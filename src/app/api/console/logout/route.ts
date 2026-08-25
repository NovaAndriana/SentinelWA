import { NextResponse } from 'next/server';
import { CONSOLE_COOKIE } from '@/lib/console-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONSOLE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
