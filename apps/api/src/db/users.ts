import type { PasswordRecord } from '../lib/crypto';
import { newId } from '../lib/crypto';
import { execute, queryOne, type Db } from './client';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'operator' | 'viewer';
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  password_algo: string;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

const COLUMNS =
  'id, email, name, role, password_hash, password_salt, password_iterations, password_algo, failed_login_count, locked_until, last_login_at, created_at, updated_at, disabled_at';

export async function countUsers(db: Db): Promise<number> {
  const row = await queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM users');
  return Number(row?.count ?? 0);
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    db,
    `SELECT ${COLUMNS} FROM users WHERE lower(email) = lower(?) LIMIT 1`,
    [email],
  );
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(db, `SELECT ${COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
}

export async function insertUser(
  db: Db,
  input: {
    email: string;
    name: string | null;
    role: 'owner' | 'operator' | 'viewer';
    password: PasswordRecord;
    now: string;
  },
): Promise<string> {
  const id = newId('usr');
  await execute(
    db,
    `INSERT INTO users (id, email, name, role, password_hash, password_salt, password_iterations, password_algo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.email,
      input.name,
      input.role,
      input.password.hash,
      input.password.salt,
      input.password.iterations,
      input.password.algo,
      input.now,
      input.now,
    ],
  );
  return id;
}

export async function markLoginSuccess(db: Db, userId: string, now: string): Promise<void> {
  await execute(
    db,
    `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, userId],
  );
}

export async function markLoginFailure(
  db: Db,
  user: Pick<UserRow, 'id' | 'failed_login_count'>,
  now: string,
  lockUntil: string | null,
): Promise<void> {
  await execute(
    db,
    `UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?`,
    [lockUntil ? 0 : Math.min(user.failed_login_count + 1, 1000), lockUntil, now, user.id],
  );
}
