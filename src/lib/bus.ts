import { EventEmitter } from 'node:events';

export type StreamEvent =
  | { type: 'log'; data: LogPayload }
  | { type: 'telemetry'; data: TelemetryPayload }
  | { type: 'message'; data: MessagePayload }
  | { type: 'status'; data: StatusPayload }
  | { type: 'health'; data: unknown };

export interface LogPayload {
  id: string;
  ts: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'CRITICAL';
  channel: string;
  message: string;
  meta?: Record<string, unknown> | null;
}

export interface TelemetryPayload {
  ts: string;
  rps: number;
  p95Ms: number;
  errorRate: number;
  outbound: number;
  inbound: number;
  metaLatencyMs: number | null;
}

export interface MessagePayload {
  id: string;
  waId: string;
  direction: string;
  body: string;
  channel: string;
  status: string;
  createdAt: string;
  contactId?: string | null;
  profileName?: string | null;
}

export interface StatusPayload {
  wamid: string;
  status: string;
  waId: string;
  at: string;
  errorMessage?: string | null;
}

const globalForBus = globalThis as unknown as {
  sentinelBus: EventEmitter | undefined;
  sentinelRing: StreamEvent[] | undefined;
};

/**
 * A single in-process fan-out hub. Every SSE client subscribes here, so a
 * webhook, an API call and the metrics sampler all reach the dashboard
 * without polling the database.
 */
export const bus: EventEmitter =
  globalForBus.sentinelBus ?? new EventEmitter().setMaxListeners(200);
globalForBus.sentinelBus = bus;

/** Small replay buffer so a freshly opened dashboard is not blank. */
const RING_SIZE = 200;
const ring: StreamEvent[] = globalForBus.sentinelRing ?? [];
globalForBus.sentinelRing = ring;

export function publish(event: StreamEvent): void {
  ring.push(event);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
  bus.emit('event', event);
}

export function replay(kinds?: StreamEvent['type'][]): StreamEvent[] {
  return kinds ? ring.filter((e) => kinds.includes(e.type)) : [...ring];
}
