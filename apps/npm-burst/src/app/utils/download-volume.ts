import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';

export interface VolumePoint {
  date: string;
  totalDownloads: number;
}

/**
 * Converts daily download data from the npm downloads API into volume points.
 * Uses the total downloads endpoint directly rather than aggregating
 * per-version data from snapshots.
 */
export function getDownloadVolumeData(
  totalDownloads: DailyDownloadPoint[]
): VolumePoint[] {
  return totalDownloads.map((d) => ({
    date: d.day,
    totalDownloads: d.downloads,
  }));
}

/**
 * Formats a download count with K/M suffixes.
 */
export function formatDownloadCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
