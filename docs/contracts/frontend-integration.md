# Control Plane API — Integration Contract for the Frontend

**Audience:** the frontend built with Google AI Studio (Next.js + shadcn/ui).
**Backend owner:** this repository (`platform/`). **Frontend owner:** Google AI Studio / frontend
repo — this file is the **only** coupling between the two.

- Base URL: `https://<control-plane-host>` (dev: `http://127.0.0.1:8000`)
- Prefix: **`/api/v1`** for everything except health
- Format: JSON only; UTF-8
- Contract artifact: `contracts/openapi.json` (machine-readable, drift-checked in CI)
- Stability: additive within v1; anything breaking ⇒ new version + ADR + this doc updated first

---

## 1. Auth model

The API uses **Bearer JWT** access tokens. Acquire via register/login, refresh via `/auth/refresh`.

```http
POST /api/v1/auth/register
{ "email": "a@b.com", "password": "…min 12 chars…", "display_name": "Ada" }
```

→ `201 Created`

```json
{
  "user": { "id": "…", "email": "a@b.com", "display_name": "Ada", "is_superadmin": false,
            "created_at": "…", "updated_at": "…" },
  "workspace": { "id": "…", "name": "Ada's Workspace", "slug": "adas-workspace-1a2b3c4d",
                 "owner_id": "…", "created_at": "…", "updated_at": "…" },
  "tokens": { "access_token": "…", "refresh_token": "…", "token_type": "bearer",
              "expires_in": 900 }
}
```

> **First-run bootstrap:** if no user exists yet, the first register call creates the account as
> owner of a personal workspace. After that, open registration requires the operator to set
> `UAB_ALLOW_OPEN_REGISTRATION=true`; otherwise register returns `403 registration_closed`
> and users must be added by an admin via workspace membership.

```http
POST /api/v1/auth/login        { "email": "a@b.com", "password": "…" }   → 200, same envelope
POST /api/v1/auth/refresh      { "refresh_token": "…" }                 → 200, same envelope
GET  /api/v1/auth/me           Authorization: Bearer <access>           → 200 { user, workspace }
```

All authenticated calls send `Authorization: Bearer <access_token>`. Treat `401` as "access token
expired": call `/auth/refresh` once; if that fails, force re-login.

The frontend **must never** see `UAB_JWT_SECRET`, the database URL, or provider keys. Tokens are
stored in memory (or `httpOnly` cookie via a thin BFF if you proxy); never in `localStorage`.

---

## 2. Standard envelope & errors

Success = the bare resource (or `Page<T>` for lists). Errors = always this shape:

```json
{ "error": { "code": "workspace_not_found", "message": "workspace not found",
             "details": null, "correlation_id": "a1b2…" } }
```

| HTTP | code examples | Frontend handling |
|---|---|---|
| 400 | `invalid_payload`, `invalid_slug` | inline form error |
| 401 | `invalid_token`, `expired_token`, `bad_credentials` | refresh once, else re-login |
| 403 | `insufficient_permissions`, `registration_closed`, `forbidden` | hide/disable affordance |
| 404 | `workspace_not_found`, `agent_not_found`, `member_not_found` | empty/detail not-found view; also used for cross-workspace objects (existence never leaked) |
| 409 | `conflict`, `slug_taken`, `invalid_transition`, `last_owner` | actionable toast with `message` |
| 422 | `validation_error` (details = field list) | map `details[].loc` to form fields |
| 500 | `internal_error` | generic error + show `correlation_id` for support |

Correlation: the backend echoes/generates `x-correlation-id`; always log it on error screens.

---

## 3. Resources & endpoints (complete list)

### Health (no auth, for infra only)
`GET /health` → `{status, version}` · `GET /health/ready` → `{status, checks:{database}, version}`

### Workspaces
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/workspaces` | any user | create secondary workspace `{name}` → 201 |
| GET | `/workspaces` | any user | list caller's workspaces (array, no Page wrapper) |
| GET | `/workspaces/{workspace_id}` | member+ | 404 if not a member |
| GET | `/workspaces/{workspace_id}/members` | member+ | list `[{user_id, email, display_name, role, joined_at}]` |
| POST | `/workspaces/{workspace_id}/members` | admin+ | `{email, role}` — user must already exist; 404 otherwise |
| PATCH | `/workspaces/{workspace_id}/members/{user_id}` | admin+ | `{role}`; cannot demote last owner; admins cannot grant owner |
| DELETE | `/workspaces/{workspace_id}/members/{user_id}` | admin+ | cannot remove last owner |

Roles: `viewer < member < admin < owner`. Role map lives in `security/rbac.py`.

### Agents (workspace-scoped)
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/workspaces/{workspace_id}/agents` | member+ | `{name, description?, slug?, config?}` → 201, **status = `draft`** |
| GET | `/workspaces/{workspace_id}/agents` | viewer+ | query: `status=draft|active|paused|archived`, `limit`, `offset` → `Page<AgentResponse>` |
| GET | `/workspaces/{workspace_id}/agents/{agent_id}` | viewer+ | |
| PATCH | `/workspaces/{workspace_id}/agents/{agent_id}` | admin+ | `{name?, description?, config?}` |
| POST | `/workspaces/{workspace_id}/agents/{agent_id}/lifecycle` | admin+ | `{action: "activate"|"pause"|"archive"|"restore"}` |
| DELETE | `/workspaces/{workspace_id}/agents/{agent_id}` | admin+ | hard delete |
| GET | `/workspaces/{workspace_id}/audit` | admin+ | `limit`, `offset`, `event_type` filter → `Page<AuditEventResponse>` |

AgentResponse: `{id, workspace_id, name, slug, description, status, config, created_at, updated_at}`.
`config` (JSON): `{provider?, model?, temperature?, max_tokens?, tool_allowlist?, …}` — validated
server-side; keep it opaque in the UI except for the known keys.

Lifecycle semantics (UI must mirror, backend enforces):

```
draft ──activate──▶ active ──pause──▶ paused ──activate──▶ active
  │                  │                                    ▲
  └────────archive──▶└────────────archive──┐              │
                                            ▼              │
                                         archived ──restore─┘
```

- Agents are **created as `draft`**. Nothing runs until an admin activates it.
- Invalid transition ⇒ `409 invalid_transition`.
- Failed activation is impossible to reach from `archived` (archive → restore first).

### Settings (platform operator)
`GET /settings` any authenticated user → array of `{key, value, updated_at}`.
`PUT /settings` **superadmin only** `{key, value}` → upsert + audit event. Use for feature flags
(e.g. `platform.banner`, `providers.default`).

### Audit events
`GET /workspaces/{workspace_id}/audit` → `{items: [{id, workspace_id, actor_user_id, event_type,
target_type, target_id, metadata, correlation_id, created_at}], total, limit, offset}`.
Common `event_type`s: `workspace.created`, `user.registered`,
`agent.created|updated|activated|paused|archived|deleted`,
`workspace.member_added|member_removed|member_role_changed`, `settings.updated`.

---

## 4. Schemas (typescript-friendly)

```ts
type Page<T> = { items: T[]; total: number; limit: number; offset: number };

type User = { id: string; email: string; display_name: string | null;
              is_superadmin: boolean; created_at: string; updated_at: string };

type Workspace = { id: string; name: string; slug: string; owner_id: string;
                   created_at: string; updated_at: string };

type Agent = { id: string; workspace_id: string; name: string; slug: string;
               description: string | null; status: 'draft'|'active'|'paused'|'archived';
               config: AgentConfig; created_at: string; updated_at: string };

type AgentConfig = { provider?: string | null; model?: string | null;
                     temperature?: number | null; max_tokens?: number | null;
                     tool_allowlist?: string[] | null } & Record<string, unknown>;

type AuditEvent = { id: string; workspace_id: string | null; actor_user_id: string | null;
                    event_type: string; target_type: string | null; target_id: string | null;
                    metadata: Record<string, unknown>; correlation_id: string | null;
                    created_at: string };

type Tokens = { access_token: string; refresh_token: string;
                 token_type: 'bearer'; expires_in: number };
```

Slugs: `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`, unique per workspace. Server generates one if omitted.

---

## 5. Versioning & compatibility policy

- v1 additive only: new optional fields may appear — the frontend must tolerate unknown keys.
  Never depend on key order; never use `additionalProperties` blindly.
- If a field must be removed: it stays ≥ 2 minor releases with `Deprecation: true` semantics in
  docs, then only in `/api/v2`.
- `x-api-version` response header may be added later; don't rely on it now.
- Regenerate types from `contracts/openapi.json` on every backend tag, e.g.:
  `npx openapi-typescript ../contracts/openapi.json -o src/lib/api-types.ts`

---

## 6. Real-time events (design intent, NOT yet implemented)

BATCH 02 ships **no** streaming transport. The planned shape (coordinate before relying on it):

- `GET /api/v1/workspaces/{workspace_id}/events` — Server-Sent Events (single stream) with
  `event: audit|agent.status|task.updated`, JSON `data:` payload shaped like the corresponding
  REST resource.
- Auth via `?access_token=` query param or `Last-Event-ID`.
- The frontend must poll `/workspaces/{id}/audit` (limit 1) as the interim dashboard refresh.
- WebSocket upgrade is explicitly deferred until the runtime bridge (BATCH 03/08).

Do not build against SSE yet; poll the audit endpoint (5–15 s) for "activity" feeds.

---

## 7. Frontend integration instructions

1. **Typed client first.** Generate TS types from `openapi.json`; wrap fetch with an interceptor
   that attaches the access token, unwraps the error envelope, and surfaces
   `correlation_id` in error toasts.
2. **Workspace switcher = tenancy boundary.** Every API call after login needs the active
   `workspace_id`; switching revalidates all queries. Never cache across workspaces without
   including `workspace_id` in the query key.
3. **Permission-aware UI.** Fetch `/auth/me` + workspace role (from `GET /workspaces/{id}/members`,
   match `user_id`) and hide/disable `activate/delete/members:manage` for lower roles. The backend
   still enforces — UI gating is UX, not security.
4. **Agent creation flow:** form → POST → show `draft` badge + "Activate" CTA for admins →
   optimistic transition via `/lifecycle` with rollback on `409 invalid_transition`.
5. **Lists:** implement offset pagination with `Page<T>` (e.g. TanStack Table `manualPagination`).
6. **Empty/error states** per error table above; never show raw `details` blobs to end users.
7. **No mocked backend.** Point `NEXT_PUBLIC_UAB_API_URL` at the dev control plane; the OpenAPI
   contract is the source of truth — if it isn't in `contracts/openapi.json`, it doesn't exist.
8. **Do not call Hermes directly** from the browser. The control plane (and later, its runtime
   bridge) is the only authorized origin for agent traffic.

---

## 8. Ownership

| Concern | Owner |
|---|---|
| Control-plane API, auth, RBAC, migrations, `openapi.json` | this repository |
| Frontend app, design system, state management | Google AI Studio frontend repo |
| Runtime behavior (tools, memory, execution) | Hermes upstream + `work/hermes-agent` patches |
| Integration arbitration | change docs/contracts here **first**, then frontend PR |

Questions/changes: open an issue/PR against this repository with `contract` in the title.
