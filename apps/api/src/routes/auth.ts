import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { MeResponse } from '@aism/core';
import type { AppBindings } from '../env';
import { loginSchema, parseJsonBody, setupSchema } from '../lib/validation';
import { enforceIpRateLimit } from '../middleware/rate-limit';
import {
  clearSessionCookie,
  requireAuth,
  requireCsrf,
  setSessionCookie,
  SESSION_COOKIE,
} from '../middleware/auth';
import { clientIp } from '../lib/rate-limit';
import { login, logout, ownersExist, setupOwner, type IssuedSession } from '../services/auth.service';

export const authRoutes = new Hono<AppBindings>();

function meta(c: Context<AppBindings>): {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
} {
  return {
    ip: clientIp(c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null),
    userAgent: c.req.header('user-agent') ?? null,
    requestId: c.get('requestId'),
  };
}

function authResponse(
  env: AppBindings['Bindings'],
  session: IssuedSession,
  setupComplete: boolean,
): MeResponse {
  return {
    user: session.user,
    session: { csrfToken: session.csrfToken, expiresAt: session.expiresAt },
    environment: env.ENVIRONMENT ?? 'unknown',
    setupComplete,
  };
}

/** Whether first-run setup is still possible (no owner + token configured). */
authRoutes.get('/state', async (c) => {
  const exists = await ownersExist(c.env.DB);
  return c.json({
    setupAvailable: !exists,
    setupTokenConfigured: Boolean(c.env.SETUP_TOKEN && c.env.SETUP_TOKEN.length >= 16),
    authenticated: false,
  });
});

authRoutes.post('/setup', async (c) => {
  await enforceIpRateLimit(c, 'auth_setup', 5, 3600);
  const input = await parseJsonBody(c, setupSchema);
  const session = await setupOwner({
    db: c.env.DB,
    env: c.env,
    input,
    meta: meta(c),
    now: new Date(),
    logger: c.get('logger'),
  });
  setSessionCookie(c, session.token, session.expiresAt);
  return c.json(authResponse(c.env, session, true), 201);
});

authRoutes.post('/login', async (c) => {
  await enforceIpRateLimit(c, 'auth_login', 10, 900);
  const input = await parseJsonBody(c, loginSchema);
  const session = await login({
    db: c.env.DB,
    env: c.env,
    input,
    meta: meta(c),
    now: new Date(),
  });
  setSessionCookie(c, session.token, session.expiresAt);
  return c.json(authResponse(c.env, session, true));
});

authRoutes.get('/me', requireAuth, async (c) => {
  const auth = c.get('auth');
  if (!auth) throw new Error('requireAuth did not set context');
  const body: MeResponse = {
    user: auth.user,
    session: { csrfToken: auth.session.csrfToken, expiresAt: auth.session.expiresAt },
    environment: c.env.ENVIRONMENT ?? 'unknown',
    setupComplete: true,
  };
  return c.json(body);
});

authRoutes.post('/logout', requireAuth, requireCsrf, async (c) => {
  const auth = c.get('auth');
  const token = getCookie(c, SESSION_COOKIE) ?? null;
  await logout({
    db: c.env.DB,
    token,
    userId: auth?.user.id ?? null,
    meta: meta(c),
    now: new Date(),
  });
  clearSessionCookie(c);
  return c.json({ ok: true });
});
