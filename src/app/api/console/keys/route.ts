import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/crypto';
import { requireConsole } from '@/lib/guard';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({
    ok: true,
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes.split(',').filter(Boolean),
      rateLimitPerMin: k.rateLimitPerMin,
      ipWhitelist: k.ipWhitelist,
      active: k.active && !k.revokedAt,
      requestCount: k.requestCount,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(240).optional(),
  scopes: z.array(z.enum(['otp.send', 'message.send', 'status.read', 'health.read'])).min(1),
  rateLimitPerMin: z.number().int().min(1).max(100_000).optional(),
  ipWhitelist: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const denied = await requireConsole(req);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { key, prefix, hash } = generateApiKey('live');
  const created = await prisma.apiKey.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: parsed.data.scopes.join(','),
      rateLimitPerMin:
        parsed.data.rateLimitPerMin ?? Number(process.env.DEFAULT_RATE_LIMIT_PER_MIN ?? 120),
      ipWhitelist: parsed.data.ipWhitelist?.trim() ?? '',
    },
  });

  await logger.warn('console', `API key "${created.name}" issued (${created.keyPrefix}…)`, {
    scopes: parsed.data.scopes,
  });

  // The plaintext key is returned exactly once and never stored.
  return NextResponse.json({ ok: true, id: created.id, key, keyPrefix: created.keyPrefix }, { status: 201 });
}
