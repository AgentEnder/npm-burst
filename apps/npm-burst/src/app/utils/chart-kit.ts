import { d3Curve } from '@tanstack/charts/d3/shape';
import { curveMonotoneX } from 'd3-shape';

/** Monotone interpolation, used by every time-series line and area. */
export const monotoneCurve = d3Curve(curveMonotoneX);

/** Parses a `YYYY-MM-DD` day as local midnight. */
export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

export function formatMonth(date: Date): string {
  return monthFormat.format(date);
}

/** Formats a download count with K/M suffixes. */
export function formatDownloadCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
