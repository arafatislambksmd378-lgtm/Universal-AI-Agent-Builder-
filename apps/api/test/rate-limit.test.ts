import { describe, expect, it } from 'vitest';
import { createTestContext } from './helpers';
import { consumeRateLimit, clientIp } from '../src/lib/rate-limit';

describe('consumeRateLimit', () => {
  it('allows up to the limit then blocks within the window', async () => {
    const ctx = createTestContext();
    const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(
        await consumeRateLimit(ctx.env.DB, {
          key: 'test:bucket',
          limit: 3,
          windowSeconds: 60,
          nowMs,
        }),
      );
    }
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets in the next window', async () => {
    const ctx = createTestContext();
    const first = Date.UTC(2026, 0, 10, 12, 0, 0);
    await consumeRateLimit(ctx.env.DB, { key: 'k', limit: 1, windowSeconds: 60, nowMs: first });
    const blocked = await consumeRateLimit(ctx.env.DB, {
      key: 'k',
      limit: 1,
      windowSeconds: 60,
      nowMs: first + 1000,
    });
    expect(blocked.allowed).toBe(false);
    const nextWindow = await consumeRateLimit(ctx.env.DB, {
      key: 'k',
      limit: 1,
      windowSeconds: 60,
      nowMs: first + 61_000,
    });
    expect(nextWindow.allowed).toBe(true);
  });

  it('keeps separate counters per key', async () => {
    const ctx = createTestContext();
    const nowMs = Date.UTC(2026, 0, 10, 12, 0, 0);
    await consumeRateLimit(ctx.env.DB, { key: 'a', limit: 1, windowSeconds: 60, nowMs });
    const other = await consumeRateLimit(ctx.env.DB, { key: 'b', limit: 1, windowSeconds: 60, nowMs });
    expect(other.allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('uses the first forwarded address and rejects junk', () => {
    expect(clientIp('203.0.113.5, 70.41.3.18')).toBe('203.0.113.5');
    expect(clientIp(undefined)).toBe('unknown');
    expect(clientIp('x'.repeat(100))).toBe('unknown');
  });
});
