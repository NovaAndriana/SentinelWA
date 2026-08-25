import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { requireConsole } from '@/lib/guard';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  active: z.boolean().optional(),
  rateLimitPerMin: z.number().int().min(1).max(100_000).optional(),
  ipWhitelist: z.string().max(500).optional(),
  scopes: z.array(z.string()).optional(),
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(240).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });

  const { scopes, ...rest } = parsed.data;
  const updated = await prisma.apiKey.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(scopes ? { scopes: scopes.join(',') } : {}),
      ...(rest.active === true ? { revokedAt: null } : {}),
    },
  });

  await logger.info('console', `API key "${updated.name}" updated`);
  return NextResponse.json({ ok: true });
}

/** Revocation is a soft delete — the audit trail on past requests must survive. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const purge = req.nextUrl.searchParams.get('purge') === 'true';

  if (purge) {
    const key = await prisma.apiKey.delete({ where: { id: params.id } });
    await logger.critical('console', `API key "${key.name}" permanently deleted`);
    return NextResponse.json({ ok: true, purged: true });
  }

  const key = await prisma.apiKey.update({
    where: { id: params.id },
    data: { active: false, revokedAt: new Date() },
  });
  await logger.critical('console', `API key "${key.name}" revoked`);
  return NextResponse.json({ ok: true, purged: false });
}
