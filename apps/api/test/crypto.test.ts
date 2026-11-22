import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD_ITERATIONS,
  base64UrlToBytes,
  bytesToBase64Url,
  decryptSecret,
  encryptSecret,
  hashPassword,
  hmacSha256Hex,
  randomToken,
  sha256Hex,
  timingSafeEqualString,
  verifyPassword,
} from '../src/lib/crypto';

describe('encoding helpers', () => {
  it('round-trips base64url without padding or unsafe characters', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it('produces unpredictable tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken(32)));
    expect(tokens.size).toBe(50);
    expect(randomToken(32).length).toBeGreaterThan(40);
  });

  it('hashes to a stable hex digest', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('signs with HMAC-SHA256', async () => {
    const a = await hmacSha256Hex('secret', 'payload');
    const b = await hmacSha256Hex('secret', 'payload');
    const c = await hmacSha256Hex('secret', 'payload2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compares strings in constant time', async () => {
    expect(await timingSafeEqualString('token', 'token')).toBe(true);
    expect(await timingSafeEqualString('token', 'Token')).toBe(false);
    expect(await timingSafeEqualString('token', 'token ')).toBe(false);
    expect(await timingSafeEqualString('', '')).toBe(true);
  });
});

describe('password hashing', () => {
  it('verifies the correct password and rejects another', async () => {
    const record = await hashPassword('correct horse battery staple');
    expect(record.algo).toBe('PBKDF2-SHA256');
    expect(record.iterations).toBe(DEFAULT_PASSWORD_ITERATIONS);
    expect(record.hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery staple', record)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', record)).toBe(false);
  });

  it('uses a unique salt per hash', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('refuses a weakened iteration count', async () => {
    await expect(hashPassword('x'.repeat(12), 1000)).rejects.toThrow(RangeError);
    await expect(hashPassword('x'.repeat(12), 1_000_000)).rejects.toThrow(RangeError);
  });

  it('rejects unknown algorithms and malformed records', async () => {
    expect(
      await verifyPassword('x', { hash: 'a', salt: 'b', iterations: 100_000, algo: 'MD5' }),
    ).toBe(false);
    expect(
      await verifyPassword('x', { hash: 'not-base64!!', salt: 'b', iterations: 100_000, algo: 'PBKDF2-SHA256' }),
    ).toBe(false);
  });
});

describe('secret encryption', () => {
  const secret = 'a-very-long-session-secret-value';

  it('round-trips a Shopify-style token', async () => {
    const token = 'shpat_0123456789abcdef';
    const ciphertext = await encryptSecret(token, secret);
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain(token);
    expect(await decryptSecret(ciphertext, secret)).toBe(token);
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const a = await encryptSecret('same', secret);
    const b = await encryptSecret('same', secret);
    expect(a).not.toBe(b);
  });

  it('fails closed with the wrong key or tampered ciphertext', async () => {
    const ciphertext = await encryptSecret('secret-token', secret);
    await expect(decryptSecret(ciphertext, 'wrong-secret-value-here')).rejects.toThrow();
    const parts = ciphertext.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${Buffer.from('tampered').toString('base64url')}`;
    await expect(decryptSecret(tampered, secret)).rejects.toThrow();
    await expect(decryptSecret('garbage', secret)).rejects.toThrow();
  });

  it('requires a non-trivial encryption key', async () => {
    await expect(encryptSecret('x', 'short')).rejects.toThrow(RangeError);
  });
});
