import { render as renderClient } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { appStore } from '../store';
import { VersionAdoptionChart } from './version-adoption-chart';

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

  it('follows view state from the store', () => {
    const initial = appStore.getState();
    appStore.setState({ adoptionChartMode: 'lines', adoptionHidden: ['v1'] });
    try {
      const { container } = renderClient(
        <VersionAdoptionChart
          snapshots={snapshots}
          liveData={null}
          versionReleases={[]}
          lowPassFilter={0}
          totalDownloads={[]}
        />
      );
      const keys = Array.from(
        container.querySelectorAll('path[data-ts-key]'),
        (path) => path.getAttribute('data-ts-key')
      );
      // Lines mode draws strokes only, and hidden v1 is left out.
      expect(keys.some((key) => key?.includes(':v2:'))).toBe(true);
      expect(keys.some((key) => key?.includes(':v1:'))).toBe(false);
      expect(container.querySelector('path[fill-opacity="0.7"]')).toBeNull();
    } finally {
      appStore.setState(initial);
    }
  });
});
