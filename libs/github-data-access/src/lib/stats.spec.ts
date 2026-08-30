import { describe, expect, it } from 'vitest';
import { hoursBetween, nearestRank, summarizeDurations } from './stats';

describe('nearestRank', () => {
  it('returns null for an empty sample', () => {
    expect(nearestRank([], 0.95)).toBeNull();
  });

  it('picks sorted[ceil(p·n) − 1]', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(nearestRank(sorted, 0.5)).toBe(5);
    expect(nearestRank(sorted, 0.95)).toBe(10);
    expect(nearestRank(sorted, 0.9)).toBe(9);
  });

  it('never indexes below the first element', () => {
    expect(nearestRank([7], 0.01)).toBe(7);
  });
});

describe('summarizeDurations', () => {
  it('is all-null for an empty sample', () => {
    expect(summarizeDurations([])).toEqual({
      avgHours: null,
      medianHours: null,
      p95Hours: null,
    });
  });

  it('rounds to two decimals and does not need sorted input', () => {
    expect(summarizeDurations([3, 1, 2])).toEqual({
      avgHours: 2,
      medianHours: 2,
      p95Hours: 3,
    });
    expect(summarizeDurations([1, 2]).avgHours).toBe(1.5);
    expect(summarizeDurations([1, 1, 2]).avgHours).toBe(1.33);
  });
});

describe('hoursBetween', () => {
  it('measures forward in hours', () => {
    expect(
      hoursBetween('2026-03-01T00:00:00.000Z', '2026-03-02T06:00:00.000Z')
    ).toBe(30);
  });
});
