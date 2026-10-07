import { renderToString } from 'react-dom/server';
import type { ChartPoint } from '@tanstack/charts';
import {
  groupWithinDays,
  MigrationVelocityChart,
} from './migration-velocity-chart';

vi.mock('../context/theme-context', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const snapshots = [
  { date: '2026-01-01', downloads: { '1.0.0': 80, '2.0.0': 20 } },
  { date: '2026-02-01', downloads: { '1.0.0': 50, '2.0.0': 50 } },
  { date: '2026-03-01', downloads: { '1.0.0': 20, '2.0.0': 80 } },
];

const versionReleases = [
  { version: '1.0.0', date: '2025-12-01' },
  { version: '2.0.0', date: '2025-12-20' },
];

function render() {
  return renderToString(
    <MigrationVelocityChart
      snapshots={snapshots}
      liveData={null}
      versionReleases={versionReleases}
    />
  );
}

describe('MigrationVelocityChart', () => {
  it('server-renders a line per version with day and percent ticks', () => {
    const html = render();
    expect(html).toContain('aria-label="Migration velocity by version"');
    expect(html.match(/<path[^>]*stroke-width="2"/g)?.length).toBe(2);
    expect(html).toContain('Days since release');
    expect(html).toContain('>100%<');
    expect(html).toMatch(/>\d+d</);
    expect(html).toContain('>v1<');
    expect(html).toContain('>v2<');
  });

  it('shows the empty state without snapshots', () => {
    const html = renderToString(
      <MigrationVelocityChart
        snapshots={[]}
        liveData={null}
        versionReleases={[]}
      />
    );
    expect(html).toContain('No historical snapshot data');
    expect(html).not.toContain('<svg');
  });
});

function point(label: string, days: number) {
  return {
    datum: { label, days, percent: days },
  } as ChartPoint<
    { label: string; days: number; percent: number },
    number,
    number
  >;
}

describe('groupWithinDays', () => {
  it('keeps the focused point plus each series nearest within 3 days', () => {
    const focused = point('v1', 30);
    const points = [
      focused,
      point('v1', 31),
      point('v2', 26),
      point('v2', 28),
      point('v2', 32),
      point('v3', 34),
    ];
    const grouped = groupWithinDays(points, focused);
    expect(grouped.map((p) => `${p.datum.label}@${p.datum.days}`)).toEqual([
      'v1@30',
      'v2@28',
    ]);
  });
});
