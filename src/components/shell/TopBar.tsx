'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Cpu, Radio, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';

import { useStream } from '@/components/StreamProvider';
import { cn, duration, relativeTime } from '@/lib/utils';
import { stateChip } from '@/lib/theme';

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { connection, health, lastEventAt } = useStream();
  const [clock, setClock] = useState('--:--:--');

  useEffect(() => {
    const tick = () => setClock(new Date().toTimeString().slice(0, 8));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const gaps = health?.meta.gaps ?? [];

  return (
    <header className="sticky top-0 z-10 border-b border-edge bg-void-900/85 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-bold uppercase tracking-[0.2em] text-[#e6f6ff]">
            {title}
          </h1>
          {subtitle && <p className="truncate text-2xs text-muted">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gaps.length > 0 && (
            <Link href="/settings" className="chip chip-warn hover:bg-warn/20">
              <ShieldAlert className="h-3 w-3" strokeWidth={2} />
              {gaps.length} credential{gaps.length > 1 ? 's' : ''} missing
            </Link>
          )}

          {health && health.meta.breaker.state !== 'closed' && (
            <span className="chip chip-crit">
              <AlertTriangle className="h-3 w-3" strokeWidth={2} />
              breaker {health.meta.breaker.state.replace('_', '-')}
            </span>
          )}

          {health && (
            <>
              <span className={stateChip(health.overall)}>{health.overall}</span>
              <span className="chip chip-idle" title="Process uptime">
                <Cpu className="h-3 w-3" strokeWidth={2} />
                {duration(health.uptimeSeconds)}
              </span>
            </>
          )}

          <span
            className={cn(
              'chip',
              connection === 'live'
                ? 'chip-ok'
                : connection === 'paused'
                  ? 'chip-warn'
                  : connection === 'connecting'
                    ? 'chip-info'
                    : 'chip-crit',
            )}
            title={lastEventAt ? `Last frame ${relativeTime(lastEventAt)}` : 'No frames yet'}
          >
            {connection === 'error' ? (
              <WifiOff className="h-3 w-3" strokeWidth={2} />
            ) : connection === 'live' ? (
              <Radio className="h-3 w-3 animate-pulse-glow" strokeWidth={2} />
            ) : (
              <Wifi className="h-3 w-3" strokeWidth={2} />
            )}
            sse {connection}
          </span>

          <span className="hidden font-mono text-[12px] tabular-nums text-neon-cyan sm:inline">
            {clock}
          </span>
        </div>
      </div>
      <div className="hairline" />
    </header>
  );
}
