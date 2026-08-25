import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/db';
import { requireConsole } from '@/lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  await prisma.cannedResponse.delete({ where: { id: params.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
