import base64
import hashlib
import os
from typing import Optional
from .config import settings

def encrypt_val(plaintext: str, salt_str: Optional[str] = None) -> str:
    """Encrypts a string value at rest using JWT_SECRET and an optional per-tenant salt."""
    if not plaintext:
        return ""
    secret_key = settings.JWT_SECRET
    if salt_str:
        secret_key += salt_str
    # Generate local random IV/salt for the stream cipher
    salt = os.urandom(16)
    data_bytes = plaintext.encode('utf-8')
    key_stream = b''
    counter = 0
    while len(key_stream) < len(data_bytes):
        h = hashlib.sha256(secret_key.encode('utf-8') + salt + str(counter).encode('utf-8')).digest()
        key_stream += h
        counter += 1
    ciphertext = bytes(b ^ k for b, k in zip(data_bytes, key_stream))
    return base64.b64encode(salt + ciphertext).decode('utf-8')

def decrypt_val(encrypted: str, salt_str: Optional[str] = None) -> str:
    """Decrypts a string value. Gracefully falls back if plaintext or if salt changes."""
    if not encrypted:
        return ""
    secret_key = settings.JWT_SECRET
    
    # Layer 1: Try decrypting with dynamic tenant-specific salt
    try:
        tenant_key = secret_key + salt_str if salt_str else secret_key
        data = base64.b64decode(encrypted.encode('utf-8'), validate=True)
        if len(data) < 16:
            return encrypted
        salt = data[:16]
        ciphertext = data[16:]
        key_stream = b''
        counter = 0
        while len(key_stream) < len(ciphertext):
            h = hashlib.sha256(tenant_key.encode('utf-8') + salt + str(counter).encode('utf-8')).digest()
            key_stream += h
            counter += 1
        plaintext = bytes(c ^ k for c, k in zip(ciphertext, key_stream))
        return plaintext.decode('utf-8')
    except Exception:
        pass

    # Layer 2: Fallback to global secret_key (in case key was encrypted before salt was populated)
    try:
        data = base64.b64decode(encrypted.encode('utf-8'), validate=True)
        if len(data) < 16:
            return encrypted
        salt = data[:16]
        ciphertext = data[16:]
        key_stream = b''
        counter = 0
        while len(key_stream) < len(ciphertext):
            h = hashlib.sha256(secret_key.encode('utf-8') + salt + str(counter).encode('utf-8')).digest()
            key_stream += h
            counter += 1
        plaintext = bytes(c ^ k for c, k in zip(ciphertext, key_stream))
        return plaintext.decode('utf-8')
    except Exception:
        # Layer 3: Fallback to plain text
        return encrypted


def check_redis_connection(redis_url: str, timeout: float = 1.0) -> bool:
    """Attempts a quick socket connection to the Redis host/port to check availability."""
    import socket
    from urllib.parse import urlparse
    try:
        parsed = urlparse(redis_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        # Try to connect with a short timeout
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def is_safe_url(url: str) -> bool:
    """Validates that a URL uses http/https, has a valid hostname, and does not resolve to private/loopback IPs."""
    import urllib.parse
    import socket
    import ipaddress
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        
        # Immediate blocklist for localhost/loopback representations
        hostname_lower = hostname.lower()
        if hostname_lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            return False
            
        # Resolve hostname to check IP ranges
        try:
            ip = socket.gethostbyname(hostname)
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_unspecified:
                return False
                
            # Additional explicit network blocklists (SSRF protection)
            blocked_networks = [
                ipaddress.ip_network("0.0.0.0/8"),
                ipaddress.ip_network("100.64.0.0/10"),
                ipaddress.ip_network("192.0.0.0/24"),
                ipaddress.ip_network("192.0.2.0/24"),    # TEST-NET-1
                ipaddress.ip_network("198.18.0.0/15"),   # Benchmarking
                ipaddress.ip_network("198.51.100.0/24"), # TEST-NET-2
                ipaddress.ip_network("203.0.113.0/24"),  # TEST-NET-3
                ipaddress.ip_network("240.0.0.0/4")      # Reserved
            ]
            for net in blocked_networks:
                if ip_obj in net:
                    return False
        except Exception:
            # If resolution fails, we proceed with caution but do not block
            pass
        return True
    except Exception:
        return False

