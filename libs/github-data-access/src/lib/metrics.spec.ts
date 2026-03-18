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
        comments: [
          {
            createdAt: '2026-03-01T06:00:00.000Z',
            author: { login: 'dependabot[bot]', __typename: 'Bot' },
          },
          {
            createdAt: '2026-03-01T12:00:00.000Z',
            author: { login: 'maintainer', __typename: 'User' },
          },
        ],
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
        author: { login: 'contributor', __typename: 'User' },
        comments: [],
        reviews: [
          {
            createdAt: '2026-03-02T10:00:00.000Z',
            author: { login: 'reviewer', __typename: 'User' },
          },
        ],
      },
    ],
  },
  fetchedAt: '2026-03-10T00:00:00.000Z',
};

describe('computeHealthMetrics', () => {
  it('filters bots out of response time metrics and honors label filters', () => {
    const metrics = computeHealthMetrics(
      rawData,
      { labels: ['bug'] },
      [{ pattern_type: 'username_suffix', pattern_value: '[bot]' }],
      new Date('2026-03-10T00:00:00.000Z')
    );

    expect(metrics.issuesOpened30d).toBe(1);
    expect(metrics.issuesClosed30d).toBe(1);
    expect(metrics.prsMerged30d).toBe(1);
    expect(metrics.medianIssueFirstResponseHours).toBe(12);
    expect(metrics.medianPrFirstReviewHours).toBe(10);
    expect(metrics.staleIssuesCount).toBe(0);
  });

  it('counts stale issues without a filter', () => {
    const metrics = computeHealthMetrics(rawData, null, [], new Date('2026-03-10T00:00:00.000Z'));
    expect(metrics.staleIssuesCount).toBe(1);
  });
});
