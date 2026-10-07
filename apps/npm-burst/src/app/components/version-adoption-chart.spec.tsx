import { renderToString } from 'react-dom/server';
import { VersionAdoptionChart } from './version-adoption-chart';

vi.mock('../context/theme-context', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const snapshots = [
  { date: '2026-01-01', downloads: { '1.0.0': 80, '2.0.0': 20 } },
  { date: '2026-02-01', downloads: { '1.0.0': 50, '2.0.0': 50 } },
  { date: '2026-03-01', downloads: { '1.0.0': 20, '2.0.0': 80 } },
];

function render() {
  return renderToString(
    <VersionAdoptionChart
      snapshots={snapshots}
      liveData={null}
      versionReleases={[{ version: '2.0.0', date: '2026-01-15' }]}
      lowPassFilter={0}
      totalDownloads={[]}
      timeWindow="all"
      onTimeWindowChange={() => undefined}
    />
  );
}

describe('VersionAdoptionChart', () => {
  it('server-renders a stacked layer per version', () => {
    const html = render();
    expect(html).toContain('aria-label="Version adoption over time"');
    // One filled layer per major version
    expect(html.match(/fill-opacity="0.7"/g)?.length).toBe(2);
  });

  it('labels releases inside the window', () => {
    expect(render()).toContain('>2.0.0<');
  });
});
