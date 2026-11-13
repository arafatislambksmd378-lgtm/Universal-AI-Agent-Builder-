"""Alembic migrations must apply, revert and re-apply cleanly — on a private database."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config


def test_migrations_up_down_up(tmp_path: Path) -> None:
    pgserver = pytest.importorskip("pgserver", reason="embedded PostgreSQL not installed")

    server = pgserver.get_server(str(tmp_path / "pgdata"))
    url = server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)

    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)

    command.upgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
