#!/usr/bin/env python3
"""Export the control-plane OpenAPI schema to contracts/openapi.json.

Run from the platform/ directory:  python ../scripts/export_openapi.py
CI regenerates this and fails on drift (contracts are a versioned artifact).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "platform" / "src"))

from uab_platform.api.app import create_app  # noqa: E402
from uab_platform.config import Settings  # noqa: E402


def main() -> int:
    settings = Settings(environment="development", database_url="postgresql+psycopg://u:p@127.0.0.1/uab")
    app = create_app(settings)
    schema = app.openapi()
    out = ROOT / "contracts" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes, {len(schema.get('paths', {}))} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
