import { prisma } from './db';
import { measureDbLatency } from './db';
import { breaker } from './circuit-breaker';
import { pingGraph } from './meta';
import { configGaps } from './settings';
import {
  bootAt,
  cpuPercent,
  dbFileStats,
  eventLoopStats,
  hostStats,
  memoryStats,
} from './system';

export type HealthState = 'operational' | 'degraded' | 'critical' | 'offline' | 'unconfigured';

export interface SubsystemHealth {
  id: string;
  label: string;
  state: HealthState;
  summary: string;
  metrics: Array<{ label: string; value: string; hint?: string }>;
}

export interface ThroughputPoint {
  t: string;
  label: string;
  requests: number;
  rps: number;
  errors: number;
  avgMs: number;
  p95Ms: number;
  outbound: number;
  inbound: number;
}

export interface DeliveryBreakdown {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  queued: number;
  total: number;
  successRate: number;
}

function pct(part: number, whole: number): number {
  return whole <= 0 ? 0 : Number(((part / whole) * 100).toFixed(1));
}

/** Buckets RequestMetric rows into a fixed-width series the charts can draw. */
export async function throughputSeries(minutes = 30, buckets = 30): Promise<ThroughputPoint[]> {
  const now = Date.now();
  const windowMs = minutes * 60_000;
  const bucketMs = windowMs / buckets;
  const since = new Date(now - windowMs);

  const [metrics, messages] = await Promise.all([
    prisma.requestMetric.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, durationMs: true, statusCode: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.message.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, direction: true },
    }),
  ]);

  const shells: ThroughputPoint[] = Array.from({ length: buckets }, (_, i) => {
    const end = now - (buckets - 1 - i) * bucketMs;
    return {
      t: new Date(end).toISOString(),
      label: new Date(end).toTimeString().slice(0, 5),
      requests: 0,
      rps: 0,
      errors: 0,
      avgMs: 0,
      p95Ms: 0,
      outbound: 0,
      inbound: 0,
    };
  });

  const durations: number[][] = Array.from({ length: buckets }, () => []);

  const indexFor = (d: Date) => {
    const idx = Math.floor((d.getTime() - (now - windowMs)) / bucketMs);
    return idx < 0 || idx >= buckets ? -1 : idx;
  };

  for (const m of metrics) {
    const i = indexFor(m.createdAt);
    if (i < 0) continue;
    shells[i]!.requests += 1;
    if (m.statusCode >= 400) shells[i]!.errors += 1;
    durations[i]!.push(m.durationMs);
  }

  for (const msg of messages) {
    const i = indexFor(msg.createdAt);
    if (i < 0) continue;
    if (msg.direction === 'inbound') shells[i]!.inbound += 1;
    else shells[i]!.outbound += 1;
  }

  shells.forEach((point, i) => {
    const list = durations[i]!.sort((a, b) => a - b);
    point.rps = Number((point.requests / (bucketMs / 1000)).toFixed(2));
    point.avgMs = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
    point.p95Ms = list.length ? list[Math.min(list.length - 1, Math.floor(list.length * 0.95))]! : 0;
  });

  return shells;
}

export async function deliveryBreakdown(hours = 24): Promise<DeliveryBreakdown> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.message.groupBy({
    by: ['status'],
    where: { direction: 'outbound', createdAt: { gte: since } },
    _count: { _all: true },
  });

  const get = (status: string) => rows.find((r) => r.status === status)?._count._all ?? 0;
  const sent = get('sent');
  const delivered = get('delivered');
  const read = get('read');
  const failed = get('failed');
  const queued = get('queued');
  const total = sent + delivered + read + failed + queued;

  return {
    sent,
    delivered,
    read,
    failed,
    queued,
    total,
    successRate: pct(delivered + read + sent, Math.max(1, total)),
  };
}

export interface WebhookHealth {
  lastPayloadAt: string | null;
  lastValidAt: string | null;
  received24h: number;
  invalidSignatures24h: number;
  errors24h: number;
  queueDepth: number;
  errorRate: number;
}

export async function webhookHealth(): Promise<WebhookHealth> {
  const since = new Date(Date.now() - 86_400_000);
  const [last, lastValid, received, invalid, errors, pending] = await Promise.all([
    prisma.webhookEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.webhookEvent.findFirst({
      where: { signatureValid: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.webhookEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.webhookEvent.count({ where: { createdAt: { gte: since }, signatureValid: false } }),
    prisma.webhookEvent.count({ where: { createdAt: { gte: since }, error: { not: null } } }),
    prisma.webhookEvent.count({ where: { processedAt: null } }),
  ]);

  return {
    lastPayloadAt: last?.createdAt.toISOString() ?? null,
    lastValidAt: lastValid?.createdAt.toISOString() ?? null,
    received24h: received,
    invalidSignatures24h: invalid,
    errors24h: errors,
    queueDepth: pending,
    errorRate: pct(errors + invalid, Math.max(1, received)),
  };
}

export interface HealthSnapshot {
  generatedAt: string;
  overall: HealthState;
  subsystems: SubsystemHealth[];
  host: ReturnType<typeof hostStats>;
  memory: ReturnType<typeof memoryStats>;
  loop: ReturnType<typeof eventLoopStats>;
  cpuPercent: number;
  uptimeSeconds: number;
  db: { readMs: number; writeMs: number; ok: boolean; file: ReturnType<typeof dbFileStats>; rows: Record<string, number> };
  meta: { reachable: boolean; latencyMs: number | null; breaker: ReturnType<typeof breaker.snapshot>; gaps: string[] };
  webhook: WebhookHealth;
  delivery: DeliveryBreakdown;
  traffic: { requests1m: number; requests5m: number; errors5m: number; errorRate5m: number; p95Ms5m: number };
}

const WORST: Record<HealthState, number> = {
  operational: 0,
  unconfigured: 1,
  degraded: 2,
  critical: 3,
  offline: 4,
};

export async function healthSnapshot(): Promise<HealthSnapshot> {
  const oneMinAgo = new Date(Date.now() - 60_000);
  const fiveMinAgo = new Date(Date.now() - 300_000);

  const [dbLatency, ping, gaps, wh, delivery, req1m, recent5m, counts] = await Promise.all([
    measureDbLatency(),
    pingGraph(),
    configGaps(),
    webhookHealth(),
    deliveryBreakdown(24),
    prisma.requestMetric.count({ where: { createdAt: { gte: oneMinAgo } } }),
    prisma.requestMetric.findMany({
      where: { createdAt: { gte: fiveMinAgo } },
      select: { statusCode: true, durationMs: true },
    }),
    Promise.all([
      prisma.message.count(),
      prisma.contact.count(),
      prisma.apiKey.count({ where: { active: true } }),
      prisma.logEntry.count(),
      prisma.webhookEvent.count(),
    ]),
  ]);

  const durations = recent5m.map((r) => r.durationMs).sort((a, b) => a - b);
  const errors5m = recent5m.filter((r) => r.statusCode >= 400).length;
  const p95Ms5m = durations.length
    ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]!
    : 0;

  const mem = memoryStats();
  const loop = eventLoopStats();
  const cpu = cpuPercent();
  const file = dbFileStats();
  const brk = breaker.snapshot();
  const uptimeSeconds = Math.round((Date.now() - bootAt) / 1000);

  const appState: HealthState =
    loop.p99Ms > 250 || mem.heapPercent > 92 ? 'degraded' : cpu > 90 ? 'degraded' : 'operational';

  const metaState: HealthState = !ping.reachable
    ? 'offline'
    : brk.state === 'open'
      ? 'critical'
      : gaps.length
        ? 'unconfigured'
        : brk.state === 'half_open'
          ? 'degraded'
          : 'operational';

  const webhookState: HealthState = wh.errorRate > 15
    ? 'critical'
    : wh.queueDepth > 25 || wh.invalidSignatures24h > 0
      ? 'degraded'
      : wh.lastPayloadAt
        ? 'operational'
        : 'unconfigured';

  const dbState: HealthState = !dbLatency.ok
    ? 'critical'
    : dbLatency.readMs > 50
      ? 'degraded'
      : 'operational';

  const subsystems: SubsystemHealth[] = [
    {
      id: 'runtime',
      label: 'Node Runtime',
      state: appState,
      summary: `${process.version} · pid ${process.pid}`,
      metrics: [
        { label: 'CPU', value: `${cpu}%`, hint: `${hostStats().cpuCount} cores` },
        { label: 'Heap', value: `${mem.heapPercent}%` },
        { label: 'Loop p99', value: `${loop.p99Ms} ms` },
      ],
    },
    {
      id: 'meta',
      label: 'Meta Graph Gateway',
      state: metaState,
      summary: ping.reachable ? 'graph.facebook.com reachable' : 'graph.facebook.com unreachable',
      metrics: [
        { label: 'Ping', value: ping.latencyMs === null ? '—' : `${ping.latencyMs} ms` },
        { label: 'Breaker', value: brk.state.replace('_', '-') },
        { label: 'Fails', value: `${brk.failures}/${brk.thresholdAt}` },
      ],
    },
    {
      id: 'webhook',
      label: 'Webhook Listener',
      state: webhookState,
      summary: wh.lastPayloadAt ? 'Receiving callbacks' : 'No callback received yet',
      metrics: [
        { label: 'Queue', value: String(wh.queueDepth) },
        { label: '24h', value: String(wh.received24h) },
        { label: 'Err rate', value: `${wh.errorRate}%` },
      ],
    },
    {
      id: 'database',
      label: 'SQLite Store',
      state: dbState,
      summary: dbLatency.ok ? 'Read/write healthy' : 'Datastore unreachable',
      metrics: [
        { label: 'Read', value: `${dbLatency.readMs} ms` },
        { label: 'Write', value: `${dbLatency.writeMs} ms` },
        { label: 'Size', value: `${(file.sizeBytes / 1_048_576).toFixed(2)} MB` },
      ],
    },
  ];

  const overall = subsystems.reduce<HealthState>(
    (worst, s) => (WORST[s.state] > WORST[worst] ? s.state : worst),
    'operational',
  );

  return {
    generatedAt: new Date().toISOString(),
    overall,
    subsystems,
    host: hostStats(),
    memory: mem,
    loop,
    cpuPercent: cpu,
    uptimeSeconds,
    db: {
      ...dbLatency,
      file,
      rows: {
        messages: counts[0],
        contacts: counts[1],
        activeKeys: counts[2],
        logs: counts[3],
        webhookEvents: counts[4],
      },
    },
    meta: { reachable: ping.reachable, latencyMs: ping.latencyMs, breaker: brk, gaps },
    webhook: wh,
    delivery,
    traffic: {
      requests1m: req1m,
      requests5m: recent5m.length,
      errors5m,
      errorRate5m: pct(errors5m, Math.max(1, recent5m.length)),
      p95Ms5m,
    },
  };
}
