import { renderToString } from 'react-dom/server';
import { VersionLifecycleChart } from './version-lifecycle-chart';

vi.mock('../context/theme-context', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const snapshots = [
  { date: '2026-01-01', downloads: { '1.0.0': 90, '2.0.0': 10 } },
  { date: '2026-02-01', downloads: { '1.0.0': 50, '2.0.0': 50 } },
  { date: '2026-03-01', downloads: { '1.0.0': 20, '2.0.0': 80 } },
];

const versionReleases = [
  { version: '1.0.0', date: '2025-06-01' },
  { version: '2.0.0', date: '2026-01-10' },
];

function render() {
  return renderToString(
    <VersionLifecycleChart
      snapshots={snapshots}
      liveData={null}
      versionReleases={versionReleases}
    />
  );
}

describe('VersionLifecycleChart', () => {
  it('server-renders one labelled row per major version', () => {
    const html = render();
    expect(html).toContain('aria-label="Major version lifecycle"');
    expect(html).toContain('>v1<');
    expect(html).toContain('>v2<');
    expect(html.match(/>Peak: \d+%</g)?.length).toBe(2);
  });

  it('draws lifecycle bars and the next-major tick', () => {
    const html = render();
    // Both majors ramp up, then hold above the threshold
    expect(html.match(/fill-opacity="0.3"/g)?.length).toBe(2);
    expect(html.match(/fill-opacity="0.7"/g)?.length).toBe(2);
    expect(html).toContain('ts-chart__tick-x');
    expect(html).toMatch(/>\+\d+d</);
  });
});
