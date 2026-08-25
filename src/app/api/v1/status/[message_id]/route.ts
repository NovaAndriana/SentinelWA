import type { NextRequest } from 'next/server';

import { withApiAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: { message_id: string } };

/**
 * GET /api/v1/status/{message_id}
 * Accepts either the Meta wamid or the gateway's own record id.
 */
export const GET = withApiAuth<RouteCtx>('status.read', async (_req: NextRequest, ctx, route) => {
  const id = decodeURIComponent(route.params.message_id ?? '').trim();
  if (!id) {
    return jsonError('VALIDATION_ERROR', 'A message identifier is required.', 400, ctx.requestId);
  }

  const message = await prisma.message.findFirst({
    where: { OR: [{ wamid: id }, { id }] },
  });

  if (!message) {
    return jsonError('NOT_FOUND', `No message found for identifier "${id}".`, 404, ctx.requestId);
  }

  return jsonOk(
    {
      message_id: message.wamid ?? message.id,
      record_id: message.id,
      status: message.status,
      to: message.waId,
      direction: message.direction,
      type: message.channel,
      template: message.templateName,
      timeline: {
        created_at: message.createdAt.toISOString(),
        sent_at: message.sentAt?.toISOString() ?? null,
        delivered_at: message.deliveredAt?.toISOString() ?? null,
        read_at: message.readAt?.toISOString() ?? null,
        failed_at: message.failedAt?.toISOString() ?? null,
      },
      error: message.errorMessage
        ? { code: message.errorCode, message: message.errorMessage }
        : null,
    },
    ctx.requestId,
  );
});
