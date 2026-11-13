# Universal-AI-Agent-Builder-

Transforming the official [NousResearch `hermes-agent`](https://github.com/NousResearch/hermes-agent)
into a modular, secure, mobile-compatible **Universal AI Agent Builder** ecosystem —
individual agents, teams, hierarchical organizations, durable task execution, workflows,
and API access — while preserving Hermes' existing working capabilities.

**Status:** BATCH 00/01 (source acquisition + technical audit) complete. See
[`reports/REPORT-01-hermes-acquisition-audit.md`](reports/REPORT-01-hermes-acquisition-audit.md)
for the full acquisition record, audit findings, and batch roadmap.

## Layout

| Path | Purpose | Tracked in Git? |
|---|---|---|
| `reports/` | Audit & engineering reports (REPORT-01…) | ✅ |
| `docs/` | Architecture decisions & API contracts (from BATCH 02) | ✅ |
| `acquisition/zip/` | Original official Hermes ZIP, preserved unmodified | ❌ (git-ignored) |
| `acquisition/original/` | Untouched extracted source snapshot | ❌ (git-ignored) |
| `work/hermes-agent/` | Working copy (full clone) for future modification | ❌ (git-ignored) |

Re-acquisition procedure: see `acquisition/ACQUISITION-METADATA.json`
(repo: `NousResearch/hermes-agent`, `main` @ `fd3174e9c5cdd037203bb4e111c950667988f3ca`,
ZIP SHA-256 `9ea0e0e79e4ab09027bf59a0f90c34d0d78b5b2bceaace6e1771adb219baf427`).

## Engineering rules

- Preserve Hermes; extend — never rewrite — its runtime.
- Paid AI providers are disabled by default (local → free-tier → paid-with-authorization).
- No work on `web/`, `ui-tui/`, `apps/desktop/` without coordination with the frontend
  (Google AI Studio) process.
- Every batch: INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → DOCUMENT → COMMIT → REPORT.
