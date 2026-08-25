'use client';

import { cn } from '@/lib/utils';

interface GaugeProps {
  label: string;
  /** 0–100. Values outside the range are clamped. */
  value: number;
  display: string;
  /** Thresholds at which the arc turns amber, then crimson. */
  warnAt?: number;
  critAt?: number;
  caption?: string;
  size?: number;
}

const R = 42;
const CIRC = 2 * Math.PI * R;
/** Three-quarter dial: 270° of sweep, opening at the bottom. */
const SWEEP = 0.75;

/**
 * A single-measure dial. Sequential by construction — one hue, deepening as the
 * value rises — with the numeric readout carrying the actual value, so the color
 * is reinforcement rather than the only encoding.
 */
export function Gauge({
  label,
  value,
  display,
  warnAt = 70,
  critAt = 88,
  caption,
  size = 108,
}: GaugeProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const level = pct >= critAt ? 'crit' : pct >= warnAt ? 'warn' : 'ok';
  const color = level === 'crit' ? '#ff3b5c' : level === 'warn' ? '#ffb020' : '#00ff9d';

  const track = CIRC * SWEEP;
  const filled = track * (pct / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-[225deg]" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="rgba(139,160,182,0.16)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${track} ${CIRC}`}
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRC}`}
            style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: 'stroke-dasharray 600ms ease' }}
          />
          {/* Tick marks every 10% — a dial without ticks reads as decoration. */}
          {Array.from({ length: 11 }, (_, i) => {
            const angle = (i / 10) * SWEEP * 360;
            return (
              <line
                key={i}
                x1="50"
                y1="4"
                x2="50"
                y2={i % 5 === 0 ? 9 : 7}
                stroke="rgba(139,160,182,0.35)"
                strokeWidth="1"
                transform={`rotate(${angle} 50 50)`}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn('font-mono text-[15px] font-semibold tabular-nums')}
            style={{ color }}
            role="status"
            aria-label={`${label}: ${display}`}
          >
            {display}
          </span>
          {caption && <span className="text-2xs text-muted">{caption}</span>}
        </div>
      </div>
      <span className="text-2xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
    </div>
  );
}
