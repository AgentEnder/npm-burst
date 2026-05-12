import type {
  RawGitHubHealthData,
  RawIssueNode,
  RawPullRequestNode,
} from './types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 91;

function mergeById<T extends { id: string }>(previous: T[], delta: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of previous) {
    map.set(item.id, item);
  }
  for (const item of delta) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function pruneByUpdatedAt<T extends { updatedAt: string }>(
  items: T[],
  cutoffMs: number
): T[] {
  return items.filter((item) => new Date(item.updatedAt).getTime() >= cutoffMs);
}

/**
 * Merge a delta fetch into a previous snapshot's raw data.
 * Items are matched by `id` — delta items overwrite previous ones.
 * Items with `updatedAt` older than 91 days are pruned.
 */
export function mergeRawHealthData(
  previous: RawGitHubHealthData,
  delta: {
    issues: RawIssueNode[];
    pullRequests: RawPullRequestNode[];
    staleIssues?: RawIssueNode[];
  },
  now = new Date()
): RawGitHubHealthData {
  const cutoffMs = now.getTime() - RETENTION_DAYS * DAY_IN_MS;

  return {
    repository: {
      owner: previous.repository.owner,
      name: previous.repository.name,
      issues: pruneByUpdatedAt(
        mergeById(previous.repository.issues, delta.issues),
        cutoffMs
      ),
      pullRequests: pruneByUpdatedAt(
        mergeById(previous.repository.pullRequests, delta.pullRequests),
        cutoffMs
      ),
      staleIssues: delta.staleIssues ?? previous.repository.staleIssues ?? [],
    },
    fetchedAt: now.toISOString(),
  };
}
