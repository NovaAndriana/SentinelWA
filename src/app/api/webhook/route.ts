import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/db';
import { verifyMetaSignature } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { clientIp } from '@/lib/net';
import { getMetaConfig } from '@/lib/settings';
import { applyStatusReceipt, recordInbound } from '@/lib/messaging';
import { publish } from '@/lib/bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/webhook — Meta's one-time verification handshake.
 * Meta calls this when you save the callback URL in the App Dashboard and
 * expects the raw `hub.challenge` value echoed back as text/plain.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  const ip = clientIp(req.headers);

  const { verifyToken } = await getMetaConfig();

  if (!verifyToken) {
    await logger.critical('webhook', 'Verification attempted but no verify token is configured', { ip });
    return new NextResponse('verify token not configured', { status: 500 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    await logger.info('webhook', `Verification handshake accepted from ${ip}`);
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  await logger.critical('webhook', `Verification handshake REJECTED from ${ip}`, { mode, hasToken: Boolean(token) });
  return new NextResponse('forbidden', { status: 403 });
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<Record<string, any>>;
  statuses?: Array<Record<string, any>>;
  errors?: Array<Record<string, any>>;
  message_template_id?: string | number;
  message_template_name?: string;
  event?: string;
  reason?: string;
}

/**
 * POST /api/webhook — inbound messages and delivery receipts.
 *
 * Always answers 200 once the signature checks out, even if parsing a single
 * entry fails: Meta retries non-2xx responses with exponential backoff and a
 * poison payload would otherwise wedge the whole subscription.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const raw = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const { appSecret } = await getMetaConfig();

  const signatureValid = appSecret ? verifyMetaSignature(raw, signature, appSecret) : false;

  const event = await prisma.webhookEvent.create({
    data: { eventType: 'unknown', signatureValid, sourceIp: ip, payload: raw.slice(0, 100_000) },
  });

  if (!signatureValid) {
    await logger.critical('webhook', `Rejected payload with invalid x-hub-signature-256 from ${ip}`, {
      eventId: event.id,
      hasSecret: Boolean(appSecret),
    });
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: 'signature_invalid' },
    });
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let eventType = 'unknown';
  let handled = 0;
  let failure: string | null = null;

  try {
    const body = JSON.parse(raw) as { entry?: Array<{ changes?: Array<{ field?: string; value?: MetaChangeValue }> }> };

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};

        // ── Template approval / rejection notices
        if (change.field === 'message_template_status_update') {
          eventType = 'template_status';
          handled += 1;
          await logger.warn(
            'webhook',
            `Template "${value.message_template_name}" → ${value.event ?? 'updated'}${value.reason ? ` (${value.reason})` : ''}`,
            { templateId: value.message_template_id },
          );
          continue;
        }

        // ── Inbound customer messages
        const profileByWaId = new Map<string, string>();
        for (const c of value.contacts ?? []) {
          if (c.wa_id) profileByWaId.set(c.wa_id, c.profile?.name ?? '');
        }

        for (const message of value.messages ?? []) {
          eventType = 'message';
          handled += 1;
          await recordInbound(message, profileByWaId.get(String(message.from)) ?? null);
        }

        // ── Delivery receipts
        for (const status of value.statuses ?? []) {
          eventType = eventType === 'message' ? eventType : 'status';
          handled += 1;
          await applyStatusReceipt({
            wamid: String(status.id),
            status: String(status.status),
            timestampSeconds: status.timestamp,
            conversationId: status.conversation?.id,
            pricingCategory: status.pricing?.category,
            errorCode: status.errors?.[0]?.code,
            errorMessage: status.errors?.[0]?.title ?? status.errors?.[0]?.message,
          });
        }

        // ── Account-level errors
        for (const err of value.errors ?? []) {
          await logger.critical('webhook', `Meta account error ${err.code}: ${err.title ?? err.message}`, err);
        }
      }
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
    await logger.critical('webhook', `Failed to parse webhook payload: ${failure}`, { eventId: event.id });
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { eventType, processedAt: new Date(), error: failure },
  });

  publish({ type: 'health', data: { webhookAt: new Date().toISOString(), eventType, handled } });

  return NextResponse.json({ ok: true, handled }, { status: 200 });
}
