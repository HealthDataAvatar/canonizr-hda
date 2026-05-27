"""AES-256-GCM encryption for data at rest in Redis."""

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ENCRYPTION_KEY = bytes.fromhex(os.environ.get("ENCRYPTION_KEY", "")) if os.environ.get("ENCRYPTION_KEY") else None

NONCE_SIZE = 12


def encrypt(data: bytes, key: bytes | None = None) -> bytes:
    """Encrypt data with AES-256-GCM. Returns nonce + ciphertext."""
    key = key or ENCRYPTION_KEY
    if key is None:
        raise ValueError("No encryption key configured")
    nonce = os.urandom(NONCE_SIZE)
    ciphertext = AESGCM(key).encrypt(nonce, data, None)
    return nonce + ciphertext


def decrypt(data: bytes, key: bytes | None = None) -> bytes:
    """Decrypt nonce + ciphertext produced by encrypt()."""
    key = key or ENCRYPTION_KEY
    if key is None:
        raise ValueError("No encryption key configured")
    nonce = data[:NONCE_SIZE]
    ciphertext = data[NONCE_SIZE:]
    return AESGCM(key).decrypt(nonce, ciphertext, None)
