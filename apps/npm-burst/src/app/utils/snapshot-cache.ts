import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import { readCacheEntry, writeCacheEntry } from './local-cache';

/**
 * A local (per-browser) cache of a package's snapshot history.
 *
 * Snapshots are immutable once written — the cron inserts with
 * `ON CONFLICT DO NOTHING` — so anything cached here stays correct forever.
 * History is always fetched newest → oldest, which keeps the cached range
 * contiguous: everything between `snapshots[0]` and the newest entry is
 * present. That lets a later visit fetch only the new pages at the top and,
 * if an earlier visit was interrupted, resume below the oldest cached date.
 */
export interface CachedSnapshotHistory {
  /** Oldest first, contiguous. */
  snapshots: Snapshot[];
  /** True once the oldest snapshot the server has is in `snapshots`. */
  complete: boolean;
  /** Epoch ms of the last write, used to pick eviction victims. */
  savedAt: number;
}

/** Snapshots requested per round-trip while walking history. */
export const SNAPSHOT_PAGE_SIZE = 25;

const KEY_PREFIX = 'npm-burst:snapshots:v1:';

function keyFor(pkg: string): string {
  return KEY_PREFIX + pkg;
}

export function readSnapshotCache(pkg: string): CachedSnapshotHistory | null {
  const parsed = readCacheEntry<CachedSnapshotHistory>(keyFor(pkg));
  if (!Array.isArray(parsed?.snapshots)) return null;
  return parsed;
}

/**
 * Each package's history can be sizeable, so a quota error evicts the
 * least-recently-saved other cache entries and retries.
 */
export function writeSnapshotCache(
  pkg: string,
  history: Omit<CachedSnapshotHistory, 'savedAt'>
): void {
  writeCacheEntry(keyFor(pkg), history);
}

/**
 * Union of snapshot lists by date, oldest first. On a date collision the
 * entry from `incoming` wins.
 */
export function mergeSnapshots(
  existing: Snapshot[],
  incoming: Snapshot[]
): Snapshot[] {
  if (incoming.length === 0) return existing;
  const byDate = new Map<string, Snapshot>();
  for (const s of existing) byDate.set(s.date, s);
  for (const s of incoming) byDate.set(s.date, s);
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}

export interface SnapshotPageFetcher {
  (options: { before?: string; limit: number }): Promise<{
    snapshots: Snapshot[];
    hasMore: boolean;
  }>;
}

/**
 * Walks a package's snapshot history newest → oldest in pages, skipping any
 * range already held in `cached`.
 *
 * - Pages down from the top until a page reaches the newest cached date (or
 *   the server runs out). The cached range is contiguous, so nothing between
 *   there and the oldest cached date needs fetching.
 * - If the cache never reached the oldest snapshot, resumes paging below the
 *   oldest cached date.
 *
 * `onProgress` is called with the full merged, oldest-first history after
 * every page (and once up front if a cache exists). `contiguous` is false
 * while there is still a gap between freshly fetched pages and the cached
 * range — only contiguous history may be written back to the cache.
 * Returning `false` from `shouldContinue` stops the walk, e.g. when the
 * caller unmounts.
 */
export interface SnapshotHistoryProgress {
  snapshots: Snapshot[];
  complete: boolean;
  contiguous: boolean;
}

export async function loadSnapshotHistory(options: {
  cached: CachedSnapshotHistory | null;
  fetchPage: SnapshotPageFetcher;
  pageSize: number;
  onProgress: (history: SnapshotHistoryProgress) => void;
  shouldContinue?: () => boolean;
}): Promise<{ snapshots: Snapshot[]; complete: boolean }> {
  const { cached, fetchPage, pageSize, onProgress } = options;
  const shouldContinue = options.shouldContinue ?? (() => true);

  let snapshots = cached?.snapshots ?? [];
  const cachedNewest = snapshots[snapshots.length - 1]?.date ?? null;
  const cachedOldest = snapshots[0]?.date ?? null;
  let complete = cached?.complete ?? false;

  if (snapshots.length > 0) {
    onProgress({ snapshots, complete, contiguous: true });
  }

  // Phase 1: fetch everything newer than the cache (or the whole history if
  // there is no cache).
  let before: string | undefined;
  for (;;) {
    if (!shouldContinue()) return { snapshots, complete };
    const page = await fetchPage({ before, limit: pageSize });
    if (!shouldContinue()) return { snapshots, complete };

    snapshots = mergeSnapshots(snapshots, page.snapshots);
    const pageOldest = page.snapshots[0]?.date;
    const reachedCache =
      cachedNewest !== null &&
      (pageOldest === undefined || pageOldest <= cachedNewest);

    if (!page.hasMore) {
      // The server has nothing older: whatever we hold now is everything.
      complete = true;
      onProgress({ snapshots, complete, contiguous: true });
      return { snapshots, complete };
    }

    if (reachedCache || pageOldest === undefined) {
      onProgress({ snapshots, complete, contiguous: true });
      break;
    }

    onProgress({ snapshots, complete, contiguous: cachedNewest === null });
    before = pageOldest;
  }

  // Phase 2: the top is now contiguous with the cache. If an earlier visit
  // stopped before the bottom, continue below the oldest cached snapshot.
  before = cachedOldest ?? undefined;
  while (!complete && before !== undefined) {
    if (!shouldContinue()) return { snapshots, complete };
    const page = await fetchPage({ before, limit: pageSize });
    if (!shouldContinue()) return { snapshots, complete };

    snapshots = mergeSnapshots(snapshots, page.snapshots);
    complete = !page.hasMore || page.snapshots.length === 0;
    before = page.snapshots[0]?.date;
    onProgress({ snapshots, complete, contiguous: true });
  }

  return { snapshots, complete };
}
