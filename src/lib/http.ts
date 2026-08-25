import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  request_id: string;
}

export function jsonOk<T extends object>(
  data: T,
  requestId: string,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  return NextResponse.json(
    { ok: true, ...data, request_id: requestId },
    {
      status: init?.status ?? 200,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store', ...(init?.headers ?? {}) },
    },
  );
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  requestId: string,
  extra?: { details?: unknown; headers?: Record<string, string> },
): NextResponse {
  const body: ApiErrorBody = {
    ok: false,
    error: { code, message, ...(extra?.details ? { details: extra.details } : {}) },
    request_id: requestId,
  };
  return NextResponse.json(body, {
    status,
    headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store', ...(extra?.headers ?? {}) },
  });
}
