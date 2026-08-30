import { describe, expect, it } from 'vitest';
import {
  computeHealthMetrics,
  computeOpenItemAges,
  findFirstHumanResponse,
} from './metrics';
import type {
  BotPattern,
  RawGitHubHealthData,
  RawIssueNode,
  RawOpenItemCollection,
  RawPullRequestNode,
} from './types';

const NOW = new Date('2026-03-10T00:00:00.000Z');
const BOT_PATTERNS: BotPattern[] = [
  { pattern_type: 'username_suffix', pattern_value: '[bot]' },
];

function issue(
  overrides: Partial<RawIssueNode> & { id: string }
): RawIssueNode {
  return {
    number: 1,
    title: overrides.id,
    createdAt: '2026-03-01T00:00:00.000Z',
    closedAt: null,
    updatedAt: '2026-03-01T00:00:00.000Z',
    labels: [],
    author: { login: 'reporter' },
    comments: [],
    ...overrides,
  };
}

function pr(
  overrides: Partial<RawPullRequestNode> & { id: string }
): RawPullRequestNode {
  return {
    number: 1,
    title: overrides.id,
    createdAt: '2026-03-01T00:00:00.000Z',
    closedAt: null,
    mergedAt: null,
    updatedAt: '2026-03-01T00:00:00.000Z',
    labels: [],
    author: { login: 'contributor' },
    reviews: [],
    ...overrides,
  };
}

function raw(
  repository: Partial<RawGitHubHealthData['repository']>
): RawGitHubHealthData {
  return {
    version: 2,
    repository: {
      owner: 'example',
      name: 'repo',
      issues: [],
      pullRequests: [],
      ...repository,
    },
    fetchedAt: NOW.toISOString(),
  };
}

const rawData = raw({
  issues: [
    issue({
      id: 'issue-1',
      createdAt: '2026-03-01T00:00:00.000Z',
      closedAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:00:00.000Z',
      labels: ['bug'],
    }),
    issue({
      id: 'issue-2',
      createdAt: '2025-10-01T00:00:00.000Z',
      updatedAt: '2025-10-15T00:00:00.000Z',
      labels: ['feature'],
    }),
  ],
  pullRequests: [
    pr({
      id: 'pr-1',
      createdAt: '2026-03-02T00:00:00.000Z',
      closedAt: '2026-03-05T00:00:00.000Z',
      mergedAt: '2026-03-05T00:00:00.000Z',
      updatedAt: '2026-03-05T00:00:00.000Z',
      labels: ['bug'],
    }),
  ],
});

describe('computeHealthMetrics', () => {
  it('honors label filters for throughput metrics', () => {
    const metrics = computeHealthMetrics(
      rawData,
      { labels: ['bug'] },
      BOT_PATTERNS,
      NOW
    );

    expect(metrics.issuesOpened30d).toBe(1);
    expect(metrics.issuesClosed30d).toBe(1);
    expect(metrics.prsMerged30d).toBe(1);
    expect(metrics.medianIssueFirstResponseHours).toBeNull();
    expect(metrics.medianPrFirstReviewHours).toBeNull();
    expect(metrics.staleIssuesCount).toBe(0);
    expect(metrics.stalePrsCount).toBe(0);
  });

  it('counts stale issues without a filter', () => {
    const metrics = computeHealthMetrics(rawData, null, [], NOW);
    expect(metrics.staleIssuesCount).toBe(1);
    expect(metrics.stalePrsCount).toBe(0);
  });

  it('uses lifecycle timestamps instead of updatedAt for throughput counts', () => {
    const metrics = computeHealthMetrics(
      raw({
        issues: [
          issue({
            id: 'issue-opened-earlier',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }),
          issue({
            id: 'issue-closed-recently',
            createdAt: '2026-01-15T00:00:00.000Z',
            closedAt: '2026-03-08T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }),
        ],
        pullRequests: [
          pr({
            id: 'pr-opened-earlier',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }),
          pr({
            id: 'pr-merged-recently',
            createdAt: '2026-01-15T00:00:00.000Z',
            closedAt: '2026-03-08T00:00:00.000Z',
            mergedAt: '2026-03-08T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }),
          pr({
            id: 'pr-closed-unmerged-recently',
            createdAt: '2026-01-20T00:00:00.000Z',
            closedAt: '2026-03-07T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }),
        ],
      }),
      null,
      [],
      NOW
    );

    expect(metrics.issuesOpened30d).toBe(0);
    expect(metrics.issuesClosed30d).toBe(1);
    expect(metrics.prsOpened30d).toBe(0);
    expect(metrics.prsMerged30d).toBe(1);
    expect(metrics.prsClosedUnmerged30d).toBe(1);
  });

  it('summarizes close and merge durations over the items resolved in the window', () => {
    const metrics = computeHealthMetrics(
      raw({
        issues: [
          issue({
            id: 'closed-fast',
            createdAt: '2026-03-01T00:00:00.000Z',
            closedAt: '2026-03-01T10:00:00.000Z',
          }),
          issue({
            id: 'closed-slow',
            createdAt: '2026-02-01T00:00:00.000Z',
            closedAt: '2026-03-03T00:00:00.000Z', // 30 days = 720h
          }),
          issue({
            id: 'closed-outside-window',
            createdAt: '2025-12-01T00:00:00.000Z',
            closedAt: '2026-01-01T00:00:00.000Z',
          }),
        ],
        pullRequests: [
          pr({
            id: 'merged',
            createdAt: '2026-03-01T00:00:00.000Z',
            mergedAt: '2026-03-02T00:00:00.000Z',
            closedAt: '2026-03-02T00:00:00.000Z',
          }),
          pr({
            id: 'closed-not-merged',
            createdAt: '2026-03-01T00:00:00.000Z',
            closedAt: '2026-03-09T00:00:00.000Z',
          }),
        ],
      }),
      null,
      [],
      NOW
    );

    expect(metrics.avgIssueCloseHours).toBe(365);
    expect(metrics.medianIssueCloseHours).toBe(10);
    expect(metrics.p95IssueCloseHours).toBe(720);
    // Only the merged PR counts; closing without merging is not a merge time.
    expect(metrics.avgPrMergeHours).toBe(24);
    expect(metrics.medianPrMergeHours).toBe(24);
    expect(metrics.p95PrMergeHours).toBe(24);
  });

  it('measures first response from a human who is not the author', () => {
    const metrics = computeHealthMetrics(
      raw({
        issues: [
          issue({
            id: 'answered',
            createdAt: '2026-03-01T00:00:00.000Z',
            author: { login: 'reporter' },
            comments: [
              {
                createdAt: '2026-03-01T01:00:00.000Z',
                author: { login: 'triage[bot]' },
              },
              {
                createdAt: '2026-03-01T02:00:00.000Z',
                author: { login: 'reporter' },
              },
              {
                createdAt: '2026-03-01T06:00:00.000Z',
                author: { login: 'maintainer' },
              },
            ],
          }),
          issue({
            id: 'unanswered',
            createdAt: '2026-03-02T00:00:00.000Z',
            comments: [],
          }),
        ],
        pullRequests: [
          pr({
            id: 'reviewed',
            createdAt: '2026-03-01T00:00:00.000Z',
            author: { login: 'contributor' },
            reviews: [
              {
                createdAt: '2026-03-01T12:00:00.000Z',
                author: { login: 'contributor' },
              },
              {
                createdAt: '2026-03-02T00:00:00.000Z',
                author: { login: 'maintainer' },
              },
            ],
          }),
        ],
      }),
      null,
      BOT_PATTERNS,
      NOW
    );

    // The unanswered issue is excluded, not counted as zero.
    expect(metrics.medianIssueFirstResponseHours).toBe(6);
    expect(metrics.medianPrFirstReviewHours).toBe(24);
  });

  it('counts distinct non-bot authors of merged PRs as active contributors', () => {
    const merged = {
      createdAt: '2026-03-01T00:00:00.000Z',
      mergedAt: '2026-03-02T00:00:00.000Z',
      closedAt: '2026-03-02T00:00:00.000Z',
    };
    const metrics = computeHealthMetrics(
      raw({
        pullRequests: [
          pr({ id: 'a1', ...merged, author: { login: 'alice' } }),
          pr({ id: 'a2', ...merged, author: { login: 'alice' } }),
          pr({ id: 'b1', ...merged, author: { login: 'bob' } }),
          pr({ id: 'bot', ...merged, author: { login: 'renovate[bot]' } }),
          pr({ id: 'open', author: { login: 'carol' } }),
        ],
      }),
      null,
      BOT_PATTERNS,
      NOW
    );

    expect(metrics.activeContributors30d).toBe(2);
  });

  it('leaves backlog age null when the snapshot carries no open items', () => {
    const metrics = computeHealthMetrics(rawData, null, [], NOW);
    expect(metrics.avgIssueAgeHours).toBeNull();
    expect(metrics.p95IssueAgeHours).toBeNull();
    expect(metrics.avgPrAgeHours).toBeNull();
    expect(metrics.p95PrAgeHours).toBeNull();
  });
});

describe('findFirstHumanResponse', () => {
  it('orders by createdAt rather than trusting input order', () => {
    const response = findFirstHumanResponse(
      { author: { login: 'reporter' } },
      [
        { createdAt: '2026-03-02T00:00:00.000Z', author: { login: 'late' } },
        { createdAt: '2026-03-01T00:00:00.000Z', author: { login: 'early' } },
      ],
      []
    );
    expect(response?.author?.login).toBe('early');
  });
});

describe('computeOpenItemAges', () => {
  // Ages in hours from NOW, oldest first.
  function collection(
    agesHours: number[],
    overrides: Partial<RawOpenItemCollection> = {}
  ): RawOpenItemCollection {
    return {
      items: agesHours.map((age, index) => ({
        number: index + 1,
        createdAt: new Date(NOW.getTime() - age * 60 * 60 * 1000).toISOString(),
        labels: index % 2 === 0 ? ['bug'] : [],
      })),
      totalCount: agesHours.length,
      truncated: false,
      ...overrides,
    };
  }

  it('is exact when nothing was truncated', () => {
    const ages = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
    expect(computeOpenItemAges(collection(ages), null, NOW)).toEqual({
      avgHours: 550,
      p95Hours: 1000,
    });
    // Label filter keeps the even-indexed items: 1000, 800, 600, 400, 200.
    expect(
      computeOpenItemAges(collection(ages), { labels: ['bug'] }, NOW)
    ).toEqual({ avgHours: 600, p95Hours: 1000 });
  });

  it('keeps the unfiltered P95 exact when truncated, and drops the average', () => {
    // 100 items in total, only the oldest 10 fetched. Ascending-age rank
    // ceil(0.95·100) = 95 is index 100 − 95 = 5 from the oldest end.
    const fetched = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
    const result = computeOpenItemAges(
      collection(fetched, { totalCount: 100, truncated: true }),
      null,
      NOW
    );
    expect(result).toEqual({ avgHours: null, p95Hours: 500 });
  });

  it('gives up entirely on a filtered truncated collection', () => {
    const result = computeOpenItemAges(
      collection([1000, 900], { totalCount: 5000, truncated: true }),
      { labels: ['bug'] },
      NOW
    );
    expect(result).toEqual({ avgHours: null, p95Hours: null });
  });

  it('gives up on P95 when the rank falls outside what was fetched', () => {
    // N = 1000 → index 50 from the oldest, but only 10 were fetched.
    const result = computeOpenItemAges(
      collection([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], {
        totalCount: 1000,
        truncated: true,
      }),
      null,
      NOW
    );
    expect(result).toEqual({ avgHours: null, p95Hours: null });
  });
});
