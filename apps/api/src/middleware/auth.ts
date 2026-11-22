import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppBindings, AuthContext, Env } from '../env';
import { findSessionWithUser, touchSession } from '../db/sessions';
import { sha256Hex, timingSafeEqualString } from '../lib/crypto';
import { forbidden, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'aism_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function cookieOptions(env: Env, expires: Date) {
  const sameSite = (env.COOKIE_SAMESITE ?? 'lax').toLowerCase() === 'none' ? 'None' : 'Lax';
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: sameSite as 'Lax' | 'None',
    path: '/',
    expires,
  };
}

export function setSessionCookie(c: Context<AppBindings>, token: string, expiresAt: string): void {
  setCookie(c, SESSION_COOKIE, token, cookieOptions(c.env, new Date(expiresAt)));
}

export function clearSessionCookie(c: Context<AppBindings>): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure: c.env.COOKIE_SECURE !== 'false',
  });
}

export interface ResolvedSession {
  auth: AuthContext;
  tokenHash: string;
  expiresAt: string;
}

/** Resolve a session cookie to an authenticated owner, or null. */
export async function resolveSession(
  c: Context<AppBindings>,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256Hex(token);
  const session = await findSessionWithUser(c.env.DB, tokenHash);
  if (!session) return null;
  if (session.revoked_at) return null;
  if (session.user_disabled_at) return null;
  if (Date.parse(session.expires_at) <= now.getTime()) return null;

  const lastSeen = Date.parse(session.last_seen_at);
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    await touchSession(c.env.DB, session.id, now.toISOString(), expiresAt);
    setSessionCookie(c, token, expiresAt);
    return {
      auth: {
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name,
          role: session.role,
        },
        session: { id: session.id, csrfToken: session.csrf_token, expiresAt },
      },
      tokenHash,
      expiresAt,
    };
  }

  return {
    auth: {
      user: {
        id: session.user_id,
        email: session.email,
        name: session.name,
        role: session.role,
      },
      session: {
        id: session.id,
        csrfToken: session.csrf_token,
        expiresAt: session.expires_at,
      },
    },
    tokenHash,
    expiresAt: session.expires_at,
  };
}

export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const resolved = await resolveSession(c);
  if (!resolved) throw unauthorized();
  c.set('auth', resolved.auth);
  await next();
};

/** Double-submit CSRF check against the token stored with the session. */
export const requireCsrf: MiddlewareHandler<AppBindings> = async (c, next) => {
  const auth = c.get('auth');
  if (!auth) throw unauthorized();
  const header = c.req.header('x-csrf-token');
  if (!header) throw forbidden('Missing CSRF token');
  const valid = await timingSafeEqualString(header, auth.session.csrfToken);
  if (!valid) throw forbidden('Invalid CSRF token');
  await next();
};
