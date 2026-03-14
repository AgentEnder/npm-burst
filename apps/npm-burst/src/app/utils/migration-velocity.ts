import { parse, gt, SemVer } from 'semver';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';

export interface MigrationSeries {
  /** Label e.g. "v18" */
  label: string;
  /** Release date of this major version */
  releaseDate: string;
  /** Data points: days since release → adoption % */
  points: { daysSinceRelease: number; percent: number }[];
}

/**
 * Groups download counts by major version.
 */
function groupByMajor(
  downloads: Record<string, number>
): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const [version, count] of Object.entries(downloads)) {
    const parsed = parse(version);
    if (!parsed) continue;
    const key = `v${parsed.major}`;
    grouped[key] = (grouped[key] ?? 0) + count;
  }
  return grouped;
}

/**
 * Finds the earliest release date for each major version.
 */
function getMajorReleaseDates(
  versionReleases: VersionRelease[]
): Map<string, string> {
  const majorDates = new Map<string, string>();
  for (const vr of versionReleases) {
    const parsed = parse(vr.version);
    if (!parsed || parsed.prerelease.length > 0) continue;
    const key = `v${parsed.major}`;
    const existing = majorDates.get(key);
    if (!existing || vr.date < existing) {
      majorDates.set(key, vr.date);
    }
  }
  return majorDates;
}

/**
 * Computes the number of days between two date strings (YYYY-MM-DD).
 */
function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Computes migration velocity data: for each major version, shows adoption %
 * normalized by days since release, allowing direct comparison of adoption
 * speeds across releases.
 */
export function getMigrationVelocityData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null,
  versionReleases: VersionRelease[]
): MigrationSeries[] {
  const majorDates = getMajorReleaseDates(versionReleases);
  if (majorDates.size === 0) return [];

  // Build timeline
  const timeline: { date: string; downloads: Record<string, number> }[] = [
    ...snapshots,
  ];
  if (liveData) {
    const today = new Date().toISOString().slice(0, 10);
    timeline.push({ date: today, downloads: liveData.downloads });
  }
  if (timeline.length === 0) return [];

  // Sort major versions by release date
  const sortedMajors = Array.from(majorDates.entries()).sort(
    (a, b) => a[1].localeCompare(b[1])
  );

  const result: MigrationSeries[] = [];

  for (const [majorKey, releaseDate] of sortedMajors) {
    const points: { daysSinceRelease: number; percent: number }[] = [];

    for (const snap of timeline) {
      // Only include snapshots on or after this major's release
      if (snap.date < releaseDate) continue;

      const grouped = groupByMajor(snap.downloads);
      const total = Object.values(grouped).reduce((s, c) => s + c, 0);
      if (total === 0) continue;

      const majorCount = grouped[majorKey] ?? 0;
      const days = daysBetween(releaseDate, snap.date);

      points.push({
        daysSinceRelease: days,
        percent: (majorCount / total) * 100,
      });
    }

    // Only include if we have data points
    if (points.length > 0) {
      result.push({
        label: majorKey,
        releaseDate,
        points,
      });
    }
  }

  return result;
}
