"""Unit tests for AES-256-GCM encryption."""

import os

import pytest

from app.crypto import decrypt, encrypt


@pytest.fixture
def key():
    return os.urandom(32)


class TestEncryptDecrypt:
    def test_round_trip(self, key):
        plaintext = b"hello world"
        ciphertext = encrypt(plaintext, key)
        assert decrypt(ciphertext, key) == plaintext

    def test_round_trip_empty(self, key):
        ciphertext = encrypt(b"", key)
        assert decrypt(ciphertext, key) == b""

    def test_round_trip_large(self, key):
        plaintext = os.urandom(10 * 1024 * 1024)  # 10MB
        ciphertext = encrypt(plaintext, key)
        assert decrypt(ciphertext, key) == plaintext

    def test_different_nonce_each_time(self, key):
        plaintext = b"same data"
        c1 = encrypt(plaintext, key)
        c2 = encrypt(plaintext, key)
        assert c1 != c2  # different nonce → different ciphertext
        assert decrypt(c1, key) == decrypt(c2, key) == plaintext

    def test_wrong_key_raises(self, key):
        ciphertext = encrypt(b"secret", key)
        wrong_key = os.urandom(32)
        with pytest.raises(Exception):
            decrypt(ciphertext, wrong_key)

    def test_tampered_ciphertext_raises(self, key):
        ciphertext = bytearray(encrypt(b"secret", key))
        ciphertext[-1] ^= 0xFF  # flip last byte
        with pytest.raises(Exception):
            decrypt(bytes(ciphertext), key)

    def test_key_wrong_length_raises(self):
        # 16/24-byte keys are the dangerous case: AESGCM accepts them (AES-128/192),
        # so without our guard the cipher would silently downgrade from AES-256.
        for bad in [b"short", os.urandom(16), os.urandom(24)]:
            with pytest.raises(ValueError):
                encrypt(b"data", bad)
