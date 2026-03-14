import { parse, gt, SemVer } from 'semver';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';

export interface VersionAdoptionSeries {
  /** Version label, e.g. "v18.3.0" or "latest" */
  label: string;
  /** Data points sorted by date */
  points: { date: string; percent: number }[];
}

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
 * Transforms snapshot history + live data into version adoption percentage
 * time series. Groups by major.minor to reduce noise, includes a special
 * "latest" series showing the adoption of whatever version was "latest" at
 * each point in time.
 */
export function getVersionAdoptionData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null,
  versionReleases: VersionRelease[],
  topN: number = 8
): VersionAdoptionSeries[] {
  // Build combined timeline: snapshots + live data
  const timeline: { date: string; downloads: Record<string, number> }[] = [
    ...snapshots,
  ];
  if (liveData) {
    // Use today's date for live data
    const today = new Date().toISOString().slice(0, 10);
    timeline.push({ date: today, downloads: liveData.downloads });
  }

  if (timeline.length === 0) return [];

  // Group versions by major.minor across all snapshots
  function groupByMajorMinor(
    downloads: Record<string, number>
  ): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const [version, count] of Object.entries(downloads)) {
      const parsed = parse(version);
      if (!parsed) continue;
      const key = `v${parsed.major}.${parsed.minor}`;
      grouped[key] = (grouped[key] ?? 0) + count;
    }
    return grouped;
  }

  // Determine the top N version groups by total downloads across all snapshots
  const totalByGroup: Record<string, number> = {};
  for (const snap of timeline) {
    const grouped = groupByMajorMinor(snap.downloads);
    for (const [key, count] of Object.entries(grouped)) {
      totalByGroup[key] = (totalByGroup[key] ?? 0) + count;
    }
  }

  const topGroups = Object.entries(totalByGroup)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);

  // Build series for each top group
  const seriesMap = new Map<string, { date: string; percent: number }[]>();
  for (const group of topGroups) {
    seriesMap.set(group, []);
  }

  // "latest" series
  const latestPoints: { date: string; percent: number }[] = [];

  for (const snap of timeline) {
    const total = Object.values(snap.downloads).reduce(
      (sum, c) => sum + c,
      0
    );
    if (total === 0) continue;

    const grouped = groupByMajorMinor(snap.downloads);

    for (const group of topGroups) {
      const count = grouped[group] ?? 0;
      seriesMap.get(group)!.push({
        date: snap.date,
        percent: (count / total) * 100,
      });
    }

    // Compute "latest" percentage
    const latestVersion = getLatestVersionAtDate(snap.date, versionReleases);
    if (latestVersion) {
      const latestCount = snap.downloads[latestVersion] ?? 0;
      latestPoints.push({
        date: snap.date,
        percent: (latestCount / total) * 100,
      });
    }
  }

  const result: VersionAdoptionSeries[] = topGroups.map((group) => ({
    label: group,
    points: seriesMap.get(group)!,
  }));

  if (latestPoints.length > 0) {
    result.push({ label: 'latest', points: latestPoints });
  }

  return result;
}
