import { parse, gt, SemVer } from 'semver';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';

export interface VersionAdoptionSeries {
  /** Version label, e.g. "v18", "v18.3", "v18.3.0", or "latest" */
  label: string;
  /** Data points sorted by date */
  points: { date: string; percent: number }[];
  /** Whether this series was below the LPF threshold */
  belowThreshold: boolean;
}

export type AdoptionGrouping = 'major' | 'minor' | 'patch';

/**
 * Determines the "latest" stable version for a given snapshot date based on
 * version release dates. Returns the highest version released on or before
 * that date.
 */
function getLatestVersionAtDate(
  date: string,
  versionReleases: VersionRelease[]
): string | null {
  let latest: { version: string; parsed: SemVer } | null = null;
  for (const vr of versionReleases) {
    if (vr.date > date) continue;
    const parsed = parse(vr.version);
    if (!parsed || parsed.prerelease.length > 0) continue;
    if (!latest || gt(parsed, latest.parsed)) {
      latest = { version: vr.version, parsed };
    }
  }
  return latest?.version ?? null;
}

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
 * Transforms snapshot history + live data into version adoption percentage
 * time series at the specified grouping level. Applies a low-pass filter
 * to mark series below the threshold. Includes a special "latest" series
 * showing the adoption of whatever exact version was "latest" at each point.
 */
export function getVersionAdoptionData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null,
  versionReleases: VersionRelease[],
  grouping: AdoptionGrouping = 'major',
  lowPassFilter: number = 0
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
    const points: { date: string; percent: number }[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const total = totals[i];
      if (total === 0) continue;
      const count = groupedBySnap[i][group] ?? 0;
      points.push({
        date: timeline[i].date,
        percent: (count / total) * 100,
      });
    }

    const avgShare = grandTotal > 0 ? (totalByGroup[group] ?? 0) / grandTotal : 0;
    result.push({
      label: group,
      points,
      belowThreshold: avgShare < lowPassFilter,
    });
  }

  // "latest" series — tracks the exact latest stable version at each point
  const latestPoints: { date: string; percent: number }[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const total = totals[i];
    if (total === 0) continue;
    const latestVersion = getLatestVersionAtDate(
      timeline[i].date,
      versionReleases
    );
    if (latestVersion) {
      const latestCount = timeline[i].downloads[latestVersion] ?? 0;
      latestPoints.push({
        date: timeline[i].date,
        percent: (latestCount / total) * 100,
      });
    }
  }

  if (latestPoints.length > 0) {
    result.push({
      label: 'latest',
      points: latestPoints,
      belowThreshold: false,
    });
  }

  return result;
}
