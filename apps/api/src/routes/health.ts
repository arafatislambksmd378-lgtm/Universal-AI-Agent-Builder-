import { Hono } from 'hono';
import type { HealthResponse } from '@aism/core';
import type { AppBindings } from '../env';
import { APP_VERSION } from '../version';

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get('/', async (c) => {
  const started = Date.now();
  const checks: HealthResponse['checks'] = {
    database: { ok: false, latencyMs: 0, migrationsApplied: 0 },
  };

  try {
    const row = await c.env.DB.prepare(
      'SELECT COUNT(*) AS migrations FROM schema_migrations',
    ).first<{ migrations: number }>();
    checks.database = {
      ok: true,
      latencyMs: Date.now() - started,
      migrationsApplied: Number(row?.migrations ?? 0),
    };
  } catch (error) {
    c.get('logger').error('health.database_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    checks.database = {
      ok: false,
      latencyMs: Date.now() - started,
      migrationsApplied: 0,
      error: 'database_unavailable',
    };
  }

  const body: HealthResponse = {
    status: checks.database.ok ? 'ok' : 'degraded',
    version: APP_VERSION,
    environment: c.env.ENVIRONMENT ?? 'unknown',
    time: new Date().toISOString(),
    checks,
    // Feature flags reflect what this build actually implements.
    features: { shopify: false, ai: false, automation: false },
  };

  return c.json(body, checks.database.ok ? 200 : 503);
});
