#!/usr/bin/env python3
"""Start an embedded PostgreSQL (pgserver) for local development and run a command against it.

Docker is not required. The data directory defaults to ~/.uab-pgdata-dev (outside the repo).

Requires the `local` dependency group. From platform/: `uv sync --group dev --group local`.
Run this script with the same interpreter, e.g. `platform/.venv/bin/python scripts/dev_db.py ...`.

Usage:
    platform/.venv/bin/python scripts/dev_db.py -- alembic upgrade head
    platform/.venv/bin/python scripts/dev_db.py --command "alembic revision --autogenerate -m 'x'"
    platform/.venv/bin/python scripts/dev_db.py            # just print the export lines

Prints the SQLAlchemy URL as postgresql+psycopg://postgres:@/postgres?host=<socket dir>.
When no command is given it only prints export lines for UAB_DATABASE_URL / UAB_TEST_DATABASE_URL.
Point pytest at the same embedded server to exercise the external-PG path:
    platform/.venv/bin/python scripts/dev_db.py -- <abs path to pytest> platform/tests -q
(conftest honors UAB_TEST_DATABASE_URL / UAB_DATABASE_URL before falling back to its own embedded instance)
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pgdata", default=os.path.expanduser("~/.uab-pgdata-dev"))
    parser.add_argument("--command", default=None, help="shell command to run with UAB_DATABASE_URL set")
    parser.add_argument("cmd", nargs=argparse.REMAINDER, help="command after --")
    args = parser.parse_args()
    cmd = args.cmd
    if cmd and cmd[0] == "--":
        cmd = cmd[1:]

    try:
        import pgserver
    except ImportError:
        print("pgserver is not installed. It lives in the `local` dependency group: uv sync --group dev --group local", file=sys.stderr)
        return 2

    server = pgserver.get_server(args.pgdata)
    uri = server.get_uri()
    # sqlalchemy URL for psycopg3: postgresql+psycopg://...?host=<socket dir>
    sqlalchemy_url = uri.replace("postgresql://", "postgresql+psycopg://", 1)
    env = dict(os.environ, UAB_DATABASE_URL=sqlalchemy_url)
    print(f"[dev_db] postgres up at {uri}", file=sys.stderr)

    command = args.command or (" ".join(shlex.quote(a) for a in cmd) if cmd else None)
    if not command:
        print(f"export UAB_DATABASE_URL={sqlalchemy_url}")
        print("export UAB_TEST_DATABASE_URL=" + sqlalchemy_url)
        return 0

    print(f"[dev_db] running: {command}", file=sys.stderr)
    return subprocess.call(command, shell=True, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
