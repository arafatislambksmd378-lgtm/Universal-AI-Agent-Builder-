import { queryOne, type Db } from '../db/client';

export interface RateLimitOptions {
  /** Stable bucket identity, e.g. `login:ip:1.2.3.4`. */
  key: string;
  limit: number;
  windowSeconds: number;
  nowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter stored in D1 so limits survive isolate restarts.
 * Increment happens atomically in a single UPSERT, so concurrent requests
 * cannot both read a stale count.
 */
export async function consumeRateLimit(
  db: Db,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = options.windowSeconds * 1000;
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const expiresAt = Math.ceil((windowStart + windowMs) / 1000);

  const row = await queryOne<{ count: number }>(
    db,
    `INSERT INTO rate_limit_buckets (bucket_key, window_start, count, expires_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT (bucket_key) DO UPDATE SET
       count = CASE WHEN rate_limit_buckets.window_start = excluded.window_start
                    THEN rate_limit_buckets.count + 1 ELSE 1 END,
       window_start = excluded.window_start,
       expires_at = excluded.expires_at
     RETURNING count`,
    [options.key, windowStart, expiresAt],
  );

  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - count),
    retryAfterSeconds: Math.max(1, expiresAt - Math.floor(nowMs / 1000)),
  };
}

/** Client IP as reported by Cloudflare; falls back to a safe constant. */
export function clientIp(headerValue: string | undefined | null): string {
  if (!headerValue) return 'unknown';
  const first = headerValue.split(',')[0]?.trim();
  return first && first.length <= 64 ? first : 'unknown';
}
