# Development guide

## Toolchain

- **Target Python: 3.14** (per project policy). In this sandbox 3.14 is not installable
  (`uv python install 3.14` fetches from the python-build-standalone index, which this
  environment cannot reach; apt is unreachable too). The whole BATCH 02 verification loop was
  executed on **Python 3.11.2** and is **not** evidence of 3.14 behavior. CI
  (`.github/workflows/ci.yml`) installs 3.14 via `astral-sh/setup-uv` + `uv python install 3.14`
  and runs ruff + the full pytest suite + migration up/down/up on 3.14 — that job is the
  reproducible-3.14 proof path and must stay green from the first PR after this batch.
- Local dependencies are installed editable: `uv pip install -e . --group dev`
  (dev group: pytest, pytest-asyncio, httpx, ruff, alembic, pgserver, mypy).
- `uv.lock` — regenerate with `uv lock` after changing `pyproject.toml` before the first
  3.14 CI run (requires network to PyPI, available from CI but not always from a sandbox).

## Databases

Three sanctioned ways to get a dev Postgres; none is allowed in production:

| Way | When to use |
|---|---|
| `docker compose -f docker-compose.dev.yml up -d` | normal dev machines with Docker |
| `python scripts/dev_db.py -- <cmd>` | Docker-less environments; starts embedded PG (pgserver, cp39–cp312 manylinux wheels only), exports `UAB_DATABASE_URL`, runs the command |
| `pytest` (conftest) | tests boot their own private embedded instance in a tmp dir; nothing leaks between runs |

Notes & limits:
- `pgserver` is a **test/dev-only** convenience, pinned under the `dev` dependency group. It is
  deliberately absent from runtime dependencies and from the Docker image.
- The embedded server listens on a Unix socket in the given data dir; it is not reachable from
  outside the machine.
- Production schema path = `alembic upgrade head` against `UAB_DATABASE_URL`. Migrations are
  authoritative; the ORM models are the same `Base.metadata` the initial revision was generated from.

## Running things

```bash
cd platform
export UAB_DATABASE_URL=postgresql+psycopg://uab:uab@127.0.0.1:5432/uab
alembic upgrade head                 # schema
alembic downgrade base && alembic upgrade head   # verify reversibility
uvicorn uab_platform.api.app:app --reload
python -m pytest tests/ -q           # ~10s; 71 tests at time of writing
mkdir -p ../contracts && python ../scripts/export_openapi.py   # refresh API contract
```

## Layout conventions

- Only `repositories/*` import SQLAlchemy models. Routers depend on repositories/services via
  `api/deps.py`; services own cross-table invariants (lifecycle, membership rules, audit emission).
- New endpoint checklist: schema in `schemas/`, repo method, service fn if invariant-bearing,
  router with `require_permission`, error via `app_error`/`_envelope`, audit event if mutating,
  tests in `tests/test_api_*.py`, contract regen, doc note in `docs/contracts/`.
- Errors: never raise bare `HTTPException`; use `AppError`/`NotFoundError`/… so the envelope stays
  uniform. A catch-all exception handler converts unknowns to 500 `internal_error` with a
  correlation id and **no internals**.
- Logging: `logging.get_logger("uab.<area>")`; JSON lines with `ts, level, logger, message,
  correlation_id`. Do not log request bodies (they may carry credentials).

## Testing

- DB-backed tests use the embedded PG fixture; pure unit tests (rbac, tokens, providers, config)
  need no database.
- `test_db_migrations.py` boots a *private* embedded PG and runs up/down/up.
- `client` fixture builds the real FastAPI app in-process via httpx ASGI transport — no ports.
- The mock provider is the default; **no test may require Ollama or any paid API**.

## Code style

- ruff (lint + format), line-length 120, target `py312` in ruff (3.11/3.12/3.14 all satisfy it).
- Type-check intent: mypy strict-ish config later; BATCH 02 ships ruff-clean code.
- Commit style: imperative subject, body explains why; one logical change per commit; BATCH
  reports (`reports/REPORT-*.md`) record verified vs claimed work honestly.
