import { render, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

import App from './app';
import { ThemeProvider } from './context/theme-context';

vi.mock('../server/functions/downloads.telefunc', () => ({
  onGetDownloads: vi.fn().mockResolvedValue({ downloads: { '1.0.0': 123 }, package: 'nx' }),
}));

vi.mock('../server/functions/snapshots.telefunc', () => ({
  onGetSnapshots: vi.fn().mockResolvedValue({ snapshots: [] }),
}));

vi.mock('../server/functions/tracking.telefunc', () => ({
  onTrackPackage: vi.fn(),
  onUntrackPackage: vi.fn(),
  onIsPackageTracked: vi.fn().mockResolvedValue({ tracked: false }),
  onGetTrackedPackages: vi.fn().mockResolvedValue({ packages: [] }),
}));

vi.mock('./context/auth-context', () => ({
  useSafeAuth: () => ({ isSignedIn: false, isLoaded: true }),
}));

vi.mock('@npm-burst/npm/data-access', () => ({
  getDownloadsByVersion: (pkg: string) => ({
    get: () =>
      Promise.resolve({
        package: pkg,
        downloads: {
          '1.0.0': 123,
        },
      }),
    cancel: () => {
      // no-op
    },
  }),
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe('App', () => {
  it('should render successfully', async () => {
    let renderResult;
    await act(async () => {
      renderResult = renderWithTheme(<App />);
      await waitFor(() => {
        expect(renderResult!.baseElement).toBeTruthy();
      });
    });
  });

  it('should display package name when data loads', async () => {
    const { getByText } = renderWithTheme(<App />);
    await waitFor(
      () => {
        expect(getByText(/NPM Downloads for/i)).toBeTruthy();
      },
      { timeout: 2000 }
    );
  });
});
