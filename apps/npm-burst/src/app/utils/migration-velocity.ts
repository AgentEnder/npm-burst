import { parse } from 'semver';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import type { MigrationGranularity } from './time-window';

export interface MigrationSeries {
  /** Label e.g. "v18", "v18.2", or "v18.2.0" depending on granularity */
  label: string;
  /** Release date of this version key */
  releaseDate: string;
  /** Data points: days since release → adoption % */
  points: { daysSinceRelease: number; percent: number }[];
}

function versionKey(
  parsed: { major: number; minor: number; patch: number },
  granularity: MigrationGranularity
): string {
  if (granularity === 'major') return `v${parsed.major}`;
  if (granularity === 'minor') return `v${parsed.major}.${parsed.minor}`;
  return `v${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function groupByGranularity(
  downloads: Record<string, number>,
  granularity: MigrationGranularity
): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const [version, count] of Object.entries(downloads)) {
    const parsed = parse(version);
    if (!parsed) continue;
    const key = versionKey(parsed, granularity);
    grouped[key] = (grouped[key] ?? 0) + count;
  }
  return grouped;
}

function getReleaseDatesByGranularity(
  versionReleases: VersionRelease[],
  granularity: MigrationGranularity
): Map<string, string> {
  const dates = new Map<string, string>();
  for (const vr of versionReleases) {
    const parsed = parse(vr.version);
    if (!parsed || parsed.prerelease.length > 0) continue;
    const key = versionKey(parsed, granularity);
    const existing = dates.get(key);
    if (!existing || vr.date < existing) {
      dates.set(key, vr.date);
    }
  }
  return dates;
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
 * Computes migration velocity data: for each version key (at the requested
 * granularity), shows adoption % normalized by days since that key first
 * appeared, allowing direct comparison of adoption speeds across releases.
 */
export function getMigrationVelocityData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null,
  versionReleases: VersionRelease[],
  granularity: MigrationGranularity = 'major'
): MigrationSeries[] {
  const releaseDates = getReleaseDatesByGranularity(
    versionReleases,
    granularity
  );
  if (releaseDates.size === 0) return [];

  const timeline: { date: string; downloads: Record<string, number> }[] = [
    ...snapshots,
  ];
  if (liveData) {
    const today = new Date().toISOString().slice(0, 10);
    timeline.push({ date: today, downloads: liveData.downloads });
  }
  if (timeline.length === 0) return [];

  const sortedKeys = Array.from(releaseDates.entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  const result: MigrationSeries[] = [];

  for (const [key, releaseDate] of sortedKeys) {
    const points: { daysSinceRelease: number; percent: number }[] = [];

    for (const snap of timeline) {
      if (snap.date < releaseDate) continue;

      const grouped = groupByGranularity(snap.downloads, granularity);
      const total = Object.values(grouped).reduce((s, c) => s + c, 0);
      if (total === 0) continue;

      const count = grouped[key] ?? 0;
      const days = daysBetween(releaseDate, snap.date);

      points.push({
        daysSinceRelease: days,
        percent: (count / total) * 100,
      });
    }

    if (points.length > 0) {
      result.push({
        label: key,
        releaseDate,
        points,
      });
    }
  }

  return result;
}
