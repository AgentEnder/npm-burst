/**
 * Seed fixture data for local development and e2e tests.
 * Provides deterministic NPM download data without hitting the real API.
 *
 * Scenario: We started tracking packages in October 2025.
 * Snapshots are taken weekly from that point. A few historical snapshots
 * exist from before tracking began (imported retroactively).
 * The "current" date is March 17, 2026.
 */

export interface FixturePackage {
  downloads: Record<string, number>;
  package: string;
}

export interface FixtureHealthMetricPoint {
  snapshotDate: string;
  issuesOpened30d: number;
  issuesClosed30d: number;
  prsOpened30d: number;
  prsMerged30d: number;
  prsClosedUnmerged30d: number;
  medianIssueFirstResponseHours: number | null;
  medianIssueCloseHours: number | null;
  medianPrFirstReviewHours: number | null;
  medianPrMergeHours: number | null;
  activeContributors30d: number;
  staleIssuesCount: number;
}

/**
 * "Live" data — current week's downloads by version.
 * This is what the npm downloads-by-version API returns right now.
 */
const fixtures: Record<string, FixturePackage> = {
  nx: {
    package: 'nx',
    downloads: {
      // Long tail of old versions
      '17.3.1': 3200,
      '18.3.0': 8500,
      '19.8.0': 12000,
      '20.4.0': 18000,
      // v21 declining
      '21.0.0': 5500,
      '21.1.0': 8200,
      '21.2.0': 14000,
      // v22 dominant
      '22.0.0': 22000,
      '22.1.0': 38000,
      '22.2.0': 65000,
      '22.3.0': 95000,
      '22.4.0': 142000,
      // v23 just released March 4
      '23.0.0': 28000,
    },
  },
  react: {
    package: 'react',
    downloads: {
      // Old versions long tail
      '17.0.2': 310000,
      '18.2.0': 1200000,
      '18.3.0': 850000,
      '18.3.1': 2800000,
      // v19 dominant
      '19.0.0': 3500000,
      '19.1.0': 5200000,
    },
  },
  lodash: {
    package: 'lodash',
    downloads: {
      '4.17.11': 280000,
      '4.17.14': 350000,
      '4.17.15': 1200000,
      '4.17.19': 780000,
      '4.17.20': 1450000,
      '4.17.21': 8900000,
    },
  },
};

const fixtureHealthRepos: Record<string, { owner: string; name: string }> = {
  nx: { owner: 'nrwl', name: 'nx' },
  react: { owner: 'facebook', name: 'react' },
  lodash: { owner: 'lodash', name: 'lodash' },
};

const fixtureHealthMetrics: Record<string, FixtureHealthMetricPoint[]> = {
  nx: [
    {
      snapshotDate: '2026-01-12',
      issuesOpened30d: 118,
      issuesClosed30d: 124,
      prsOpened30d: 52,
      prsMerged30d: 47,
      prsClosedUnmerged30d: 5,
      medianIssueFirstResponseHours: 7.4,
      medianIssueCloseHours: 96.2,
      medianPrFirstReviewHours: 14.6,
      medianPrMergeHours: 51.8,
      activeContributors30d: 19,
      staleIssuesCount: 38,
    },
    {
      snapshotDate: '2026-01-26',
      issuesOpened30d: 123,
      issuesClosed30d: 119,
      prsOpened30d: 55,
      prsMerged30d: 49,
      prsClosedUnmerged30d: 4,
      medianIssueFirstResponseHours: 6.9,
      medianIssueCloseHours: 89.1,
      medianPrFirstReviewHours: 13.1,
      medianPrMergeHours: 48.3,
      activeContributors30d: 21,
      staleIssuesCount: 37,
    },
    {
      snapshotDate: '2026-02-09',
      issuesOpened30d: 131,
      issuesClosed30d: 127,
      prsOpened30d: 57,
      prsMerged30d: 51,
      prsClosedUnmerged30d: 5,
      medianIssueFirstResponseHours: 5.8,
      medianIssueCloseHours: 82.5,
      medianPrFirstReviewHours: 11.2,
      medianPrMergeHours: 43.7,
      activeContributors30d: 22,
      staleIssuesCount: 35,
    },
    {
      snapshotDate: '2026-02-23',
      issuesOpened30d: 142,
      issuesClosed30d: 135,
      prsOpened30d: 60,
      prsMerged30d: 54,
      prsClosedUnmerged30d: 6,
      medianIssueFirstResponseHours: 4.9,
      medianIssueCloseHours: 78.4,
      medianPrFirstReviewHours: 10.6,
      medianPrMergeHours: 41.1,
      activeContributors30d: 24,
      staleIssuesCount: 33,
    },
    {
      snapshotDate: '2026-03-09',
      issuesOpened30d: 138,
      issuesClosed30d: 144,
      prsOpened30d: 63,
      prsMerged30d: 59,
      prsClosedUnmerged30d: 3,
      medianIssueFirstResponseHours: 4.2,
      medianIssueCloseHours: 71.6,
      medianPrFirstReviewHours: 9.8,
      medianPrMergeHours: 36.9,
      activeContributors30d: 26,
      staleIssuesCount: 30,
    },
  ],
  react: [
    {
      snapshotDate: '2026-01-12',
      issuesOpened30d: 76,
      issuesClosed30d: 62,
      prsOpened30d: 38,
      prsMerged30d: 29,
      prsClosedUnmerged30d: 7,
      medianIssueFirstResponseHours: 18.5,
      medianIssueCloseHours: 164.4,
      medianPrFirstReviewHours: 27.1,
      medianPrMergeHours: 89.3,
      activeContributors30d: 14,
      staleIssuesCount: 112,
    },
    {
      snapshotDate: '2026-01-26',
      issuesOpened30d: 81,
      issuesClosed30d: 69,
      prsOpened30d: 41,
      prsMerged30d: 31,
      prsClosedUnmerged30d: 8,
      medianIssueFirstResponseHours: 17.2,
      medianIssueCloseHours: 158.2,
      medianPrFirstReviewHours: 24.8,
      medianPrMergeHours: 84.7,
      activeContributors30d: 15,
      staleIssuesCount: 110,
    },
    {
      snapshotDate: '2026-02-09',
      issuesOpened30d: 88,
      issuesClosed30d: 74,
      prsOpened30d: 43,
      prsMerged30d: 34,
      prsClosedUnmerged30d: 6,
      medianIssueFirstResponseHours: 15.3,
      medianIssueCloseHours: 144.5,
      medianPrFirstReviewHours: 22.9,
      medianPrMergeHours: 78.2,
      activeContributors30d: 17,
      staleIssuesCount: 104,
    },
    {
      snapshotDate: '2026-02-23',
      issuesOpened30d: 86,
      issuesClosed30d: 79,
      prsOpened30d: 44,
      prsMerged30d: 36,
      prsClosedUnmerged30d: 5,
      medianIssueFirstResponseHours: 13.9,
      medianIssueCloseHours: 132.8,
      medianPrFirstReviewHours: 20.2,
      medianPrMergeHours: 72.5,
      activeContributors30d: 18,
      staleIssuesCount: 101,
    },
    {
      snapshotDate: '2026-03-09',
      issuesOpened30d: 79,
      issuesClosed30d: 84,
      prsOpened30d: 46,
      prsMerged30d: 39,
      prsClosedUnmerged30d: 4,
      medianIssueFirstResponseHours: 12.6,
      medianIssueCloseHours: 121.4,
      medianPrFirstReviewHours: 18.7,
      medianPrMergeHours: 69.1,
      activeContributors30d: 20,
      staleIssuesCount: 96,
    },
  ],
  lodash: [
    {
      snapshotDate: '2026-01-12',
      issuesOpened30d: 12,
      issuesClosed30d: 8,
      prsOpened30d: 4,
      prsMerged30d: 3,
      prsClosedUnmerged30d: 1,
      medianIssueFirstResponseHours: 54.1,
      medianIssueCloseHours: 320.2,
      medianPrFirstReviewHours: 41.5,
      medianPrMergeHours: 96.8,
      activeContributors30d: 4,
      staleIssuesCount: 47,
    },
    {
      snapshotDate: '2026-01-26',
      issuesOpened30d: 13,
      issuesClosed30d: 10,
      prsOpened30d: 5,
      prsMerged30d: 4,
      prsClosedUnmerged30d: 1,
      medianIssueFirstResponseHours: 49.7,
      medianIssueCloseHours: 288.1,
      medianPrFirstReviewHours: 36.1,
      medianPrMergeHours: 90.4,
      activeContributors30d: 5,
      staleIssuesCount: 44,
    },
    {
      snapshotDate: '2026-02-09',
      issuesOpened30d: 11,
      issuesClosed30d: 12,
      prsOpened30d: 5,
      prsMerged30d: 5,
      prsClosedUnmerged30d: 0,
      medianIssueFirstResponseHours: 45.2,
      medianIssueCloseHours: 256.3,
      medianPrFirstReviewHours: 31.7,
      medianPrMergeHours: 83.6,
      activeContributors30d: 6,
      staleIssuesCount: 41,
    },
    {
      snapshotDate: '2026-02-23',
      issuesOpened30d: 10,
      issuesClosed30d: 11,
      prsOpened30d: 6,
      prsMerged30d: 5,
      prsClosedUnmerged30d: 1,
      medianIssueFirstResponseHours: 38.5,
      medianIssueCloseHours: 224.8,
      medianPrFirstReviewHours: 28.3,
      medianPrMergeHours: 76.4,
      activeContributors30d: 7,
      staleIssuesCount: 39,
    },
    {
      snapshotDate: '2026-03-09',
      issuesOpened30d: 9,
      issuesClosed30d: 13,
      prsOpened30d: 6,
      prsMerged30d: 6,
      prsClosedUnmerged30d: 0,
      medianIssueFirstResponseHours: 32.1,
      medianIssueCloseHours: 198.7,
      medianPrFirstReviewHours: 24.9,
      medianPrMergeHours: 64.2,
      activeContributors30d: 8,
      staleIssuesCount: 35,
    },
  ],
};

/**
 * Historical snapshot fixtures for testing time-travel.
 *
 * Each snapshot represents weekly download counts at that point in time.
 * Realistic patterns:
 * - New versions start small and grow as users migrate
 * - Old versions decline gradually (never vanish abruptly)
 * - We started tracking in Oct 2025, so earlier snapshots are sparse/imported
 */
export const snapshotFixtures: Record<
  string,
  { date: string; downloads: Record<string, number> }[]
> = {
  nx: [
    // --- Historical imports (before we started tracking) ---
    // v18 dominant era
    {
      date: '2024-04-25',
      downloads: {
        '16.5.2': 3800,
        '17.2.0': 10000,
        '17.3.0': 18000,
        '17.3.1': 22000,
        '18.0.0': 28000,
        '18.0.1': 35000,
        '18.1.0': 82000,
        '18.2.0': 98000,
        '18.3.0': 5000,
      },
    },
    // v19 taking over
    {
      date: '2024-08-15',
      downloads: {
        '17.3.1': 9500,
        '18.1.0': 18000,
        '18.2.0': 32000,
        '18.3.0': 85000,
        '19.0.0': 45000,
        '19.1.0': 62000,
        '19.2.0': 78000,
        '19.3.0': 42000,
        '19.4.0': 12000,
      },
    },
    // v20 just released
    {
      date: '2024-10-10',
      downloads: {
        '17.3.1': 5200,
        '18.3.0': 42000,
        '19.3.0': 15000,
        '19.5.0': 48000,
        '19.6.0': 62000,
        '19.7.0': 85000,
        '19.8.0': 95000,
        '20.0.0': 8000,
      },
    },
    // v20 gaining traction
    {
      date: '2024-11-15',
      downloads: {
        '17.3.1': 4200,
        '18.3.0': 35000,
        '19.7.0': 32000,
        '19.8.0': 78000,
        '20.0.0': 52000,
        '20.1.0': 68000,
      },
    },
    // v20 dominant
    {
      date: '2025-01-10',
      downloads: {
        '18.3.0': 28000,
        '19.8.0': 55000,
        '20.0.0': 32000,
        '20.1.0': 45000,
        '20.2.0': 85000,
        '20.3.0': 72000,
      },
    },
    // v20 peak, v21 approaching
    {
      date: '2025-04-15',
      downloads: {
        '18.3.0': 22000,
        '19.8.0': 38000,
        '20.2.0': 42000,
        '20.3.0': 65000,
        '20.4.0': 148000,
      },
    },
    // v21 released and growing
    {
      date: '2025-05-20',
      downloads: {
        '18.3.0': 20000,
        '19.8.0': 32000,
        '20.3.0': 45000,
        '20.4.0': 125000,
        '21.0.0': 48000,
      },
    },
    // v21 taking over
    {
      date: '2025-07-10',
      downloads: {
        '18.3.0': 16000,
        '19.8.0': 26000,
        '20.4.0': 72000,
        '21.0.0': 35000,
        '21.1.0': 68000,
        '21.2.0': 95000,
      },
    },
    // v21 dominant
    {
      date: '2025-09-15',
      downloads: {
        '18.3.0': 14000,
        '19.8.0': 24000,
        '20.4.0': 42000,
        '21.0.0': 30000,
        '21.1.0': 58000,
        '21.2.0': 155000,
      },
    },

    // --- Regular tracking begins (weekly from Oct 2025) ---
    // v22 just released, v21 was dominant
    {
      date: '2025-10-24',
      downloads: {
        '18.3.0': 12000,
        '19.8.0': 22000,
        '20.3.0': 18000,
        '20.4.0': 35000,
        '21.0.0': 28000,
        '21.1.0': 52000,
        '21.2.0': 145000,
        '22.0.0': 15000,
      },
    },
    {
      date: '2025-10-31',
      downloads: {
        '18.3.0': 11500,
        '19.8.0': 21000,
        '20.4.0': 32000,
        '21.0.0': 25000,
        '21.1.0': 48000,
        '21.2.0': 138000,
        '22.0.0': 32000,
      },
    },
    {
      date: '2025-11-07',
      downloads: {
        '18.3.0': 11000,
        '19.8.0': 20000,
        '20.4.0': 30000,
        '21.0.0': 22000,
        '21.1.0': 42000,
        '21.2.0': 125000,
        '22.0.0': 55000,
      },
    },
    {
      date: '2025-11-21',
      downloads: {
        '18.3.0': 10500,
        '19.8.0': 19000,
        '20.4.0': 28000,
        '21.0.0': 18000,
        '21.1.0': 35000,
        '21.2.0': 108000,
        '22.0.0': 42000,
        '22.1.0': 65000,
      },
    },
    {
      date: '2025-12-12',
      downloads: {
        '18.3.0': 9800,
        '19.8.0': 17000,
        '20.4.0': 25000,
        '21.1.0': 28000,
        '21.2.0': 85000,
        '22.0.0': 35000,
        '22.1.0': 78000,
        '22.2.0': 48000,
      },
    },
    {
      date: '2026-01-09',
      downloads: {
        '18.3.0': 9200,
        '19.8.0': 15000,
        '20.4.0': 22000,
        '21.2.0': 62000,
        '22.0.0': 28000,
        '22.1.0': 52000,
        '22.2.0': 72000,
      },
    },
    {
      date: '2026-01-16',
      downloads: {
        '18.3.0': 9000,
        '19.8.0': 14500,
        '20.4.0': 21000,
        '21.2.0': 55000,
        '22.0.0': 26000,
        '22.1.0': 48000,
        '22.2.0': 68000,
        '22.3.0': 32000,
      },
    },
    {
      date: '2026-01-30',
      downloads: {
        '18.3.0': 8800,
        '19.8.0': 13500,
        '20.4.0': 20000,
        '21.2.0': 45000,
        '22.0.0': 24000,
        '22.1.0': 42000,
        '22.2.0': 58000,
        '22.3.0': 72000,
      },
    },
    {
      date: '2026-02-13',
      downloads: {
        '18.3.0': 8500,
        '19.8.0': 12500,
        '20.4.0': 19000,
        '21.2.0': 38000,
        '22.0.0': 22000,
        '22.1.0': 38000,
        '22.2.0': 52000,
        '22.3.0': 65000,
        '22.4.0': 42000,
      },
    },
    {
      date: '2026-02-27',
      downloads: {
        '18.3.0': 8200,
        '19.8.0': 12000,
        '20.4.0': 18000,
        '21.2.0': 32000,
        '22.0.0': 21000,
        '22.1.0': 35000,
        '22.2.0': 48000,
        '22.3.0': 78000,
        '22.4.0': 115000,
      },
    },
    // v23.0.0 released March 4
    {
      date: '2026-03-06',
      downloads: {
        '18.3.0': 8000,
        '19.8.0': 11500,
        '20.4.0': 17500,
        '21.2.0': 28000,
        '22.1.0': 32000,
        '22.2.0': 45000,
        '22.3.0': 82000,
        '22.4.0': 128000,
        '23.0.0': 18000,
      },
    },
    {
      date: '2026-03-13',
      downloads: {
        '17.3.1': 3500,
        '18.3.0': 8000,
        '19.8.0': 11000,
        '20.4.0': 17000,
        '21.2.0': 25000,
        '22.1.0': 30000,
        '22.2.0': 42000,
        '22.3.0': 78000,
        '22.4.0': 135000,
        '23.0.0': 35000,
      },
    },
  ],
  react: [
    // Historical imports
    {
      date: '2022-06-14',
      downloads: {
        '16.14.0': 1200000,
        '17.0.2': 1800000,
        '18.0.0': 210000,
        '18.1.0': 420000,
        '18.2.0': 12000,
      },
    },
    {
      date: '2024-04-26',
      downloads: {
        '16.14.0': 280000,
        '17.0.2': 420000,
        '18.2.0': 1800000,
        '18.3.0': 2200000,
        '18.3.1': 15000,
      },
    },
    {
      date: '2024-12-05',
      downloads: {
        '16.14.0': 180000,
        '17.0.2': 310000,
        '18.2.0': 1500000,
        '18.3.1': 3000000,
        '19.0.0': 45000,
      },
    },
    // Regular tracking
    {
      date: '2025-10-24',
      downloads: {
        '17.0.2': 320000,
        '18.2.0': 1300000,
        '18.3.1': 2900000,
        '19.0.0': 3200000,
        '19.1.0': 4800000,
      },
    },
    {
      date: '2025-11-21',
      downloads: {
        '17.0.2': 315000,
        '18.2.0': 1250000,
        '18.3.1': 2850000,
        '19.0.0': 3400000,
        '19.1.0': 5000000,
      },
    },
    {
      date: '2025-12-12',
      downloads: {
        '17.0.2': 312000,
        '18.2.0': 1220000,
        '18.3.1': 2800000,
        '19.0.0': 3500000,
        '19.1.0': 5100000,
      },
    },
    {
      date: '2026-01-16',
      downloads: {
        '17.0.2': 310000,
        '18.2.0': 1200000,
        '18.3.1': 2800000,
        '19.0.0': 3500000,
        '19.1.0': 5200000,
      },
    },
    {
      date: '2026-02-13',
      downloads: {
        '17.0.2': 308000,
        '18.2.0': 1180000,
        '18.3.1': 2780000,
        '19.0.0': 3500000,
        '19.1.0': 5300000,
      },
    },
    {
      date: '2026-03-13',
      downloads: {
        '17.0.2': 305000,
        '18.2.0': 1150000,
        '18.3.1': 2750000,
        '19.0.0': 3500000,
        '19.1.0': 5400000,
      },
    },
  ],
  lodash: [
    // Historical — only one major, just patch versions
    {
      date: '2021-02-20',
      downloads: {
        '4.17.11': 620000,
        '4.17.14': 850000,
        '4.17.15': 1800000,
        '4.17.19': 520000,
        '4.17.20': 780000,
        '4.17.21': 22000,
      },
    },
    // Regular tracking
    {
      date: '2025-10-24',
      downloads: {
        '4.17.11': 290000,
        '4.17.14': 360000,
        '4.17.15': 1220000,
        '4.17.19': 790000,
        '4.17.20': 1460000,
        '4.17.21': 8500000,
      },
    },
    {
      date: '2025-12-12',
      downloads: {
        '4.17.11': 285000,
        '4.17.14': 355000,
        '4.17.15': 1210000,
        '4.17.19': 785000,
        '4.17.20': 1455000,
        '4.17.21': 8700000,
      },
    },
    {
      date: '2026-02-13',
      downloads: {
        '4.17.11': 282000,
        '4.17.14': 352000,
        '4.17.15': 1205000,
        '4.17.19': 782000,
        '4.17.20': 1452000,
        '4.17.21': 8850000,
      },
    },
    {
      date: '2026-03-13',
      downloads: {
        '4.17.11': 280000,
        '4.17.14': 350000,
        '4.17.15': 1200000,
        '4.17.19': 780000,
        '4.17.20': 1450000,
        '4.17.21': 8900000,
      },
    },
  ],
};

export function getFixturePackage(name: string): FixturePackage | null {
  return fixtures[name] ?? null;
}

export function getFixtureSnapshots(
  name: string
): { date: string; downloads: Record<string, number> }[] {
  return snapshotFixtures[name] ?? [];
}

export function getAllFixturePackageNames(): string[] {
  return Object.keys(fixtures);
}

export function getFixtureHealthRepo(name: string): {
  owner: string;
  name: string;
} | null {
  return fixtureHealthRepos[name] ?? null;
}

export function getFixtureHealthMetrics(
  name: string
): FixtureHealthMetricPoint[] {
  return fixtureHealthMetrics[name] ?? [];
}

/**
 * Fixture version release dates (version → ISO date string).
 * Only stable x.y.z versions, no pre-release tags.
 * These come from the npm registry, so they include the full history.
 */
const versionReleaseDates: Record<string, Record<string, string>> = {
  nx: {
    '16.0.0': '2023-05-23',
    '16.1.0': '2023-06-12',
    '16.2.0': '2023-06-26',
    '16.3.0': '2023-07-14',
    '16.3.1': '2023-07-18',
    '16.4.0': '2023-07-27',
    '16.5.0': '2023-08-07',
    '16.5.1': '2023-08-10',
    '16.5.2': '2023-08-17',
    '17.0.0': '2023-10-09',
    '17.0.1': '2023-10-12',
    '17.1.0': '2023-11-02',
    '17.2.0': '2023-11-22',
    '17.3.0': '2023-12-20',
    '17.3.1': '2024-01-05',
    '18.0.0': '2024-02-05',
    '18.0.1': '2024-02-09',
    '18.1.0': '2024-03-08',
    '18.2.0': '2024-04-03',
    '18.3.0': '2024-04-25',
    '19.0.0': '2024-05-06',
    '19.1.0': '2024-06-03',
    '19.2.0': '2024-06-25',
    '19.3.0': '2024-07-17',
    '19.4.0': '2024-08-07',
    '19.5.0': '2024-08-22',
    '19.6.0': '2024-09-05',
    '19.7.0': '2024-09-18',
    '19.8.0': '2024-10-01',
    '20.0.0': '2024-10-07',
    '20.1.0': '2024-11-04',
    '20.2.0': '2024-12-02',
    '20.3.0': '2025-01-07',
    '20.4.0': '2025-02-04',
    '21.0.0': '2025-05-05',
    '21.1.0': '2025-06-02',
    '21.2.0': '2025-07-01',
    '22.0.0': '2025-10-22',
    '22.1.0': '2025-11-18',
    '22.2.0': '2025-12-09',
    '22.3.0': '2026-01-14',
    '22.4.0': '2026-02-11',
    '23.0.0': '2026-03-04',
  },
  react: {
    '17.0.0': '2020-10-20',
    '17.0.1': '2020-10-22',
    '17.0.2': '2021-03-22',
    '18.0.0': '2022-03-29',
    '18.1.0': '2022-04-26',
    '18.2.0': '2022-06-14',
    '18.3.0': '2024-04-25',
    '18.3.1': '2024-04-26',
    '19.0.0': '2024-12-05',
    '19.1.0': '2025-03-28',
  },
  lodash: {
    '4.17.15': '2019-07-17',
    '4.17.16': '2020-08-13',
    '4.17.17': '2020-08-13',
    '4.17.18': '2020-08-13',
    '4.17.19': '2020-08-17',
    '4.17.20': '2020-08-13',
    '4.17.21': '2021-02-20',
  },
};

export function getFixtureVersionDates(
  name: string
): Record<string, string> | null {
  return versionReleaseDates[name] ?? null;
}

/**
 * Generate fixture total download data simulating the npm range API.
 * Returns daily download points covering up to 18 months back from "today"
 * (2026-03-17), matching the real API's behavior.
 *
 * - Pre-snapshot period: uses first snapshot's daily rate as baseline,
 *   growing gradually toward the first snapshot's actual total.
 *   These show as "unknown" in the adoption chart since we have no
 *   version breakdown for this period.
 * - Snapshot period: interpolates between snapshot totals (weekly / 7).
 * - Post-last-snapshot: extrapolates forward 14 days.
 */
export function getFixtureTotalDownloads(
  name: string
): { day: string; downloads: number }[] {
  const snapshots = snapshotFixtures[name];
  if (!snapshots || snapshots.length === 0) return [];

  const points: { day: string; downloads: number }[] = [];

  // Start 18 months before "today" (2026-03-17), matching real npm API
  const apiStart = new Date('2024-09-17T00:00:00');
  const firstSnapDate = new Date(snapshots[0].date + 'T00:00:00');
  const firstWeekly = Object.values(snapshots[0].downloads).reduce(
    (sum, c) => sum + c,
    0
  );
  const firstDailyRate = firstWeekly / 7;

  // Pre-snapshot backfill: generate daily data from API start to first snapshot.
  // Use ~80% of the first snapshot's rate at the start, growing to match.
  const preSnapshotDays = Math.round(
    (firstSnapDate.getTime() - apiStart.getTime()) / 86400000
  );
  if (preSnapshotDays > 0) {
    const startRate = firstDailyRate * 0.7;
    for (let d = 0; d < preSnapshotDays; d++) {
      const date = new Date(apiStart);
      date.setDate(date.getDate() + d);
      const t = d / preSnapshotDays;
      const rate = startRate + (firstDailyRate - startRate) * t;
      points.push({
        day: date.toISOString().slice(0, 10),
        downloads: Math.round(rate),
      });
    }
  }

  // Snapshot period: interpolate between snapshots
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const weeklyTotal = Object.values(snap.downloads).reduce(
      (sum, c) => sum + c,
      0
    );
    const dailyRate = weeklyTotal / 7;
    const startDate = new Date(snap.date + 'T00:00:00');

    if (i < snapshots.length - 1) {
      const endDate = new Date(snapshots[i + 1].date + 'T00:00:00');
      const endWeekly = Object.values(snapshots[i + 1].downloads).reduce(
        (sum, c) => sum + c,
        0
      );
      const endDailyRate = endWeekly / 7;
      const days = Math.round(
        (endDate.getTime() - startDate.getTime()) / 86400000
      );

      for (let d = 0; d < days; d++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + d);
        const t = d / days;
        const interpolated = Math.round(
          dailyRate + (endDailyRate - dailyRate) * t
        );
        points.push({
          day: date.toISOString().slice(0, 10),
          downloads: interpolated,
        });
      }
    } else {
      // Last snapshot — extrapolate forward
      for (let d = 0; d < 14; d++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + d);
        points.push({
          day: date.toISOString().slice(0, 10),
          downloads: Math.round(dailyRate),
        });
      }
    }
  }

  return points;
}
