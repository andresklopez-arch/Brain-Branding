import base64
import hashlib
import os
from .config import settings

def encrypt_val(plaintext: str) -> str:
    """Encrypts a string value at rest using JWT_SECRET as key."""
    if not plaintext:
        return ""
    secret_key = settings.JWT_SECRET
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

def decrypt_val(encrypted: str) -> str:
    """Decrypts a string value, returning the plaintext. Gracefully falls back if plaintext."""
    if not encrypted:
        return ""
    secret_key = settings.JWT_SECRET
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
        # Fallback to plain text if not encrypted
        return encrypted
