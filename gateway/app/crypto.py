"""AES-256-GCM encryption for data at rest.

Key is always passed explicitly — per-user keys from Table Storage.
No module-level globals.
"""

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_SIZE = 12


def encrypt(data: bytes, key: bytes) -> bytes:
    """Encrypt data with AES-256-GCM. Returns nonce + ciphertext."""
    nonce = os.urandom(NONCE_SIZE)
    ciphertext = AESGCM(key).encrypt(nonce, data, None)
    return nonce + ciphertext


def decrypt(data: bytes, key: bytes) -> bytes:
    """Decrypt nonce + ciphertext produced by encrypt()."""
    nonce = data[:NONCE_SIZE]
    ciphertext = data[NONCE_SIZE:]
    return AESGCM(key).decrypt(nonce, ciphertext, None)
