/**
 * Chart + status palette.
 *
 * The bright brand neons (#00ff9d / #00e5ff) are *chrome*: borders, glows,
 * headings, gauge arcs. They sit at OKLCH L ~ 0.85, far above the readable band
 * for data marks on a #0d1117 surface, so plotting series use the deeper steps
 * below instead. Those four were validated as a categorical set against the
 * dark surface - lightness band, chroma floor, adjacent-pair CVD separation
 * (worst dE 9.7 deutan), normal-vision floor and 3:1 contrast all pass.
 *
 * Order is fixed. Never cycle it, never reassign by rank - a series keeps its
 * hue when a filter changes which series are visible.
 */
export const SERIES = {
  emerald: '#00ad78',
  amber: '#c08419',
  violet: '#7f6ff2',
  crimson: '#e0455e',
} as const;

export const SERIES_ORDER = [SERIES.emerald, SERIES.amber, SERIES.violet, SERIES.crimson] as const;

/** Reserved state colors - always shipped with a label or icon, never alone. */
export const STATUS = {
  operational: '#00ad78',
  unconfigured: '#5c7186',
  degraded: '#c08419',
  critical: '#e0455e',
  offline: '#e0455e',
} as const;

/** Delivery lifecycle, drawn as a ring with direct labels beside each arc. */
export const DELIVERY = {
  queued: '#5c7186',
  sent: '#7f6ff2',
  delivered: '#00ad78',
  read: '#00e5ff',
  failed: '#e0455e',
} as const;

/** Neon chrome - UI only, never a data mark. */
export const CHROME = {
  neon: '#00ff9d',
  cyan: '#00e5ff',
  warn: '#ffb020',
  crit: '#ff3b5c',
  surface: '#0d1117',
  void: '#0a0a0f',
  ink: '#c7d5e0',
  inkMuted: '#8ba0b6',
  grid: 'rgba(0, 229, 255, 0.10)',
  axis: 'rgba(139, 160, 182, 0.45)',
} as const;

export const LOG_LEVEL_COLOR: Record<string, string> = {
  DEBUG: '#5c7186',
  INFO: '#00e5ff',
  WARN: '#ffb020',
  CRITICAL: '#ff3b5c',
};

export type HealthState = keyof typeof STATUS;

export function stateColor(state: string): string {
  return STATUS[state as HealthState] ?? STATUS.unconfigured;
}

export function stateChip(state: string): string {
  switch (state) {
    case 'operational':
      return 'chip chip-ok';
    case 'degraded':
      return 'chip chip-warn';
    case 'critical':
    case 'offline':
      return 'chip chip-crit';
    default:
      return 'chip chip-idle';
  }
}
