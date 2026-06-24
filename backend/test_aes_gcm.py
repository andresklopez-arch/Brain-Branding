import sys
import os
import base64
import hashlib

# Adjust path to import app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.utils import encrypt_val, decrypt_val

def test_aes_gcm():
    print("[TEST] Running AES-256-GCM encryption tests...")
    
    # Test case 1: Basic encrypt and decrypt
    plain = "my_secret_token_123"
    salt = "tenant-salt-abc"
    
    encrypted = encrypt_val(plain, salt)
    assert encrypted != plain, "Encryption failed to obscure value"
    
    decrypted = decrypt_val(encrypted, salt)
    assert decrypted == plain, f"Decryption mismatch. Got '{decrypted}' instead of '{plain}'"
    print("[SUCCESS] AES-256-GCM encryption/decryption validated.")
    
    # Test case 2: Legacy XOR fallback decryption
    # Let's recreate the old stream cipher encryption to test fallback:
    def legacy_encrypt(plaintext: str, secret_key: str, salt_str: str) -> str:
        tenant_key = secret_key + salt_str
        salt = os.urandom(16)
        data_bytes = plaintext.encode('utf-8')
        key_stream = b''
        counter = 0
        while len(key_stream) < len(data_bytes):
            h = hashlib.sha256(tenant_key.encode('utf-8') + salt + str(counter).encode('utf-8')).digest()
            key_stream += h
            counter += 1
        ciphertext = bytes(b ^ k for b, k in zip(data_bytes, key_stream))
        return base64.b64encode(salt + ciphertext).decode('utf-8')
        
    from app.config import settings
    legacy_encrypted = legacy_encrypt(plain, settings.JWT_SECRET, salt)
    
    # Attempt to decrypt legacy ciphertext using the updated decrypt_val
    decrypted_legacy = decrypt_val(legacy_encrypted, salt)
    assert decrypted_legacy == plain, f"[ERROR] Fallback decryption failed. Got '{decrypted_legacy}' instead of '{plain}'"
    print("[SUCCESS] Legacy fallback decryption validated.")
    
    print("[COMPLETE] All cryptography tests passed successfully.")

if __name__ == "__main__":
    test_aes_gcm()
