import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1234567 -> "1.23M" — keeps gauges from overflowing their tiles. */
export function compact(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(digits)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(digits)}k`;
  return abs >= 100 ? n.toFixed(0) : n.toFixed(digits).replace(/\.0$/, '');
}

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 93784 -> "1d 02:03:04" */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor((seconds / 3600) % 24);
  const d = Math.floor(seconds / 86400);
  const hhmmss = [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  return d > 0 ? `${d}d ${hhmmss}` : hhmmss;
}

export function relativeTime(input: string | number | Date | null | undefined): string {
  if (!input) return 'never';
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return 'never';
  const delta = Math.round((Date.now() - then) / 1000);
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function clockTime(input: string | number | Date): string {
  const d = new Date(input);
  return Number.isNaN(d.getTime())
    ? '--:--:--'
    : d.toTimeString().slice(0, 8);
}

/** Normalises a phone number to the digits-only form Meta expects. */
export function normalizeWaId(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

export function maskSecret(value: string, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible * 2) return '•'.repeat(value.length);
  return `${value.slice(0, visible)}${'•'.repeat(Math.min(24, value.length - visible * 2))}${value.slice(-visible)}`;
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
