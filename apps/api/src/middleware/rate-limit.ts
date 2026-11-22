import type { Context } from 'hono';
import type { AppBindings } from '../env';
import { consumeRateLimit, clientIp } from '../lib/rate-limit';
import { tooManyRequests } from '../lib/errors';

function requestIp(c: Context<AppBindings>): string {
  return clientIp(c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null);
}

/** IP-scoped limiter for unauthenticated endpoints. */
export async function enforceIpRateLimit(
  c: Context<AppBindings>,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const key = `${bucket}:ip:${requestIp(c)}`;
  const result = await consumeRateLimit(c.env.DB, { key, limit, windowSeconds });
  c.header('x-ratelimit-limit', String(result.limit));
  c.header('x-ratelimit-remaining', String(result.remaining));
  if (!result.allowed) {
    c.header('retry-after', String(result.retryAfterSeconds));
    throw tooManyRequests('Too many requests. Please wait and try again.', result.retryAfterSeconds);
  }
}

/** Owner-scoped limiter for authenticated mutations. */
export async function enforceUserRateLimit(
  c: Context<AppBindings>,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const auth = c.get('auth');
  const key = `${bucket}:user:${auth?.user.id ?? requestIp(c)}`;
  const result = await consumeRateLimit(c.env.DB, { key, limit, windowSeconds });
  c.header('x-ratelimit-limit', String(result.limit));
  c.header('x-ratelimit-remaining', String(result.remaining));
  if (!result.allowed) {
    c.header('retry-after', String(result.retryAfterSeconds));
    throw tooManyRequests('Too many requests. Please wait and try again.', result.retryAfterSeconds);
  }
}
