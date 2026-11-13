# Upstream reference: NousResearch/hermes-agent

This project builds **on top of** Hermes Agent rather than forking it. This document pins
the exact upstream state we audited and defines how upstream changes flow in.

## Pinned upstream

| Field | Value |
|---|---|
| Repository | <https://github.com/NousResearch/hermes-agent> |
| Default branch | `main` |
| Pinned commit (audited source of truth) | `fd3174e9c5cdd037203bb4e111c950667988f3ca` |
| Commit date | 2026-11-13T03:02:12-08:00 |
| Acquired | 2026-11-13T11:04Z |
| ZIP SHA-256 | `9ea0e0e79e4ab09027bf59a0f90c34d0d78b5b2bceaace6e1771adb219baf427` |
| ZIP entries / bytes | 26,697 / 254,454,542 |
| Latest stable release | v0.23.1 (2026-11-10) |
| License | MIT (Nous Research) — see `THIRD_PARTY_NOTICES.md` |

## Where each artifact lives

| Path | Role |
|---|---|
| `acquisition/zip/hermes-agent-main.zip` | Original archive, unmodified |
| `acquisition/original/hermes-agent-main/` | Untouched extracted snapshot, never modified |
| `work/hermes-agent/` | Working clone (branch management for future upstream-derived changes) |
| `acquisition/ACQUISITION-METADATA.json` | Machine-readable provenance (SHA-256, commands) |

`acquisition/` and `work/` are git-ignored on purpose: the repository carries pointers and
docs, not 400+ MB of third-party source. Re-acquisition procedure is in
`acquisition/ACQUISITION-METADATA.json`.

## Boundary rules (hard)

1. **Never modify `acquisition/original/` or the ZIP.** It is the audited baseline.
2. **No Hermes code is copied into `platform/`.** The control plane uses HTTP (OpenAI-compatible
   API), MCP, and A2A as integration surfaces — not import-time coupling.
3. **Runtime modifications** (when a future batch needs one) go on a dedicated branch in
   `work/hermes-agent/`, pass upstream's own test harness (`scripts/run_tests.sh`), and are
   documented in `docs/upstream-changes.md` (created when the first change lands) with:
   files changed, why, upstream-report status, and revert procedure.
4. **License compliance:** Hermes is MIT. Keep Nous Research copyright notices intact in any
   file derived from upstream, and ship `THIRD_PARTY_NOTICES.md` with distributions.
5. **Prompt surface:** upstream's `tests/ci/test_prompt_surface.py` snapshot is sacred; any
   runtime change must keep it green or be reverted.

## Upstream synchronization strategy

- **Watch:** subscribe to upstream releases (`hermes update` notifications + GitHub release feed).
- **Cadence:** evaluate upstream at every tagged minor release (e.g. v0.24.0) or on a security
  advisory, whichever comes first.
- **Procedure per sync:**
  1. Re-download the release ZIP; verify SHA-256 (recompute; record in a dated manifest under
     `acquisition/sync-<tag>/`).
  2. `git -C work/hermes-agent fetch` and diff `fd3174e..<new-tag>`.
  3. Run our compatibility gate: import smoke + a pinned subset of upstream tests + our control
     plane contract tests that mock the runtime interface.
  4. Update the pin table above and `acquisition/ACQUISITION-METADATA.json` in the same commit.
  5. Any behavior we depend on but that changed → ADR addendum in `docs/architecture/`.
- **Never auto-merge** upstream into our tree; always via reviewed PR with the compatibility
  gate green.

## Current delta from upstream

**None.** As of 2026-11-13 the working copy is byte-identical to the pinned commit
(`diff -qr` clean, `git status` clean). The platform control plane is green-field code that
also ships zero upstream-derived modules.
