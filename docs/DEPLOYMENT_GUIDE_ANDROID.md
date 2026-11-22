# Deployment guide — Android phone only

Everything below is doable in Chrome on a phone. There are two tracks:

- **Track A (recommended, no terminal):** Cloudflare dashboard + GitHub web editor + GitHub Actions.
- **Track B (optional):** GitHub Codespaces for a browser terminal when a CLI is genuinely easier.

You need: a GitHub account (repo already there), a Cloudflare account (free), and later a Shopify
Partner account for Phase 02.

---

## 0. What gets deployed

| Piece | Where | Notes |
|---|---|---|
| API | Cloudflare Worker `aism-api` | Hono app from `apps/api` |
| Database | D1 `aism-db` | Migrations in `apps/api/migrations` |
| Web | Cloudflare Pages `aism-web` | Static build from `apps/web/dist` |

---

## 1. Create the D1 database (Cloudflare dashboard)

1. <https://dash.cloudflare.com> → **Storage & Databases → D1 SQL Database → Create**.
2. Name: `aism-db`. Region: closest to you (e.g. ENAM/WEUR). Plan: **Free**.
3. Open the database and copy the **Database ID** (a UUID).
4. In GitHub, open `apps/api/wrangler.toml` → pencil icon → replace
   `REPLACE_WITH_D1_DATABASE_ID` with the UUID → **Commit changes**.

## 2. Create an API token for GitHub Actions

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**.
2. Use **Create Custom Token** with:
   - Permissions: *Account → Workers Scripts → Edit*, *Account → D1 → Edit*,
     *Account → Cloudflare Pages → Edit*.
   - Account resources: your account.
3. Copy the token once. Also copy your **Account ID** (Workers & Pages → right sidebar).
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

No secret is ever typed into the code or chat.

## 3. Run the deploy workflow

1. GitHub repo → **Actions** → **Deploy** → **Run workflow** → branch `main` → **Run**.
2. The workflow: installs, typechecks, tests, applies D1 migrations (`--remote`), deploys the Worker,
   builds the SPA and deploys to Pages.
3. Wait for green ticks. The Worker URL looks like `https://aism-api.<subdomain>.workers.dev`.
4. Open `https://aism-api.<subdomain>.workers.dev/api/health` in your phone browser. Expect:
   ```json
   {"status":"ok","checks":{"database":{"ok":true,"migrationsApplied":1}},
    "features":{"shopify":false,"ai":false,"automation":false}}
   ```
   If `migrationsApplied` is 0, the migration step failed — check the Action log.

The Pages URL is printed at the end of the deploy job (`https://aism-web.pages.dev` or similar).

> First Pages deploy may need the project to exist. If the job fails with "project not found",
> dashboard → **Workers & Pages → Create → Pages → Upload assets**, name it `aism-web`, then re-run.

## 4. Set the Worker secrets (Cloudflare dashboard)

Workers & Pages → `aism-api` → **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `APP_ORIGIN` | Secret/Plain | your Pages URL, e.g. `https://aism-web.pages.dev` |
| `SETUP_TOKEN` | Secret | a long random string you generate now (≥16 chars) |
| `SESSION_SECRET` | Secret | 32+ random characters (used to encrypt store tokens later) |
| `COOKIE_SAMESITE` | Plain | `none` while on `pages.dev` + `workers.dev`; `lax` once both share a domain |

Why `none`: `pages.dev` and `workers.dev` are different sites, so a `Lax` cookie is not sent on the
API call. The session is still protected by the CSRF token and Origin checks.

Click **Deploy** if the dashboard asks to redeploy after changing variables.

## 5. Complete first-run setup (phone)

1. Open the Pages URL. The app redirects to **Sign in** → tap **Create the owner account**.
2. Enter the `SETUP_TOKEN` from step 4, your email and a 12+ character password.
3. You land on the dashboard. It should say: store not connected, $0.00 AI spend, 10 agents
   registered, 0 executable, and Phase 1/8 complete.
4. Go to **Settings**, change the monthly ceiling to $4.00, save, confirm the change appears and an
   audit entry is created on **Activity**.
5. Delete the `SETUP_TOKEN` secret in Cloudflare now (it is no longer needed).

## 6. Optional: same-domain cookies (recommended later)

If you own a domain and move it to Cloudflare:

1. **Workers & Pages → aism-api → Settings → Domains & Routes → Add custom domain** →
   `api.yourdomain.com`.
2. **Pages → aism-web → Custom domains** → `app.yourdomain.com`.
3. Update `APP_ORIGIN` to `https://app.yourdomain.com` and set `COOKIE_SAMESITE=lax`.
4. Redeploy. Cookies are now first-party and `SameSite=Lax`.

## 7. Verify from the phone

| Check | Expected |
|---|---|
| `/api/health` | `status: ok`, `migrationsApplied ≥ 1` |
| Pages URL | Login screen; after sign-in, dashboard with honest empty states |
| Settings → save budget | Success message, value persists after reload |
| Activity | Entries for `auth.setup`, `auth.login`, `settings.budget.update` |
| Direct API call without cookie | `401 {"error":{"code":"unauthorized"}}` |
| Sign out, reload | Redirected to login |

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login succeeds but the next request is 401 | Cross-site cookie blocked | Set `COOKIE_SAMESITE=none`, `APP_ORIGIN` exactly matching the Pages origin (no trailing slash) |
| `403 Origin is not allowed` | `APP_ORIGIN` mismatch | Copy the origin from the browser address bar exactly |
| `503 Setup is disabled` | `SETUP_TOKEN` missing | Add the secret, redeploy |
| `409 An owner account already exists` | Setup already completed | Sign in; reset a forgotten password with a D1 query (below) |
| Health shows `degraded` | D1 binding/migration issue | Check `database_id`, re-run the deploy workflow |
| Action fails at `wrangler d1 migrations apply` | Wrong DB name or token scope | Confirm `database_name` in `wrangler.toml` and token permissions |

### Password reset (owner-only, deliberate)

Cloudflare dashboard → D1 → `aism-db` → **Console**:

```sql
DELETE FROM users;              -- removes the owner (sessions cascade)
DELETE FROM sessions;
```

Then set a fresh `SETUP_TOKEN` secret and complete setup again. If you prefer to keep audits, only
delete the `users` row. There is no email-based reset by design (no email provider in the $5 budget).

## 9. Phase 02 (Shopify) adds these deployment steps

1. Deploy first, then create the Partner app with the real Worker URL.
2. Add `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES` as Worker secrets.
3. Set the app's redirect URL to `https://<worker-host>/api/shopify/callback`.
4. Install on a **development** store before your live store.

## 10. Rollback

- Worker: Cloudflare → Workers & Pages → `aism-api` → **Deployments** → previous version → **Rollback**.
- Pages: Deployments → previous → **Rollback**.
- Database: migrations are additive; `wrangler d1 time-travel restore` is available on the free plan
  for recent points in time. Take an export before destructive changes.
