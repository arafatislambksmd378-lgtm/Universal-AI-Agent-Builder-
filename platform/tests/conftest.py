"""Test harness.

- A session-scoped embedded PostgreSQL (pgserver) instance is created in a tmp
  directory; Alembic migrations are applied once per session.
- Each test runs against a clean database (TRUNCATE ... RESTART IDENTITY CASCADE).
- HTTP-level tests use httpx ASGITransport — no network needed.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

_DEV_PGDATA = Path(os.path.expanduser("~/.uab-pgdata-test"))


def _sqlalchemy_url(pguri: str) -> str:
    return pguri.replace("postgresql://", "postgresql+psycopg://", 1)


@pytest.fixture(scope="session")
def pg_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    pgserver = pytest.importorskip("pgserver", reason="embedded PostgreSQL (pgserver) not installed")
    pgdata = tmp_path_factory.mktemp("pgdata") / "pg"
    server = pgserver.get_server(str(pgdata))
    yield _sqlalchemy_url(server.get_uri())


@pytest.fixture(scope="session")
def migrated_url(pg_url: str, monkeypatch_session: pytest.MonkeyPatch) -> Iterator[str]:
    monkeypatch_session.setenv("UAB_DATABASE_URL", pg_url)
    monkeypatch_session.setenv("UAB_ENVIRONMENT", "test")
    monkeypatch_session.setenv("UAB_JWT_SECRET", "test-secret-key-for-pytest-only-0123456789abcdef")
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", pg_url)
    from uab_platform.config import get_settings

    get_settings.cache_clear()
    command.upgrade(cfg, "head")
    yield pg_url


@pytest.fixture(scope="session")
def monkeypatch_session() -> Iterator[pytest.MonkeyPatch]:
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


@pytest.fixture(scope="session")
def settings_for_tests(migrated_url: str):
    from uab_platform.config import Settings

    return Settings(
        environment="test",
        database_url=migrated_url,
        jwt_secret="test-secret-key-for-pytest-only-0123456789abcdef",
        allow_open_registration=False,
        allow_paid_providers=False,
    )


@pytest.fixture()
def clean_db(migrated_url: str, settings_for_tests) -> Iterator[None]:
    from sqlalchemy import create_engine, text

    engine = create_engine(migrated_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE TABLE audit_events, agent_configs, agents, app_settings, "
                "workspace_memberships, workspaces, users RESTART IDENTITY CASCADE"
            )
        )
    engine.dispose()

    from uab_platform.db import session as db_session

    db_session.reset_engine_for_tests()
    yield


@pytest_asyncio.fixture()
async def client(clean_db: None, settings_for_tests) -> AsyncIterator[AsyncClient]:
    from uab_platform.api.app import create_app

    app = create_app(settings_for_tests)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


async def register_user(
    client: AsyncClient, email: str, password: str = "correct-horse-battery-staple", display_name: str = "Test User"
):
    return await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )


async def login(client: AsyncClient, email: str, password: str = "correct-horse-battery-staple"):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def unique_email() -> str:
    return f"user-{uuid.uuid4().hex[:12]}@example.com"
