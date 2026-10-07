import { render as renderClient } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { appStore } from '../store';
import { VersionLifecycleChart } from './version-lifecycle-chart';

// jsdom does not provide ResizeObserver
globalThis.ResizeObserver = class {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  observe() {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  unobserve() {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  disconnect() {}
} as unknown as typeof ResizeObserver;

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

  describe('with a time window', () => {
    // Every major stays under the 50% threshold, like `nx` once downloads
    // spread across many majors.
    const spread = { '0.9.0': 30, '1.0.0': 40, '2.0.0': 30 };
    const windowSnapshots = ['2026-04-01', '2026-07-01', '2026-10-01'].map(
      (date) => ({ date, downloads: spread })
    );
    const windowReleases = [
      { version: '0.9.0', date: '2024-01-01' },
      { version: '1.0.0', date: '2025-06-01' },
      { version: '2.0.0', date: '2026-03-01' },
    ];
    const initial = appStore.getState();

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
      appStore.setState(initial);
    });

    function renderWindowed() {
      return renderClient(
        <VersionLifecycleChart
          snapshots={windowSnapshots}
          liveData={null}
          versionReleases={windowReleases}
        />
      );
    }

    it('keeps a running major released before the window', () => {
      appStore.setState({ timeWindow: '90d' });
      const { container } = renderWindowed();
      const text = container.textContent ?? '';
      // v2 is still running; v0 and v1 were concluded by a newer major
      // before the window opened.
      expect(text).toContain('v2');
      expect(text).not.toMatch(/\bv1\b/);
      expect(text).not.toContain('No historical snapshot data');
    });

    it('limits the axis to the window', () => {
      appStore.setState({ timeWindow: '90d' });
      const { container } = renderWindowed();
      const ticks = Array.from(
        container.querySelectorAll('text'),
        (t) => t.textContent ?? ''
      ).filter((t) => /^[A-Z][a-z]{2} \d{4}$/.test(t));
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks.every((t) => t.endsWith('2026'))).toBe(true);
    });

    it('blames the filters, not the data, when they exclude every row', () => {
      appStore.setState({ lifecycleMinPeak: 100 });
      const { container } = renderWindowed();
      expect(container.textContent).toContain(
        'No major versions match the current filters'
      );
      expect(container.textContent).not.toContain(
        'No historical snapshot data'
      );
    });
  });
});
