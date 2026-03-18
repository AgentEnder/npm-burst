import { describe, expect, it } from 'vitest';
import { computeHealthMetrics } from './metrics';
import type { RawGitHubHealthData } from './types';

const rawData: RawGitHubHealthData = {
  repository: {
    owner: 'example',
    name: 'repo',
    issues: [
      {
        id: 'issue-1',
        number: 1,
        title: 'Bug',
        createdAt: '2026-03-01T00:00:00.000Z',
        closedAt: '2026-03-03T00:00:00.000Z',
        updatedAt: '2026-03-03T00:00:00.000Z',
        labels: ['bug'],
        comments: [],
      },
      {
        id: 'issue-2',
        number: 2,
        title: 'Feature',
        createdAt: '2025-10-01T00:00:00.000Z',
        closedAt: null,
        updatedAt: '2025-10-15T00:00:00.000Z',
        labels: ['feature'],
        comments: [],
      },
    ],
    staleIssues: [
      {
        id: 'stale-issue-1',
        number: 3,
        title: 'Stale bug',
        createdAt: '2025-09-01T00:00:00.000Z',
        closedAt: null,
        updatedAt: '2025-10-15T00:00:00.000Z',
        labels: ['feature'],
        comments: [],
      },
    ],
    pullRequests: [
      {
        id: 'pr-1',
        number: 10,
        title: 'Fix',
        createdAt: '2026-03-02T00:00:00.000Z',
        closedAt: '2026-03-05T00:00:00.000Z',
        mergedAt: '2026-03-05T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
        labels: ['bug'],
        author: null,
        comments: [],
        reviews: [],
      },
    ],
  },
  fetchedAt: '2026-03-10T00:00:00.000Z',
};

describe('computeHealthMetrics', () => {
  it('honors label filters for throughput metrics', () => {
    const metrics = computeHealthMetrics(
      rawData,
      { labels: ['bug'] },
      [{ pattern_type: 'username_suffix', pattern_value: '[bot]' }],
      new Date('2026-03-10T00:00:00.000Z')
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
    const metrics = computeHealthMetrics(rawData, null, [], new Date('2026-03-10T00:00:00.000Z'));
    expect(metrics.staleIssuesCount).toBe(1);
    expect(metrics.stalePrsCount).toBe(0);
  });

  it('uses lifecycle timestamps instead of updatedAt for throughput counts', () => {
    const metrics = computeHealthMetrics(
      {
        repository: {
          owner: 'example',
          name: 'repo',
          issues: [
            {
              id: 'issue-opened-earlier',
              number: 20,
              title: 'Old issue updated recently',
              createdAt: '2026-01-01T00:00:00.000Z',
              closedAt: null,
              updatedAt: '2026-03-09T00:00:00.000Z',
              labels: [],
              comments: [],
            },
            {
              id: 'issue-closed-recently',
              number: 21,
              title: 'Old issue closed recently',
              createdAt: '2026-01-15T00:00:00.000Z',
              closedAt: '2026-03-08T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
              labels: [],
              comments: [],
            },
          ],
          staleIssues: [],
          pullRequests: [
            {
              id: 'pr-opened-earlier',
              number: 30,
              title: 'Old PR updated recently',
              createdAt: '2026-01-01T00:00:00.000Z',
              closedAt: null,
              mergedAt: null,
              updatedAt: '2026-03-09T00:00:00.000Z',
              labels: [],
              author: null,
              comments: [],
              reviews: [],
            },
            {
              id: 'pr-merged-recently',
              number: 31,
              title: 'Old PR merged recently',
              createdAt: '2026-01-15T00:00:00.000Z',
              closedAt: '2026-03-08T00:00:00.000Z',
              mergedAt: '2026-03-08T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
              labels: [],
              author: null,
              comments: [],
              reviews: [],
            },
            {
              id: 'pr-closed-unmerged-recently',
              number: 32,
              title: 'Old PR closed recently',
              createdAt: '2026-01-20T00:00:00.000Z',
              closedAt: '2026-03-07T00:00:00.000Z',
              mergedAt: null,
              updatedAt: '2026-03-09T00:00:00.000Z',
              labels: [],
              author: null,
              comments: [],
              reviews: [],
            },
          ],
        },
        fetchedAt: '2026-03-10T00:00:00.000Z',
      },
      null,
      [],
      new Date('2026-03-10T00:00:00.000Z')
    );

    expect(metrics.issuesOpened30d).toBe(0);
    expect(metrics.issuesClosed30d).toBe(1);
    expect(metrics.prsOpened30d).toBe(0);
    expect(metrics.prsMerged30d).toBe(1);
    expect(metrics.prsClosedUnmerged30d).toBe(1);
    expect(metrics.activeContributors30d).toBe(0);
  });
});
