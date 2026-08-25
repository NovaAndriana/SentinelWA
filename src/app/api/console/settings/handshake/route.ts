import { NextResponse, type NextRequest } from 'next/server';

import { requireConsole } from '@/lib/guard';
import { logger } from '@/lib/logger';
import { executeHandshake } from '@/lib/meta';
import { breaker } from '@/lib/circuit-breaker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/console/settings/handshake
 * Validates the stored credentials against GET /{version}/{phone-number-id}.
 * A successful handshake also resets an open circuit breaker, so the operator
 * can recover the gateway without a restart.
 */
export async function POST(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const report = await executeHandshake();

  if (report.ok) {
    breaker.reset();
    await logger.info('meta', `Handshake OK — ${report.verifiedName ?? 'number'} (${report.latencyMs} ms)`);
  } else {
    await logger.critical('meta', `Handshake FAILED — ${report.error ?? 'unknown error'}`);
  }

  return NextResponse.json({ ok: report.ok, report }, { status: report.ok ? 200 : 502 });
}
