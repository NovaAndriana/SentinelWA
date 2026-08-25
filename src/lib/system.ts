import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

const globalForSys = globalThis as unknown as {
  sentinelLoopHist?: IntervalHistogram;
  sentinelCpuMark?: { cpu: NodeJS.CpuUsage; at: number };
  sentinelBootAt?: number;
};

function histogram(): IntervalHistogram {
  if (!globalForSys.sentinelLoopHist) {
    const h = monitorEventLoopDelay({ resolution: 10 });
    h.enable();
    globalForSys.sentinelLoopHist = h;
  }
  return globalForSys.sentinelLoopHist;
}

export const bootAt = (globalForSys.sentinelBootAt ??= Date.now());

export interface EventLoopStats {
  meanMs: number;
  p99Ms: number;
  maxMs: number;
}

export function eventLoopStats(): EventLoopStats {
  const h = histogram();
  const toMs = (ns: number) => Number((ns / 1e6).toFixed(2));
  return {
    meanMs: Number.isFinite(h.mean) ? toMs(h.mean) : 0,
    p99Ms: toMs(h.percentile(99)),
    maxMs: toMs(h.max),
  };
}

/** Process CPU share since the previous call, as a percentage of one core-second. */
export function cpuPercent(): number {
  const now = Date.now();
  const cpu = process.cpuUsage();
  const prev = globalForSys.sentinelCpuMark;
  globalForSys.sentinelCpuMark = { cpu, at: now };

  if (!prev) return 0;
  const elapsedUs = (now - prev.at) * 1000;
  if (elapsedUs <= 0) return 0;
  const usedUs = cpu.user - prev.cpu.user + (cpu.system - prev.cpu.system);
  const cores = os.cpus().length || 1;
  return Number(Math.min(100, (usedUs / elapsedUs / cores) * 100).toFixed(1));
}

export interface MemoryStats {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  systemTotal: number;
  systemFree: number;
  heapPercent: number;
  systemPercent: number;
}

export function memoryStats(): MemoryStats {
  const m = process.memoryUsage();
  const total = os.totalmem();
  const free = os.freemem();
  return {
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
    systemTotal: total,
    systemFree: free,
    heapPercent: Number(((m.heapUsed / Math.max(1, m.heapTotal)) * 100).toFixed(1)),
    systemPercent: Number((((total - free) / Math.max(1, total)) * 100).toFixed(1)),
  };
}

export interface DbFileStats {
  path: string;
  exists: boolean;
  sizeBytes: number;
  walBytes: number;
  modifiedAt: string | null;
}

/** Resolves DATABASE_URL="file:./x.db" the way Prisma does (relative to prisma/). */
export function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./sentinelwa.db';
  const raw = url.replace(/^file:/, '');
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), 'prisma', raw);
}

export function dbFileStats(): DbFileStats {
  const file = resolveDbPath();
  try {
    const stat = fs.statSync(file);
    let walBytes = 0;
    for (const suffix of ['-wal', '-shm']) {
      try {
        walBytes += fs.statSync(`${file}${suffix}`).size;
      } catch {
        /* absent in delete-journal mode */
      }
    }
    return {
      path: file,
      exists: true,
      sizeBytes: stat.size,
      walBytes,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return { path: file, exists: false, sizeBytes: 0, walBytes: 0, modifiedAt: null };
  }
}

export interface HostStats {
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  cpuModel: string;
  cpuCount: number;
  loadAvg: number[];
  uptimeSeconds: number;
  processUptimeSeconds: number;
  pid: number;
}

export function hostStats(): HostStats {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    nodeVersion: process.version,
    cpuModel: cpus[0]?.model?.trim() ?? 'unknown',
    cpuCount: cpus.length,
    loadAvg: os.loadavg().map((v) => Number(v.toFixed(2))),
    uptimeSeconds: Math.round(os.uptime()),
    processUptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
  };
}
