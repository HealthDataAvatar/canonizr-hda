"""AES-256-GCM encryption for data at rest.

Key is always passed explicitly — per-user keys from Table Storage.
No module-level globals.
"""

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_SIZE = 12
KEY_SIZE = 32  # AES-256


def _aes(key: bytes) -> AESGCM:
    # AESGCM also accepts 16/24-byte keys (AES-128/192); a wrong-length key would
    # silently downgrade the cipher, so require exactly 32 bytes. Raise (not assert)
    # so `python -O` can't strip this security check.
    if len(key) != KEY_SIZE:
        raise ValueError(f"AES-256 requires a {KEY_SIZE}-byte key, got {len(key)}")
    return AESGCM(key)


def encrypt(data: bytes, key: bytes) -> bytes:
    """Encrypt data with AES-256-GCM. Returns nonce + ciphertext."""
    nonce = os.urandom(NONCE_SIZE)
    ciphertext = _aes(key).encrypt(nonce, data, None)
    return nonce + ciphertext


def decrypt(data: bytes, key: bytes) -> bytes:
    """Decrypt nonce + ciphertext produced by encrypt()."""
    nonce = data[:NONCE_SIZE]
    ciphertext = data[NONCE_SIZE:]
    return _aes(key).decrypt(nonce, ciphertext, None)
