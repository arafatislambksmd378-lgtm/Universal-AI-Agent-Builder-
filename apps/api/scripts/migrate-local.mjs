#!/usr/bin/env node
/**
 * Apply migrations to the local SQLite file used by `npm run dev`.
 * Production migrations run with `npx wrangler d1 migrations apply aism-db --remote`.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createD1, applyMigrations } from '../dev/d1-sqlite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../migrations');
const dbPath = process.env.LOCAL_DB_PATH ?? resolve(here, '../.dev-data/local.db');

const db = createD1(dbPath);
const applied = applyMigrations(db, migrationsDir);
console.log(
  applied.length === 0
    ? `No pending migrations. Database: ${dbPath}`
    : `Applied ${applied.length} migration(s): ${applied.join(', ')}\nDatabase: ${dbPath}`,
);
