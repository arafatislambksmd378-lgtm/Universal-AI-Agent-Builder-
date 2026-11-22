import { execute, queryOne, type Db } from './client';

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_token: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface SessionWithUser extends SessionRow {
  email: string;
  name: string | null;
  role: 'owner' | 'operator' | 'viewer';
  user_disabled_at: string | null;
}

export async function insertSession(
  db: Db,
  input: {
    id?: string;
    userId: string;
    tokenHash: string;
    csrfToken: string;
    now: string;
    expiresAt: string;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.tokenHash, input.csrfToken, input.now, input.now, input.expiresAt, input.ip, input.userAgent],
  );
  return id;
}

export async function findSessionWithUser(
  db: Db,
  tokenHash: string,
): Promise<SessionWithUser | null> {
  return queryOne<SessionWithUser>(
    db,
    `SELECT s.id, s.user_id, s.token_hash, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at,
            s.revoked_at, s.ip, s.user_agent,
            u.email, u.name, u.role, u.disabled_at AS user_disabled_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
     LIMIT 1`,
    [tokenHash],
  );
}

export async function touchSession(
  db: Db,
  sessionId: string,
  now: string,
  expiresAt: string,
): Promise<void> {
  await execute(db, 'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', [
    now,
    expiresAt,
    sessionId,
  ]);
}

export async function revokeSessionByTokenHash(
  db: Db,
  tokenHash: string,
  now: string,
): Promise<void> {
  await execute(db, 'UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [
    now,
    tokenHash,
  ]);
}

export async function revokeSessionsForUser(db: Db, userId: string, now: string): Promise<void> {
  await execute(db, 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [
    now,
    userId,
  ]);
}
