"""Password hashing (argon2id)."""

from __future__ import annotations

from uab_platform.security.passwords import hash_password, needs_rehash, verify_password


def test_hash_and_verify_roundtrip() -> None:
    hashed = hash_password("correct-horse-battery-staple")
    assert hashed.startswith("$argon2")
    assert verify_password("correct-horse-battery-staple", hashed)


def test_wrong_password_rejected() -> None:
    hashed = hash_password("correct-horse-battery-staple")
    assert not verify_password("wrong", hashed)


def test_garbage_hash_rejected_without_raising() -> None:
    assert not verify_password("anything", "not-a-hash")


def test_hash_uses_unique_salt() -> None:
    assert hash_password("same-input") != hash_password("same-input")


def test_default_params_do_not_need_rehash() -> None:
    assert not needs_rehash(hash_password("correct-horse-battery-staple"))
