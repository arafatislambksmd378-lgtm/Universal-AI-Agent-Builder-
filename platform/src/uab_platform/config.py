"""Control-plane configuration.

Secrets come from the environment (or a local `.env` file that is git-ignored).
Nothing here may be hardcoded to a real credential; the dev-only JWT default is
loud, visibly insecure, and refused when UAB_ENVIRONMENT=production.
"""

from __future__ import annotations

import secrets as _secrets
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me"  # noqa: S105 - documented dev placeholder, rejected in production


class Settings(BaseSettings):
    """Application settings, read from `UAB_*` environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="UAB_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # Database. No credentials are embedded anywhere in the repository; the
    # local development default points at the throwaway docker-compose database.
    database_url: str = Field(
        default="postgresql+psycopg://uab:uab@127.0.0.1:5432/uab",
        description="SQLAlchemy URL. Use the psycopg driver, e.g. postgresql+psycopg://user:pass@host:5432/db",
    )
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=10, ge=0, le=100)

    # Auth
    jwt_secret: str = Field(default=_DEV_JWT_SECRET)
    jwt_algorithm: str = Field(default="HS256")
    access_token_ttl_seconds: int = Field(default=15 * 60, gt=0)
    refresh_token_ttl_seconds: int = Field(default=30 * 24 * 3600, gt=0)
    allow_open_registration: bool = Field(default=False)

    # AI provider policy. Cost policy: LOCAL -> ELIGIBLE FREE-TIER -> PAID (authorized).
    # Paid providers stay disabled unless explicitly enabled by the operator.
    allow_local_providers: bool = Field(default=True)
    allow_free_tier_providers: bool = Field(default=True)
    allow_paid_providers: bool = Field(default=False)
    ollama_base_url: str = Field(default="http://127.0.0.1:11434")

    # Observability
    correlation_id_header: str = Field(default="X-Correlation-ID")

    @field_validator("environment")
    @classmethod
    def _environment_known(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in {"development", "test", "staging", "production"}:
            raise ValueError("UAB_ENVIRONMENT must be one of development|test|staging|production")
        return v

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_strength(cls, v: str) -> str:
        if len(v) < 32:
            # Deliberately conservative; the dev default itself passes this check.
            raise ValueError("UAB_JWT_SECRET must be at least 32 characters")
        return v

    def validate_for_production(self) -> None:
        """Fail fast when booting an unsafe production configuration."""
        if self.environment != "production":
            return
        problems: list[str] = []
        if self.jwt_secret == _DEV_JWT_SECRET:
            problems.append("UAB_JWT_SECRET is the built-in development default")
        if "uab:uab@" in self.database_url:
            problems.append("UAB_DATABASE_URL uses local development credentials")
        if self.allow_paid_providers:
            problems.append("UAB_ALLOW_PAID_PROVIDERS is enabled — confirm intent in writing")
        if problems:
            raise RuntimeError("Refusing to start with an unsafe production configuration: " + "; ".join(problems))

    @property
    def uses_dev_jwt_secret(self) -> bool:
        return self.jwt_secret == _DEV_JWT_SECRET

    def redacted_database_url(self) -> str:
        """Database URL safe to log (password stripped)."""
        from sqlalchemy.engine import make_url

        try:
            url = make_url(self.database_url)
        except Exception:
            return "<unparseable database url>"
        if url.password:
            url = url._replace(password="***")  # noqa: S106 - masking placeholder, not a credential
        return str(url)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def generate_dev_jwt_secret() -> str:
    """Helper for operators: print a strong JWT secret to export as UAB_JWT_SECRET."""
    return _secrets.token_urlsafe(48)
