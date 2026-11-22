/**
 * Local development server.
 *
 * Runs the *same* Hono app that ships to Cloudflare Workers, with the SQLite D1
 * adapter instead of the Cloudflare binding. Used for `npm run dev` and for the
 * browser preview; production always uses `wrangler deploy`.
 */
import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
// @ts-expect-error -- plain JS dev adapter, intentionally outside the Worker build
import { createD1, applyMigrations } from './d1-sqlite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.LOCAL_DB_PATH ?? resolve(here, '../.dev-data/local.db');
const setupToken =
  process.env.SETUP_TOKEN ?? `local-setup-${randomBytes(9).toString('hex')}`;

const db = createD1(dbPath);
const applied = applyMigrations(db, resolve(here, '../migrations'));

const env: Env = {
  DB: db as unknown as D1Database,
  ENVIRONMENT: 'development',
  APP_NAME: 'AI Store Manager (local)',
  APP_ORIGIN: process.env.APP_ORIGIN ?? '',
  SETUP_TOKEN: setupToken,
  SESSION_SECRET: process.env.SESSION_SECRET ?? randomBytes(32).toString('base64url'),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'lax',
};

const app = createApp();

serve(
  {
    fetch: async (request) => {
      // Mirror Cloudflare's client-IP header so rate limiting behaves in dev.
      const headers = new Headers(request.headers);
      if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', '127.0.0.1');
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const body = hasBody ? await request.arrayBuffer() : undefined;
      const forwarded = new Request(request.url, {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
      });
      return app.fetch(forwarded, env);
    },
    port,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log(`\n  AI Store Manager API  →  http://localhost:${info.port}`);
    console.log(`  Database              →  ${dbPath}`);
    if (applied.length > 0) console.log(`  Migrations applied    →  ${applied.join(', ')}`);
    const owners = db.db.prepare('SELECT COUNT(*) AS count FROM users').get();
    if (Number(owners?.count ?? 0) === 0) {
      console.log('\n  No owner account yet. Open the app and complete /setup with:');
      console.log(`  Setup token: ${setupToken}\n`);
    }
  },
);
