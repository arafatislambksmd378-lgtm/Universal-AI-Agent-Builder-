import { describe, expect, it } from 'vitest';
import { createOwnerSession, createTestContext, request } from './helpers';

describe('authorization boundaries', () => {
  it('protects every data route behind a session', async () => {
    const ctx = createTestContext();
    for (const path of [
      '/api/dashboard/summary',
      '/api/activity',
      '/api/settings',
      '/api/agents',
      '/api/roadmap',
    ]) {
      const response = await request(ctx, path);
      expect(response.status, path).toBe(401);
    }
  });

  it('requires a CSRF token for authenticated mutations', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);

    const missing = await request(ctx, '/api/settings/budget', {
      method: 'PUT',
      cookie: session.cookie,
      body: { monthlyLimitCents: 400, dailyLimitCents: 40, warningThresholdPct: 80 },
    });
    expect(missing.status).toBe(403);
    expect(((await missing.json()) as { error: { message: string } }).error.message).toContain(
      'CSRF',
    );

    const wrong = await request(ctx, '/api/settings/budget', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: 'not-the-token',
      body: { monthlyLimitCents: 400, dailyLimitCents: 40, warningThresholdPct: 80 },
    });
    expect(wrong.status).toBe(403);

    const correct = await request(ctx, '/api/settings/budget', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      body: { monthlyLimitCents: 400, dailyLimitCents: 40, warningThresholdPct: 80 },
    });
    expect(correct.status).toBe(200);
  });

  it('rejects cross-origin writes from an unlisted origin', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const response = await request(ctx, '/api/settings/budget', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      origin: 'https://evil.example',
      body: { monthlyLimitCents: 1, dailyLimitCents: 1, warningThresholdPct: 1 },
    });
    expect(response.status).toBe(403);
  });

  it('rejects cross-origin writes when no APP_ORIGIN is configured', async () => {
    const ctx = createTestContext({ APP_ORIGIN: '' });
    const session = await createOwnerSession(ctx, { origin: null });
    const response = await request(ctx, '/api/settings/budget', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      origin: 'https://anything.example',
      body: { monthlyLimitCents: 1, dailyLimitCents: 1, warningThresholdPct: 1 },
    });
    expect(response.status).toBe(403);
  });

  it('only sends CORS credentials to allow-listed origins', async () => {
    const ctx = createTestContext();
    const allowed = await request(ctx, '/api/health', { origin: 'https://app.example.com' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    const denied = await request(ctx, '/api/health', { origin: 'https://evil.example' });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers CORS preflight for the allowed origin', async () => {
    const ctx = createTestContext();
    const response = await request(ctx, '/api/settings/budget', {
      method: 'OPTIONS',
      origin: 'https://app.example.com',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('PUT');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-csrf-token');
  });

  it('rate-limits login attempts from one address', async () => {
    const ctx = createTestContext();
    await createOwnerSession(ctx);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(ctx, '/api/auth/login', {
        body: { email: 'owner@example.com', password: 'wrong password' },
        ip: '198.51.100.9',
      });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it('never returns secrets in API responses', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const settings = await request(ctx, '/api/settings', { cookie: session.cookie });
    const payload = await settings.text();
    expect(payload).not.toContain(ctx.env.SETUP_TOKEN!);
    expect(payload).not.toContain(ctx.env.SESSION_SECRET!);
    expect(payload.toLowerCase()).not.toContain('password_hash');
    expect(payload.toLowerCase()).not.toContain('session_secret');

    const health = await request(ctx, '/api/health');
    const healthPayload = await health.text();
    expect(healthPayload).not.toContain(ctx.env.SETUP_TOKEN!);
  });

  it('ignores a client-supplied role or user id', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const me = await request(ctx, '/api/auth/me', {
      cookie: session.cookie,
      headers: { 'x-user-id': 'usr_other', 'x-role': 'admin' },
    });
    const body = (await me.json()) as { user: { id: string; role: string } };
    expect(body.user.id).toBe(session.user.id);
    expect(body.user.role).toBe('owner');
  });

  it('rejects malformed JSON with a 400 rather than a 500', async () => {
    const ctx = createTestContext();
    const response = await ctx.app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.55' },
        body: '{not json',
      },
      ctx.env,
    );
    expect(response.status).toBe(400);
  });
});
