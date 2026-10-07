import { lifecycleEndDate, type LifecycleMilestone } from './version-lifecycle';

const TODAY = '2026-10-07';

function milestone(overrides: Partial<LifecycleMilestone>): LifecycleMilestone {
  return {
    label: 'v1',
    releaseDate: '2025-01-01',
    daysToReachThreshold: null,
    reachedThresholdDate: null,
    nextMajorReleaseDate: null,
    daysPersistingAfterNext: null,
    droppedBelowDate: null,
    stillAboveThreshold: false,
    neverReached: false,
    peakPercent: 30,
    currentPercent: 30,
    ...overrides,
  };
}

describe('lifecycleEndDate', () => {
  it('runs a pending version to today', () => {
    expect(lifecycleEndDate(milestone({}), TODAY)).toBe(TODAY);
  });

  it('ends a concluded never-reached version at the next major', () => {
    expect(
      lifecycleEndDate(
        milestone({ neverReached: true, nextMajorReleaseDate: '2025-06-01' }),
        TODAY
      )
    ).toBe('2025-06-01');
  });

  it('runs a version still above threshold to today', () => {
    expect(
      lifecycleEndDate(
        milestone({
          reachedThresholdDate: '2025-02-01',
          stillAboveThreshold: true,
        }),
        TODAY
      )
    ).toBe(TODAY);
  });

  it('ends a dropped version at the drop', () => {
    expect(
      lifecycleEndDate(
        milestone({
          reachedThresholdDate: '2025-02-01',
          droppedBelowDate: '2025-09-01',
        }),
        TODAY
      )
    ).toBe('2025-09-01');
  });
});
