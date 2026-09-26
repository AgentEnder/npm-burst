import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../../server/functions/snapshots.telefunc';
import { pageSnapshots } from '../../server/snapshots';
import {
  loadSnapshotHistory,
  mergeSnapshots,
  readSnapshotCache,
  writeSnapshotCache,
  type SnapshotHistoryProgress,
} from './snapshot-cache';

function snap(day: number): Snapshot {
  const date = `2026-01-${String(day).padStart(2, '0')}`;
  return { date, downloads: { '1.0.0': day } };
}

function range(from: number, to: number): Snapshot[] {
  const out: Snapshot[] = [];
  for (let d = from; d <= to; d++) out.push(snap(d));
  return out;
}

function serverOf(all: Snapshot[]) {
  return vi.fn((options: { before?: string; limit: number }) =>
    Promise.resolve(pageSnapshots(all, options))
  );
}

const dates = (s: Snapshot[]) => s.map((x) => x.date);

describe('pageSnapshots', () => {
  it('pages newest to oldest, each page oldest-first', () => {
    const all = range(1, 7);
    const first = pageSnapshots(all, { limit: 3 });
    expect(dates(first.snapshots)).toEqual(dates(range(5, 7)));
    expect(first.hasMore).toBe(true);

    const last = pageSnapshots(all, { before: '2026-01-02', limit: 3 });
    expect(dates(last.snapshots)).toEqual(['2026-01-01']);
    expect(last.hasMore).toBe(false);
  });
});

describe('mergeSnapshots', () => {
  it('unions by date and keeps oldest-first order', () => {
    expect(
      dates(mergeSnapshots([snap(3), snap(1)], [snap(2), snap(3)]))
    ).toEqual(dates(range(1, 3)));
  });
});

describe('loadSnapshotHistory', () => {
  it('walks the full history in pages with no cache', async () => {
    const fetchPage = serverOf(range(1, 7));
    const progress: SnapshotHistoryProgress[] = [];
    const result = await loadSnapshotHistory({
      cached: null,
      fetchPage,
      pageSize: 3,
      onProgress: (p) => progress.push(p),
    });

    expect(dates(result.snapshots)).toEqual(dates(range(1, 7)));
    expect(result.complete).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(progress.map((p) => p.snapshots.length)).toEqual([3, 6, 7]);
    expect(progress.every((p) => p.contiguous)).toBe(true);
  });

  it('only fetches pages newer than a complete cache', async () => {
    const fetchPage = serverOf(range(1, 12));
    const result = await loadSnapshotHistory({
      cached: { snapshots: range(1, 7), complete: true, savedAt: 0 },
      fetchPage,
      pageSize: 3,
      onProgress: () => undefined,
    });

    expect(dates(result.snapshots)).toEqual(dates(range(1, 12)));
    expect(result.complete).toBe(true);
    // 10-12, then 7-9 overlaps the cache.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('flags progress above an existing cache as non-contiguous', async () => {
    const progress: SnapshotHistoryProgress[] = [];
    await loadSnapshotHistory({
      cached: { snapshots: range(1, 2), complete: true, savedAt: 0 },
      fetchPage: serverOf(range(1, 9)),
      pageSize: 3,
      onProgress: (p) => progress.push(p),
    });

    expect(progress.map((p) => p.contiguous)).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it('resumes below an incomplete cache', async () => {
    const fetchPage = serverOf(range(1, 9));
    const result = await loadSnapshotHistory({
      cached: { snapshots: range(6, 9), complete: false, savedAt: 0 },
      fetchPage,
      pageSize: 3,
      onProgress: () => undefined,
    });

    expect(dates(result.snapshots)).toEqual(dates(range(1, 9)));
    expect(result.complete).toBe(true);
    expect(fetchPage.mock.calls.map(([o]) => o.before)).toEqual([
      undefined,
      '2026-01-06',
      '2026-01-03',
    ]);
  });

  it('stops when shouldContinue turns false', async () => {
    let calls = 0;
    const fetchPage = serverOf(range(1, 9));
    const result = await loadSnapshotHistory({
      cached: null,
      fetchPage: (o) => {
        calls++;
        return fetchPage(o);
      },
      pageSize: 3,
      shouldContinue: () => calls < 1,
      onProgress: () => undefined,
    });

    expect(calls).toBe(1);
    expect(result.complete).toBe(false);
  });
});

describe('snapshot localStorage cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a history', () => {
    writeSnapshotCache('nx', { snapshots: range(1, 2), complete: true });
    const cached = readSnapshotCache('nx');
    expect(dates(cached?.snapshots ?? [])).toEqual(dates(range(1, 2)));
    expect(cached?.complete).toBe(true);
  });

  it('evicts the oldest other package when storage is full', () => {
    writeSnapshotCache('old', { snapshots: range(1, 1), complete: true });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });

    writeSnapshotCache('nx', { snapshots: range(1, 2), complete: true });
    setItem.mockRestore();

    expect(readSnapshotCache('old')).toBeNull();
    expect(readSnapshotCache('nx')?.snapshots).toHaveLength(2);
  });
});
