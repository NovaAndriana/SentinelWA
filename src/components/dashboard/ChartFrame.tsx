'use client';

import type { TooltipProps } from 'recharts';
import { cn } from '@/lib/utils';

export function ChartFrame({
  title,
  icon,
  caption,
  actions,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  caption?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('panel reticle flex min-h-0 flex-col', className)}>
      <div className="panel-head">
        <span className="panel-title">
          {icon}
          {title}
        </span>
        <div className="flex items-center gap-2">
          {caption && <span className="text-2xs text-muted">{caption}</span>}
          {actions}
        </div>
      </div>
      <div className="min-h-0 flex-1 px-1 py-2">{children}</div>
    </section>
  );
}

/** Shared tooltip: dark card, series swatch + name + value, text in ink tokens. */
export function SocTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipProps<number, string> & { unit?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-sm border border-edge bg-void-900/95 px-2.5 py-2 shadow-cyan backdrop-blur">
      <div className="mb-1 text-2xs uppercase tracking-[0.14em] text-muted">{label}</div>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-[11px]">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-mono tabular-nums text-[#e6f6ff]">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
              {unit ? ` ${unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend rendered as plain HTML so it can carry text tokens, not series color. */
export function SeriesLegend({
  items,
}: {
  items: Array<{ color: string; label: string; value?: string }>;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-1 pt-0.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-[1px]"
            style={{ background: item.color }}
            aria-hidden="true"
          />
          {item.label}
          {item.value && <span className="font-mono tabular-nums text-[#dceaf5]">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function EmptyPlot({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center">
      <p className="max-w-xs text-2xs leading-relaxed text-muted">{message}</p>
    </div>
  );
}
