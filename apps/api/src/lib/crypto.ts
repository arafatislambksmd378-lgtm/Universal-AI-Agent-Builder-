/**
 * Cryptographic helpers. Only WebCrypto is used, so the identical code runs in
 * Cloudflare Workers, Node 22 (tests / local dev) and the browser.
 */

const encoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomToken(length = 32): string {
  return bytesToBase64Url(randomBytes(length));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return toHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

/** Constant-time byte comparison. */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Constant-time string comparison that reveals nothing about length either:
 * both inputs are hashed first, so the comparison always runs over 32 bytes.
 */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    diff |= hashA.charCodeAt(i) ^ hashB.charCodeAt(i);
  }
  return diff === 0;
}

export const PASSWORD_ALGO = 'PBKDF2-SHA256';
export const DEFAULT_PASSWORD_ITERATIONS = 100_000;
export const MIN_PASSWORD_ITERATIONS = 100_000;
export const MAX_PASSWORD_ITERATIONS = 300_000;

export interface PasswordRecord {
  hash: string;
  salt: string;
  iterations: number;
  algo: string;
}

async function derivePasswordBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations: number = DEFAULT_PASSWORD_ITERATIONS,
): Promise<PasswordRecord> {
  if (!Number.isInteger(iterations) || iterations < MIN_PASSWORD_ITERATIONS || iterations > MAX_PASSWORD_ITERATIONS) {
    throw new RangeError(`PBKDF2 iteration count must be between ${MIN_PASSWORD_ITERATIONS} and ${MAX_PASSWORD_ITERATIONS}`);
  }
  const salt = randomBytes(16);
  const derived = await derivePasswordBits(password, salt, iterations);
  return {
    hash: bytesToBase64Url(derived),
    salt: bytesToBase64Url(salt),
    iterations,
    algo: PASSWORD_ALGO,
  };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (record.algo !== PASSWORD_ALGO) return false;
  if (!Number.isInteger(record.iterations) || record.iterations < 1) return false;
  try {
    const derived = await derivePasswordBits(
      password,
      base64UrlToBytes(record.salt),
      record.iterations,
    );
    return timingSafeEqualBytes(derived, base64UrlToBytes(record.hash));
  } catch {
    return false;
  }
}

const ENCRYPTION_SALT = 'aism-token-encryption-v1';

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPTION_SALT),
      iterations: DEFAULT_PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a secret at rest (used for Shopify access tokens in Phase 02).
 * Output format: `v1.<iv-b64url>.<ciphertext-b64url>`.
 */
export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  if (!secret || secret.length < 16) throw new RangeError('Encryption secret is too weak');
  const key = await deriveEncryptionKey(secret);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const parts = payload.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Unsupported ciphertext format');
  const key = await deriveEncryptionKey(secret);
  const iv = base64UrlToBytes(parts[1]!);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64UrlToBytes(parts[2]!),
  );
  return new TextDecoder().decode(plaintext);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomToken(16)}`;
}
