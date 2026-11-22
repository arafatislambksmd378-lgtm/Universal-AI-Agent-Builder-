/**
 * A D1-compatible adapter over Node's built-in SQLite (node:sqlite, Node >= 22.5).
 *
 * This is a *development and test* driver only. Production uses the real D1
 * binding from wrangler.toml. It implements exactly the subset of the D1 API the
 * Worker code uses (prepare / bind / first / all / run / batch / exec) so the
 * same application code runs unchanged in both environments.
 */
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Loaded through createRequire so bundlers (Vite/Vitest) do not try to resolve
// the Node-only builtin during transform.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

function normalize(params) {
  return params.map((value) => (value === undefined ? null : value));
}

class SqliteStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new SqliteStatement(this.db, this.sql, normalize(params));
  }

  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return null;
    if (typeof column === 'string') return row[column] ?? null;
    return { ...row };
  }

  async all() {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return {
      results: rows.map((row) => ({ ...row })),
      success: true,
      meta: { changes: 0, duration: 0 },
    };
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
        duration: 0,
      },
    };
  }
}

export class SqliteD1 {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
  }

  prepare(sql) {
    return new SqliteStatement(this.db, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  async exec(sql) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
}

export function createD1(path = ':memory:') {
  return new SqliteD1(path);
}

/** Apply every migrations/*.sql file in filename order, each in a transaction. */
export function applyMigrations(db, migrationsDir) {
  db.db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const applied = new Set(
    db.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  );
  const freshlyApplied = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.db.exec('BEGIN');
    try {
      db.db.exec(sql);
      db.db
        .prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, new Date().toISOString());
      db.db.exec('COMMIT');
      freshlyApplied.push(version);
    } catch (error) {
      db.db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return freshlyApplied;
}
