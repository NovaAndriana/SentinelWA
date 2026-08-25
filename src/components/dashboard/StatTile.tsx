'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = 'default',
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'ok' | 'warn' | 'crit' | 'info';
  /** Optional 0–1 normalised series drawn as a bare sparkline. */
  spark?: number[];
}) {
  const toneClass = {
    default: 'text-[#e6f6ff]',
    ok: 'text-neon',
    warn: 'text-warn',
    crit: 'text-crit',
    info: 'text-neon-cyan',
  }[tone];

  return (
    <div className="panel reticle px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn('h-3.5 w-3.5 shrink-0', toneClass)} strokeWidth={1.6} />}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn('stat-value', toneClass)}>{value}</span>
        {unit && <span className="text-2xs text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 truncate text-2xs text-muted">{hint}</div>}
      {spark && spark.length > 1 && <Sparkline data={spark} tone={tone} />}
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  const max = Math.max(...data, 1);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${28 - (v / max) * 24}`)
    .join(' ');
  const stroke =
    tone === 'crit' ? '#e0455e' : tone === 'warn' ? '#c08419' : tone === 'info' ? '#00e5ff' : '#00ad78';

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-1.5 h-6 w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
