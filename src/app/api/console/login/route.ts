import { NextResponse, type NextRequest } from 'next/server';

import { CONSOLE_COOKIE, consoleAuthEnabled, issueSessionToken, passwordMatches } from '@/lib/console-auth';
import { logger } from '@/lib/logger';
import { clientIp } from '@/lib/net';
import { consume } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  // Brute-force brake: 10 attempts per minute per source address.
  const verdict = consume(`login:${ip}`, 10);
  if (!verdict.allowed) {
    await logger.critical('auth', `Console login throttled for ${ip}`);
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } },
    );
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (consoleAuthEnabled() && !passwordMatches(password ?? '')) {
    await logger.critical('auth', `Failed console login from ${ip}`);
    return NextResponse.json({ ok: false, error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = await issueSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONSOLE_COOKIE, token.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: token.maxAge,
  });
  await logger.info('auth', `Console session opened from ${ip}`);
  return res;
}
