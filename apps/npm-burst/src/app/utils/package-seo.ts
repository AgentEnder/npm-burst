import { coerce } from 'semver';

import type { PackageTab } from './package-route';

/**
 * Title and meta-description text for package pages.
 *
 * Everything here is derived from the snapshot `+data.ts` already loads for
 * the chart, so per-package metadata costs no extra queries. That is the whole
 * point: the unique, indexable text for these pages is the data itself, not
 * prose written to fill a page.
 *
 * Pure functions, no pageContext — the wiring lives in
 * `pages/package-detail/+config.ts`.
 */

export const SITE_NAME = 'Npm Burst';

/** Google truncates descriptions past roughly this; keep them inside it. */
const MAX_DESCRIPTION = 155;

export interface SnapshotSummary {
  totalDownloads: number;
  versionCount: number;
  /** Major line with the largest share, e.g. `21` — null if unparseable. */
  topMajor: string | null;
  /** Share of total downloads on `topMajor`, 0-1. */
  topMajorShare: number;
}

/**
 * `1240000 -> "1.24M"`. Compact rather than grouped, because these land in
 * a title where width is the scarce resource.
 */
export function formatDownloads(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  if (count < 1_000) return `${Math.round(count)}`;
  if (count < 1_000_000) {
    const thousands = count / 1_000;
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}K`;
  }
  const millions = count / 1_000_000;
  return `${millions < 10 ? millions.toFixed(2) : millions.toFixed(1)}M`;
}

export function summarizeSnapshot(
  downloads: Record<string, number> | null | undefined
): SnapshotSummary | null {
  if (!downloads) return null;

  const entries = Object.entries(downloads).filter(
    ([, count]) => Number.isFinite(count) && count > 0
  );
  if (entries.length === 0) return null;

  const byMajor = new Map<string, number>();
  let totalDownloads = 0;

  for (const [version, count] of entries) {
    totalDownloads += count;
    const major = coerce(version)?.major;
    if (major === undefined) continue;
    byMajor.set(`${major}`, (byMajor.get(`${major}`) ?? 0) + count);
  }

  let topMajor: string | null = null;
  let topMajorDownloads = 0;
  for (const [major, count] of byMajor) {
    if (count > topMajorDownloads) {
      topMajor = major;
      topMajorDownloads = count;
    }
  }

  return {
    totalDownloads,
    versionCount: entries.length,
    topMajor,
    topMajorShare: totalDownloads > 0 ? topMajorDownloads / totalDownloads : 0,
  };
}

export function buildPackageTitle(
  packageName: string,
  summary: SnapshotSummary | null,
  tab: PackageTab
): string {
  if (tab === 'health') {
    return `${packageName} — repository health & maintenance | ${SITE_NAME}`;
  }

  if (summary) {
    return `${packageName} — ${formatDownloads(
      summary.totalDownloads
    )} weekly npm downloads across ${summary.versionCount} versions`;
  }

  return `${packageName} — npm download stats by version | ${SITE_NAME}`;
}

export function buildPackageDescription(
  packageName: string,
  summary: SnapshotSummary | null,
  tab: PackageTab
): string {
  if (tab === 'health') {
    return truncate(
      `Issue and pull request throughput, review latency and contributor activity for the ${packageName} repository, tracked over time.`
    );
  }

  if (!summary) {
    return truncate(
      `Weekly npm download distribution for ${packageName} broken down by major, minor and patch version, with daily snapshots and adoption history.`
    );
  }

  const share =
    summary.topMajor !== null
      ? ` ${Math.round(summary.topMajorShare * 100)}% are on ${
          summary.topMajor
        }.x.`
      : '';

  return truncate(
    `${formatDownloads(
      summary.totalDownloads
    )} weekly downloads of ${packageName} across ${
      summary.versionCount
    } published versions.${share} See the full version breakdown and adoption history.`
  );
}

function truncate(text: string): string {
  if (text.length <= MAX_DESCRIPTION) return text;
  // Cut on a word boundary so the ellipsis does not land mid-word.
  const clipped = text.slice(0, MAX_DESCRIPTION - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 0
    ? clipped.slice(0, lastSpace)
    : clipped
  ).trimEnd()}…`;
}
