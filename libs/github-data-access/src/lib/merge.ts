import {
  RAW_HEALTH_DATA_VERSION,
  type RawGitHubHealthData,
  type RawIssueNode,
  type RawOpenItemCollection,
  type RawPullRequestNode,
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
 *
 * Open-item collections are point-in-time state, not deltas: the incoming
 * one replaces the previous one wholesale when present.
 */
export function mergeRawHealthData(
  previous: RawGitHubHealthData,
  delta: {
    issues: RawIssueNode[];
    pullRequests: RawPullRequestNode[];
    staleIssues?: RawIssueNode[];
    openIssues?: RawOpenItemCollection;
    openPullRequests?: RawOpenItemCollection;
  },
  now = new Date()
): RawGitHubHealthData {
  const cutoffMs = now.getTime() - RETENTION_DAYS * DAY_IN_MS;

  return {
    version: RAW_HEALTH_DATA_VERSION,
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
      openIssues: delta.openIssues ?? previous.repository.openIssues,
      openPullRequests:
        delta.openPullRequests ?? previous.repository.openPullRequests,
    },
    fetchedAt: now.toISOString(),
  };
}

/**
 * A stored snapshot is only usable as the base of a delta fetch if it was
 * written by the current collection shape. Anything older is treated as
 * absent so the next run does a full fetch.
 */
export function isCurrentRawHealthData(
  data: RawGitHubHealthData | null | undefined
): data is RawGitHubHealthData {
  return data?.version === RAW_HEALTH_DATA_VERSION;
}
