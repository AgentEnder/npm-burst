/**
 * Shared plumbing for the per-browser caches kept in localStorage.
 *
 * Every entry written through here carries a `savedAt` timestamp so that, when
 * storage fills up, the least-recently-saved entry under any of the cache
 * prefixes can be evicted to make room. Keys outside those prefixes (theme,
 * dev flags, …) are never touched.
 */

/** Every prefix whose entries may be evicted to free space for another. */
export const EVICTABLE_CACHE_PREFIXES = [
  'npm-burst:snapshots:v1:',
  'npm-burst:package-data:v1:',
] as const;

export function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Accessing localStorage throws when storage is blocked.
    return null;
  }
}

export function readCacheEntry<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Writes `value` (stamped with `savedAt`) under `key`. On a quota error,
 * evicts the least-recently-saved other cache entry one at a time and retries.
 */
export function writeCacheEntry<T extends object>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;
  const serialized = JSON.stringify({ ...value, savedAt: Date.now() });

  for (;;) {
    try {
      storage.setItem(key, serialized);
      return;
    } catch {
      if (!evictOldestOther(storage, key)) return;
    }
  }
}

function evictOldestOther(storage: Storage, keep: string): boolean {
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (
      !key ||
      key === keep ||
      !EVICTABLE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      continue;
    }
    let savedAt = 0;
    try {
      savedAt =
        (
          JSON.parse(storage.getItem(key) ?? '{}') as {
            savedAt?: number;
          } | null
        )?.savedAt ?? 0;
    } catch {
      // Unreadable entries are the first to go.
    }
    if (savedAt < oldestAt) {
      oldestAt = savedAt;
      oldestKey = key;
    }
  }
  if (oldestKey === null) return false;
  storage.removeItem(oldestKey);
  return true;
}
