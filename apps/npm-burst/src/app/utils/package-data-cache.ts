import type { NpmDownloadsByVersion } from '@npm-burst/npm-data-access';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';
import type { DailyDownloadPoint } from '../../server/functions/total-downloads.telefunc';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import { readCacheEntry, writeCacheEntry } from './local-cache';

/**
 * A local (per-browser) copy of the last data a package page loaded, used for
 * stale-while-revalidate: a repeat visit paints from here immediately, then
 * every data point is re-fetched in the background and swapped in as it
 * arrives.
 *
 * Unlike snapshots these values do go stale, so nothing here is ever trusted
 * as final — it only stands in until the revalidation lands. The snapshot
 * history has its own (immutable, incrementally paged) cache in
 * `snapshot-cache.ts`.
 */
export interface CachedPackageData {
  liveData: NpmDownloadsByVersion | null;
  versionReleases: VersionRelease[];
  totalDownloads: DailyDownloadPoint[];
  health: PackageHealthResponse | null;
  /** Epoch ms of the last write, used to pick eviction victims. */
  savedAt: number;
}

const KEY_PREFIX = 'npm-burst:package-data:v1:';

function keyFor(pkg: string): string {
  return KEY_PREFIX + pkg;
}

export function readPackageDataCache(pkg: string): CachedPackageData | null {
  const parsed = readCacheEntry<CachedPackageData>(keyFor(pkg));
  if (
    !parsed ||
    !Array.isArray(parsed.versionReleases) ||
    !Array.isArray(parsed.totalDownloads)
  ) {
    return null;
  }
  return parsed;
}

export function writePackageDataCache(
  pkg: string,
  data: Omit<CachedPackageData, 'savedAt'>
): void {
  writeCacheEntry(keyFor(pkg), {
    ...data,
    // Warnings describe the request that produced them; replaying them from
    // cache would re-toast stale failures on every visit.
    health: data.health ? { ...data.health, warnings: [] } : null,
  });
}
