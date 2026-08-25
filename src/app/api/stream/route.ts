import type { NextRequest } from 'next/server';

import { bus, publish, replay, type StreamEvent } from '@/lib/bus';
import { healthSnapshot } from '@/lib/telemetry';
import { sweepBuckets } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEALTH_INTERVAL_MS = 5_000;
const KEEPALIVE_MS = 20_000;

/**
 * GET /api/stream — Server-Sent Events feed for the SOC dashboard.
 *
 * SSE (not WebSockets) because the dashboard only ever receives: it needs no
 * upstream channel, it reconnects on its own, and it survives an Nginx reverse
 * proxy with a single `proxy_buffering off;` line.
 *
 * Frames:
 *   event: log        — a structured log line
 *   event: telemetry  — a single request's latency sample
 *   event: message    — an inbound/outbound WhatsApp message
 *   event: status     — a delivery receipt
 *   event: health     — the full health snapshot, every 5s
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const wantsReplay = req.nextUrl.searchParams.get('replay') !== '0';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        try {
          const frame =
            (id ? `id: ${id}\n` : '') +
            `event: ${event}\n` +
            `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true;
        }
      };

      const onEvent = (event: StreamEvent) => send(event.type, event.data);

      const pushHealth = async () => {
        try {
          send('health', await healthSnapshot());
        } catch (err) {
          send('log', {
            id: `health_${Date.now()}`,
            ts: new Date().toISOString(),
            level: 'CRITICAL',
            channel: 'system',
            message: `Health sampler failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      };

      // ── Handshake: retry hint + replay buffer so the console is never blank.
      controller.enqueue(encoder.encode('retry: 3000\n\n'));
      send('ready', { connectedAt: new Date().toISOString(), pid: process.pid });
      if (wantsReplay) for (const event of replay()) send(event.type, event.data);
      await pushHealth();

      bus.on('event', onEvent);

      const healthTimer = setInterval(() => {
        void pushHealth();
        sweepBuckets();
      }, HEALTH_INTERVAL_MS);

      const keepAlive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, KEEPALIVE_MS);

      const teardown = () => {
        if (closed) return;
        closed = true;
        clearInterval(healthTimer);
        clearInterval(keepAlive);
        bus.off('event', onEvent);
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };

      req.signal.addEventListener('abort', teardown);
    },
  });

  publish({ type: 'health', data: { subscriberAt: new Date().toISOString() } });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell Nginx not to buffer — without this the stream arrives in bursts.
      'X-Accel-Buffering': 'no',
    },
  });
}
