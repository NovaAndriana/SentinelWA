import type { NextRequest } from 'next/server';

import { withApiAuth } from '@/lib/api-auth';
import { jsonOk } from '@/lib/http';
import { healthSnapshot } from '@/lib/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/health
 * Machine-readable readiness probe. Returns 503 when a subsystem is down so a
 * load balancer or uptime monitor can act on the HTTP status alone.
 */
export const GET = withApiAuth('health.read', async (_req: NextRequest, ctx) => {
  const snap = await healthSnapshot();
  const degraded = snap.overall === 'critical' || snap.overall === 'offline' || !snap.db.ok;

  return jsonOk(
    {
      status: snap.overall,
      uptime_seconds: snap.uptimeSeconds,
      version: process.env.npm_package_version ?? '1.0.0',
      system: {
        node: snap.host.nodeVersion,
        hostname: snap.host.hostname,
        platform: snap.host.platform,
        cpu_percent: snap.cpuPercent,
        memory_percent: snap.memory.systemPercent,
        heap_percent: snap.memory.heapPercent,
        event_loop_p99_ms: snap.loop.p99Ms,
        load_average: snap.host.loadAvg,
      },
      database: {
        ok: snap.db.ok,
        read_ms: snap.db.readMs,
        write_ms: snap.db.writeMs,
        size_bytes: snap.db.file.sizeBytes,
        rows: snap.db.rows,
      },
      meta_api: {
        reachable: snap.meta.reachable,
        latency_ms: snap.meta.latencyMs,
        circuit_breaker: snap.meta.breaker.state,
        configured: snap.meta.gaps.length === 0,
        missing_configuration: snap.meta.gaps,
      },
      webhook: {
        last_payload_at: snap.webhook.lastPayloadAt,
        queue_depth: snap.webhook.queueDepth,
        received_24h: snap.webhook.received24h,
        error_rate: snap.webhook.errorRate,
      },
      traffic: snap.traffic,
    },
    ctx.requestId,
    { status: degraded ? 503 : 200 },
  );
});
