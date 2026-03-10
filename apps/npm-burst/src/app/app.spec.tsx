import { render, waitFor, act } from '@testing-library/react';

import App from './app';
import { ThemeProvider } from './context/theme-context';

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
