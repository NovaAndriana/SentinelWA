import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { requireConsole } from '@/lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const responses = await prisma.cannedResponse.findMany({ orderBy: { shortcut: 'asc' } });
  return NextResponse.json({ ok: true, responses });
}

const schema = z.object({
  shortcut: z
    .string()
    .min(2)
    .max(24)
    .regex(/^\/[a-z0-9-]+$/, 'Shortcut must look like /greeting.'),
  title: z.string().min(2).max(80),
  body: z.string().min(1).max(1024),
});

export async function POST(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const created = await prisma.cannedResponse.upsert({
    where: { shortcut: parsed.data.shortcut },
    create: parsed.data,
    update: { title: parsed.data.title, body: parsed.data.body },
  });

  return NextResponse.json({ ok: true, response: created }, { status: 201 });
}
