"""agent avatar identity + capabilities

Additive revision: adds structured avatar metadata and ordered capability tags to
the agents table. avatar_ref is retained for backwards compatibility (superseded by
avatar_id/avatar_url but kept so existing rows/clients keep working).

Revision ID: 51d4c7e1a9b2
Revises: 09f16b9dfa10
Create Date: 2026-11-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import text

revision: str = "51d4c7e1a9b2"
down_revision: str | None = "09f16b9dfa10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("avatar_id", sa.String(length=120), nullable=True))
    op.add_column("agents", sa.Column("avatar_url", sa.String(length=1000), nullable=True))
    op.add_column("agents", sa.Column("avatar_type", sa.String(length=20), nullable=True))
    op.add_column("agents", sa.Column("avatar_style", sa.String(length=120), nullable=True))
    op.add_column("agents", sa.Column("avatar_metadata", JSONB(), nullable=True))
    op.add_column("agents", sa.Column("capabilities", JSONB(), nullable=False, server_default=text("'[]'::jsonb")))
    op.create_check_constraint(
        "avatar_type_valid",
        "agents",
        "avatar_type IS NULL OR avatar_type IN ('preset','upload','url','generated')",
    )


def downgrade() -> None:
    op.drop_constraint("avatar_type_valid", "agents", type_="check")
    op.drop_column("agents", "capabilities")
    op.drop_column("agents", "avatar_metadata")
    op.drop_column("agents", "avatar_style")
    op.drop_column("agents", "avatar_type")
    op.drop_column("agents", "avatar_url")
    op.drop_column("agents", "avatar_id")
