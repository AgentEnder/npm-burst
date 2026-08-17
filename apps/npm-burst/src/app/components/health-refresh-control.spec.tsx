import { fireEvent, render, waitFor } from '@testing-library/react';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';
import { HealthRefreshControl } from './health-refresh-control';

const openSignIn = vi.fn();
const linkGitHubAccount = vi.fn(() => Promise.resolve());
const refresh = vi.fn((_pkg: string) =>
  Promise.resolve({} as PackageHealthResponse)
);
const setHealth = vi.fn();
const cacheCurrentPackageData = vi.fn();

let authState: { isSignedIn?: boolean; isLoaded?: boolean; isAdmin: boolean } =
  {
    isSignedIn: true,
    isLoaded: true,
    isAdmin: false,
  };
let storeHealth: PackageHealthResponse | null = null;

vi.mock('../context/auth-context', () => ({
  useSafeAuth: () => authState,
  useSafeClerkActions: () => ({ openSignIn, linkGitHubAccount }),
}));

vi.mock('../../server/functions/health.telefunc', () => ({
  onRefreshHealthMetricsWithGitHubUserAccess: (pkg: string) => refresh(pkg),
}));

vi.mock('../store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ health: storeHealth, npmPackageName: 'nx' }),
  appStore: {
    getState: () => ({ setHealth, cacheCurrentPackageData }),
  },
}));

function buildHealth(
  overrides: Partial<PackageHealthResponse> = {}
): PackageHealthResponse {
  return {
    packageName: 'nx',
    installationConfigured: true,
    githubUserAuthAvailable: true,
    repo: { owner: 'nrwl', name: 'nx' },
    externalRepo: null,
    filterConfig: null,
    lastRefreshedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    warnings: [],
    snapshots: [
      {
        snapshotDate: '2026-08-16',
        issuesOpened30d: 10,
        issuesClosed30d: 8,
        prsOpened30d: 5,
        prsMerged30d: 4,
        prsClosedUnmerged30d: 1,
        medianIssueFirstResponseHours: null,
        medianIssueCloseHours: null,
        medianPrFirstReviewHours: null,
        medianPrMergeHours: null,
        activeContributors30d: 3,
        staleIssuesCount: 2,
        stalePrsCount: 1,
        openIssuesCount: 40,
        openPullRequestsCount: 12,
        starsCount: 100,
      },
    ],
    ...overrides,
  };
}

describe('HealthRefreshControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isSignedIn: true, isLoaded: true, isAdmin: false };
    storeHealth = buildHealth();
  });

  it('shows when the report was last refreshed', () => {
    const { getByText } = render(<HealthRefreshControl />);
    expect(getByText('Updated 3 hours ago')).toBeTruthy();
  });

  it('renders nothing when there are no snapshots', () => {
    // With nothing captured, the empty state owns the call to action instead.
    storeHealth = buildHealth({ snapshots: [] });
    const { container } = render(<HealthRefreshControl />);
    expect(container.firstChild).toBeNull();
  });

  it('refreshes when signed in with GitHub connected', async () => {
    const { getByRole } = render(<HealthRefreshControl />);
    fireEvent.click(getByRole('button', { name: /Refresh with GitHub/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalledWith('nx'));
    expect(openSignIn).not.toHaveBeenCalled();
  });

  it('reads as disabled and opens sign-in when signed out', () => {
    authState = { isSignedIn: false, isLoaded: true, isAdmin: false };
    const { getByRole } = render(<HealthRefreshControl />);

    const button = getByRole('button', { name: /Sign in with GitHub/ });
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);
    expect(openSignIn).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('links GitHub when signed in without a connection', () => {
    storeHealth = buildHealth({ githubUserAuthAvailable: false });
    const { getByRole } = render(<HealthRefreshControl />);

    const button = getByRole('button', { name: /Connect your GitHub account/ });
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);
    expect(linkGitHubAccount).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('blocks interaction until Clerk has loaded', () => {
    authState = { isSignedIn: undefined, isLoaded: false, isAdmin: false };
    const { getByRole } = render(<HealthRefreshControl />);

    const button = getByRole('button', {
      name: /Refresh with GitHub/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
