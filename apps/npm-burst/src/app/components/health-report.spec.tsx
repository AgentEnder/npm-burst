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

  describe('charts', () => {
    const base = buildHealth().snapshots[0];

    /** Twenty daily snapshots; open issues shrink so the Δ series goes negative. */
    const dailySnapshots = Array.from({ length: 20 }, (_, index) => ({
      ...base,
      snapshotDate: `2026-03-${String(index + 1).padStart(2, '0')}`,
      openIssuesCount: 40 - index,
      avgIssueCloseHours: 48 + index,
    }));

    function expandRow(
      label: string,
      health = buildHealth({ snapshots: dailySnapshots })
    ) {
      const utils = render(<HealthReport health={health} />);
      const rowButton = utils
        .getByText(label)
        .closest('[role="button"]') as HTMLElement;
      fireEvent.click(rowButton);
      const row = rowButton.parentElement as HTMLElement;
      const chart = within(row).getByRole('img', { name: label });
      return { ...utils, row, rowButton, chart };
    }

    /** Variant ids of the plotted series, in paint order. */
    function seriesIds(chart: Element): (string | null)[] {
      return Array.from(chart.querySelectorAll('g.ts-chart__dot')).map(
        (group) => group.getAttribute('data-ts-key')
      );
    }

    function areaIds(chart: Element): (string | null)[] {
      return Array.from(chart.querySelectorAll('g.ts-chart__area')).map(
        (group) => group.getAttribute('data-ts-key')
      );
    }

    it('draws every stat of a duration row with the selected one on top', () => {
      const { row, rowButton, chart } = expandRow('Issue Resolution Time');
      expect(seriesIds(chart)).toEqual(['p95', 'median', 'avg']);
      expect(areaIds(chart)).toEqual(['avg-area']);
      expect(
        chart.querySelector('[stroke="var(--chart-series-p95)"]')
      ).toBeTruthy();

      const legend = within(row).getByRole('group', { name: 'Series' });
      fireEvent.click(within(legend).getByRole('button', { name: /P95/ }));
      expect(
        within(rowButton)
          .getByRole('button', { name: 'P95' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(seriesIds(chart).at(-1)).toBe('p95');
      expect(areaIds(chart)).toEqual(['p95-area']);
    });

    it('draws only the selected series when the other variant is a delta', () => {
      const { row, chart } = expandRow('Open Issues');
      expect(seriesIds(chart)).toEqual(['total']);
      expect(within(row).queryByRole('group', { name: 'Series' })).toBeNull();
    });

    it('thins x-axis labels and keeps the ends inside the plot', () => {
      const { chart } = expandRow('PRs Merged');
      const labels = Array.from(
        chart.querySelectorAll('text[data-ts-key^="x-tick-label"]')
      );
      expect(labels.length).toBeGreaterThan(1);
      expect(labels.length).toBeLessThan(20);
      expect(labels[0].textContent).toMatch(/Mar 1, 2026/);
      expect(labels[0].getAttribute('text-anchor')).toBe('start');
      const last = labels[labels.length - 1];
      expect(last.textContent).toMatch(/Mar 20, 2026/);
      expect(last.getAttribute('text-anchor')).toBe('end');
    });

    it('shows every series for the focused snapshot in the tooltip', () => {
      const { chart } = expandRow('Issue Resolution Time');
      fireEvent.focus(chart);
      fireEvent.keyDown(chart, { key: 'End' });

      const host = chart.closest('.ts-chart-host') as HTMLElement;
      const tip = within(host).getByRole('status');
      const summary = tip.getAttribute('aria-label') ?? '';
      expect(summary).toMatch(/Mar 20, 2026/);
      // avgIssueCloseHours = 48 + 19 = 67h.
      expect(summary).toMatch(/Avg: 2\.8d/);
      expect(summary).toMatch(/Median: 30h/);
      expect(summary).toMatch(/P95: 10d/);

      // Markers at the focused snapshot grow; the rest keep their size.
      const focused = chart.querySelectorAll(
        'circle[data-ts-key$=":2026-03-20"]'
      );
      expect(focused).toHaveLength(3);
      focused.forEach((marker) => expect(marker.getAttribute('r')).toBe('5'));
      expect(
        chart
          .querySelector('circle[data-ts-key$=":2026-03-01"]')
          ?.getAttribute('r')
      ).not.toBe('5');
    });

    it('draws a sparkline per row and a zero line once values go negative', () => {
      const { getByText } = render(
        <HealthReport health={buildHealth({ snapshots: dailySnapshots })} />
      );
      const row = getByText('Open Issues').closest(
        '[role="button"]'
      ) as HTMLElement;
      const sparkline = () =>
        within(row).getByRole('img', { name: /trend$/ }) as Element;

      expect(
        sparkline().querySelector('path[stroke="currentColor"]')
      ).toBeTruthy();
      expect(sparkline().querySelector('.ts-chart__rule')).toBeNull();

      fireEvent.click(within(row).getByRole('button', { name: 'Δ' }));
      expect(sparkline().querySelector('.ts-chart__rule')).toBeTruthy();
    });
  });
});
