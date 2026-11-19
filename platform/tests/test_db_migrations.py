"""Alembic migrations must apply, revert and re-apply cleanly.

Against ``UAB_TEST_DATABASE_URL`` a throwaway scratch database is created on the same
server (the shared test database is not downgraded mid-suite). Otherwise a private
embedded PostgreSQL instance is used (``uv sync --group local``).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest
from alembic import command
from alembic.config import Config


def _split_sqlalchemy(url: str) -> tuple[str, str, str]:
    """Return (libpq_maintenance_url, scratch_db_name, libpq_scratch_url)."""
    bare = url.replace("postgresql+psycopg://", "postgresql://", 1)
    parts = urlsplit(bare)
    name = f"uab_scratch_{uuid.uuid4().hex[:12]}"
    maint = urlunsplit((parts.scheme, parts.netloc, "/postgres", parts.query, ""))
    scratch = urlunsplit((parts.scheme, parts.netloc, f"/{name}", parts.query, ""))
    return maint, name, scratch


@pytest.fixture()
def scratch_url():
    ext = os.environ.get("UAB_TEST_DATABASE_URL") or os.environ.get("UAB_DATABASE_URL")
    if ext:
        import psycopg

        maint, name, _scratch = _split_sqlalchemy(ext)
        with psycopg.connect(maint, autocommit=True) as conn:
            conn.execute(f'CREATE DATABASE "{name}"')
        try:
            yield _scratch.replace("postgresql://", "postgresql+psycopg://", 1)
        finally:
            with psycopg.connect(maint, autocommit=True) as conn:
                conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        return

    pgserver = pytest.importorskip("pgserver", reason="embedded PostgreSQL (pgserver) not installed")
    import tempfile

    with tempfile.TemporaryDirectory(prefix="uab-pg-mig-") as tmp:
        server = pgserver.get_server(str(Path(tmp) / "pg"))
        yield server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)


def test_migrations_up_down_up(scratch_url: str, tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", scratch_url)

    command.upgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
