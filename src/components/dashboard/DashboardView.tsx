'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  Boxes,
  Inbox,
  KeyRound,
  RefreshCw,
  Send,
  Timer,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { useStream, type LogLine } from '@/components/StreamProvider';
import { HealthMatrix, RuntimeGauges } from './HealthMatrix';
import { DeliveryRing } from './DeliveryRing';
import { LatencyChart, MessageFlowChart, ThroughputChart, type SeriesPoint } from './ThroughputChart';
import { StatTile } from './StatTile';
import { TerminalLog } from './TerminalLog';
import { ChartFrame } from './ChartFrame';
import { bytes, cn, relativeTime } from '@/lib/utils';

const WINDOWS = [15, 30, 60, 180] as const;

interface TelemetryPayload {
  series: SeriesPoint[];
  delivery: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    queued: number;
    total: number;
    successRate: number;
  };
  consumers: Array<{ id: string; name: string; requests: number }>;
  recentMessages: Array<{
    id: string;
    waId: string;
    direction: string;
    channel: string;
    status: string;
    body: string;
    createdAt: string;
  }>;
}

export function DashboardView() {
  const { health, messages } = useStream();
  const [minutes, setMinutes] = useState<number>(30);
  const [data, setData] = useState<TelemetryPayload | null>(null);
  const [initialLogs, setInitialLogs] = useState<LogLine[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (window: number) => {
      setRefreshing(true);
      try {
        const [telemetry, logs] = await Promise.all([
          fetch(`/api/console/telemetry?minutes=${window}`, { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/console/logs?take=250', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (telemetry.ok) setData(telemetry);
        if (logs.ok) setInitialLogs(logs.entries as LogLine[]);
      } catch {
        /* the SSE stream keeps the page alive even if this poll fails */
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(minutes);
  }, [load, minutes]);

  // Re-pull the aggregate series periodically; live deltas arrive over SSE.
  useEffect(() => {
    const t = setInterval(() => void load(minutes), 30_000);
    return () => clearInterval(t);
  }, [load, minutes]);

  const rpsNow = health ? (health.traffic.requests1m / 60).toFixed(2) : '0.00';
  const spark = data?.series.slice(-16).map((p) => p.requests) ?? [];

  return (
    <div className="space-y-3 p-3 pb-6">
      {/* ── Filter row: one row, above the charts ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted">Window</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setMinutes(w)}
            aria-pressed={minutes === w}
            className={cn('btn', minutes === w ? 'btn-primary' : 'btn-ghost')}
          >
            {w >= 60 ? `${w / 60}h` : `${w}m`}
          </button>
        ))}
        <button onClick={() => void load(minutes)} className="btn btn-ghost ml-auto">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} strokeWidth={2} />
          refresh
        </button>
      </div>

      <HealthMatrix health={health} />

      {/* ── Headline numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Throughput"
          value={rpsNow}
          unit="req/s"
          hint={`${health?.traffic.requests1m ?? 0} in the last minute`}
          icon={Boxes}
          tone="ok"
          spark={spark}
        />
        <StatTile
          label="Error rate"
          value={`${health?.traffic.errorRate5m ?? 0}`}
          unit="%"
          hint={`${health?.traffic.errors5m ?? 0} of ${health?.traffic.requests5m ?? 0} in 5m`}
          icon={AlertOctagon}
          tone={(health?.traffic.errorRate5m ?? 0) > 5 ? 'crit' : 'default'}
        />
        <StatTile
          label="p95 latency"
          value={`${health?.traffic.p95Ms5m ?? 0}`}
          unit="ms"
          hint="gateway-side, last 5 minutes"
          icon={Timer}
          tone={(health?.traffic.p95Ms5m ?? 0) > 800 ? 'warn' : 'info'}
        />
        <StatTile
          label="Dispatched"
          value={(health?.delivery.total ?? 0).toLocaleString()}
          hint={`${health?.delivery.successRate ?? 0}% accepted by Meta`}
          icon={Send}
          tone="ok"
        />
        <StatTile
          label="Contacts"
          value={(health?.db.rows.contacts ?? 0).toLocaleString()}
          hint={`${health?.db.rows.messages ?? 0} messages stored`}
          icon={Users}
        />
        <StatTile
          label="Active keys"
          value={(health?.db.rows.activeKeys ?? 0).toLocaleString()}
          hint={health ? `db ${bytes(health.db.file.sizeBytes)}` : '—'}
          icon={KeyRound}
          tone="info"
        />
      </div>

      {/* ── Telemetry ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ThroughputChart data={data?.series ?? []} minutes={minutes} />
        <MessageFlowChart data={data?.series ?? []} />
        <DeliveryRing breakdown={data?.delivery ?? health?.delivery ?? null} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <LatencyChart data={data?.series ?? []} />
        <RuntimeGauges health={health} />
        <ConsumerPanel consumers={data?.consumers ?? []} />
      </div>

      {/* ── Log console + live traffic ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
        <TerminalLog initial={initialLogs} />
        <RecentTraffic
          live={messages}
          fallback={data?.recentMessages ?? []}
        />
      </div>
    </div>
  );
}

function ConsumerPanel({ consumers }: { consumers: Array<{ id: string; name: string; requests: number }> }) {
  const max = Math.max(1, ...consumers.map((c) => c.requests));

  return (
    <ChartFrame
      title="Top Internal Consumers"
      icon={<KeyRound className="h-3.5 w-3.5" strokeWidth={1.6} />}
      caption="last 24h"
    >
      {consumers.length === 0 ? (
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-2xs text-muted">
            No key has called the gateway in the last 24 hours.
          </p>
          <Link href="/api-keys" className="btn btn-primary">
            issue an api key
          </Link>
        </div>
      ) : (
        <ul className="space-y-2 px-3 py-1">
          {consumers.map((c) => (
            <li key={c.id}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">{c.name}</span>
                <span className="font-mono tabular-nums text-[#dceaf5]">
                  {c.requests.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className="h-full rounded-full bg-neon/70"
                  style={{ width: `${(c.requests / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  );
}

const STATUS_TONE: Record<string, string> = {
  failed: 'chip-crit',
  queued: 'chip-idle',
  sent: 'chip-info',
  delivered: 'chip-ok',
  read: 'chip-ok',
  received: 'chip-info',
};

function RecentTraffic({
  live,
  fallback,
}: {
  live: Array<{ id: string; waId: string; direction: string; body: string; status: string; createdAt: string }>;
  fallback: Array<{ id: string; waId: string; direction: string; body: string; status: string; createdAt: string }>;
}) {
  const rows = (live.length ? live : fallback).slice(0, 14);

  return (
    <ChartFrame
      title="Message Tap"
      icon={<Inbox className="h-3.5 w-3.5" strokeWidth={1.6} />}
      caption="live"
    >
      {rows.length === 0 ? (
        <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center">
          <p className="text-2xs text-muted">
            Nothing on the wire yet. Inbound messages and dispatch receipts appear here the moment
            they are handled.
          </p>
        </div>
      ) : (
        <ul className="max-h-[320px] divide-y divide-edge/40 overflow-y-auto px-1">
          {rows.map((m) => (
            <li key={m.id} className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'chip',
                    m.direction === 'inbound' ? 'chip-info' : 'chip-ok',
                  )}
                >
                  {m.direction === 'inbound' ? 'in' : 'out'}
                </span>
                <span className="truncate font-mono text-[11px] text-[#dceaf5]">+{m.waId}</span>
                <span className={cn('chip ml-auto', STATUS_TONE[m.status] ?? 'chip-idle')}>
                  {m.status}
                </span>
              </div>
              <p className="mt-0.5 truncate text-2xs text-muted">{m.body}</p>
              <p className="text-2xs text-muted/60">{relativeTime(m.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  );
}
