import { appStore, type AppState } from './app-store';
import { readStateFromSearch, writeStateToSearch } from './url-sync';

function stateWith(overrides: Partial<AppState>): AppState {
  return { ...appStore.getState(), ...overrides };
}

describe('url-sync', () => {
  it('writes nothing when every control is at its default', () => {
    expect(writeStateToSearch(appStore.getState(), '')).toBe('');
  });

  it('reads an empty query as the defaults', () => {
    const state = readStateFromSearch('');
    expect(state).toMatchObject({
      sortByVersion: true,
      lowPassFilter: 0.02,
      versionFilter: '',
      adoptionGrouping: 'major',
      adoptionHidden: [],
      lifecycleThreshold: 50,
    });
  });

  it('round-trips non-default view state', () => {
    const changed: Partial<AppState> = {
      sortByVersion: false,
      lowPassFilter: 0.05,
      versionFilter: '^22',
      showDataTable: false,
      timeWindow: '90d',
      adoptionChartMode: 'lines',
      adoptionYAxis: 'count',
      adoptionGrouping: 'minor',
      adoptionShowReleases: false,
      adoptionTickLevel: 'patch',
      adoptionHidden: ['v1.0', 'unknown'],
      migrationTimeWindow: '1y',
      migrationGranularity: 'patch',
      migrationHidden: ['v2'],
      lifecycleThreshold: 75,
      lifecycleShowOnlySnapshotted: true,
      lifecycleMinPeak: 10,
    };
    const search = writeStateToSearch(stateWith(changed), '');
    expect(readStateFromSearch(search)).toMatchObject(changed);
  });

  it('keeps "sort by downloads" across a reload', () => {
    const search = writeStateToSearch(stateWith({ sortByVersion: false }), '');
    expect(search).toBe('?sortBy=downloads');
    expect(readStateFromSearch(search).sortByVersion).toBe(false);
  });

  it('falls back to defaults for values the controls cannot hold', () => {
    const state = readStateFromSearch(
      '?window=2w&adoption.group=epic&lifecycle.threshold=0&lpf=abc&snapshot=yesterday'
    );
    expect(state).toMatchObject({
      timeWindow: 'all',
      adoptionGrouping: 'major',
      lifecycleThreshold: 50,
      lowPassFilter: 0.02,
      pendingSnapshotDate: null,
    });
  });

  it('leaves params it does not own in place', () => {
    const search = writeStateToSearch(
      stateWith({ versionFilter: 'beta' }),
      '?utm_source=x&filter=old'
    );
    expect(new URLSearchParams(search).get('utm_source')).toBe('x');
    expect(new URLSearchParams(search).get('filter')).toBe('beta');
  });

  it('writes the selected snapshot as its date', () => {
    const snapshots = [
      { date: '2026-01-01', downloads: {} },
      { date: '2026-02-01', downloads: {} },
    ];
    const search = writeStateToSearch(
      stateWith({ snapshots, snapshotIndex: 1 }),
      ''
    );
    expect(search).toBe('?snapshot=2026-02-01');
    expect(readStateFromSearch(search).pendingSnapshotDate).toBe('2026-02-01');
  });
});

describe('applyURLState', () => {
  it('resolves a snapshot date once history is loaded', () => {
    appStore.getState().applyURLState({ pendingSnapshotDate: '2026-02-01' });
    expect(appStore.getState().pendingSnapshotDate).toBe('2026-02-01');

    appStore.getState().applySnapshotHistory([
      { date: '2026-01-01', downloads: { '1.0.0': 1 } },
      { date: '2026-02-01', downloads: { '1.0.0': 2 } },
    ]);
    expect(appStore.getState()).toMatchObject({
      snapshotIndex: 1,
      pendingSnapshotDate: null,
    });
  });
});
