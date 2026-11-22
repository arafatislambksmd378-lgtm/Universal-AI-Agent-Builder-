import type { PublicUser } from '@aism/core';
import type { Db } from '../db/client';
import {
  countUsers,
  findUserByEmail,
  findUserById,
  insertUser,
  markLoginFailure,
  markLoginSuccess,
  type UserRow,
} from '../db/users';
import { findSessionWithUser, insertSession, revokeSessionByTokenHash } from '../db/sessions';
import { writeAudit } from '../db/audit';
import type { Env, Logger } from '../env';
import {
  DEFAULT_PASSWORD_ITERATIONS,
  MAX_PASSWORD_ITERATIONS,
  MIN_PASSWORD_ITERATIONS,
  hashPassword,
  newId,
  randomToken,
  sha256Hex,
  timingSafeEqualString,
  verifyPassword,
} from '../lib/crypto';
import { conflict, forbidden, tooManyRequests, unauthorized, unavailable } from '../lib/errors';
import { SESSION_TTL_MS } from '../middleware/auth';

const MAX_FAILED_LOGINS = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface IssuedSession {
  token: string;
  csrfToken: string;
  expiresAt: string;
  user: PublicUser;
}

function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function resolvedPasswordIterations(env: Env): number {
  const parsed = Number(env.PASSWORD_ITERATIONS);
  if (!Number.isInteger(parsed)) return DEFAULT_PASSWORD_ITERATIONS;
  return Math.min(Math.max(parsed, MIN_PASSWORD_ITERATIONS), MAX_PASSWORD_ITERATIONS);
}

async function issueSession(
  db: Db,
  user: PublicUser,
  meta: RequestMeta,
  now: Date,
): Promise<IssuedSession> {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await insertSession(db, {
    id: newId('ses'),
    userId: user.id,
    tokenHash: await sha256Hex(token),
    csrfToken,
    now: now.toISOString(),
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, csrfToken, expiresAt, user };
}

export async function ownersExist(db: Db): Promise<boolean> {
  return (await countUsers(db)) > 0;
}

export async function setupOwner(params: {
  db: Db;
  env: Env;
  input: { setupToken: string; email: string; password: string; name?: string };
  meta: RequestMeta;
  now: Date;
  logger: Logger;
}): Promise<IssuedSession> {
  const { db, env, input, meta, now, logger } = params;

  if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 16) {
    throw unavailable(
      'Setup is disabled: SETUP_TOKEN is not configured on the server. Add it with `wrangler secret put SETUP_TOKEN`.',
    );
  }

  const tokenMatches = await timingSafeEqualString(input.setupToken, env.SETUP_TOKEN);
  if (!tokenMatches) {
    await writeAudit(db, {
      actorType: 'system',
      action: 'auth.setup',
      outcome: 'denied',
      metadata: { reason: 'invalid_setup_token' },
      ip: meta.ip,
      requestId: meta.requestId,
      now: now.toISOString(),
    });
    throw forbidden('Invalid setup token.');
  }

  if (await ownersExist(db)) {
    throw conflict('An owner account already exists. Sign in instead.');
  }

  const password = await hashPassword(input.password, resolvedPasswordIterations(env));
  const userId = await insertUser(db, {
    email: input.email,
    name: input.name?.trim() || null,
    role: 'owner',
    password,
    now: now.toISOString(),
  });

  logger.info('owner.created', { userId });
  await writeAudit(db, {
    actorType: 'system',
    action: 'auth.setup',
    targetType: 'user',
    targetId: userId,
    outcome: 'success',
    ip: meta.ip,
    requestId: meta.requestId,
    now: now.toISOString(),
  });

  const created = await findUserById(db, userId);
  if (!created) throw new Error('User vanished after insert');

  const session = await issueSession(db, toPublicUser(created), meta, now);
  await writeAudit(db, {
    actorType: 'owner',
    actorId: userId,
    action: 'auth.login',
    outcome: 'success',
    metadata: { method: 'setup' },
    ip: meta.ip,
    requestId: meta.requestId,
    now: now.toISOString(),
  });
  return session;
}

export async function login(params: {
  db: Db;
  env: Env;
  input: { email: string; password: string };
  meta: RequestMeta;
  now: Date;
}): Promise<IssuedSession> {
  const { db, env, input, meta, now } = params;
  const user = await findUserByEmail(db, input.email);

  if (!user) {
    // Burn comparable CPU so a missing account is not detectably faster.
    await hashPassword(input.password, resolvedPasswordIterations(env));
    await writeAudit(db, {
      actorType: 'system',
      action: 'auth.login',
      outcome: 'failure',
      metadata: { reason: 'unknown_account' },
      ip: meta.ip,
      requestId: meta.requestId,
      now: now.toISOString(),
    });
    throw unauthorized('Invalid email or password.');
  }

  if (user.disabled_at) {
    await writeAudit(db, {
      actorType: 'system',
      action: 'auth.login',
      outcome: 'denied',
      targetType: 'user',
      targetId: user.id,
      metadata: { reason: 'account_disabled' },
      ip: meta.ip,
      requestId: meta.requestId,
      now: now.toISOString(),
    });
    throw forbidden('This account is disabled.');
  }

  if (user.locked_until && Date.parse(user.locked_until) > now.getTime()) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(user.locked_until) - now.getTime()) / 1000));
    throw tooManyRequests('Too many failed attempts. Try again later.', retryAfter);
  }

  const valid = await verifyPassword(input.password, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations,
    algo: user.password_algo,
  });

  if (!valid) {
    const shouldLock = user.failed_login_count + 1 >= MAX_FAILED_LOGINS;
    const lockUntil = shouldLock ? new Date(now.getTime() + LOCK_DURATION_MS).toISOString() : null;
    await markLoginFailure(db, user, now.toISOString(), lockUntil);
    await writeAudit(db, {
      actorType: 'system',
      action: 'auth.login',
      outcome: 'failure',
      targetType: 'user',
      targetId: user.id,
      metadata: shouldLock ? { reason: 'bad_password', locked: true } : { reason: 'bad_password' },
      ip: meta.ip,
      requestId: meta.requestId,
      now: now.toISOString(),
    });
    throw unauthorized('Invalid email or password.');
  }

  await markLoginSuccess(db, user.id, now.toISOString());
  const session = await issueSession(db, toPublicUser(user), meta, now);
  await writeAudit(db, {
    actorType: 'owner',
    actorId: user.id,
    action: 'auth.login',
    outcome: 'success',
    ip: meta.ip,
    requestId: meta.requestId,
    now: now.toISOString(),
  });
  return session;
}

export async function logout(params: {
  db: Db;
  token: string | null;
  userId: string | null;
  meta: RequestMeta;
  now: Date;
}): Promise<void> {
  const { db, token, userId, meta, now } = params;
  if (token) await revokeSessionByTokenHash(db, await sha256Hex(token), now.toISOString());
  await writeAudit(db, {
    actorType: 'owner',
    actorId: userId,
    action: 'auth.logout',
    outcome: 'success',
    ip: meta.ip,
    requestId: meta.requestId,
    now: now.toISOString(),
  });
}

/** Loads the owner row for the settings screen (created_at is not in the session). */
export async function getUserProfile(db: Db, userId: string): Promise<UserRow | null> {
  return findUserById(db, userId);
}

export async function sessionStillValid(db: Db, tokenHash: string): Promise<boolean> {
  const session = await findSessionWithUser(db, tokenHash);
  return Boolean(session && !session.revoked_at);
}
