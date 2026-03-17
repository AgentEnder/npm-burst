import { parse } from 'semver';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';

export interface VersionAdoptionPoint {
  date: string;
  percent: number;
  count: number;
}

export interface VersionAdoptionSeries {
  /** Version label, e.g. "v18", "v18.3", "v18.3.0" */
  label: string;
  /** Data points sorted by date */
  points: VersionAdoptionPoint[];
  /** Whether this series was below the LPF threshold */
  belowThreshold: boolean;
}

export type AdoptionGrouping = 'major' | 'minor' | 'patch';

/**
 * Groups download counts at the specified granularity level.
 */
function groupDownloads(
  downloads: Record<string, number>,
  grouping: AdoptionGrouping
): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const [version, count] of Object.entries(downloads)) {
    const parsed = parse(version);
    if (!parsed) continue;
    let key: string;
    switch (grouping) {
      case 'major':
        key = `v${parsed.major}`;
        break;
      case 'minor':
        key = `v${parsed.major}.${parsed.minor}`;
        break;
      case 'patch':
        key = `v${parsed.major}.${parsed.minor}.${parsed.patch}`;
        break;
    }
    grouped[key] = (grouped[key] ?? 0) + count;
  }
  return grouped;
}

/**
 * Builds a map of date → 7-day rolling sum from daily download data.
 */
function buildRollingTotalMap(
  dailyDownloads: DailyDownloadPoint[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 6; i < dailyDownloads.length; i++) {
    let sum = 0;
    for (let j = i - 6; j <= i; j++) {
      sum += dailyDownloads[j].downloads;
    }
    map.set(dailyDownloads[i].day, sum);
  }
  return map;
}

/**
 * Finds the closest rolling total for a given date.
 * Falls back to nearest available date within 7 days.
 */
function findClosestTotal(
  rollingMap: Map<string, number>,
  date: string
): number | null {
  if (rollingMap.has(date)) return rollingMap.get(date)!;
  // Search nearby dates (±7 days)
  const target = new Date(date + 'T00:00:00').getTime();
  let closest: number | null = null;
  let closestDist = Infinity;
  for (const [d, total] of rollingMap) {
    const dist = Math.abs(new Date(d + 'T00:00:00').getTime() - target);
    if (dist < closestDist && dist <= 7 * 86400000) {
      closestDist = dist;
      closest = total;
    }
  }
  return closest;
}

/**
 * Transforms snapshot history + live data into version adoption
 * time series at the specified grouping level. Applies a low-pass filter
 * to mark series below the threshold. When totalDownloads is provided,
 * adds an "unknown" series for downloads not attributable to known versions.
 */
export function getVersionAdoptionData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null,
  grouping: AdoptionGrouping = 'major',
  lowPassFilter: number = 0,
  totalDownloads: DailyDownloadPoint[] = []
): VersionAdoptionSeries[] {
  // Build combined timeline: snapshots + live data
  const timeline: { date: string; downloads: Record<string, number> }[] = [
    ...snapshots,
  ];
  if (liveData) {
    const today = new Date().toISOString().slice(0, 10);
    timeline.push({ date: today, downloads: liveData.downloads });
  }

  if (timeline.length === 0) return [];

  // Collect all unique group keys across all snapshots
  const allGroups = new Set<string>();
  const groupedBySnap: Record<string, number>[] = [];
  const totals: number[] = [];

  for (const snap of timeline) {
    const grouped = groupDownloads(snap.downloads, grouping);
    groupedBySnap.push(grouped);
    const total = Object.values(snap.downloads).reduce(
      (sum, c) => sum + c,
      0
    );
    totals.push(total);
    for (const key of Object.keys(grouped)) {
      allGroups.add(key);
    }
  }

  // Compute total downloads per group across entire history (for LPF + sorting)
  const totalByGroup: Record<string, number> = {};
  const grandTotal = totals.reduce((s, t) => s + t, 0);
  for (const grouped of groupedBySnap) {
    for (const [key, count] of Object.entries(grouped)) {
      totalByGroup[key] = (totalByGroup[key] ?? 0) + count;
    }
  }

  // Sort groups by total downloads descending
  const sortedGroups = Array.from(allGroups).sort(
    (a, b) => (totalByGroup[b] ?? 0) - (totalByGroup[a] ?? 0)
  );

  // Build series
  const result: VersionAdoptionSeries[] = [];

  for (const group of sortedGroups) {
    const points: VersionAdoptionPoint[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const total = totals[i];
      if (total === 0) continue;
      const count = groupedBySnap[i][group] ?? 0;
      points.push({
        date: timeline[i].date,
        percent: (count / total) * 100,
        count,
      });
    }

    const avgShare = grandTotal > 0 ? (totalByGroup[group] ?? 0) / grandTotal : 0;
    result.push({
      label: group,
      points,
      belowThreshold: avgShare < lowPassFilter,
    });
  }

  // "unknown" series — gap between total downloads and sum of known versions
  if (totalDownloads.length >= 7) {
    const rollingMap = buildRollingTotalMap(totalDownloads);
    const unknownPoints: VersionAdoptionPoint[] = [];

    for (let i = 0; i < timeline.length; i++) {
      const knownTotal = totals[i];
      const actualTotal = findClosestTotal(rollingMap, timeline[i].date);
      if (actualTotal === null) continue;

      const unknownCount = Math.max(0, actualTotal - knownTotal);
      const unknownPercent = actualTotal > 0 ? (unknownCount / actualTotal) * 100 : 0;
      unknownPoints.push({
        date: timeline[i].date,
        percent: unknownPercent,
        count: unknownCount,
      });
    }

    if (unknownPoints.some((p) => p.count > 0)) {
      result.push({
        label: 'unknown',
        points: unknownPoints,
        belowThreshold: false,
      });
    }
  }

  return result;
}
