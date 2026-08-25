'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCheck } from 'lucide-react';

import { CHROME, DELIVERY } from '@/lib/theme';
import { ChartFrame, EmptyPlot, SocTooltip } from './ChartFrame';

interface Breakdown {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  queued: number;
  total: number;
  successRate: number;
}

const SEGMENTS = [
  { key: 'read', label: 'Read', color: DELIVERY.read },
  { key: 'delivered', label: 'Delivered', color: DELIVERY.delivered },
  { key: 'sent', label: 'Sent', color: DELIVERY.sent },
  { key: 'queued', label: 'Queued', color: DELIVERY.queued },
  { key: 'failed', label: 'Failed', color: DELIVERY.failed },
] as const;

/**
 * Delivery funnel as a ring. Every arc is directly labelled in the table beside
 * it, so the state is never carried by color alone — the ring is the shape, the
 * list is the reading.
 */
export function DeliveryRing({ breakdown }: { breakdown: Breakdown | null }) {
  const data = SEGMENTS.map((s) => ({
    name: s.label,
    value: breakdown?.[s.key] ?? 0,
    color: s.color,
  })).filter((d) => d.value > 0);

  const total = breakdown?.total ?? 0;

  return (
    <ChartFrame
      title="Delivery Breakdown"
      icon={<CheckCheck className="h-3.5 w-3.5" strokeWidth={1.6} />}
      caption="last 24h"
    >
      {total === 0 ? (
        <EmptyPlot message="No outbound messages in the last 24 hours. Delivery receipts populate this ring as Meta reports them back over the webhook." />
      ) : (
        <div className="flex flex-col items-center gap-3 px-3 py-1 sm:flex-row">
          <div className="relative h-[150px] w-[150px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke={CHROME.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<SocTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-xl font-semibold tabular-nums text-[#e6f6ff]">
                {breakdown?.successRate ?? 0}%
              </span>
              <span className="text-2xs uppercase tracking-[0.14em] text-muted">accepted</span>
            </div>
          </div>

          <table className="w-full text-[11px]">
            <caption className="sr-only">Outbound message delivery states, last 24 hours</caption>
            <tbody>
              {SEGMENTS.map((s) => {
                const value = breakdown?.[s.key] ?? 0;
                const share = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={s.key} className="border-b border-edge/40 last:border-0">
                    <td className="py-1 pr-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="inline-block h-2 w-2 rounded-[1px]"
                          style={{ background: s.color }}
                          aria-hidden="true"
                        />
                        {s.label}
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums text-[#dceaf5]">
                      {value.toLocaleString()}
                    </td>
                    <td className="w-12 py-1 text-right font-mono tabular-nums text-muted">{share}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartFrame>
  );
}
