import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '@aism/core';
import { createTestContext, request } from './helpers';

describe('GET /api/health', () => {
  it('reports a healthy database and applied migrations', async () => {
    const ctx = createTestContext();
    const response = await request(ctx, '/api/health');
    expect(response.status).toBe(200);

    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe('ok');
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.database.migrationsApplied).toBeGreaterThanOrEqual(1);
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('advertises only implemented features', async () => {
    const ctx = createTestContext();
    const body = (await (await request(ctx, '/api/health')).json()) as HealthResponse;
    expect(body.features).toEqual({ shopify: false, ai: false, automation: false });
  });

  it('sets hardening headers and a request id', async () => {
    const ctx = createTestContext();
    const response = await request(ctx, '/api/health');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('degrades instead of crashing when the database is unreachable', async () => {
    const ctx = createTestContext();
    const broken = {
      ...ctx.env,
      DB: {
        prepare() {
          throw new Error('D1_ERROR: no such table');
        },
      } as unknown as D1Database,
    };
    const response = await ctx.app.request('/api/health', {}, broken);
    expect(response.status).toBe(503);
    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe('degraded');
    expect(body.checks.database.ok).toBe(false);
    // Internal driver detail must not leak.
    expect(JSON.stringify(body)).not.toContain('D1_ERROR');
  });

  it('returns JSON (never HTML) for unknown routes', async () => {
    const ctx = createTestContext();
    const response = await request(ctx, '/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('lists its endpoints at /api', async () => {
    const ctx = createTestContext();
    const response = await request(ctx, '/api');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { endpoints: string[] };
    expect(body.endpoints).toContain('GET /api/health');
  });
});
