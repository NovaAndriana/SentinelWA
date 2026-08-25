import { prisma } from './db';
import { decryptSecret, encryptSecret } from './crypto';

export const SECRET_KEYS = [
  'META_ACCESS_TOKEN',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
] as const;

export const SETTING_KEYS = [
  'META_API_VERSION',
  'META_ACCESS_TOKEN',
  'META_PHONE_NUMBER_ID',
  'META_WABA_ID',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'META_OTP_TEMPLATE_NAME',
  'META_OTP_TEMPLATE_LANG',
  'APP_PUBLIC_URL',
  'GLOBAL_IP_WHITELIST',
  'MOCK_META',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  META_API_VERSION: 'v21.0',
  META_OTP_TEMPLATE_NAME: 'otp_verification',
  META_OTP_TEMPLATE_LANG: 'en_US',
  MOCK_META: 'false',
};

function isSecret(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

/**
 * Resolution order: SQLite (edited in /settings) → process.env → built-in
 * default. That lets an operator change credentials without a redeploy while
 * still supporting a pure .env bootstrap.
 */
export async function getSetting(key: SettingKey): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row?.value) return row.encrypted ? decryptSecret(row.value) : row.value;
  } catch {
    /* fall through to env */
  }
  return process.env[key] ?? DEFAULTS[key] ?? '';
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const entries = await Promise.all(SETTING_KEYS.map(async (k) => [k, await getSetting(k)] as const));
  return Object.fromEntries(entries) as Record<SettingKey, string>;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const encrypted = isSecret(key);
  const stored = encrypted ? encryptSecret(value) : value;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, encrypted },
    update: { value: stored, encrypted },
  });
}

export async function setSettings(patch: Partial<Record<SettingKey, string>>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTING_KEYS.includes(key as SettingKey)) continue;
    if (value === undefined) continue;
    // An empty string on a secret field means "leave the stored value alone".
    if (isSecret(key) && value === '') continue;
    await setSetting(key as SettingKey, value);
  }
}

export interface MetaConfig {
  apiVersion: string;
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  verifyToken: string;
  otpTemplate: string;
  otpLang: string;
  mock: boolean;
  publicUrl: string;
}

export async function getMetaConfig(): Promise<MetaConfig> {
  const s = await getSettings();
  return {
    apiVersion: s.META_API_VERSION || 'v21.0',
    accessToken: s.META_ACCESS_TOKEN,
    phoneNumberId: s.META_PHONE_NUMBER_ID,
    wabaId: s.META_WABA_ID,
    appSecret: s.META_APP_SECRET,
    verifyToken: s.META_WEBHOOK_VERIFY_TOKEN,
    otpTemplate: s.META_OTP_TEMPLATE_NAME || 'otp_verification',
    otpLang: s.META_OTP_TEMPLATE_LANG || 'en_US',
    mock: (s.MOCK_META || 'false').toLowerCase() === 'true',
    publicUrl: (s.APP_PUBLIC_URL || process.env.APP_PUBLIC_URL || '').replace(/\/+$/, ''),
  };
}

/** Which credentials are missing — drives the "unconfigured" banner. */
export async function configGaps(): Promise<string[]> {
  const c = await getMetaConfig();
  const gaps: string[] = [];
  if (!c.accessToken) gaps.push('META_ACCESS_TOKEN');
  if (!c.phoneNumberId) gaps.push('META_PHONE_NUMBER_ID');
  if (!c.wabaId) gaps.push('META_WABA_ID');
  if (!c.appSecret) gaps.push('META_APP_SECRET');
  if (!c.verifyToken) gaps.push('META_WEBHOOK_VERIFY_TOKEN');
  return gaps;
}
