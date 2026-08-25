/**
 * Operator console session.
 *
 * A single shared password (CONSOLE_PASSWORD) gates /, /chat, /api-keys and
 * /settings. The cookie is an HMAC-signed expiry stamp — no server-side session
 * store, and it verifies with Web Crypto so `middleware.ts` can check it on the
 * Edge runtime. Leave CONSOLE_PASSWORD empty to disable the gate entirely
 * (only appropriate on an isolated management VLAN).
 */

export const CONSOLE_COOKIE = 'sentinel_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret(): string {
  return process.env.SESSION_SECRET || 'sentinelwa-insecure-dev-session-secret';
}

export function consoleAuthEnabled(): boolean {
  return Boolean(process.env.CONSOLE_PASSWORD);
}

const encoder = new TextEncoder();

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function issueSessionToken(): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `console.${exp}`;
  return { value: `${payload}.${await hmacHex(payload)}`, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!consoleAuthEnabled()) return true;
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [scope, expRaw, sig] = parts;
  if (scope !== 'console') return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = await hmacHex(`${scope}.${expRaw}`);
  if (expected.length !== sig!.length) return false;
  // Constant-time comparison without Node's Buffer (Edge-safe).
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ sig!.charCodeAt(i);
  return diff === 0;
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.CONSOLE_PASSWORD ?? '';
  if (!expected) return true;
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  return diff === 0;
}
