import { render } from '@testing-library/react';

import App from './app';

vi.mock('@npm-burst/npm/data-access', () => ({
  getDownloadsByVersion: (pkg: string) => ({
    get: () =>
      Promise.resolve({
        package: pkg,
        versions: {
          '1.0.0': 123,
        },
      }),
    cancel: () => {
      // no-op
    },
  }),
}));

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should default to Nx', () => {
    const { getByText } = render(<App />);
    expect(getByText(/NPM Downloads for nx/gi)).toBeTruthy();
  });
});
