export type BreakerState = 'closed' | 'open' | 'half_open';

interface BreakerSnapshot {
  state: BreakerState;
  failures: number;
  successes: number;
  openedAt: number | null;
  nextProbeAt: number | null;
  lastError: string | null;
}

const THRESHOLD = Number(process.env.BREAKER_FAILURE_THRESHOLD ?? 5);
const RESET_MS = Number(process.env.BREAKER_RESET_MS ?? 30_000);

const globalForBreaker = globalThis as unknown as { sentinelBreaker?: BreakerSnapshot };

const state: BreakerSnapshot = globalForBreaker.sentinelBreaker ?? {
  state: 'closed',
  failures: 0,
  successes: 0,
  openedAt: null,
  nextProbeAt: null,
  lastError: null,
};
globalForBreaker.sentinelBreaker = state;

/**
 * Guards the Meta Graph API. After THRESHOLD consecutive failures the breaker
 * opens and calls fail fast for RESET_MS, then a single half-open probe
 * decides whether to close again.
 */
export const breaker = {
  snapshot(): BreakerSnapshot & { thresholdAt: number; resetMs: number } {
    return { ...state, thresholdAt: THRESHOLD, resetMs: RESET_MS };
  },

  /** Returns null when the call may proceed, or a reason string when blocked. */
  guard(): string | null {
    if (state.state === 'open') {
      if (state.nextProbeAt && Date.now() >= state.nextProbeAt) {
        state.state = 'half_open';
        return null;
      }
      const waitMs = Math.max(0, (state.nextProbeAt ?? 0) - Date.now());
      return `circuit_open:retry_in_${Math.ceil(waitMs / 1000)}s`;
    }
    return null;
  },

  success(): void {
    state.failures = 0;
    state.successes += 1;
    state.state = 'closed';
    state.openedAt = null;
    state.nextProbeAt = null;
    state.lastError = null;
  },

  failure(error: string): void {
    state.failures += 1;
    state.lastError = error;
    if (state.state === 'half_open' || state.failures >= THRESHOLD) {
      state.state = 'open';
      state.openedAt = Date.now();
      state.nextProbeAt = Date.now() + RESET_MS;
    }
  },

  reset(): void {
    state.state = 'closed';
    state.failures = 0;
    state.openedAt = null;
    state.nextProbeAt = null;
    state.lastError = null;
  },
};
