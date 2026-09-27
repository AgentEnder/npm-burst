import { fireEvent, render, within } from '@testing-library/react';
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
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ isRevalidatingHealth: false }),
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
        medianIssueCloseHours: 30,
        medianPrFirstReviewHours: null,
        medianPrMergeHours: null,
        activeContributors30d: 3,
        staleIssuesCount: 2,
        stalePrsCount: 1,
        openIssuesCount: 40,
        openPullRequestsCount: 12,
        starsCount: 100,
        avgIssueCloseHours: 48,
        p95IssueCloseHours: 240,
        avgPrMergeHours: 12,
        p95PrMergeHours: 72,
        avgIssueAgeHours: 2400,
        p95IssueAgeHours: 12000,
        avgPrAgeHours: 300,
        p95PrAgeHours: 1200,
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

  describe('sections and variants', () => {
    it('groups the rows under Issues, Pull Requests and Other', () => {
      const { getByRole } = render(<HealthReport health={buildHealth()} />);
      expect(getByRole('heading', { name: 'Issues' })).toBeTruthy();
      expect(getByRole('heading', { name: 'Pull Requests' })).toBeTruthy();
      expect(getByRole('heading', { name: 'Other' })).toBeTruthy();
    });

    it('formats durations and switches the headline with the toggle', () => {
      const { getByText } = render(<HealthReport health={buildHealth()} />);
      const row = getByText('Issue Backlog Age').closest(
        '[role="button"]'
      ) as HTMLElement;
      // 2400h = 100 days.
      expect(within(row).getByText('100d')).toBeTruthy();

      fireEvent.click(within(row).getByRole('button', { name: 'P95' }));
      // 12000h = 500 days.
      expect(within(row).getByText('500d')).toBeTruthy();
      expect(
        within(row)
          .getByRole('button', { name: 'P95' })
          .getAttribute('aria-pressed')
      ).toBe('true');
    });

    it('renders n/a when the latest value is null', () => {
      const { getByText } = render(
        <HealthReport
          health={buildHealth({
            snapshots: [{ ...buildHealth().snapshots[0], avgPrAgeHours: null }],
          })}
        />
      );
      const row = getByText('PR Backlog Age').closest(
        '[role="button"]'
      ) as HTMLElement;
      expect(within(row).getByText('n/a')).toBeTruthy();
    });

    it('shows a single-variant row without a toggle', () => {
      const { getByText } = render(<HealthReport health={buildHealth()} />);
      const row = getByText('Issue First Response').closest(
        '[role="button"]'
      ) as HTMLElement;
      expect(within(row).queryByRole('button')).toBeNull();
    });
  });

  describe('expanded chart', () => {
    function expandRow(label: string) {
      const utils = render(<HealthReport health={buildHealth()} />);
      const rowButton = utils
        .getByText(label)
        .closest('[role="button"]') as HTMLElement;
      fireEvent.click(rowButton);
      const row = rowButton.parentElement as HTMLElement;
      return { ...utils, row, rowButton };
    }

    it('draws every stat of a duration row and lets the legend pick the headline', () => {
      const { row, rowButton } = expandRow('Issue Resolution Time');
      const svg = row.querySelector('svg[role="img"]') as SVGSVGElement;
      expect(svg.querySelectorAll('[data-series]')).toHaveLength(3);

      const legend = within(row).getByRole('group', { name: 'Series' });
      fireEvent.click(within(legend).getByRole('button', { name: /P95/ }));
      expect(
        within(rowButton)
          .getByRole('button', { name: 'P95' })
          .getAttribute('aria-pressed')
      ).toBe('true');
    });

    it('draws only the selected series when the other variant is a delta', () => {
      const { row } = expandRow('Open Issues');
      const svg = row.querySelector('svg[role="img"]') as SVGSVGElement;
      expect(svg.querySelectorAll('[data-series]')).toHaveLength(1);
      expect(within(row).queryByRole('group', { name: 'Series' })).toBeNull();
    });

    it('thins x-axis labels when there are more snapshots than fit', () => {
      const base = buildHealth().snapshots[0];
      const snapshots = Array.from({ length: 20 }, (_, index) => ({
        ...base,
        snapshotDate: `2026-03-${String(index + 1).padStart(2, '0')}`,
      }));
      const { getByText } = render(
        <HealthReport health={buildHealth({ snapshots })} />
      );
      const rowButton = getByText('PRs Merged').closest(
        '[role="button"]'
      ) as HTMLElement;
      fireEvent.click(rowButton);
      const svg = (rowButton.parentElement as HTMLElement).querySelector(
        'svg[role="img"]'
      ) as SVGSVGElement;
      const axisLabels = Array.from(svg.querySelectorAll('text')).filter(
        (node) => /2026$/.test(node.textContent ?? '')
      );
      expect(axisLabels.length).toBeLessThan(20);
      expect(
        axisLabels[axisLabels.length - 1].getAttribute('text-anchor')
      ).toBe('end');
    });
  });
});
