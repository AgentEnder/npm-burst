import { render } from '@testing-library/react';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';
import { HealthReport } from './health-report';

const maintainerStatus = vi.fn((_pkg: string) =>
  Promise.resolve({ isMaintainer: false })
);

vi.mock('../context/auth-context', () => ({
  useSafeAuth: () => ({ isSignedIn: false, isLoaded: true, isAdmin: false }),
  useSafeClerkActions: () => ({
    openSignIn: vi.fn(),
    linkGitHubAccount: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('../../server/functions/health.telefunc', () => ({
  onRefreshHealthMetricsWithGitHubUserAccess: vi.fn(() => Promise.resolve({})),
  onGetPackageMaintainerStatus: (pkg: string) => maintainerStatus(pkg),
}));

vi.mock('../../server/functions/health-source.telefunc', () => ({
  onGetHealthMetricSource: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../hooks/use-warning-toast', () => ({
  useWarningToast: () => undefined,
}));

vi.mock('../store', () => ({
  appStore: {
    getState: () => ({
      setHealth: vi.fn(),
      cacheCurrentPackageData: vi.fn(),
    }),
  },
}));

function buildHealth(
  overrides: Partial<PackageHealthResponse> = {}
): PackageHealthResponse {
  return {
    packageName: 'nx',
    installationConfigured: true,
    githubUserAuthAvailable: false,
    repo: { owner: 'nrwl', name: 'nx' },
    externalRepo: null,
    filterConfig: null,
    lastRefreshedAt: new Date().toISOString(),
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

describe('HealthReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the metric rows and the repository once there are snapshots', () => {
    const { getByText } = render(<HealthReport health={buildHealth()} />);
    expect(getByText('Issues Opened')).toBeTruthy();
    expect(getByText('nrwl/nx')).toBeTruthy();
  });

  it('does not render the refresh control — that lives in the tab strip', () => {
    const { queryByRole } = render(<HealthReport health={buildHealth()} />);
    expect(queryByRole('button', { name: /Refresh with GitHub/ })).toBeNull();
  });

  describe('without a GitHub repository', () => {
    it('names the host when the package is hosted elsewhere', () => {
      // "Lists no repository" and "lists one we can't read" need different
      // explanations; the second must not claim there is no repository.
      const { getByText } = render(
        <HealthReport
          health={buildHealth({
            repo: null,
            snapshots: [],
            externalRepo: {
              host: 'gitlab.com',
              url: 'https://gitlab.com/a/b',
            },
          })}
        />
      );
      expect(getByText('Hosted on gitlab.com')).toBeTruthy();
      expect(getByText(/View the repository on gitlab\.com/)).toBeTruthy();
    });

    it('falls back to the no-repository state when npm lists none', () => {
      const { getByText } = render(
        <HealthReport
          health={buildHealth({
            repo: null,
            snapshots: [],
            externalRepo: null,
          })}
        />
      );
      expect(getByText('No linked repository')).toBeTruthy();
    });
  });
});
