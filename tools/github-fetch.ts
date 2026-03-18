import {
  computeHealthMetrics,
  fetchGitHubHealthDebugData,
  type GitHubFetchStats,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';

interface CliOptions {
  repo: string;
  since: string;
  json: boolean;
}

function printUsage(): void {
  console.error(
    'Usage: pnpm github:fetch -- <owner>/<repo> [--since=2026-01-01T00:00:00Z] [--json]'
  );
}

function parseArgs(argv: string[]): CliOptions | null {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const repo = positional[0];

  if (!repo) {
    return null;
  }

  const sinceArg = argv.find((arg) => arg.startsWith('--since='));
  const since = sinceArg
    ? sinceArg.slice('--since='.length)
    : new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();

  if (Number.isNaN(new Date(since).getTime())) {
    console.error(`Invalid --since value: ${since}`);
    return null;
  }

  return {
    repo,
    since,
    json: argv.includes('--json'),
  };
}

function parseRepo(value: string): { owner: string; name: string } | null {
  const [owner, name] = value.split('/');
  if (!owner || !name) {
    return null;
  }
  return { owner, name };
}

function summarize(
  rawData: RawGitHubHealthData,
  staleIssuesCount: number,
  stalePrsCount: number,
  since: string,
  durationMs: number,
  stats: GitHubFetchStats
) {
  const now = new Date();
  const metrics = computeHealthMetrics(rawData, null, [], now);
  const issues = rawData.repository.issues;
  const pullRequests = rawData.repository.pullRequests;

  return {
    repository: `${rawData.repository.owner}/${rawData.repository.name}`,
    fetchedAt: rawData.fetchedAt,
    since,
    durationMs,
    githubRequestCount: stats.requestCount,
    githubRateLimitLimit: stats.lastRateLimitLimit,
    githubRateLimitUsed: stats.lastRateLimitUsed,
    githubRateLimitRemaining: stats.lastRateLimitRemaining,
    githubRateLimitResetAt: stats.lastRateLimitResetAt,
    issuesFetched: issues.length,
    pullRequestsFetched: pullRequests.length,
    issuesOpened30d: metrics.issuesOpened30d,
    issuesClosed30d: metrics.issuesClosed30d,
    prsOpened30d: metrics.prsOpened30d,
    prsMerged30d: metrics.prsMerged30d,
    prsClosedUnmerged30d: metrics.prsClosedUnmerged30d,
    staleIssuesCount,
    stalePrsCount,
    oldestFetchedIssueCreatedAt:
      issues.map((issue) => issue.createdAt).sort()[0] ?? null,
    oldestFetchedPullRequestCreatedAt:
      pullRequests.map((pr) => pr.createdAt).sort()[0] ?? null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    printUsage();
    process.exit(1);
  }

  const repo = parseRepo(options.repo);
  if (!repo) {
    console.error(`Invalid repo "${options.repo}". Expected <owner>/<repo>.`);
    printUsage();
    process.exit(1);
  }

  const token = process.env['DEV_GITHUB_PAT'];

  if (!token) {
    console.error('DEV_GITHUB_PAT is required in apps/npm-burst/.env.local.');
    process.exit(1);
  }

  try {
    const startedAt = Date.now();
    const result = await fetchGitHubHealthDebugData(
      token,
      repo.owner,
      repo.name,
      { since: options.since }
    );

    if (!result) {
      console.error(`No data returned for ${repo.owner}/${repo.name}.`);
      process.exit(1);
    }

    const summary = summarize(
      result.rawData,
      result.staleIssuesCount,
      result.stalePrsCount,
      options.since,
      Date.now() - startedAt,
      result.stats
    );

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            summary,
            stats: result.stats,
            rawData: result.rawData,
          },
          null,
          2
        )
      );
      return;
    }

    console.table(summary);
  } catch (error) {
    console.error(
      'GitHub fetch failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

void main();
