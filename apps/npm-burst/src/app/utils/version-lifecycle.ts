import { parse } from 'semver';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';

export interface LifecycleMilestone {
  /** Major version label e.g. "v18" */
  label: string;
  /** Release date of this major version */
  releaseDate: string;
  /** Days from release until reaching the threshold % adoption (null if never reached) */
  daysToReachThreshold: number | null;
  /** Date when it reached the threshold (null if never reached) */
  reachedThresholdDate: string | null;
  /** Release date of the next major version (null if this is the latest) */
  nextMajorReleaseDate: string | null;
  /** Days after the next major release that this version persisted above threshold
   *  (null if no next major, or if it never dropped below) */
  daysPersistingAfterNext: number | null;
  /** Date when adoption dropped below threshold after next major (null if still above) */
  droppedBelowDate: string | null;
  /** Whether this version is still above threshold at the latest data point */
  stillAboveThreshold: boolean;
  /** Peak adoption % */
  peakPercent: number;
  /** Current adoption % (at latest snapshot) */
  currentPercent: number;
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
 * Finds the earliest stable release date for each major version.
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

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Computes lifecycle milestones for each major version:
 * - How many days to reach the threshold % adoption
 * - How many days it persisted above threshold after the next major was released
 */
export function getVersionLifecycleData(
  snapshots: Snapshot[],
  liveData: NpmDownloadsByVersion | null,
  versionReleases: VersionRelease[],
  threshold: number = 0.5
): LifecycleMilestone[] {
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
  const sortedMajors = Array.from(majorDates.entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  // Pre-compute adoption % per major per snapshot
  const adoptionBySnap: { date: string; percents: Record<string, number> }[] =
    timeline.map((snap) => {
      const grouped = groupByMajor(snap.downloads);
      const total = Object.values(grouped).reduce((s, c) => s + c, 0);
      const percents: Record<string, number> = {};
      if (total > 0) {
        for (const [key, count] of Object.entries(grouped)) {
          percents[key] = count / total;
        }
      }
      return { date: snap.date, percents };
    });

  const thresholdPct = threshold; // Already a fraction (e.g. 0.5 = 50%)

  const result: LifecycleMilestone[] = [];

  for (let i = 0; i < sortedMajors.length; i++) {
    const [majorKey, releaseDate] = sortedMajors[i];
    const nextMajorReleaseDate =
      i + 1 < sortedMajors.length ? sortedMajors[i + 1][1] : null;

    let daysToReachThreshold: number | null = null;
    let reachedThresholdDate: string | null = null;
    let daysPersistingAfterNext: number | null = null;
    let droppedBelowDate: string | null = null;
    let stillAboveThreshold = false;
    let peakPercent = 0;
    let currentPercent = 0;

    for (const snap of adoptionBySnap) {
      const pct = snap.percents[majorKey] ?? 0;
      peakPercent = Math.max(peakPercent, pct);
      currentPercent = pct;

      // Check if it reached the threshold
      if (
        reachedThresholdDate === null &&
        pct >= thresholdPct &&
        snap.date >= releaseDate
      ) {
        reachedThresholdDate = snap.date;
        daysToReachThreshold = daysBetween(releaseDate, snap.date);
      }

      // Check persistence after next major release
      if (nextMajorReleaseDate && snap.date >= nextMajorReleaseDate) {
        if (pct < thresholdPct && droppedBelowDate === null) {
          droppedBelowDate = snap.date;
          daysPersistingAfterNext = daysBetween(
            nextMajorReleaseDate,
            snap.date
          );
        }
      }
    }

    // Check if still above threshold at latest data point
    if (currentPercent >= thresholdPct) {
      stillAboveThreshold = true;
    }

    // Only include versions that have any snapshot data
    const hasData = adoptionBySnap.some(
      (s) => s.date >= releaseDate && (s.percents[majorKey] ?? 0) > 0
    );
    if (!hasData) continue;

    result.push({
      label: majorKey,
      releaseDate,
      daysToReachThreshold,
      reachedThresholdDate,
      nextMajorReleaseDate,
      daysPersistingAfterNext,
      droppedBelowDate,
      stillAboveThreshold,
      peakPercent: peakPercent * 100,
      currentPercent: currentPercent * 100,
    });
  }

  return result;
}
