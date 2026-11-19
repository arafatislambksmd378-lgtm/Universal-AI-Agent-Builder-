# Control Plane API — Google AI Studio Frontend Contract

**Audience:** the frontend (Next.js + shadcn/ui) built with Google AI Studio.
**Backend owner:** this repository (`platform/`). **Frontend owner:** frontend repo — this file is the
coupling between the two and changes only here, first.

- Base URL: `https://<control-plane-host>` (dev: `http://127.0.0.1:8000`)
- Everything except health lives under **`/api/v1`**
- Format: JSON UTF-8
- Machine-readable artifact: `contracts/openapi.json` (16 paths, CI drift-checked)
- Stability: additive within v1; breaking changes ⇒ ADR + `/api/v2` + this doc first
- Last updated: BATCH 02 final review (avatar identity, agent activity endpoint, audit filters,
  JWT issuer pinning, admin-gated lifecycle, opt-in CORS)

---

## 1. Product & visual direction (input to the frontend design system)

These are design inputs agreed with the project owner. The backend does not store them; they are
recorded here so frontend work (in the frontend repo) starts aligned.

- Clean, professional, modern; white / near-white backgrounds
- Purple as the primary accent (e.g. `#7c3aed` family: 600/700 for actions, 100–300 tints for fills)
- Subtle gradients and shadows; carefully designed rounded cards (≈ `0.75–1.25rem` radius)
- Compact, intuitive navigation (sidebar + top workspace switcher)
- Responsive: desktop ≥1280px, tablet ≥768px, mobile stacked layouts
- **Functional pages, not decorative dashboards**: every card/row maps to live API data (§4)
- Empty states guide the next action ("Create your first agent", not lorem ipsum)

---

## 2. Authentication & session flow

JWT pair. Access token (default **15 min**) + refresh token (default **30 days**), HS256, issuer
`uab-control-plane` (pinned and verified). `typ` claim separates access/refresh; a refresh token can
never be used as an access token and vice versa.

```http
POST /api/v1/auth/register   { "email": "ada@example.com", "password": "min 12 chars", "display_name": "Ada" }
POST /api/v1/auth/login      { "email": "ada@example.com", "password": "…" }
POST /api/v1/auth/refresh    { "refresh_token": "…" }
GET  /api/v1/auth/me         Authorization: Bearer <access_token>
```

Register → `201` (or `403 registration_closed` once the first-run bootstrap has happened and
`UAB_ALLOW_OPEN_REGISTRATION=false`; the very first account on an empty instance is auto-bootstrapped
as the owner of a personal workspace).

All → `{ "user": User, "tokens": Tokens, "workspace"?: Workspace }` (login/refresh return `user` +
`tokens`; register adds `workspace`). Login returns `401 bad_credentials` for wrong
email/password (identical message either way — no account enumeration).

Frontend session handling:
1. Store tokens in memory; optionally persist the refresh token in an `httpOnly` cookie via a thin
   BFF. **Never** `localStorage`.
2. Interceptor: on `401` with code `expired_token`, call `/auth/refresh` once, retry the request;
   if refresh fails, hard logout.
3. Send `X-Correlation-ID` on support-relevant requests and render it on error screens.
4. Tokens carry `iss/sub/typ/iat/exp/jti` — do not decode for authorization decisions; always call
   `/auth/me` (or your cached copy of it) for identity.

**Cross-origin:** the API serves no CORS allowlist by default. If your dev frontend runs on
`http://127.0.0.1:3000`, the control plane must be configured with
`UAB_CORS_ORIGINS=http://127.0.0.1:3000` (credentials allowed). Configure it server-side; never
bypass by proxying blindly.

---

## 3. Error envelope (all non-2xx)

```json
{ "error": { "code": "workspace_not_found", "message": "workspace not found",
             "details": null, "correlation_id": "a1b2c3…" } }
```

| HTTP | code (examples) | UI guidance |
|---|---|---|
| 400 | `invalid_payload`, `invalid_slug` | inline form error |
| 401 | `unauthenticated`, `expired_token`, `token invalid` | refresh-once → re-login |
| 403 | `forbidden`, `registration_closed`, `insufficient_permissions`, `provider_disabled` | hide/disable the affordance; explain role |
| 404 | `not_found` (incl. cross-workspace references — existence is never leaked) | not-found view |
| 409 | `conflict`, `slug_taken`, `invalid_transition`, `last_owner` | actionable toast with `message` |
| 422 | `validation_error` (`details` = field list with `loc`) | map `loc` → form fields |
| 500 | `internal_error` | generic error + show `correlation_id` |
| 503 | `provider_unavailable` (when a flow depends on a provider; none in BATCH 02 UI paths) | retry/status page |

---

## 4. Endpoint reference (complete; examples are abbreviated)

Health (no auth): `GET /health` → `{status, version}` · `GET /health/ready` →
`{status, checks:{database}, version}` (503 when the DB is unreachable).

### Workspaces
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/workspaces` | user | body `{name, slug?}` → 201 `Workspace` |
| GET | `/workspaces` | user | → `Workspace[]` (caller's workspaces; **not** paginated) |
| GET | `/workspaces/{workspace_id}` | viewer+ | 404 if not a member |
| PATCH | `/workspaces/{workspace_id}` | admin+ | body `{name?}` → `Workspace` |
| DELETE | `/workspaces/{workspace_id}` | owner | 204; audit row survives (`workspace_id` set NULL) |
| GET | `/workspaces/{workspace_id}/members` | viewer+ | → `Member[]` (`{user_id,email,display_name,role,created_at}`) |
| POST | `/workspaces/{workspace_id}/members` | admin+ | `{email, role}`; target must already have an account (no email invites yet) |
| PATCH | `/workspaces/{workspace_id}/members/{user_id}` | admin+ | `{role}`; only owners may grant/revoke `owner`; last owner protected (409) |
| DELETE | `/workspaces/{workspace_id}/members/{user_id}` | admin+ | last owner protected (409) |

### Agents
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/workspaces/{workspace_id}/agents` | member+ | `AgentCreate` → 201; **always starts `draft`** |
| GET | `/workspaces/{workspace_id}/agents` | viewer+ | query: `status=draft\|active\|paused\|archived`, `limit`(1–100, def 20), `offset` → `Page<Agent>` |
| GET | `/workspaces/{workspace_id}/agents/{agent_id}` | viewer+ | full `Agent` incl. avatar + capabilities + config |
| PATCH | `/workspaces/{workspace_id}/agents/{agent_id}` | member+ | partial `AgentUpdate` (name/role/description/avatar_*/capabilities/system_instructions/config) |
| DELETE | `/workspaces/{workspace_id}/agents/{agent_id}` | admin+ | 204 |
| POST | `/workspaces/{workspace_id}/agents/{agent_id}/lifecycle` | **admin+** | `{action: activate\|pause\|archive\|restore}` |
| GET | `/workspaces/{workspace_id}/agents/{agent_id}/activity` | **admin+** (`audit:read`) | → `Page<AuditEvent>` scoped to this agent |

> **Member capability note:** members may create agents and edit any agent field, including a
> `paused`/`active` agent's config — but **only admins can change execution state** (lifecycle) and
> **only admins can read activity/audit**. Build UIs so this is obvious (disabled controls +
> tooltips), not merely absent.

### Audit & settings
| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/workspaces/{workspace_id}/audit` | admin+ | query: `event_type`, `target_type`, `target_id`, `limit`, `offset` → `Page<AuditEvent>` |
| GET | `/settings` | user | → `AppSettingItem[]` (`{key, value, updated_at}`) |
| PUT | `/settings` | **superadmin** | `{key, value}` upsert; emits `settings.updated` audit |

### Request/response examples (abbreviated)

Create agent:

```http
POST /api/v1/workspaces/7e4c…/agents
{ "name": "Nova", "role": "research-analyst",
  "description": "Digs through docs and summarises.",
  "avatar_id": "preset-nova-01", "avatar_type": "preset", "avatar_style": "2d-cute",
  "avatar_metadata": { "palette": ["#7c3aed", "#c4b5fd"], "mood": "curious", "seed": 42 },
  "capabilities": ["research", "summarization"],
  "config": { "provider": "ollama", "model": "llama3.2", "max_tokens": 512,
              "tool_allowlist": ["web-search"], "budget_cents": 0 } }
```

→ `201` `Agent` (status `draft`; slug auto-generated, unique per workspace).

Activate: `POST …/agents/{id}/lifecycle {"action":"activate"}` → `200` Agent with `status:"active"`;
from `archived` ⇒ `409 invalid_transition` (restore first). Archive is reversible via `restore`.

Activity feed: `GET …/agents/{id}/activity?limit=10` → `Page<AuditEvent>`; newest first;
`total` is the full count for pagination controls.

---

## 5. Schemas (TypeScript)

```ts
type Page<T> = { items: T[]; total: number; limit: number; offset: number };

type User = { id: string; email: string; display_name: string;
              is_superadmin: boolean; created_at: string; updated_at: string };

type Workspace = { id: string; name: string; slug: string;
                   created_at: string; updated_at: string };

type Member = { user_id: string; email: string; display_name: string;
                role: 'viewer'|'member'|'admin'|'owner'; created_at: string };

type AvatarType = 'preset' | 'upload' | 'url' | 'generated';

type Agent = {
  id: string; workspace_id: string; slug: string; name: string; role: string;
  description: string;
  /** legacy free-form reference kept for older clients; prefer the avatar_* fields */
  avatar_ref: string | null;
  avatar_id: string | null;        // preset id or upload key
  avatar_url: string | null;       // absolute URL for url/upload/generated types
  avatar_type: AvatarType | null;
  avatar_style: string | null;     // e.g. '2d-cute', 'flat', 'pixel'
  avatar_metadata: Record<string, unknown> | null;  // frontend-defined (palette, mood, seed, …)
  capabilities: string[];          // ['research','summarization',…] identity tags (≠ tool permissions)
  status: 'draft' | 'active' | 'paused' | 'archived';
  created_by: string | null; created_at: string; updated_at: string;
  config: AgentConfig | null;
  /** RESERVED (org model, BATCH 04+) — always null in v1 today; safe to render as hidden */
  team: string | null;
  /** RESERVED (org model, BATCH 04+) — always null in v1 today */
  organization: string | null;
};

type AgentConfig = { provider: string | null; model: string | null;
                     temperature: number | null; max_tokens: number | null;
                     tool_allowlist: string[]; memory_policy: Record<string, unknown>;
                     budget_cents: number | null; updated_at: string | null };

type AuditEvent = { id: number; workspace_id: string | null; actor_user_id: string | null;
                    event_type: string; target_type: string | null; target_id: string | null;
                    metadata: Record<string, unknown>; correlation_id: string | null;
                    created_at: string };

type AppSettingItem = { key: string; value: unknown; updated_at: string };

type Tokens = { access_token: string; refresh_token: string;
                 token_type: 'bearer'; expires_in: number };

type ErrorEnvelope = { error: { code: string; message: string;
                                details: unknown; correlation_id: string } };
```

Slug rules: `^[a-z0-9][a-z0-9-]{1,62}$`. Capability tags: `^[a-z0-9][a-z0-9_.-]{0,39}$`, ≤40 tags,
normalized lowercase + de-duplicated server-side. `avatar_type` values: `preset` (platform
character library — the frontend ships this artwork), `upload` (user-supplied file; storage is a
frontend/BFF concern in v1), `url` (direct external image), `generated` (reserved; backend does not
call any image-generation provider yet).

---

## 6. Agent identity & the avatar system

Every agent has a consistent visual identity carried across the whole UI: cards, profile header,
tables, activity feed, approvals queue, future chat surface.

**Backend contract (implemented):** `avatar_id`, `avatar_url`, `avatar_type`, `avatar_style`,
`avatar_metadata` (opaque JSON), `capabilities`. The backend validates shape/size only — it never
calls an image-generation provider and never interprets `avatar_metadata` keys. That keeps the
backend provider-independent and lets you iterate on art without migrations.

**Frontend responsibilities (frontend repo):**
1. **Preset library** — ship the friendly 2D characters as static assets (e.g. `public/avatars/`),
   keyed by `avatar_id` (`preset-nova-01`, `preset-orbit-02`, …) with the palettes/expressions from
   your character references. Distinct silhouettes + accent colors + expression variants; consistent
   across pages.
2. **Main assistant character** — reserve a dedicated `avatar_id` (suggested: `preset-mascot-main`)
   for the default workspace assistant / onboarding guide; it is the same "mascot" everywhere
   (logo, empty states, chat), not just another agent.
3. **Custom avatars** — support `upload`/`url` by rendering `avatar_url` with a graceful fallback
   to a generated placeholder (initials on purple gradient).
4. **`avatar_metadata`** — define your own keys; suggested: `palette: [primary, secondary]`,
   `mood: 'curious'|'focused'|'playful'|'calm'`, `seed: number` (for deterministic decorative
   animation), `idle_animation: 'blink'|'bob'|'wave'`. Treat unknown keys as ignorable.
5. **Consistency** — one `<AgentAvatar>` component keyed off `avatar_id || avatar_url || name`;
   do not fork styles inline per page.

Display data around the avatar: `name`, `role`, `description`, `status` (badge), `capabilities`
(chips), `team`/`organization` (hidden until non-null — reserved keys, §9), `config.provider/model`
(small "engine" sublabel), and recent activity via §8.

---

## 7. Lifecycle (visible to the user; enforced server-side)

```
draft ──activate──▶ active ──pause──▶ paused ──activate──▶ active
  │                  │                                    ▲
  └─────────archive──┴──────────────archive──┐            │
                                              ▼            │
                                           archived ──restore (→ draft)
```

- New agents are `draft` and can never act; the primary CTA for admins is "Activate".
- Invalid transition ⇒ `409 invalid_transition` with `details: {action, current_status}`.
- `paused` agents are shown with a paused badge and are excluded from dispatch (once dispatch exists).
- `archived` agents are hidden from default lists (`GET …/agents?status=active,paused` is your
  default filter) but restorable.

---

## 8. Live activity & monitoring — contract for the future (NOT IMPLEMENTED)

BATCH 02 ships **no** streaming transport. This section pins the contract so the frontend can be
built forward-compatibly and so the backend can implement it without breaking changes.

**Chosen approach: Server-Sent Events** at a single stream endpoint (WebSocket only if a future
use-case needs bidirectional traffic, e.g. human-in-loop free-form approvals):

```http
GET /api/v1/workspaces/{workspace_id}/events     (planned; today: 404)
Accept: text/event-stream
Authorization: Bearer <access_token>   (or ?access_token= for EventSource)
```

Event envelope:

```json
{ "seq": 1284, "type": "agent.task.progress", "occurred_at": "2026-11-13T10:01:02Z",
  "workspace_id": "7e4c…",
  "data": { "agent_id": "3f9b…", "task_id": "a81c…", "progress": 0.4,
            "label": "Reading 12 of 30 sources" } }
```

Reserved event types (frontend may register handlers; all are additive within v1):

| Event | `data` sketch | Source batch |
|---|---|---|
| `agent.status` | `{agent_id, status: draft|active|paused|archived, by: user_id}` | 02 (lifecycle today via audit) |
| `agent.task.started` | `{agent_id, task_id, title}` | 03+/08 |
| `agent.task.progress` | `{agent_id, task_id, progress: 0..1, label?}` | 08 |
| `agent.task.completed` | `{agent_id, task_id, duration_ms}` | 08 |
| `agent.task.failed` | `{agent_id, task_id, error_code, message}` | 08 |
| `approval.required` | `{agent_id, task_id, reason, risk}` | 10/12 |
| `a2a.message` | `{from_agent_id, to_agent_id, summary}` | 09 |

Rules: events are ordered by `seq` per workspace; `Last-Event-ID` replays missed events; keep-alive
comment every 15 s; client reconnects with backoff; UI must always have a polling fallback.

**Interim (available now):** poll the audit feed — `GET …/agents/{id}/activity` (agent profile) and
`GET …/audit?limit=10&target_id={id}` / `?event_type=agent.activated` (workspace activity widget) —
every 5–15 s. `AgentResponse.updated_at` doubles as a cheap "what changed" signal.

---

## 9. Forward compatibility & reserved extension points

Designed so the following BATCH 03–14 features land **additively** in v1 without breaking your client:

- **Teams, team leaders, organizations, departments, CEO-led orgs** (BATCH 04–06): new
  `/workspaces/{id}/teams…` resources + non-null `Agent.team` / `Agent.organization` (already
  present, always `null` today). Do not build against non-null values yet; do hide/show on
  truthiness so no UI rewrite is needed.
- **Visual Agent Builder / Workflow Builder** (BATCH 07/08): new `workflows` resources + draft
  graphs; agent `config.memory_policy` and `tool_allowlist` are already in place.
- **Knowledge Base** (BATCH 09): new `kb_collections`; agent config gains optional `kb_refs`.
- **Tools & Skills** (BATCH 07): `skills` resources; `tool_allowlist` already wires execution
  permissions (RBAC-gated separately from identity capabilities).
- **API Management** (BATCH 13): hashed per-workspace API keys for runtime→control-plane calls.
- **Live Activity** (§8): SSE stream + `approval.required` events.
- **Approval Management** (BATCH 10): decisions recorded as audit events `approval.approved|rejected`.

Compatibility rules (both sides): additive fields only in v1; unknown fields must be ignored by the
frontend; never switch on absence/presence of reserved keys; regenerate types from
`contracts/openapi.json` on every backend tag
(`npx openapi-typescript ../contracts/openapi.json -o src/lib/api-types.ts`).

---

## 10. Pagination & filtering

Lists that can grow return `Page<T>`: `{items, total, limit, offset}`. `limit` 1–100 (default **20**
except agents, where default is 20; audit default 20). TanStack Table/SWR:
`useInfiniteQuery`/`useQuery` with `offset += limit` pages, or offset state in the URL (`?page=2`).
Filters shipped today: agents — `status`; audit — `event_type`, `target_type`, `target_id`.

---

## 11. Frontend integration checklist

1. Generate types from `openapi.json`; wrap `fetch` with auth + error-envelope interceptor.
2. Workspace switcher scopes every query key (`['agents', workspaceId, page]`).
3. Permission-aware UI from `GET /auth/me` + membership role (match your `user_id` in the members
   list): hide/disable lifecycle, members admin, audit reads, settings PUT (superadmin).
4. Agent creation wizard: identity step (name/role/description) → avatar picker (preset library +
   custom URL) → capabilities chips → review; submit; show `draft` + admin "Activate" CTA.
5. Agent profile: header (avatar, name, role, status badge, capabilities chips) + tabs
   [Overview (config, provider/model)] [Activity (admin; poll `…/activity`)] [Settings (edit)].
6. Lists: offset pagination; default filter `status=active,paused` for “Running agents” view;
   archived under an opt-in filter.
7. No direct Hermes/runtime calls from the browser. The control plane is the only origin.
8. No mocked backend: point `NEXT_PUBLIC_UAB_API_URL` at the real control plane; implement against
   this contract, not against imagined endpoints.
9. Errors: map `error.code` → message; log `correlation_id`; never render raw `details`.
10. Onboarding: empty workspace → "Add member" / "Create first agent" steps; the main mascot
    (§6, suggestion `preset-mascot-main`) as the guide.

---

## 12. Ownership & change control

| Concern | Owner |
|---|---|
| This contract + `contracts/openapi.json` | this repository (PR + ADR for changes) |
| Frontend implementation | Google AI Studio frontend repo |
| Runtime behavior | Hermes upstream + `work/hermes-agent` patches (BATCH 03+) |

Contract changes: PR against this repo with `contract` in the title; `contracts/openapi.json` is
regenerated in CI and drift fails the build. **Do not implement frontend-side behavior that
contradicts this document.**

## 13. Change log

- 2026-11-13 (BATCH 02 foundation): initial contract — auth, workspaces, members, agents CRUD +
  lifecycle, audit, settings; standard envelope; RBAC table.
- (audit vocabulary) `agent.activated|paused|archived|restored` are the post-condition names
  for lifecycle actions (code aligned to docs).
- 2026-11-13 (BATCH 02 final review): avatar identity fields + capability tags on Agent;
  `GET …/agents/{id}/activity`; audit `target_type`/`target_id` filters; lifecycle documented as
  **admin-only**; JWT `iss` pinned; opt-in CORS for browser clients; live-activity contract §8
  formalized as SSE (still not implemented); reserved `team`/`organization` keys documented.
