import type { NextRequest, NextResponse } from 'next/server';
import type { ApiKey } from '@prisma/client';

import { prisma } from './db';
import { hashApiKey, requestId as newRequestId } from './crypto';
import { consume } from './rate-limit';
import { clientIp, ipAllowed } from './net';
import { jsonError } from './http';
import { logger } from './logger';
import { publish } from './bus';

export type Scope = 'otp.send' | 'message.send' | 'status.read' | 'health.read';

export interface GatewayContext {
  requestId: string;
  apiKey: ApiKey;
  ip: string;
  startedAt: number;
}

/** Records one row per request — this is what the RPS/latency charts read. */
async function recordMetric(args: {
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
  sourceIp: string;
  outcome: string;
  apiKeyId?: string | null;
}): Promise<void> {
  try {
    await prisma.requestMetric.create({ data: { ...args, apiKeyId: args.apiKeyId ?? null } });
  } catch {
    /* metrics must never break the request path */
  }
}

/**
 * The internal gateway middleware.
 *
 * Order of checks is deliberate — cheapest and least informative first, so an
 * unauthenticated prober learns as little as possible:
 *   1. presence of x-api-key
 *   2. key lookup by SHA-256 hash (never by plaintext)
 *   3. revocation / active flag
 *   4. global + per-key IP allowlist
 *   5. scope
 *   6. per-key token-bucket rate limit
 */
export function withApiAuth<R = unknown>(
  scope: Scope,
  handler: (req: NextRequest, ctx: GatewayContext, routeCtx: R) => Promise<NextResponse>,
) {
  return async (req: NextRequest, routeCtx: R): Promise<NextResponse> => {
    const rid = req.headers.get('x-request-id') ?? newRequestId();
    const ip = clientIp(req.headers);
    const started = performance.now();
    const path = new URL(req.url).pathname;

    const finish = async (res: NextResponse, outcome: string, apiKeyId?: string | null) => {
      const durationMs = Math.round(performance.now() - started);
      res.headers.set('X-Request-Id', rid);
      res.headers.set('X-Response-Time', `${durationMs}ms`);
      await recordMetric({
        path,
        method: req.method,
        statusCode: res.status,
        durationMs,
        sourceIp: ip,
        outcome,
        apiKeyId,
      });
      publish({
        type: 'telemetry',
        data: {
          ts: new Date().toISOString(),
          rps: 0,
          p95Ms: durationMs,
          errorRate: res.status >= 400 ? 1 : 0,
          outbound: 0,
          inbound: 0,
          metaLatencyMs: null,
        },
      });
      return res;
    };

    // 1 ── credential presented?
    const presented =
      req.headers.get('x-api-key') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';

    if (!presented) {
      await logger.warn('auth', `Missing x-api-key on ${req.method} ${path}`, { ip, rid });
      return finish(
        jsonError('UNAUTHORIZED', 'Missing x-api-key header.', 401, rid),
        'auth_failed',
      );
    }

    // 2 ── constant-cost lookup on the hash
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(presented) } });
    if (!key) {
      await logger.warn('auth', `Rejected unknown API key on ${path}`, { ip, rid });
      return finish(jsonError('UNAUTHORIZED', 'Invalid API key.', 401, rid), 'auth_failed');
    }

    // 3 ── revoked or disabled
    if (!key.active || key.revokedAt) {
      await logger.warn('auth', `Revoked key "${key.name}" attempted ${path}`, { ip, rid, keyId: key.id });
      return finish(
        jsonError('KEY_REVOKED', 'This API key has been revoked.', 403, rid),
        'auth_failed',
        key.id,
      );
    }

    // 4 ── network origin
    const globalList = process.env.GLOBAL_IP_WHITELIST ?? '';
    if (!ipAllowed(ip, globalList)) {
      await logger.critical('auth', `Blocked ${ip} by global IP allowlist`, { ip, rid, path });
      return finish(
        jsonError('IP_NOT_ALLOWED', `Source address ${ip} is not permitted by the gateway allowlist.`, 403, rid),
        'auth_failed',
        key.id,
      );
    }
    if (!ipAllowed(ip, key.ipWhitelist)) {
      await logger.critical('auth', `Blocked ${ip} by key allowlist for "${key.name}"`, { ip, rid, path });
      return finish(
        jsonError('IP_NOT_ALLOWED', `Source address ${ip} is not permitted for this API key.`, 403, rid),
        'auth_failed',
        key.id,
      );
    }

    // 5 ── scope
    const scopes = key.scopes.split(',').map((s) => s.trim()).filter(Boolean);
    if (!scopes.includes(scope)) {
      await logger.warn('auth', `Key "${key.name}" lacks scope ${scope}`, { rid, path });
      return finish(
        jsonError('FORBIDDEN_SCOPE', `This API key is missing the "${scope}" scope.`, 403, rid, {
          details: { granted: scopes, required: scope },
        }),
        'auth_failed',
        key.id,
      );
    }

    // 6 ── rate limit
    const verdict = consume(`key:${key.id}`, key.rateLimitPerMin);
    const rateHeaders = {
      'X-RateLimit-Limit': String(verdict.limit),
      'X-RateLimit-Remaining': String(verdict.remaining),
      'X-RateLimit-Reset': String(Math.ceil(verdict.resetAt / 1000)),
    };
    if (!verdict.allowed) {
      await logger.warn('auth', `Rate limit hit by "${key.name}" (${key.rateLimitPerMin}/min)`, { rid, path });
      return finish(
        jsonError('RATE_LIMITED', `Rate limit of ${verdict.limit} requests/minute exceeded.`, 429, rid, {
          headers: { ...rateHeaders, 'Retry-After': String(verdict.retryAfterSeconds) },
        }),
        'rate_limited',
        key.id,
      );
    }

    // ── authorised
    prisma.apiKey
      .update({
        where: { id: key.id },
        data: { lastUsedAt: new Date(), lastUsedIp: ip, requestCount: { increment: 1 } },
      })
      .catch(() => undefined);

    try {
      const res = await handler(req, { requestId: rid, apiKey: key, ip, startedAt: started }, routeCtx);
      for (const [h, v] of Object.entries(rateHeaders)) res.headers.set(h, v);
      return finish(res, res.status >= 400 ? 'error' : 'ok', key.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logger.critical('api', `Unhandled error on ${path}: ${message}`, { rid, path });
      return finish(
        jsonError('INTERNAL_ERROR', 'The gateway encountered an unexpected error.', 500, rid),
        'error',
        key.id,
      );
    }
  };
}
