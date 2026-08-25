import { prisma } from './db';
import { publish, type LogPayload } from './bus';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'CRITICAL';
export type LogChannel = 'system' | 'api' | 'meta' | 'webhook' | 'db' | 'auth' | 'console';

const LEVEL_RANK: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARN: 30, CRITICAL: 40 };
const MIN_PERSIST: LogLevel = (process.env.LOG_MIN_LEVEL as LogLevel) || 'INFO';

/**
 * Writes a structured line to SQLite and pushes it onto the live SSE bus.
 * Persistence failures never bubble up — a broken log must not break a send.
 */
export async function log(
  level: LogLevel,
  channel: LogChannel,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const payload: LogPayload = {
    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    level,
    channel,
    message,
    meta: meta ?? null,
  };

  publish({ type: 'log', data: payload });

  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_PERSIST]) return;

  try {
    const row = await prisma.logEntry.create({
      data: { level, channel, message, meta: meta ? JSON.stringify(meta) : null },
    });
    payload.id = row.id;
  } catch {
    /* SQLite unavailable — the live stream already carried the line. */
  }
}

export const logger = {
  debug: (channel: LogChannel, message: string, meta?: Record<string, unknown>) =>
    log('DEBUG', channel, message, meta),
  info: (channel: LogChannel, message: string, meta?: Record<string, unknown>) =>
    log('INFO', channel, message, meta),
  warn: (channel: LogChannel, message: string, meta?: Record<string, unknown>) =>
    log('WARN', channel, message, meta),
  critical: (channel: LogChannel, message: string, meta?: Record<string, unknown>) =>
    log('CRITICAL', channel, message, meta),
};

/** Trims log rows and request metrics older than LOG_RETENTION_DAYS. */
export async function pruneOldRecords(): Promise<{ logs: number; metrics: number; webhooks: number }> {
  const days = Number(process.env.LOG_RETENTION_DAYS ?? 14);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const [logs, metrics, webhooks] = await Promise.all([
    prisma.logEntry.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.requestMetric.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.webhookEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { logs: logs.count, metrics: metrics.count, webhooks: webhooks.count };
}
