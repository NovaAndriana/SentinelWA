import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { withApiAuth } from '@/lib/api-auth';
import { jsonError, jsonOk } from '@/lib/http';
import { logger } from '@/lib/logger';
import { sendOtpTemplate } from '@/lib/meta';
import { markFailed, markSent, recordOutbound } from '@/lib/messaging';
import { normalizeWaId } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().min(6, 'Recipient number is too short.').max(20),
  code: z
    .string()
    .min(4, 'OTP code must be at least 4 characters.')
    .max(10, 'OTP code must be at most 10 characters.')
    .regex(/^[A-Za-z0-9]+$/, 'OTP code must be alphanumeric.'),
  template_name: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(12).optional(),
  reference: z.string().max(120).optional(),
});

/**
 * POST /api/v1/send-otp
 * Dispatches a Meta authentication template. Authentication templates are
 * deliverable outside the 24h service window, which is why OTP has its own
 * endpoint rather than riding on /send-message.
 */
export const POST = withApiAuth('otp.send', async (req: NextRequest, ctx) => {
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

  const { to, code, template_name: templateName, language, reference } = parsed.data;
  const waId = normalizeWaId(to);
  if (waId.length < 8) {
    return jsonError('VALIDATION_ERROR', 'Recipient must be a valid E.164 number.', 400, ctx.requestId);
  }

  // The code itself is never persisted — only its length, for audit.
  const record = await recordOutbound({
    waId,
    body: `[OTP · ${code.length} chars]`,
    channel: 'template',
    templateName: templateName ?? null,
    templateLang: language ?? null,
    payload: { kind: 'otp', reference: reference ?? null, digits: code.length },
    source: 'api',
    apiKeyId: ctx.apiKey.id,
  });

  const result = await sendOtpTemplate(waId, code, templateName, language);

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
  await logger.info('api', `OTP dispatched to ${waId} via "${result.template}"`, {
    key: ctx.apiKey.name,
    rid: ctx.requestId,
    latencyMs: result.latencyMs,
    reference: reference ?? null,
  });

  return jsonOk(
    {
      message_id: result.wamid,
      record_id: record.id,
      status: 'sent',
      to: waId,
      template: result.template,
      latency_ms: result.latencyMs,
      ...(result.mocked ? { mocked: true } : {}),
    },
    ctx.requestId,
  );
});
