'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeftRight, Gauge as GaugeIcon, TrendingUp } from 'lucide-react';

import { CHROME, SERIES } from '@/lib/theme';
import { ChartFrame, EmptyPlot, SeriesLegend, SocTooltip } from './ChartFrame';

export interface SeriesPoint {
  label: string;
  requests: number;
  rps: number;
  errors: number;
  avgMs: number;
  p95Ms: number;
  outbound: number;
  inbound: number;
}

const axisProps = {
  stroke: CHROME.axis,
  tick: { fill: CHROME.inkMuted, fontSize: 10, fontFamily: 'inherit' },
  tickLine: false,
  axisLine: { stroke: 'rgba(139,160,182,0.25)' },
} as const;

/** Request volume against the error count — both are counts, so one axis. */
export function ThroughputChart({ data, minutes }: { data: SeriesPoint[]; minutes: number }) {
  const total = data.reduce((sum, d) => sum + d.requests, 0);
  const errors = data.reduce((sum, d) => sum + d.errors, 0);
  const empty = total === 0;

  return (
    <ChartFrame
      title="Internal API Throughput"
      icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={1.6} />}
      caption={`last ${minutes}m`}
    >
      {empty ? (
        <EmptyPlot message="No gateway traffic recorded in this window. Hit POST /api/v1/send-otp with a valid x-api-key to start the series." />
      ) : (
        <>
          <div className="h-[176px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES.emerald} stopOpacity={0.38} />
                    <stop offset="100%" stopColor={SERIES.emerald} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHROME.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                <YAxis {...axisProps} width={44} allowDecimals={false} />
                <Tooltip
                  content={<SocTooltip />}
                  cursor={{ stroke: CHROME.cyan, strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  name="Requests"
                  stroke={SERIES.emerald}
                  strokeWidth={2}
                  fill="url(#reqFill)"
                  dot={false}
                  activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  name="Errors"
                  stroke={SERIES.crimson}
                  strokeWidth={2}
                  fill="none"
                  dot={false}
                  activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <SeriesLegend
            items={[
              { color: SERIES.emerald, label: 'Requests', value: total.toLocaleString() },
              { color: SERIES.crimson, label: 'Errors', value: errors.toLocaleString() },
            ]}
          />
        </>
      )}
    </ChartFrame>
  );
}

/** Outbound vs inbound message volume — again both counts, one axis. */
export function MessageFlowChart({ data }: { data: SeriesPoint[] }) {
  const out = data.reduce((s, d) => s + d.outbound, 0);
  const inb = data.reduce((s, d) => s + d.inbound, 0);

  return (
    <ChartFrame
      title="Message Flow"
      icon={<ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.6} />}
      caption="dispatch vs receive"
    >
      {out + inb === 0 ? (
        <EmptyPlot message="No WhatsApp traffic yet. Outbound appears once a send succeeds; inbound appears once Meta delivers a webhook callback." />
      ) : (
        <>
          <div className="h-[176px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }} barCategoryGap="18%">
                <CartesianGrid stroke={CHROME.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                <YAxis {...axisProps} width={44} allowDecimals={false} />
                <Tooltip content={<SocTooltip />} cursor={{ fill: 'rgba(0,229,255,0.06)' }} />
                {/* 2px surface gap between stacked segments keeps them legible. */}
                <Bar
                  dataKey="outbound"
                  name="Outbound"
                  stackId="flow"
                  fill={SERIES.emerald}
                  stroke={CHROME.surface}
                  strokeWidth={2}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="inbound"
                  name="Inbound"
                  stackId="flow"
                  fill={SERIES.violet}
                  stroke={CHROME.surface}
                  strokeWidth={2}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SeriesLegend
            items={[
              { color: SERIES.emerald, label: 'Outbound', value: out.toLocaleString() },
              { color: SERIES.violet, label: 'Inbound', value: inb.toLocaleString() },
            ]}
          />
        </>
      )}
    </ChartFrame>
  );
}

/** Latency lives on its own chart — never a second axis on the volume plot. */
export function LatencyChart({ data }: { data: SeriesPoint[] }) {
  const peak = Math.max(0, ...data.map((d) => d.p95Ms));

  return (
    <ChartFrame
      title="Gateway Latency"
      icon={<GaugeIcon className="h-3.5 w-3.5" strokeWidth={1.6} />}
      caption="p95 · milliseconds"
    >
      {peak === 0 ? (
        <EmptyPlot message="Latency is sampled per request. The plot fills in as soon as the gateway serves traffic." />
      ) : (
        <>
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={CHROME.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                <YAxis {...axisProps} width={44} unit="" />
                <Tooltip
                  content={<SocTooltip unit="ms" />}
                  cursor={{ stroke: CHROME.cyan, strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                <Line
                  type="monotone"
                  dataKey="p95Ms"
                  name="p95"
                  stroke={SERIES.amber}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgMs"
                  name="mean"
                  stroke={SERIES.violet}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <SeriesLegend
            items={[
              { color: SERIES.amber, label: 'p95', value: `${peak} ms peak` },
              { color: SERIES.violet, label: 'mean' },
            ]}
          />
        </>
      )}
    </ChartFrame>
  );
}
