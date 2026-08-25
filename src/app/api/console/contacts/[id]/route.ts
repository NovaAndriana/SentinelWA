import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { requireConsole } from '@/lib/guard';
import { SERVICE_WINDOW_MS } from '@/lib/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/console/contacts/{id} — full thread plus the inspector payload. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const [messages, counts] = await Promise.all([
    prisma.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        wamid: true,
        direction: true,
        channel: true,
        body: true,
        status: true,
        source: true,
        templateName: true,
        errorMessage: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
      },
    }),
    prisma.message.groupBy({
      by: ['direction'],
      where: { contactId: contact.id },
      _count: { _all: true },
    }),
  ]);

  // Clear the unread badge — opening the thread is the read receipt.
  if (contact.unreadCount > 0) {
    await prisma.contact.update({ where: { id: contact.id }, data: { unreadCount: 0 } });
  }

  const windowExpiresAt = contact.lastInboundAt
    ? new Date(contact.lastInboundAt.getTime() + SERVICE_WINDOW_MS)
    : null;

  return NextResponse.json({
    ok: true,
    contact: {
      id: contact.id,
      waId: contact.waId,
      name: contact.displayName || contact.profileName || contact.waId,
      profileName: contact.profileName,
      optIn: contact.optIn,
      blocked: contact.blocked,
      note: contact.note,
      createdAt: contact.createdAt,
      lastInboundAt: contact.lastInboundAt,
      lastOutboundAt: contact.lastOutboundAt,
      windowExpiresAt: windowExpiresAt?.toISOString() ?? null,
      windowOpen: windowExpiresAt ? windowExpiresAt.getTime() > Date.now() : false,
      counts: Object.fromEntries(counts.map((c) => [c.direction, c._count._all])),
    },
    messages,
  });
}

const patchSchema = z.object({
  displayName: z.string().max(80).optional(),
  note: z.string().max(1000).optional(),
  blocked: z.boolean().optional(),
  optIn: z.boolean().optional(),
  unreadCount: z.number().int().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });

  await prisma.contact.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
