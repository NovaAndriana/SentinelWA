import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { requireConsole } from '@/lib/guard';
import { logger } from '@/lib/logger';
import { sendTemplateMessage, sendTextMessage } from '@/lib/meta';
import { markFailed, markSent, recordOutbound, windowRemainingMs } from '@/lib/messaging';
import { normalizeWaId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().min(6),
  message: z.string().min(1).max(4096),
  type: z.enum(['text', 'template']).default('text'),
  language: z.string().min(2).max(12).optional(),
});

/**
 * POST /api/console/send — agent reply from the CS command center.
 * Refuses free-form text once the 24h service window has closed, because Meta
 * would reject it anyway and the operator deserves the clearer error.
 */
export async function POST(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { to, message, type, language } = parsed.data;
  const waId = normalizeWaId(to);
  const contact = await prisma.contact.findUnique({ where: { waId } });

  if (type === 'text' && windowRemainingMs(contact?.lastInboundAt) <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'The 24-hour customer service window has closed for this contact. Send an approved template instead.',
        code: 'WINDOW_CLOSED',
      },
      { status: 409 },
    );
  }

  const record = await recordOutbound({
    waId,
    body: message,
    channel: type,
    templateName: type === 'template' ? message : null,
    templateLang: type === 'template' ? (language ?? 'en_US') : null,
    source: 'console',
  });

  const result =
    type === 'template'
      ? await sendTemplateMessage(waId, message, language ?? 'en_US')
      : await sendTextMessage(waId, message);

  if (!result.ok) {
    const failed = await markFailed(record.id, result.error?.code, result.error?.message ?? 'Meta error');
    return NextResponse.json(
      { ok: false, error: result.error?.message ?? 'Meta rejected the message.', message: failed },
      { status: 502 },
    );
  }

  const sent = await markSent(record.id, result.wamid);
  await logger.info('console', `Agent reply sent to ${waId}`, { wamid: result.wamid });
  return NextResponse.json({ ok: true, message: sent });
}
