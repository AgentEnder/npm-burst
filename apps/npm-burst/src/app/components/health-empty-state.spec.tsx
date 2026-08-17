import { fireEvent, render, waitFor } from '@testing-library/react';
import { HealthEmptyState } from './health-empty-state';
import type { HealthEmptyStateProps } from './health-empty-state';

const maintainerStatus = vi.fn((_pkg: string) =>
  Promise.resolve({ isMaintainer: false })
);

vi.mock('../../server/functions/health.telefunc', () => ({
  onGetPackageMaintainerStatus: (pkg: string) => maintainerStatus(pkg),
}));

/**
 * The state matrix itself is covered by `health-empty-state-model.spec.ts`.
 * These cover the wiring: that the resolved plan reaches the right callback.
 */
function renderEmptyState(overrides: Partial<HealthEmptyStateProps> = {}) {
  const props: HealthEmptyStateProps = {
    packageName: 'nx',
    repo: { owner: 'nrwl', name: 'nx' },
    appInstalled: false,
    isSignedIn: true,
    githubLinked: true,
    authPending: false,
    syncing: false,
    syncError: null,
    onSnapshot: vi.fn(),
    onSignIn: vi.fn(),
    onConnectGitHub: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<HealthEmptyState {...props} />) };
}

describe('HealthEmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maintainerStatus.mockResolvedValue({ isMaintainer: false });
  });

  it('offers no actions at all once the app is installed', async () => {
    const { queryByRole } = renderEmptyState({ appInstalled: true });
    await waitFor(() => expect(maintainerStatus).toHaveBeenCalled());
    expect(queryByRole('button')).toBeNull();
  });

  it('runs sign-in when signed out', () => {
    const onSignIn = vi.fn();
    const { getByRole } = renderEmptyState({ isSignedIn: false, onSignIn });

    fireEvent.click(getByRole('button', { name: /Sign in with GitHub/ }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('does not ask for maintainer status when signed out', () => {
    renderEmptyState({ isSignedIn: false });
    // It needs auth, so anonymously it is a guaranteed-false round trip.
    expect(maintainerStatus).not.toHaveBeenCalled();
  });

  it('leads with connecting GitHub when it is not linked', async () => {
    const onConnectGitHub = vi.fn();
    const { getByRole } = renderEmptyState({
      githubLinked: false,
      onConnectGitHub,
    });
    await waitFor(() => expect(maintainerStatus).toHaveBeenCalled());

    fireEvent.click(getByRole('button', { name: /Connect GitHub/ }));
    expect(onConnectGitHub).toHaveBeenCalledTimes(1);
  });

  it('leads with the snapshot once GitHub is linked', async () => {
    const onSnapshot = vi.fn();
    const { getByRole } = renderEmptyState({ onSnapshot });
    await waitFor(() => expect(maintainerStatus).toHaveBeenCalled());

    fireEvent.click(getByRole('button', { name: /Fetch a snapshot/ }));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('leads with install for a maintainer and keeps the snapshot reachable', async () => {
    maintainerStatus.mockResolvedValue({ isMaintainer: true });
    const onSnapshot = vi.fn();
    const { getByRole } = renderEmptyState({ onSnapshot });

    await waitFor(() =>
      expect(getByRole('button', { name: /Install GitHub App/ })).toBeTruthy()
    );

    fireEvent.click(
      getByRole('button', { name: /or pull a one-off snapshot/ })
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('falls back to the non-maintainer plan when detection fails', async () => {
    // Detection is a heuristic, so a lookup failure must degrade to the
    // self-service path rather than a dead end.
    maintainerStatus.mockRejectedValue(new Error('lookup failed'));
    const { getByRole } = renderEmptyState();

    await waitFor(() => expect(maintainerStatus).toHaveBeenCalled());
    expect(getByRole('button', { name: /Fetch a snapshot/ })).toBeTruthy();
  });

  it('shows progress on the snapshot action while syncing', async () => {
    const { getByRole } = renderEmptyState({ syncing: true });
    await waitFor(() => expect(maintainerStatus).toHaveBeenCalled());

    const button = getByRole('button', {
      name: /Fetching health data/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
