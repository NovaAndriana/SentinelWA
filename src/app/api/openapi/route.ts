import { NextResponse, type NextRequest } from 'next/server';
import { buildOpenApiDocument } from '@/lib/openapi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/openapi — the machine-readable spec behind the /docs explorer. */
export async function GET(req: NextRequest) {
  const configured = (process.env.APP_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const origin = configured || req.nextUrl.origin;
  return NextResponse.json(buildOpenApiDocument(origin), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
