import { axisLabelAnchor, pickAxisLabelIndexes } from './health-chart-utils';

describe('pickAxisLabelIndexes', () => {
  it('labels every position when they all fit', () => {
    expect([...pickAxisLabelIndexes(5, 7)].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('thins to a uniform step that always includes the last position', () => {
    const picked = pickAxisLabelIndexes(13, 7);
    // ceil(13 / 7) = 2 → every other label, counted back from the end.
    expect([...picked].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(picked.has(12)).toBe(true);
  });

  it('never labels more than the budget allows', () => {
    expect(pickAxisLabelIndexes(40, 7).size).toBeLessThanOrEqual(7);
  });

  it('is empty for an empty axis', () => {
    expect(pickAxisLabelIndexes(0, 7).size).toBe(0);
  });
});

describe('axisLabelAnchor', () => {
  it('pins the ends inward and centres the rest', () => {
    expect(axisLabelAnchor(0, 5)).toBe('start');
    expect(axisLabelAnchor(4, 5)).toBe('end');
    expect(axisLabelAnchor(2, 5)).toBe('middle');
    expect(axisLabelAnchor(0, 1)).toBe('middle');
  });
});
