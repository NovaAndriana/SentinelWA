import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/db';
import { requireConsole } from '@/lib/guard';
import { SERVICE_WINDOW_MS } from '@/lib/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/console/contacts — the triage list for the CS command center. */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams.get('q')?.trim();

  const contacts = await prisma.contact.findMany({
    where: q
      ? {
          OR: [
            { waId: { contains: q } },
            { displayName: { contains: q } },
            { profileName: { contains: q } },
          ],
        }
      : undefined,
    orderBy: [{ lastInboundAt: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, direction: true, createdAt: true, status: true, channel: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    contacts: contacts.map((c) => ({
      id: c.id,
      waId: c.waId,
      name: c.displayName || c.profileName || c.waId,
      profileName: c.profileName,
      optIn: c.optIn,
      blocked: c.blocked,
      note: c.note,
      unreadCount: c.unreadCount,
      lastInboundAt: c.lastInboundAt,
      lastOutboundAt: c.lastOutboundAt,
      windowExpiresAt: c.lastInboundAt
        ? new Date(c.lastInboundAt.getTime() + SERVICE_WINDOW_MS).toISOString()
        : null,
      preview: c.messages[0] ?? null,
    })),
  });
}
