import { NextResponse, type NextRequest } from 'next/server';
import { CONSOLE_COOKIE, verifySessionToken } from './console-auth';

/**
 * Guard for /api/console/* — the operator-only surface behind the dashboard.
 * Distinct from `withApiAuth`, which guards the machine-facing /api/v1 gateway.
 */
export async function requireConsole(req: NextRequest): Promise<NextResponse | null> {
  const ok = await verifySessionToken(req.cookies.get(CONSOLE_COOKIE)?.value);
  if (ok) return null;
  return NextResponse.json(
    { ok: false, error: { code: 'CONSOLE_UNAUTHORIZED', message: 'Operator session required.' } },
    { status: 401 },
  );
}
