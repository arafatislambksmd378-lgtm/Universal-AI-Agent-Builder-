import { describe, expect, it } from 'vitest';
import { createTestContext, countRows } from './helpers';

const EXPECTED_TABLES = [
  'users',
  'sessions',
  'system_settings',
  'budget_limits',
  'usage_records',
  'audit_logs',
  'rate_limit_buckets',
  'notifications',
  'schema_migrations',
];

describe('migration 0001', () => {
  it('creates every foundation table', () => {
    const { db } = createTestContext();
    const tables = db.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: { name: string }) => row.name);
    for (const table of EXPECTED_TABLES) expect(tables).toContain(table);
  });

  it('seeds the $5 monthly and $0.50 daily AI ceilings', () => {
    const { db } = createTestContext();
    const rows = db.db
      .prepare("SELECT period, category, limit_usd_cents, hard_stop FROM budget_limits ORDER BY period")
      .all() as Array<{ period: string; category: string; limit_usd_cents: number; hard_stop: number }>;
    expect(rows).toHaveLength(2);
    const monthly = rows.find((row) => row.period === 'monthly');
    const daily = rows.find((row) => row.period === 'daily');
    expect(monthly).toMatchObject({ category: 'ai', limit_usd_cents: 500, hard_stop: 1 });
    expect(daily).toMatchObject({ limit_usd_cents: 50 });
  });

  it('records the applied migration version', () => {
    const { db } = createTestContext();
    const row = db.db
      .prepare('SELECT version FROM schema_migrations')
      .get() as { version: string };
    expect(row.version).toBe('0001_foundation');
  });

  it('enforces unique email addresses case-insensitively', () => {
    const { db } = createTestContext();
    const insert = db.db.prepare(
      `INSERT INTO users (id, email, role, password_hash, password_salt, password_iterations, password_algo, created_at, updated_at)
       VALUES (?, ?, 'owner', 'h', 's', 100000, 'PBKDF2-SHA256', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    );
    insert.run('usr_1', 'Owner@Example.com');
    expect(() => insert.run('usr_2', 'owner@example.COM')).toThrow();
  });

  it('rejects invalid enum values at the database layer', () => {
    const { db } = createTestContext();
    expect(() =>
      db.db
        .prepare(
          `INSERT INTO audit_logs (id, created_at, actor_type, action, outcome)
           VALUES ('a1', '2026-01-01T00:00:00Z', 'intruder', 'x', 'success')`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      db.db
        .prepare(
          `INSERT INTO budget_limits (id, scope_id, period, category, limit_usd_cents, created_at, updated_at)
           VALUES ('b1', 'global', 'weekly', 'ai', 100, 'now', 'now')`,
        )
        .run(),
    ).toThrow();
  });

  it('cascades session deletion when a user is removed', () => {
    const { db } = createTestContext();
    db.db
      .prepare(
        `INSERT INTO users (id, email, role, password_hash, password_salt, password_iterations, password_algo, created_at, updated_at)
         VALUES ('usr_1', 'a@example.com', 'owner', 'h', 's', 100000, 'PBKDF2-SHA256', 'now', 'now')`,
      )
      .run();
    db.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at)
         VALUES ('ses_1', 'usr_1', 'hash', 'csrf', 'now', 'now', 'later')`,
      )
      .run();
    expect(countRows(db, 'sessions')).toBe(1);
    db.db.prepare("DELETE FROM users WHERE id = 'usr_1'").run();
    expect(countRows(db, 'sessions')).toBe(0);
  });

  it('refuses negative AI usage costs', () => {
    const { db } = createTestContext();
    expect(() =>
      db.db
        .prepare(
          `INSERT INTO usage_records (id, provider, cost_usd_cents, occurred_at, created_at)
           VALUES ('u1', 'gemini', -5, 'now', 'now')`,
        )
        .run(),
    ).toThrow();
  });

  it('does not create customer, order or product tables before they are used', () => {
    const { db } = createTestContext();
    const tables = db.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row: { name: string }) => row.name);
    expect(tables).not.toContain('orders');
    expect(tables).not.toContain('products');
    expect(tables).not.toContain('customers');
  });
});
