# uab-platform — Universal AI Agent Builder Control Plane

The control plane for the Universal AI Agent Builder. It owns everything that is **not**
the agent runtime: users, workspaces, memberships and roles, the agent registry,
application settings, audit events, and the provider-independent AI interface.

The Hermes Agent runtime remains the execution engine and is **not** rewritten here;
it lives upstream (see `docs/upstream.md`) and will be bridged in BATCH 03+.

## Layout

```
platform/
├── pyproject.toml          # project metadata, pinned-ish dependencies, ruff/pytest config
├── alembic.ini             # migration config (URL comes from UAB_DATABASE_URL)
├── alembic/                # migration environment + versions
│   └── versions/           # 0001 initial schema (autogenerate-reviewed)
├── src/uab_platform/
│   ├── config.py           # UAB_* settings (pydantic-settings), production guardrails
│   ├── logging.py          # JSON structured logs + correlation IDs
│   ├── db/                 # engine/session, declarative base, ORM models
│   ├── repositories/       # the only layer that talks SQLAlchemy to the DB
│   ├── services/           # agent registry logic, lifecycle state machine, audit
│   ├── security/           # argon2 passwords, JWT, static RBAC matrix
│   ├── providers/          # ChatProvider contract + deterministic mock + Ollama adapter +
│   │                       #   cost-policy router (LOCAL → FREE-TIER → PAID-authorized)
│   └── api/                # FastAPI app, /api/v1 routers, error envelope, middleware
└── tests/                  # unit + API + migration tests (embedded PostgreSQL)
```

## Quickstart (local, no Docker required)

```bash
# 1. Python 3.14 is the target; >=3.11 works for the local loop (see docs/development.md)
uv venv && uv pip install -e . --group dev
# (or: python3 -m venv .venv && .venv/bin/pip install -e . && uv pip install pytest pytest-asyncio pgserver)

# 2. PostgreSQL — either Docker…
docker compose -f ../docker-compose.dev.yml up -d
export UAB_DATABASE_URL=postgresql+psycopg://uab:uab@127.0.0.1:5432/uab
#   …or the bundled embedded server (used by the tests):
python ../scripts/dev_db.py -- alembic upgrade head

# 3. Run the API
uvicorn uab_platform.api.app:app --reload
#    Docs: http://127.0.0.1:8000/api/docs · Health: /health · Ready: /health/ready

# 4. First user (or only if the users table is empty — first registration is auto-bootstrap)
uab-bootstrap --email admin@example.com --password 'a-long-random-password'

# 5. Test
python -m pytest tests/
```

## Design rules

- Control plane only — never the agent loop. Hermes internals stay upstream.
- Every table is workspace-scoped (or global and operator-owned); workspace isolation
  is enforced by query construction *and* by `require_permission` guards; cross-workspace
  access returns 404 by default.
- Paid AI providers are disabled by default (`UAB_ALLOW_PAID_PROVIDERS=false`).
- No secrets in the repo. `.env` is git-ignored; `.env.example` documents the surface.
- Migrations are the only way the schema changes; they are applied in CI (up/down/up).
