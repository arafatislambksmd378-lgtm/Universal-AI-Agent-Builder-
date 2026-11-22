import type { MiddlewareHandler } from 'hono';
import type { AppBindings, Env } from '../env';
import { forbidden } from '../lib/errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function allowedOrigins(env: Pick<Env, 'APP_ORIGIN'>): string[] {
  return (env.APP_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0);
}

export function isAllowedOrigin(origin: string | undefined, env: Pick<Env, 'APP_ORIGIN'>): boolean {
  if (!origin) return false;
  const list = allowedOrigins(env);
  return list.includes(origin.replace(/\/$/, ''));
}

/** Security headers for API responses (the web app sets its own CSP). */
export function applySecurityHeaders(headers: Headers, env: Pick<Env, 'ENVIRONMENT'>): void {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'geolocation=(), microphone=(), camera=()');
  headers.set('cross-origin-resource-policy', 'same-site');
  headers.set('cache-control', 'no-store');
  if (env.ENVIRONMENT === 'production') {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}

export function applyCorsHeaders(
  headers: Headers,
  origin: string | undefined,
  env: Pick<Env, 'APP_ORIGIN'>,
): void {
  headers.set('vary', 'Origin');
  if (isAllowedOrigin(origin, env) && origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    headers.set('access-control-allow-headers', 'content-type,x-csrf-token');
    headers.set('access-control-max-age', '600');
  }
}

export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers, c.env);
};

/**
 * Reject state-changing requests whose Origin header is not allow-listed.
 * Browsers always send Origin on cross-origin writes, so this blocks drive-by
 * fetch/form attacks before any handler runs.
 */
export const originGuard: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (!MUTATING.has(c.req.method)) return next();
  const origin = c.req.header('origin');
  if (!origin) return next();
  const normalized = origin.replace(/\/$/, '');
  const allowList = allowedOrigins(c.env);
  if (allowList.length === 0) {
    // No explicit allow-list: only same-origin writes are accepted. This covers
    // a same-domain deployment and the local dev proxy, which rewrites Origin.
    const selfOrigin = new URL(c.req.url).origin;
    if (normalized === selfOrigin) return next();
    throw forbidden('Cross-origin requests are not enabled on this deployment.');
  }
  if (!allowList.includes(normalized)) {
    throw forbidden('Origin is not allowed.');
  }
  return next();
};

/** Credentialed CORS for the configured web origins. */
export const cors: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  applyCorsHeaders(c.res.headers, c.req.header('origin'), c.env);
  if (c.req.method === 'OPTIONS') {
    c.res = new Response(null, { status: 204, headers: c.res.headers });
  }
};
