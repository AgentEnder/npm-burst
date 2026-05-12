import { describe, expect, it } from 'vitest';
import { mergeRawHealthData } from './merge';
import type { RawGitHubHealthData } from './types';

function makeIssue(
  id: string,
  updatedAt: string,
  overrides: Partial<RawGitHubHealthData['repository']['issues'][number]> = {}
) {
  return {
    id,
    number: parseInt(id.replace('issue-', ''), 10),
    title: `Issue ${id}`,
    createdAt: updatedAt,
    closedAt: null,
    updatedAt,
    labels: [],
    comments: [],
    ...overrides,
  };
}

function makePr(
  id: string,
  updatedAt: string,
  overrides: Partial<
    RawGitHubHealthData['repository']['pullRequests'][number]
  > = {}
) {
  return {
    id,
    number: parseInt(id.replace('pr-', ''), 10),
    title: `PR ${id}`,
    createdAt: updatedAt,
    closedAt: null,
    mergedAt: null,
    updatedAt,
    labels: [],
    comments: [],
    reviews: [],
    author: null,
    ...overrides,
  };
}

const now = new Date('2026-03-18T00:00:00.000Z');

describe('mergeRawHealthData', () => {
  it('merges delta items into previous data by id', () => {
    const previous: RawGitHubHealthData = {
      repository: {
        owner: 'org',
        name: 'repo',
        issues: [
          makeIssue('issue-1', '2026-03-10T00:00:00.000Z'),
          makeIssue('issue-2', '2026-03-01T00:00:00.000Z'),
        ],
        pullRequests: [makePr('pr-1', '2026-03-05T00:00:00.000Z')],
        staleIssues: [makeIssue('issue-stale', '2025-11-15T00:00:00.000Z')],
      },
      fetchedAt: '2026-03-17T00:00:00.000Z',
    };

    const delta = {
      issues: [
        makeIssue('issue-1', '2026-03-17T12:00:00.000Z', {
          closedAt: '2026-03-17T12:00:00.000Z',
        }),
        makeIssue('issue-3', '2026-03-17T08:00:00.000Z'),
      ],
      pullRequests: [],
      staleIssues: [makeIssue('issue-stale-2', '2025-11-10T00:00:00.000Z')],
    };

    const result = mergeRawHealthData(previous, delta, now);

    expect(result.repository.issues).toHaveLength(3);
    const issue1 = result.repository.issues.find((i) => i.id === 'issue-1');
    expect(issue1?.closedAt).toBe('2026-03-17T12:00:00.000Z');
    expect(
      result.repository.issues.find((i) => i.id === 'issue-3')
    ).toBeTruthy();
    expect(result.repository.staleIssues).toHaveLength(1);
    expect(result.repository.staleIssues?.[0].id).toBe('issue-stale-2');
  });

  it('prunes items older than 91 days', () => {
    const previous: RawGitHubHealthData = {
      repository: {
        owner: 'org',
        name: 'repo',
        issues: [
          makeIssue('issue-old', '2025-12-01T00:00:00.000Z'),
          makeIssue('issue-recent', '2026-03-10T00:00:00.000Z'),
        ],
        pullRequests: [
          makePr('pr-old', '2025-11-01T00:00:00.000Z'),
          makePr('pr-recent', '2026-03-15T00:00:00.000Z'),
        ],
        staleIssues: [makeIssue('issue-stale', '2025-11-01T00:00:00.000Z')],
      },
      fetchedAt: '2026-03-17T00:00:00.000Z',
    };

    const result = mergeRawHealthData(
      previous,
      { issues: [], pullRequests: [], staleIssues: [] },
      now
    );

    expect(result.repository.issues).toHaveLength(1);
    expect(result.repository.issues[0].id).toBe('issue-recent');
    expect(result.repository.pullRequests).toHaveLength(1);
    expect(result.repository.pullRequests[0].id).toBe('pr-recent');
    expect(result.repository.staleIssues).toHaveLength(0);
  });

  it('sets fetchedAt to now', () => {
    const previous: RawGitHubHealthData = {
      repository: {
        owner: 'org',
        name: 'repo',
        issues: [],
        pullRequests: [],
        staleIssues: [],
      },
      fetchedAt: '2026-03-17T00:00:00.000Z',
    };

    const result = mergeRawHealthData(
      previous,
      { issues: [], pullRequests: [], staleIssues: [] },
      now
    );
    expect(result.fetchedAt).toBe('2026-03-18T00:00:00.000Z');
  });
});
