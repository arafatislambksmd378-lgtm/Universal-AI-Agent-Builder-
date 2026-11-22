import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@aism/core';
import type { AppBindings } from './env';
import { AppError } from './lib/errors';
import { requestContext } from './middleware/context';
import {
  applyCorsHeaders,
  applySecurityHeaders,
  cors,
  originGuard,
  securityHeaders,
} from './middleware/security';
import { loginSchema, setupSchema, budgetUpdateSchema } from './lib/validation';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { activityRoutes } from './routes/activity';
import { settingsRoutes } from './routes/settings';
import { agentsRoutes } from './routes/agents';
import { roadmapRoutes } from './routes/roadmap';
import { APP_VERSION } from './version';

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use('*', requestContext);
  app.use('*', securityHeaders);
  app.use('*', originGuard);
  app.use('*', cors);
  app.options('*', (c) => c.body(null, 204));

  app.get('/api', (c) =>
    c.json({
      name: 'AI Shopify Store Manager API',
      version: APP_VERSION,
      environment: c.env.ENVIRONMENT ?? 'unknown',
      endpoints: [
        'GET /api/health',
        'GET /api/auth/state',
        'POST /api/auth/setup',
        'POST /api/auth/login',
        'GET /api/auth/me',
        'POST /api/auth/logout',
        'GET /api/dashboard/summary',
        'GET /api/activity',
        'GET /api/settings',
        'PUT /api/settings/budget',
        'PUT /api/settings/permissions/:actionId',
        'GET /api/agents',
        'GET /api/roadmap',
      ],
    }),
  );

  app.route('/api/health', healthRoutes);
  app.route('/api/auth', authRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/api/activity', activityRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/agents', agentsRoutes);
  app.route('/api/roadmap', roadmapRoutes);

  app.notFound((c) => {
    const body: ApiErrorBody = {
      error: { code: 'not_found', message: 'Route not found', requestId: c.get('requestId') },
    };
    applySecurityHeaders(c.res?.headers ?? new Headers(), c.env);
    return c.json(body, 404);
  });

  app.onError((error, c) => {
    const logger = c.get('logger');
    const requestId = c.get('requestId') ?? 'unknown';
    const headers = new Headers();
    applySecurityHeaders(headers, c.env);
    applyCorsHeaders(headers, c.req.header('origin'), c.env);
    headers.set('x-request-id', requestId);

    const reply = (status: number, body: ApiErrorBody, extra?: Record<string, string>) => {
      for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value);
      return new Response(JSON.stringify(body), {
        status,
        headers: { ...Object.fromEntries(headers), 'content-type': 'application/json; charset=utf-8' },
      });
    };

    if (error instanceof AppError) {
      logger?.warn('request.failed', { code: error.code, status: error.status, message: error.message });
      if (error.code === 'rate_limited') {
        const details = error.details as { retryAfterSeconds?: number } | undefined;
        if (details?.retryAfterSeconds) headers.set('retry-after', String(details.retryAfterSeconds));
      }
      return reply(error.status, {
        error: { code: error.code, message: error.message, details: error.details, requestId },
      });
    }

    if (error instanceof ZodError) {
      return reply(400, {
        error: {
          code: 'bad_request',
          message: 'Some fields are invalid',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
          requestId,
        },
      });
    }

    if (error instanceof HTTPException) {
      return reply(error.status, {
        error: { code: 'http_error', message: error.message || 'Request failed', requestId },
      });
    }

    // Unexpected: log full detail server-side, return nothing sensitive.
    logger?.error('request.unhandled_error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join(' | ') : undefined,
    });
    return reply(500, {
      error: { code: 'internal_error', message: 'Unexpected server error', requestId },
    });
  });

  return app;
}

/** Exported for contract tests: request schemas used by the HTTP layer. */
export const requestSchemas = { setupSchema, loginSchema, budgetUpdateSchema };
