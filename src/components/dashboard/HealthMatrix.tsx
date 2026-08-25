'use client';

import { Activity, CircuitBoard, Database, Radio, Server, Webhook } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { HealthSnapshot } from '@/components/StreamProvider';
import { stateChip } from '@/lib/theme';
import { bytes, duration, relativeTime } from '@/lib/utils';
import { Gauge } from './Gauge';

const ICONS: Record<string, LucideIcon> = {
  runtime: Server,
  meta: Radio,
  webhook: Webhook,
  database: Database,
};

/**
 * The four-card service matrix. Each card names the subsystem, states its
 * condition as a labelled chip (never color alone) and shows the three numbers
 * an operator would ask for next.
 */
export function HealthMatrix({ health }: { health: HealthSnapshot | null }) {
  if (!health) return <MatrixSkeleton />;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {health.subsystems.map((s) => {
        const Icon = ICONS[s.id] ?? CircuitBoard;
        return (
          <article key={s.id} className="panel reticle scanlines overflow-hidden">
            <div className="panel-head">
              <span className="panel-title">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                {s.label}
              </span>
              <span className={stateChip(s.state)}>{s.state}</span>
            </div>
            <div className="px-3 py-2.5">
              <p className="truncate text-2xs text-muted">{s.summary}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                {s.metrics.map((m) => (
                  <div key={m.label} className="min-w-0">
                    <dt className="truncate text-2xs uppercase tracking-[0.12em] text-muted">
                      {m.label}
                    </dt>
                    <dd className="truncate font-mono text-[13px] tabular-nums text-[#dceaf5]">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <SubsystemFooter id={s.id} health={health} />
          </article>
        );
      })}
    </div>
  );
}

function SubsystemFooter({ id, health }: { id: string; health: HealthSnapshot }) {
  const text = (() => {
    switch (id) {
      case 'runtime':
        return `up ${duration(health.uptimeSeconds)} · ${health.host.cpuCount} cores · rss ${bytes(health.memory.rss)}`;
      case 'meta':
        return health.meta.breaker.lastError
          ? `last error: ${health.meta.breaker.lastError}`
          : `${health.meta.gaps.length ? `${health.meta.gaps.length} credentials missing` : 'credentials present'} · ${health.delivery.successRate}% delivered`;
      case 'webhook':
        return `last payload ${relativeTime(health.webhook.lastPayloadAt)} · ${health.webhook.invalidSignatures24h} bad signatures`;
      case 'database':
        return `${health.db.rows.messages ?? 0} messages · ${health.db.rows.contacts ?? 0} contacts · wal ${bytes(health.db.file.walBytes)}`;
      default:
        return '';
    }
  })();

  return (
    <div className="border-t border-edge/70 px-3 py-1.5">
      <p className="truncate text-2xs text-muted">{text}</p>
    </div>
  );
}

/** Runtime gauges — CPU, heap and event-loop lag, the three numbers that move. */
export function RuntimeGauges({ health }: { health: HealthSnapshot | null }) {
  return (
    <section className="panel reticle">
      <div className="panel-head">
        <span className="panel-title">
          <Activity className="h-3.5 w-3.5" strokeWidth={1.6} />
          Runtime Telemetry
        </span>
        <span className="text-2xs text-muted">{health?.host.hostname ?? '—'}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 px-3 py-4 sm:grid-cols-4">
        <Gauge
          label="CPU"
          value={health?.cpuPercent ?? 0}
          display={`${health?.cpuPercent ?? 0}%`}
          caption="process"
        />
        <Gauge
          label="Heap"
          value={health?.memory.heapPercent ?? 0}
          display={`${health?.memory.heapPercent ?? 0}%`}
          caption={health ? bytes(health.memory.heapUsed) : '—'}
        />
        <Gauge
          label="Loop lag"
          value={Math.min(100, ((health?.loop.p99Ms ?? 0) / 250) * 100)}
          display={`${health?.loop.p99Ms ?? 0}`}
          caption="ms p99"
          warnAt={40}
          critAt={70}
        />
        <Gauge
          label="Meta ping"
          value={Math.min(100, ((health?.meta.latencyMs ?? 0) / 1200) * 100)}
          display={health?.meta.latencyMs === null || health?.meta.latencyMs === undefined ? '—' : `${health.meta.latencyMs}`}
          caption="ms rtt"
          warnAt={30}
          critAt={60}
        />
      </div>
    </section>
  );
}

function MatrixSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="panel h-[136px] animate-pulse" />
      ))}
    </div>
  );
}
