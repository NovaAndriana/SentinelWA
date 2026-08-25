import { NextResponse, type NextRequest } from 'next/server';

import { requireConsole } from '@/lib/guard';
import { logger } from '@/lib/logger';
import { configGaps, getSettings, SECRET_KEYS, setSettings, type SettingKey } from '@/lib/settings';
import { maskSecret } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const settings = await getSettings();
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    masked[key] = (SECRET_KEYS as readonly string[]).includes(key) ? maskSecret(value) : value;
  }

  const publicUrl = (settings.APP_PUBLIC_URL || process.env.APP_PUBLIC_URL || '').replace(/\/+$/, '');

  return NextResponse.json({
    ok: true,
    settings: masked,
    present: Object.fromEntries(SECRET_KEYS.map((k) => [k, Boolean(settings[k])])),
    gaps: await configGaps(),
    callbackUrl: publicUrl ? `${publicUrl}/api/webhook` : `${req.nextUrl.origin}/api/webhook`,
    origin: req.nextUrl.origin,
  });
}

export async function PUT(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Partial<Record<SettingKey, string>>;
  await setSettings(body);
  await logger.warn('console', `Gateway settings updated (${Object.keys(body).join(', ') || 'none'})`);

  return NextResponse.json({ ok: true, gaps: await configGaps() });
}
