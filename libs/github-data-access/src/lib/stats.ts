const HOUR_IN_MS = 60 * 60 * 1000;

export interface DurationStats {
  avgHours: number | null;
  medianHours: number | null;
  p95Hours: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Nearest-rank percentile: the value at `ceil(p·n)` (1-based) in an
 * ascending sample. Chosen over interpolation because it is also what the
 * truncated backlog-age case can compute exactly from a partial sample.
 */
export function nearestRank(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const index = Math.max(0, Math.ceil(p * sortedAsc.length) - 1);
  return sortedAsc[index];
}

export function summarizeDurations(hours: number[]): DurationStats {
  if (hours.length === 0) {
    return { avgHours: null, medianHours: null, p95Hours: null };
  }
  const sorted = [...hours].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    avgHours: round2(total / sorted.length),
    medianHours: round2(nearestRank(sorted, 0.5) as number),
    p95Hours: round2(nearestRank(sorted, 0.95) as number),
  };
}

export function hoursBetween(startIso: string, endIso: string): number {
  return (
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / HOUR_IN_MS
  );
}
