import base64
import hashlib
import os
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import settings

def encrypt_val(plaintext: str, salt_str: Optional[str] = None) -> str:
    """Encrypts a string value at rest using AES-256-GCM, using JWT_SECRET and optional salt."""
    if not plaintext:
        return ""
    secret_key = settings.JWT_SECRET
    if salt_str:
        secret_key += salt_str
    
    # Deriving 32-byte key using SHA-256
    key = hashlib.sha256(secret_key.encode('utf-8')).digest()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    return base64.b64encode(nonce + ciphertext).decode('utf-8')

def decrypt_val(encrypted: str, salt_str: Optional[str] = None) -> str:
    """Decrypts a string value using AES-256-GCM, falling back to legacy custom XOR cipher or plain text."""
    if not encrypted:
        return ""
    secret_key = settings.JWT_SECRET
    
    # Layer 1: AES-256-GCM with salt
    try:
        tenant_key = secret_key + salt_str if salt_str else secret_key
        key = hashlib.sha256(tenant_key.encode('utf-8')).digest()
        data = base64.b64decode(encrypted.encode('utf-8'), validate=True)
        if len(data) >= 12:
            nonce = data[:12]
            ciphertext = data[12:]
            aesgcm = AESGCM(key)
            return aesgcm.decrypt(nonce, ciphertext, None).decode('utf-8')
    except Exception:
        pass

    # Layer 2: AES-256-GCM without salt (fallback)
    try:
        key = hashlib.sha256(secret_key.encode('utf-8')).digest()
        data = base64.b64decode(encrypted.encode('utf-8'), validate=True)
        if len(data) >= 12:
            nonce = data[:12]
            ciphertext = data[12:]
            aesgcm = AESGCM(key)
            return aesgcm.decrypt(nonce, ciphertext, None).decode('utf-8')
    except Exception:
        pass

    # Layer 3: Legacy XOR stream cipher (with salt)
    try:
        tenant_key = secret_key + salt_str if salt_str else secret_key
        data = base64.b64decode(encrypted.encode('utf-8'), validate=True)
        if len(data) >= 16:
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

    # Layer 4: Legacy XOR stream cipher (without salt)
    try:
        data = base64.b64decode(encrypted.encode('utf-8'), validate=True)
        if len(data) >= 16:
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
        pass

    # Layer 5: Plaintext fallback
    return encrypted

def hash_pii(text: str) -> str:
    """Hashes phone numbers and emails inside logs to protect privacy."""
    import re
    if not text:
        return ""
    
    def get_hash(val: str) -> str:
        return hashlib.sha256(val.lower().strip().encode('utf-8')).hexdigest()[:8]
    
    email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    phone_pattern = re.compile(r'\+?\b\d[\d\s-]{7,14}\b')
    
    def email_repl(match):
        return f"[EMAIL_HASH:{get_hash(match.group(0))}]"
        
    def phone_repl(match):
        val = match.group(0)
        digits = "".join(c for c in val if c.isdigit())
        if 8 <= len(digits) <= 15:
            return f"[PHONE_HASH:{get_hash(val)}]"
        return val
        
    res = email_pattern.sub(email_repl, text)
    res = phone_pattern.sub(phone_repl, res)
    return res

def sanitize_input(text: str) -> str:
    """Removes hidden Unicode control characters and sanitizes chat input."""
    if not text:
        return ""
    import unicodedata
    return "".join(
        ch for ch in text 
        if unicodedata.category(ch)[0] != 'C' or ch in ('\n', '\r', '\t')
    ).strip()


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


def scrub_sensitive_data(text: str) -> str:
    """Scrubs sensitive PII like credit cards from messages before sending to APIs."""
    import re
    if not text:
        return ""
    # Regex to match 13-19 digit sequences with optional hyphens/spaces
    cc_pattern = re.compile(r'\b(?:\d[ -]*?){13,19}\b')
    
    def cc_repl(match):
        val = match.group(0)
        digits = [c for c in val if c.isdigit()]
        if 13 <= len(digits) <= 19:
            return "[TARJETA REDACTADA]"
        return val
        
    return cc_pattern.sub(cc_repl, text)

