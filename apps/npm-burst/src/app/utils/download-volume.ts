import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';

export interface VolumePoint {
  date: string;
  totalDownloads: number;
}

/**
 * Converts daily download data from the npm downloads API into volume points
 * using a rolling 7-day sum. Each point represents the total downloads for
 * the preceding 7 days, which smooths out day-of-week noise.
 */
export function getDownloadVolumeData(
  totalDownloads: DailyDownloadPoint[]
): VolumePoint[] {
  if (totalDownloads.length < 7) return [];

  const points: VolumePoint[] = [];
  for (let i = 6; i < totalDownloads.length; i++) {
    let sum = 0;
    for (let j = i - 6; j <= i; j++) {
      sum += totalDownloads[j].downloads;
    }
    points.push({
      date: totalDownloads[i].day,
      totalDownloads: sum,
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
