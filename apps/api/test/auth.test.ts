import { describe, expect, it } from 'vitest';
import {
  createOwnerSession,
  createTestContext,
  countRows,
  login,
  request,
  sessionCookieFrom,
  TEST_SETUP_TOKEN,
} from './helpers';

describe('first-run setup', () => {
  it('requires the configured setup token', async () => {
    const ctx = createTestContext();
    const response = await request(ctx, '/api/auth/setup', {
      body: { setupToken: 'wrong-token-0000000', email: 'a@example.com', password: 'a very long password' },
    });
    expect(response.status).toBe(403);
    expect(countRows(ctx.db, 'users')).toBe(0);
  });

  it('refuses to run when SETUP_TOKEN is missing from the server', async () => {
    const ctx = createTestContext({ SETUP_TOKEN: undefined });
    const response = await request(ctx, '/api/auth/setup', {
      body: { setupToken: 'anything-at-all', email: 'a@example.com', password: 'a very long password' },
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('SETUP_TOKEN');
  });

  it('rejects weak passwords and invalid email addresses', async () => {
    const ctx = createTestContext();
    const short = await request(ctx, '/api/auth/setup', {
      body: { setupToken: TEST_SETUP_TOKEN, email: 'a@example.com', password: 'short' },
    });
    expect(short.status).toBe(400);
    const badEmail = await request(ctx, '/api/auth/setup', {
      body: { setupToken: TEST_SETUP_TOKEN, email: 'not-an-email', password: 'a very long password' },
    });
    expect(badEmail.status).toBe(400);
    expect(countRows(ctx.db, 'users')).toBe(0);
  });

  it('creates the owner with a hardened session cookie', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    expect(session.setCookie).toContain('HttpOnly');
    expect(session.setCookie).toContain('SameSite=Lax');
    expect(session.setCookie).toContain('Path=/');
    expect(session.setCookie).toMatch(/Expires=/);
    expect(session.setCookie).not.toContain('Secure');
    expect(countRows(ctx.db, 'users')).toBe(1);
  });

  it('is a one-time operation', async () => {
    const ctx = createTestContext();
    await createOwnerSession(ctx);
    const second = await request(ctx, '/api/auth/setup', {
      body: { setupToken: TEST_SETUP_TOKEN, email: 'other@example.com', password: 'another long password' },
    });
    expect(second.status).toBe(409);
    expect(countRows(ctx.db, 'users')).toBe(1);
  });

  it('reports setup availability through /api/auth/state', async () => {
    const ctx = createTestContext();
    const before = (await (await request(ctx, '/api/auth/state')).json()) as {
      setupAvailable: boolean;
      setupTokenConfigured: boolean;
    };
    expect(before).toMatchObject({ setupAvailable: true, setupTokenConfigured: true });
    await createOwnerSession(ctx);
    const after = (await (await request(ctx, '/api/auth/state')).json()) as { setupAvailable: boolean };
    expect(after.setupAvailable).toBe(false);
  });
});

describe('login and sessions', () => {
  it('stores only a hash of the session token', async () => {
    const ctx = createTestContext();
    const { cookie } = await createOwnerSession(ctx);
    const row = ctx.db.db.prepare('SELECT token_hash FROM sessions LIMIT 1').get() as {
      token_hash: string;
    };
    expect(row.token_hash).not.toBe(cookie);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toContain(cookie);
  });

  it('logs in with the correct password', async () => {
    const ctx = createTestContext();
    await createOwnerSession(ctx, { email: 'owner@example.com', password: 'correct horse battery staple' });
    const response = await login(ctx, {
      email: 'OWNER@example.com',
      password: 'correct horse battery staple',
    });
    expect(response.status).toBe(200);
    const cookie = sessionCookieFrom(response);
    expect(cookie.length).toBeGreaterThan(20);
    const me = await request(ctx, '/api/auth/me', { cookie });
    expect(me.status).toBe(200);
  });

  it('returns an identical error for wrong password and unknown account', async () => {
    const ctx = createTestContext();
    await createOwnerSession(ctx);
    const wrong = await login(ctx, { email: 'owner@example.com', password: 'wrong password here' });
    const unknown = await login(ctx, { email: 'nobody@example.com', password: 'wrong password here' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const wrongBody = (await wrong.json()) as { error: { code: string; message: string; requestId: string } };
    const unknownBody = (await unknown.json()) as { error: { code: string; message: string; requestId: string } };
    // Identical apart from the correlation id: no account enumeration.
    const { requestId: _w, ...wrongRest } = wrongBody.error;
    const { requestId: _u, ...unknownRest } = unknownBody.error;
    expect(wrongRest).toEqual(unknownRest);
  });

  it('locks the account after ten consecutive failures', async () => {
    const ctx = createTestContext();
    await createOwnerSession(ctx);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await login(ctx, { email: 'owner@example.com', password: 'not the password' });
      expect([401, 429]).toContain(response.status);
    }
    const locked = await login(ctx, { email: 'owner@example.com', password: 'not the password' });
    expect(locked.status).toBe(429);
    const row = ctx.db.db
      .prepare('SELECT locked_until FROM users WHERE email = ?')
      .get('owner@example.com') as { locked_until: string | null };
    expect(row.locked_until).toBeTruthy();
    // A locked account cannot be brute-forced with the correct password either.
    const correct = await login(ctx, {
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    });
    expect(correct.status).toBe(429);
  });

  it('exposes the CSRF token to the authenticated client only', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const anonymous = await request(ctx, '/api/auth/me');
    expect(anonymous.status).toBe(401);

    const me = (await (await request(ctx, '/api/auth/me', { cookie: session.cookie })).json()) as {
      session: { csrfToken: string };
      user: { email: string };
    };
    expect(me.session.csrfToken).toBe(session.csrf);
    expect(me.user.email).toBe('owner@example.com');
  });

  it('revokes the session on logout and refuses the old cookie', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const logout = await request(ctx, '/api/auth/logout', {
      method: 'POST',
      cookie: session.cookie,
      csrf: session.csrf,
    });
    expect(logout.status).toBe(200);
    const after = await request(ctx, '/api/auth/me', { cookie: session.cookie });
    expect(after.status).toBe(401);
  });

  it('rejects a forged or expired session cookie', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    expect((await request(ctx, '/api/auth/me', { cookie: 'forged-token' })).status).toBe(401);

    ctx.db.db
      .prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'")
      .run();
    expect((await request(ctx, '/api/auth/me', { cookie: session.cookie })).status).toBe(401);
  });

  it('writes an audit trail for authentication events', async () => {
    const ctx = createTestContext();
    await createOwnerSession(ctx);
    await login(ctx, { email: 'owner@example.com', password: 'nope nope nope' });
    const actions = ctx.db.db
      .prepare('SELECT action, outcome FROM audit_logs ORDER BY created_at')
      .all() as Array<{ action: string; outcome: string }>;
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: 'auth.setup', outcome: 'success' },
        { action: 'auth.login', outcome: 'success' },
        { action: 'auth.login', outcome: 'failure' },
      ]),
    );
    // No password material is ever written to the audit log.
    const metadata = ctx.db.db
      .prepare("SELECT metadata FROM audit_logs WHERE metadata IS NOT NULL")
      .all()
      .map((row: { metadata: string }) => row.metadata.toLowerCase())
      .join(' ');
    expect(metadata).not.toContain('correct horse');
  });
});
