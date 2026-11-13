"""Unit tests for configuration behavior and production guardrails."""

from __future__ import annotations

import pytest

from uab_platform.config import Settings


def test_paid_providers_disabled_by_default() -> None:
    s = Settings(database_url="postgresql+psycopg://u:p@127.0.0.1/db")
    assert s.allow_paid_providers is False
    assert s.allow_local_providers is True
    assert s.allow_free_tier_providers is True


def test_production_refuses_dev_jwt_secret() -> None:
    s = Settings(
        environment="production",
        database_url="postgresql+psycopg://u:p@db.internal/uab",
        jwt_secret="dev-only-insecure-jwt-secret-change-me",
    )
    with pytest.raises(RuntimeError, match="UAB_JWT_SECRET"):
        s.validate_for_production()


def test_production_refuses_default_db_credentials() -> None:
    s = Settings(
        environment="production",
        database_url="postgresql+psycopg://uab:uab@127.0.0.1:5432/uab",
        jwt_secret="x" * 48,
    )
    with pytest.raises(RuntimeError, match="UAB_DATABASE_URL"):
        s.validate_for_production()


def test_production_passes_with_sane_values() -> None:
    s = Settings(
        environment="production",
        database_url="postgresql+psycopg://svc:s3cret@db.internal:5432/uab",
        jwt_secret="y" * 48,
    )
    s.validate_for_production()  # must not raise


def test_non_production_validation_is_noop() -> None:
    s = Settings(environment="development")
    s.validate_for_production()


def test_redacted_database_url_strips_password() -> None:
    s = Settings(database_url="postgresql+psycopg://uab:topsecret@127.0.0.1:5432/uab")
    assert "topsecret" not in s.redacted_database_url()
    assert "***" in s.redacted_database_url()


def test_environment_must_be_known() -> None:
    with pytest.raises(ValueError):
        Settings(environment="banana")


def test_jwt_secret_minimum_length() -> None:
    with pytest.raises(ValueError):
        Settings(jwt_secret="short")
