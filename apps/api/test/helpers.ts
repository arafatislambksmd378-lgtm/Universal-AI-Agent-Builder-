import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
// @ts-expect-error -- plain JS test/dev adapter
import { createD1, applyMigrations, type SqliteD1 } from '../dev/d1-sqlite.mjs';

export const TEST_ORIGIN = 'https://app.example.com';
export const TEST_SETUP_TOKEN = 'test-setup-token-abcdefghijklmnop';
export const TEST_IP = '203.0.113.7';

export type App = ReturnType<typeof createApp>;

export interface TestContext {
  app: App;
  env: Env;
  db: SqliteD1;
}

export function createTestContext(overrides: Partial<Env> = {}): TestContext {
  const db = createD1(':memory:');
  applyMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)));
  const env: Env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: 'development',
    APP_NAME: 'AI Store Manager (test)',
    APP_ORIGIN: TEST_ORIGIN,
    SETUP_TOKEN: TEST_SETUP_TOKEN,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef',
    LOG_LEVEL: 'error',
    COOKIE_SECURE: 'false',
    COOKIE_SAMESITE: 'lax',
    PASSWORD_ITERATIONS: '100000',
    ...overrides,
  };
  return { app: createApp(), env, db };
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  cookie?: string | null;
  csrf?: string | null;
  headers?: Record<string, string>;
  ip?: string;
  origin?: string | null;
}

export function request(ctx: TestContext, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'cf-connecting-ip': options.ip ?? TEST_IP,
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = `aism_session=${options.cookie}`;
  if (options.csrf) headers['x-csrf-token'] = options.csrf;
  if (options.origin !== null) headers.origin = options.origin ?? TEST_ORIGIN;

  return ctx.app.request(
    path,
    {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    },
    ctx.env,
  );
}

export function sessionCookieFrom(response: Response): string {
  const raw = response.headers.get('set-cookie') ?? '';
  const match = /aism_session=([^;]*)/.exec(raw);
  if (!match?.[1]) throw new Error(`No session cookie in response: ${raw}`);
  return match[1];
}

export interface OwnerSession {
  cookie: string;
  csrf: string;
  user: { id: string; email: string; role: string };
  setCookie: string;
}

export async function createOwnerSession(
  ctx: TestContext,
  overrides: { email?: string; password?: string; origin?: string | null } = {},
): Promise<OwnerSession> {
  const email = overrides.email ?? 'owner@example.com';
  const password = overrides.password ?? 'correct horse battery staple';
  const response = await request(ctx, '/api/auth/setup', {
    body: { setupToken: TEST_SETUP_TOKEN, email, password, name: 'Store Owner' },
    origin: overrides.origin,
  });
  if (response.status !== 201) {
    throw new Error(`Setup failed with ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as {
    user: { id: string; email: string; role: string };
    session: { csrfToken: string };
  };
  return {
    cookie: sessionCookieFrom(response),
    csrf: body.session.csrfToken,
    user: body.user,
    setCookie: response.headers.get('set-cookie') ?? '',
  };
}

export async function login(
  ctx: TestContext,
  credentials: { email: string; password: string },
  ip = TEST_IP,
): Promise<Response> {
  return request(ctx, '/api/auth/login', { body: credentials, ip });
}

export function countRows(db: SqliteD1, table: string): number {
  const row = db.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return Number(row?.count ?? 0);
}
