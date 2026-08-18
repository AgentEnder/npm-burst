import { fireEvent, render } from '@testing-library/react';
import { PackageSearch } from './package-search';

vi.mock('../context/auth-context', () => ({
  useSafeAuth: () => ({ isSignedIn: false, isLoaded: true, isAdmin: false }),
}));

vi.mock('../../server/functions/tracking.telefunc', () => ({
  onGetTrackedPackages: () => Promise.resolve({ packages: [] }),
}));

function pressCmdK() {
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
}

describe('PackageSearch', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; the shortcut hint probes for a coarse pointer.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('focuses the input on Cmd+K', () => {
    const { getByRole } = render(<PackageSearch onSelectPackage={vi.fn()} />);
    const input = getByRole('textbox');

    expect(document.activeElement).not.toBe(input);
    pressCmdK();
    expect(document.activeElement).toBe(input);
  });

  it('focuses the input on Ctrl+K', () => {
    const { getByRole } = render(<PackageSearch onSelectPackage={vi.fn()} />);
    const input = getByRole('textbox');

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it('ignores a bare k so typing elsewhere is unaffected', () => {
    const { getByRole } = render(<PackageSearch onSelectPackage={vi.fn()} />);
    const input = getByRole('textbox');

    fireEvent.keyDown(document, { key: 'k' });
    expect(document.activeElement).not.toBe(input);
  });

  it('blurs on Escape so the shortcut is reversible', () => {
    const { getByRole } = render(<PackageSearch onSelectPackage={vi.fn()} />);
    const input = getByRole('textbox');

    pressCmdK();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).not.toBe(input);
  });

  // The reason the registry exists: package-detail mounts the navbar's compact
  // search alongside a page-level one. Exactly one may answer the keystroke.
  it('targets the page-level search when a compact one is also mounted', () => {
    const { getByTestId } = render(
      <>
        <div data-testid="navbar">
          <PackageSearch onSelectPackage={vi.fn()} compact />
        </div>
        <div data-testid="page">
          <PackageSearch onSelectPackage={vi.fn()} />
        </div>
      </>
    );

    const pageInput = getByTestId('page').querySelector('input');
    pressCmdK();
    expect(document.activeElement).toBe(pageInput);
  });

  it('still answers when only a compact search is mounted', () => {
    const { getByRole } = render(
      <PackageSearch onSelectPackage={vi.fn()} compact />
    );

    pressCmdK();
    expect(document.activeElement).toBe(getByRole('textbox'));
  });

  it('detaches the listener once every instance unmounts', () => {
    const { getByRole, unmount } = render(
      <PackageSearch onSelectPackage={vi.fn()} />
    );
    const input = getByRole('textbox');
    unmount();

    // Nothing to focus, and crucially no throw from a stale handle.
    expect(() => pressCmdK()).not.toThrow();
    expect(document.activeElement).not.toBe(input);
  });

  it('advertises the shortcut only on the search that answers it', () => {
    const { queryByText, rerender } = render(
      <PackageSearch onSelectPackage={vi.fn()} />
    );
    expect(queryByText(/⌘K|Ctrl K/)).toBeTruthy();

    rerender(<PackageSearch onSelectPackage={vi.fn()} compact />);
    expect(queryByText(/⌘K|Ctrl K/)).toBeNull();
  });

  it('hides the hint on touch devices with no key to press', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    );

    const { queryByText } = render(<PackageSearch onSelectPackage={vi.fn()} />);
    expect(queryByText(/⌘K|Ctrl K/)).toBeNull();
  });
});
