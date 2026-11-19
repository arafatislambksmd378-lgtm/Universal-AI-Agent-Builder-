# ADR-0004: API conventions and contract-first frontend boundary

- **Status:** Accepted (BATCH 02)
- **Date:** 2026-11-13
- **Context:** The frontend (Next.js + shadcn/ui, built with Google AI Studio) is developed
  outside this repo. The control-plane API must be stable enough to build against, and changes
  must not silently break the frontend.

## Decision

- **Prefix & versioning:** everything under `/api/v1`. Version bumps are additive (`/api/v2` never
  breaks `/v1` within a supported window; deprecation notice in this file + response header).
- **Standard envelope:** success responses are bare domain objects (or `Page[T]` for lists);
  errors are always `{ "error": { "code", "message", "details", "correlation_id" } }` with the
  right HTTP status (400/401/403/404/409/422/500). `request-id`/`x-correlation-id` flows from
  middleware into logs and error bodies.
- **Pagination:** `limit` (1–100, default 50) + `offset`; `Page[T] = {items,total,limit,offset}`.
- **Error codes** are snake_case machine labels (`workspace_not_found`, `invalid_transition`,
  `provider_unavailable`, …) — never raw driver text.
- **Auth:** JWT access (15 min) + refresh (30 days) pair; argon2 password hashing;
  workspace-scoped RBAC (`viewer < member < admin < owner`); `is_superadmin` for operator actions;
  404 (not 403) for cross-workspace reads to avoid tenant existence leaks.
- **Contract ownership:** this repo owns the backend + `contracts/openapi.json` (generated from the
  app, drift-checked in CI). The frontend consumes that file; UI work belongs to the frontend repo.
- **Versioning of the contract:** `contracts/openapi.json` is regenerated in CI and any drift fails
  the build; breaking changes require ADR + major bump.

## Consequences

- Google AI Studio (or any frontend) can codegen types from `contracts/openapi.json` deterministically.
- The error envelope makes client-side error UX trivial (`code` → message map, `correlation_id` →
  support).
- Audit events and settings endpoints are part of the public contract and listed in
  `docs/contracts/openapi-control-plane-v1.md`.

## Rejected alternatives

- **GraphQL** — adds a schema toolchain and caching semantics before we have a consumer problem;
  rejected; REST + OpenAPI is sufficient and matches Hermes' own API server style.
- **Returning 403 for foreign-workspace objects** — leaks tenant existence; 404 chosen.
- **gRPC** — transport mismatch with a Next.js frontend; rejected for now (internal services, if
  split later, may adopt gRPC behind an edge gateway).
