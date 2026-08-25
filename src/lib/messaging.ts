import type { Message } from '@prisma/client';

import { prisma } from './db';
import { publish } from './bus';
import { logger } from './logger';
import { normalizeWaId } from './utils';

/** 24h customer service window, measured from the last inbound message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function upsertContact(waId: string, profileName?: string | null) {
  const id = normalizeWaId(waId);
  return prisma.contact.upsert({
    where: { waId: id },
    create: { waId: id, profileName: profileName ?? null, displayName: profileName ?? null },
    update: profileName ? { profileName } : {},
  });
}

export function windowRemainingMs(lastInboundAt: Date | null | undefined): number {
  if (!lastInboundAt) return 0;
  return Math.max(0, lastInboundAt.getTime() + SERVICE_WINDOW_MS - Date.now());
}

export function broadcastMessage(message: Message, profileName?: string | null): void {
  publish({
    type: 'message',
    data: {
      id: message.id,
      waId: message.waId,
      direction: message.direction,
      body: message.body,
      channel: message.channel,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
      contactId: message.contactId,
      profileName: profileName ?? null,
    },
  });
}

export interface RecordOutboundArgs {
  waId: string;
  body: string;
  channel: string;
  templateName?: string | null;
  templateLang?: string | null;
  payload?: unknown;
  source: 'api' | 'console';
  apiKeyId?: string | null;
}

/** Persists an outbound message in `queued` state before the Meta call. */
export async function recordOutbound(args: RecordOutboundArgs): Promise<Message> {
  const contact = await upsertContact(args.waId);
  const message = await prisma.message.create({
    data: {
      waId: normalizeWaId(args.waId),
      direction: 'outbound',
      channel: args.channel,
      body: args.body,
      templateName: args.templateName ?? null,
      templateLang: args.templateLang ?? null,
      payload: args.payload ? JSON.stringify(args.payload) : null,
      status: 'queued',
      source: args.source,
      contactId: contact.id,
      apiKeyId: args.apiKeyId ?? null,
    },
  });
  broadcastMessage(message, contact.profileName);
  return message;
}

export async function markSent(id: string, wamid: string | null): Promise<Message> {
  const message = await prisma.message.update({
    where: { id },
    data: { wamid, status: 'sent', sentAt: new Date() },
  });
  await prisma.contact
    .update({ where: { waId: message.waId }, data: { lastOutboundAt: new Date() } })
    .catch(() => undefined);
  publish({
    type: 'status',
    data: { wamid: wamid ?? id, status: 'sent', waId: message.waId, at: new Date().toISOString() },
  });
  return message;
}

export async function markFailed(
  id: string,
  code: string | number | undefined,
  reason: string,
): Promise<Message> {
  const message = await prisma.message.update({
    where: { id },
    data: {
      status: 'failed',
      failedAt: new Date(),
      errorCode: code !== undefined ? String(code) : null,
      errorMessage: reason.slice(0, 500),
    },
  });
  publish({
    type: 'status',
    data: {
      wamid: message.wamid ?? id,
      status: 'failed',
      waId: message.waId,
      at: new Date().toISOString(),
      errorMessage: reason,
    },
  });
  await logger.warn('meta', `Dispatch to ${message.waId} failed: ${reason}`, { messageId: id, code });
  return message;
}

/** Applies a Meta delivery receipt (sent → delivered → read, or failed). */
export async function applyStatusReceipt(args: {
  wamid: string;
  status: string;
  timestampSeconds?: string | number;
  errorCode?: string | number;
  errorMessage?: string;
  conversationId?: string;
  pricingCategory?: string;
}): Promise<void> {
  const at = args.timestampSeconds ? new Date(Number(args.timestampSeconds) * 1000) : new Date();
  const existing = await prisma.message.findUnique({ where: { wamid: args.wamid } });
  if (!existing) {
    await logger.debug('webhook', `Receipt for unknown wamid ${args.wamid}`, { status: args.status });
    return;
  }

  const patch: Record<string, unknown> = { status: args.status };
  if (args.status === 'sent') patch.sentAt = existing.sentAt ?? at;
  if (args.status === 'delivered') patch.deliveredAt = at;
  if (args.status === 'read') patch.readAt = at;
  if (args.status === 'failed') {
    patch.failedAt = at;
    patch.errorCode = args.errorCode !== undefined ? String(args.errorCode) : null;
    patch.errorMessage = args.errorMessage ?? null;
  }
  if (args.conversationId) patch.conversationId = args.conversationId;
  if (args.pricingCategory) patch.pricingCategory = args.pricingCategory;

  await prisma.message.update({ where: { wamid: args.wamid }, data: patch });

  publish({
    type: 'status',
    data: {
      wamid: args.wamid,
      status: args.status,
      waId: existing.waId,
      at: at.toISOString(),
      errorMessage: args.errorMessage ?? null,
    },
  });
}

const TEXTUAL: Record<string, (m: Record<string, any>) => string> = {
  text: (m) => m.text?.body ?? '',
  button: (m) => m.button?.text ?? '',
  interactive: (m) =>
    m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '[interactive reply]',
  image: (m) => m.image?.caption ?? '[image]',
  video: (m) => m.video?.caption ?? '[video]',
  document: (m) => m.document?.filename ?? '[document]',
  audio: () => '[voice note]',
  sticker: () => '[sticker]',
  location: (m) => `[location ${m.location?.latitude}, ${m.location?.longitude}]`,
  contacts: () => '[contact card]',
  reaction: (m) => `[reaction ${m.reaction?.emoji ?? ''}]`.trim(),
};

/** Persists one inbound message from a webhook envelope. */
export async function recordInbound(
  raw: Record<string, any>,
  profileName?: string | null,
): Promise<Message | null> {
  const waId = normalizeWaId(raw.from ?? '');
  if (!waId || !raw.id) return null;

  const existing = await prisma.message.findUnique({ where: { wamid: raw.id } });
  if (existing) return existing; // Meta retries — stay idempotent.

  const type = String(raw.type ?? 'unsupported');
  const body = (TEXTUAL[type] ?? (() => `[${type}]`))(raw);
  const contact = await upsertContact(waId, profileName);

  const message = await prisma.message.create({
    data: {
      wamid: raw.id,
      waId,
      direction: 'inbound',
      channel: type,
      body,
      status: 'received',
      source: 'webhook',
      payload: JSON.stringify(raw),
      contactId: contact.id,
    },
  });

  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastInboundAt: new Date(), unreadCount: { increment: 1 }, optIn: true },
  });

  broadcastMessage(message, contact.profileName);
  await logger.info('webhook', `Inbound ${type} from ${waId}`, { wamid: raw.id });
  return message;
}
