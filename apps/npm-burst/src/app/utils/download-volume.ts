import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';

export interface VolumePoint {
  date: string;
  totalDownloads: number;
}

/**
 * Computes total download volume per snapshot date.
 * Sums all version downloads for each snapshot to get absolute totals.
 */
export function getDownloadVolumeData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null
): VolumePoint[] {
  const points: VolumePoint[] = snapshots.map((snap) => ({
    date: snap.date,
    totalDownloads: Object.values(snap.downloads).reduce(
      (sum, c) => sum + c,
      0
    ),
  }));

  if (liveData) {
    const today = new Date().toISOString().slice(0, 10);
    points.push({
      date: today,
      totalDownloads: Object.values(liveData.downloads).reduce(
        (sum, c) => sum + c,
        0
      ),
    });
  }

  return points;
}

/**
 * Formats a download count with K/M suffixes.
 */
export function formatDownloadCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
