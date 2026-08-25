import { NextResponse, type NextRequest } from 'next/server';

import { requireConsole } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { deliveryBreakdown, healthSnapshot, throughputSeries } from '@/lib/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/console/telemetry — the dashboard's initial paint.
 * Live updates thereafter arrive over /api/stream.
 */
export async function GET(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const minutes = Math.min(1440, Math.max(5, Number(req.nextUrl.searchParams.get('minutes') ?? 30)));

  const [health, series, delivery, byKey, recentMessages] = await Promise.all([
    healthSnapshot(),
    throughputSeries(minutes, 30),
    deliveryBreakdown(24),
    prisma.requestMetric.groupBy({
      by: ['apiKeyId'],
      where: { createdAt: { gte: new Date(Date.now() - 86_400_000) }, apiKeyId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { apiKeyId: 'desc' } },
      take: 6,
    }),
    prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        waId: true,
        direction: true,
        channel: true,
        status: true,
        body: true,
        createdAt: true,
      },
    }),
  ]);

  const keyNames = await prisma.apiKey.findMany({
    where: { id: { in: byKey.map((r) => r.apiKeyId!).filter(Boolean) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(keyNames.map((k) => [k.id, k.name]));

  return NextResponse.json({
    ok: true,
    health,
    series,
    delivery,
    consumers: byKey.map((r) => ({
      id: r.apiKeyId,
      name: nameById.get(r.apiKeyId!) ?? 'unknown',
      requests: r._count._all,
    })),
    recentMessages,
  });
}
