'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type LogLine = {
  id: string;
  ts: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'CRITICAL';
  channel: string;
  message: string;
  meta?: Record<string, unknown> | null;
};

export type LiveMessage = {
  id: string;
  waId: string;
  direction: string;
  body: string;
  channel: string;
  status: string;
  createdAt: string;
  contactId?: string | null;
  profileName?: string | null;
};

export type StatusReceipt = {
  wamid: string;
  status: string;
  waId: string;
  at: string;
  errorMessage?: string | null;
};

export type HealthSnapshot = {
  generatedAt: string;
  overall: string;
  subsystems: Array<{
    id: string;
    label: string;
    state: string;
    summary: string;
    metrics: Array<{ label: string; value: string; hint?: string }>;
  }>;
  host: {
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
  };
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    systemTotal: number;
    systemFree: number;
    heapPercent: number;
    systemPercent: number;
  };
  loop: { meanMs: number; p99Ms: number; maxMs: number };
  cpuPercent: number;
  uptimeSeconds: number;
  db: {
    ok: boolean;
    readMs: number;
    writeMs: number;
    file: { path: string; sizeBytes: number; walBytes: number; exists: boolean };
    rows: Record<string, number>;
  };
  meta: {
    reachable: boolean;
    latencyMs: number | null;
    breaker: { state: string; failures: number; thresholdAt: number; lastError: string | null };
    gaps: string[];
  };
  webhook: {
    lastPayloadAt: string | null;
    received24h: number;
    invalidSignatures24h: number;
    errors24h: number;
    queueDepth: number;
    errorRate: number;
  };
  delivery: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    queued: number;
    total: number;
    successRate: number;
  };
  traffic: {
    requests1m: number;
    requests5m: number;
    errors5m: number;
    errorRate5m: number;
    p95Ms5m: number;
  };
};

export type ConnectionState = 'connecting' | 'live' | 'paused' | 'error';

interface StreamValue {
  connection: ConnectionState;
  health: HealthSnapshot | null;
  logs: LogLine[];
  messages: LiveMessage[];
  receipts: StatusReceipt[];
  paused: boolean;
  droppedWhilePaused: number;
  togglePause: () => void;
  clearLogs: () => void;
  lastEventAt: string | null;
}

const StreamContext = createContext<StreamValue | null>(null);

const LOG_BUFFER = 800;
const MESSAGE_BUFFER = 120;

/**
 * Single EventSource shared by every panel on the page.
 *
 * Pausing freezes the *view*, not the socket: incoming frames keep landing in a
 * holding buffer so resuming never leaves a hole in the timeline. The browser
 * reconnects on its own (the server sends `retry: 3000`), so there is no manual
 * backoff loop here.
 */
export function StreamProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [receipts, setReceipts] = useState<StatusReceipt[]>([]);
  const [paused, setPaused] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [droppedWhilePaused, setDropped] = useState(0);

  const pausedRef = useRef(paused);
  const holdRef = useRef<LogLine[]>([]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && holdRef.current.length) {
      const held = holdRef.current;
      holdRef.current = [];
      setLogs((prev) => [...prev, ...held].slice(-LOG_BUFFER));
      setDropped(0);
    }
  }, [paused]);

  useEffect(() => {
    const source = new EventSource('/api/stream');

    source.addEventListener('open', () => setConnection('live'));
    source.addEventListener('error', () => setConnection('error'));

    source.addEventListener('ready', () => setConnection('live'));

    source.addEventListener('log', (event) => {
      const line = JSON.parse((event as MessageEvent).data) as LogLine;
      setLastEventAt(new Date().toISOString());
      if (pausedRef.current) {
        holdRef.current = [...holdRef.current, line].slice(-LOG_BUFFER);
        setDropped(holdRef.current.length);
        return;
      }
      setLogs((prev) => [...prev, line].slice(-LOG_BUFFER));
    });

    source.addEventListener('health', (event) => {
      const snap = JSON.parse((event as MessageEvent).data) as Partial<HealthSnapshot>;
      setLastEventAt(new Date().toISOString());
      setConnection((c) => (c === 'error' ? 'live' : c));
      if (snap && 'subsystems' in snap) setHealth(snap as HealthSnapshot);
    });

    source.addEventListener('message', (event) => {
      const msg = JSON.parse((event as MessageEvent).data) as LiveMessage;
      setLastEventAt(new Date().toISOString());
      setMessages((prev) => [msg, ...prev.filter((m) => m.id !== msg.id)].slice(0, MESSAGE_BUFFER));
    });

    source.addEventListener('status', (event) => {
      const receipt = JSON.parse((event as MessageEvent).data) as StatusReceipt;
      setLastEventAt(new Date().toISOString());
      setReceipts((prev) => [receipt, ...prev].slice(0, MESSAGE_BUFFER));
      setMessages((prev) =>
        prev.map((m) => (m.id === receipt.wamid ? { ...m, status: receipt.status } : m)),
      );
    });

    return () => source.close();
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const clearLogs = useCallback(() => {
    holdRef.current = [];
    setDropped(0);
    setLogs([]);
  }, []);

  const value = useMemo<StreamValue>(
    () => ({
      connection: paused ? 'paused' : connection,
      health,
      logs,
      messages,
      receipts,
      paused,
      droppedWhilePaused,
      togglePause,
      clearLogs,
      lastEventAt,
    }),
    [connection, health, logs, messages, receipts, paused, droppedWhilePaused, togglePause, clearLogs, lastEventAt],
  );

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

export function useStream(): StreamValue {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error('useStream must be used inside <StreamProvider>');
  return ctx;
}
