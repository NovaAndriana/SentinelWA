import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { withApiAuth } from '@/lib/api-auth';
import { jsonError, jsonOk } from '@/lib/http';
import { logger } from '@/lib/logger';
import { sendTemplateMessage, sendTextMessage, type TemplateComponent } from '@/lib/meta';
import { markFailed, markSent, recordOutbound } from '@/lib/messaging';
import { normalizeWaId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().min(6).max(20),
  message: z.string().min(1, 'Message body cannot be empty.').max(4096),
  type: z.enum(['text', 'template']).default('text'),
  language: z.string().min(2).max(12).optional(),
  components: z.array(z.record(z.any())).optional(),
});

/**
 * POST /api/v1/send-message
 * `text` rides the 24h customer service window; `template` works any time.
 */
export const POST = withApiAuth('message.send', async (req: NextRequest, ctx) => {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Request body must be valid JSON.', 400, ctx.requestId);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Request body failed validation.', 400, ctx.requestId, {
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { to, message, type, language, components } = parsed.data;
  const waId = normalizeWaId(to);
  if (waId.length < 8) {
    return jsonError('VALIDATION_ERROR', 'Recipient must be a valid E.164 number.', 400, ctx.requestId);
  }

  const isTemplate = type === 'template';
  const record = await recordOutbound({
    waId,
    body: message,
    channel: type,
    templateName: isTemplate ? message : null,
    templateLang: isTemplate ? (language ?? 'en_US') : null,
    payload: isTemplate ? { components: components ?? [] } : null,
    source: 'api',
    apiKeyId: ctx.apiKey.id,
  });

  const result = isTemplate
    ? await sendTemplateMessage(
        waId,
        message,
        language ?? 'en_US',
        components as TemplateComponent[] | undefined,
      )
    : await sendTextMessage(waId, message);

  if (!result.ok) {
    await markFailed(record.id, result.error?.code, result.error?.message ?? 'Unknown Meta error');
    const status = result.status === 428 ? 428 : result.error?.code === 'CIRCUIT_OPEN' ? 503 : 502;
    return jsonError(
      result.error?.code === 'CIRCUIT_OPEN'
        ? 'CIRCUIT_OPEN'
        : result.status === 428
          ? 'NOT_CONFIGURED'
          : 'META_ERROR',
      result.error?.message ?? 'Meta rejected the dispatch.',
      status,
      ctx.requestId,
      { details: { record_id: record.id, meta_status: result.status } },
    );
  }

  await markSent(record.id, result.wamid);
  await logger.info('api', `${type} message dispatched to ${waId}`, {
    key: ctx.apiKey.name,
    rid: ctx.requestId,
    latencyMs: result.latencyMs,
  });

  return jsonOk(
    {
      message_id: result.wamid,
      record_id: record.id,
      status: 'sent',
      to: waId,
      type,
      latency_ms: result.latencyMs,
      ...(result.mocked ? { mocked: true } : {}),
    },
    ctx.requestId,
  );
});
