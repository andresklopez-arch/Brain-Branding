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

