import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function resolveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    // Deterministic dev fallback so a fresh clone boots without configuration.
    // Production start-up refuses to run without a real key (see assertSecrets).
    return crypto.createHash('sha256').update('sentinelwa-insecure-dev-key').digest();
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  return crypto.createHash('sha256').update(raw).digest();
}

export function assertSecrets(): string[] {
  const problems: string[] = [];
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ENCRYPTION_KEY) problems.push('ENCRYPTION_KEY is not set');
    if (!process.env.SESSION_SECRET) problems.push('SESSION_SECRET is not set');
  }
  return problems;
}

/** AES-256-GCM. Output format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64> */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, resolveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith('v1.')) return payload;
  try {
    const [, ivB64, tagB64, dataB64] = payload.split('.');
    const decipher = crypto.createDecipheriv(ALGO, resolveKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

/** Generates a bearer key: swa_live_<40 hex>. Returned once, never stored raw. */
export function generateApiKey(env: 'live' | 'test' = 'live'): { key: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(20).toString('hex');
  const key = `swa_${env}_${secret}`;
  return { key, prefix: key.slice(0, 13), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Meta signs webhook bodies as sha256=<hmac>. Compared in constant time. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function requestId(): string {
  return crypto.randomBytes(8).toString('hex');
}
