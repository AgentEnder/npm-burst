import { describe, expect, it } from 'vitest';

import { buildBreakdownCard, type BreakdownView } from './card-model';

const DEFAULT_VIEW: BreakdownView = {
  lowPassFilter: 0.02,
  expandedNodes: [],
  versionFilter: '',
  sortByVersion: true,
  selectedVersion: null,
};

const DOWNLOADS: Record<string, number> = {
  '3.0.0': 600,
  '3.1.0': 200,
  '2.0.0': 150,
  '1.0.0': 30,
  '1.1.0': 20,
};

function build(view: Partial<BreakdownView> = {}, downloads = DOWNLOADS) {
  return buildBreakdownCard(
    'pkg',
    downloads,
    { ...DEFAULT_VIEW, ...view },
    100
  );
}

describe('buildBreakdownCard', () => {
  it('returns null without downloads', () => {
    expect(build({}, {})).toBeNull();
  });

  it('summarizes the whole package regardless of the view', () => {
    const card = build({ selectedVersion: 'v3' });
    expect(card?.totalDownloads).toBe(1000);
    expect(card?.versionCount).toBe(5);
  });

  it('lists majors newest first when sorting by version', () => {
    expect(build()?.legend.map((entry) => entry.name)).toEqual([
      'v3',
      'v2',
      'v1',
    ]);
  });

  it('lists majors largest first when sorting by downloads', () => {
    const card = build(
      { sortByVersion: false },
      { '3.0.0': 100, '2.0.0': 500, '1.0.0': 400 }
    );
    expect(card?.legend.map((entry) => entry.name)).toEqual(['v2', 'v1', 'v3']);
  });

  it('re-roots at the selected version and reports its share', () => {
    const card = build({ selectedVersion: 'v3' });
    expect(card?.drillRoot).toEqual({ name: 'v3', share: 0.8 });
    expect(card?.legend.map((entry) => entry.name)).toEqual(['v3.1', 'v3.0']);
    expect(card?.legend[1].share).toBeCloseTo(0.75);
  });

  it('shows all versions when nothing is selected', () => {
    expect(build()?.drillRoot).toBeNull();
  });

  it('colors each legend swatch like its arc', () => {
    const card = build();
    const arcFill = new Map(card?.arcs.map((arc) => [arc.key, arc.fill]));
    for (const entry of card?.legend ?? []) {
      expect(arcFill.get(`versions/${entry.name}`)).toBe(entry.color);
    }
  });

  it('draws at most two rings', () => {
    const card = build();
    expect(card?.arcs.every((arc) => arc.key.split('/').length <= 3)).toBe(
      true
    );
  });

  it('folds sectors below the low-pass filter into Other', () => {
    const card = build({ lowPassFilter: 0.1 });
    expect(card?.legend.map((entry) => entry.name)).toEqual([
      'v3',
      'v2',
      'Other',
    ]);
  });

  it('counts the sectors it cannot list', () => {
    const downloads = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`${i + 1}.0.0`, 100])
    );
    const card = build({}, downloads);
    expect(card?.legend).toHaveLength(5);
    expect(card?.legendOverflow).toBe(3);
  });
});
