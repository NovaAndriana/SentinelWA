'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Download,
  Eraser,
  Pause,
  Play,
  Search,
  TerminalSquare,
} from 'lucide-react';

import { useStream, type LogLine } from '@/components/StreamProvider';
import { LOG_LEVEL_COLOR } from '@/lib/theme';
import { cn } from '@/lib/utils';

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'CRITICAL'] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_CHIP: Record<Level, string> = {
  DEBUG: 'chip-idle',
  INFO: 'chip-info',
  WARN: 'chip-warn',
  CRITICAL: 'chip-crit',
};

/**
 * Streaming log console.
 *
 * Auto-scroll follows the tail only while the viewport is already at the
 * bottom — scrolling up to read something detaches the follow, and the
 * "jump to tail" affordance reattaches it. Without that, reading a stack trace
 * on a busy gateway is impossible.
 */
export function TerminalLog({ initial }: { initial: LogLine[] }) {
  const { logs, paused, togglePause, clearLogs, droppedWhilePaused } = useStream();
  const [levels, setLevels] = useState<Set<Level>>(new Set(LEVELS));
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const [cleared, setCleared] = useState(false);

  const viewport = useRef<HTMLDivElement>(null);

  const combined = useMemo(() => {
    if (cleared) return logs;
    const seen = new Set(logs.map((l) => l.id));
    return [...initial.filter((l) => !seen.has(l.id)), ...logs];
  }, [initial, logs, cleared]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combined.filter((line) => {
      if (!levels.has(line.level as Level)) return false;
      if (!q) return true;
      return (
        line.message.toLowerCase().includes(q) ||
        line.channel.toLowerCase().includes(q) ||
        JSON.stringify(line.meta ?? '').toLowerCase().includes(q)
      );
    });
  }, [combined, levels, query]);

  useEffect(() => {
    if (!follow || paused) return;
    const el = viewport.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, follow, paused]);

  const onScroll = () => {
    const el = viewport.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollow(atBottom);
  };

  const toggleLevel = (level: Level) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      // Never let the operator filter everything away.
      return next.size ? next : new Set([level]);
    });
  };

  const exportUrl = (format: 'json' | 'csv') => {
    const params = new URLSearchParams({ format, levels: [...levels].join(',') });
    if (query.trim()) params.set('q', query.trim());
    return `/api/console/logs/export?${params.toString()}`;
  };

  const counts = useMemo(() => {
    const acc: Record<string, number> = { DEBUG: 0, INFO: 0, WARN: 0, CRITICAL: 0 };
    for (const l of combined) acc[l.level] = (acc[l.level] ?? 0) + 1;
    return acc;
  }, [combined]);

  return (
    <section className="panel reticle flex min-h-0 flex-col">
      <div className="panel-head flex-wrap">
        <span className="panel-title">
          <TerminalSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
          Live Event Stream
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              aria-pressed={levels.has(level)}
              className={cn(
                'chip transition-opacity',
                LEVEL_CHIP[level],
                !levels.has(level) && 'opacity-30',
              )}
              title={`${levels.has(level) ? 'Hide' : 'Show'} ${level} lines`}
            >
              {level}
              <span className="font-mono tabular-nums opacity-70">{counts[level] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-edge/70 px-3 py-1.5">
        <label className="relative flex min-w-[180px] flex-1 items-center">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted" strokeWidth={1.6} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter events…  (message, channel or metadata)"
            className="field pl-7"
            aria-label="Filter log lines"
          />
        </label>

        <button onClick={togglePause} className={cn('btn', paused ? 'btn-primary' : 'btn-ghost')}>
          {paused ? <Play className="h-3.5 w-3.5" strokeWidth={2} /> : <Pause className="h-3.5 w-3.5" strokeWidth={2} />}
          {paused ? `resume${droppedWhilePaused ? ` (${droppedWhilePaused})` : ''}` : 'pause'}
        </button>

        <button
          onClick={() => {
            clearLogs();
            setCleared(true);
          }}
          className="btn btn-ghost"
          title="Clear the on-screen buffer (the database keeps the history)"
        >
          <Eraser className="h-3.5 w-3.5" strokeWidth={2} />
          clear
        </button>

        <a href={exportUrl('json')} className="btn btn-ghost" download>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          json
        </a>
        <a href={exportUrl('csv')} className="btn btn-ghost" download>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          csv
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={viewport}
          onScroll={onScroll}
          className="h-full min-h-[220px] overflow-y-auto bg-void-900/60 px-3 py-2 font-mono text-[11.5px] leading-[1.55]"
          role="log"
          aria-live="polite"
          aria-label="Gateway event stream"
        >
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-2xs text-muted">
              No events match the current filter.
            </p>
          ) : (
            filtered.map((line) => <LogRow key={line.id} line={line} />)
          )}
          <div className="flex items-center gap-1 pt-1 text-neon">
            <span className="opacity-60">sentinel@gateway:~$</span>
            <span className="inline-block h-3 w-[7px] animate-blink bg-neon align-middle" />
          </div>
        </div>

        {!follow && (
          <button
            onClick={() => {
              setFollow(true);
              const el = viewport.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="btn btn-primary absolute bottom-3 right-4 shadow-neon"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={2} />
            jump to tail
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-edge/70 px-3 py-1 text-2xs text-muted">
        <span>
          {filtered.length.toLocaleString()} shown · {combined.length.toLocaleString()} buffered
        </span>
        <span>{follow ? 'following tail' : 'scroll detached'}</span>
      </div>
    </section>
  );
}

function LogRow({ line }: { line: LogLine }) {
  const [open, setOpen] = useState(false);
  const color = LOG_LEVEL_COLOR[line.level] ?? '#8ba0b6';
  const hasMeta = line.meta && Object.keys(line.meta).length > 0;

  return (
    <div
      className={cn(
        'group -mx-1 flex gap-2 rounded-sm px-1 py-[1px] hover:bg-white/[0.03]',
        line.level === 'CRITICAL' && 'bg-crit/[0.06]',
      )}
    >
      <span className="shrink-0 tabular-nums text-muted/70">{line.ts.slice(11, 23)}</span>
      <span className="w-[62px] shrink-0 font-semibold" style={{ color }}>
        {line.level}
      </span>
      <span className="w-[62px] shrink-0 truncate text-neon-cyan/70">{line.channel}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[#c7d5e0]">
        {line.message}
        {hasMeta && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="ml-2 text-2xs text-muted underline decoration-dotted underline-offset-2 hover:text-neon-cyan"
          >
            {open ? 'hide meta' : 'meta'}
          </button>
        )}
        {open && hasMeta && (
          <pre className="mt-1 overflow-x-auto rounded-sm border border-edge/60 bg-void-800/80 p-2 text-2xs text-muted-foreground">
            {JSON.stringify(line.meta, null, 2)}
          </pre>
        )}
      </span>
    </div>
  );
}
