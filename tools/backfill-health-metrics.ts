/**
 * Recompute the close / merge duration columns on every stored
 * github_health_metrics row from its snapshot's raw_data.
 *
 * raw_data has always carried createdAt / closedAt / mergedAt, so these six
 * columns are recoverable for history. First-response, contributor and
 * backlog-age columns are not — that data was never fetched — and are left
 * untouched.
 *
 * Usage:
 *   pnpm db:backfill-health              # apply to $D1_LOCAL_DB (default apps/npm-burst/local.db)
 *   pnpm db:backfill-health -- --dry-run # count rows only
 *   pnpm db:backfill-health -- --sql     # print UPDATE statements for `wrangler d1 execute --remote --file`
 */
import {
  computeHealthMetrics,
  parseFilterConfig,
  type RawGitHubHealthData,
} from '@npm-burst/github-data-access';
import { decompressJson } from '@npm-burst/shared';
import Database from 'better-sqlite3';
import { CompiledQuery, Kysely, SqliteDialect } from 'kysely';

const dbPath = process.env['D1_LOCAL_DB'] ?? 'apps/npm-burst/local.db';
const printSql = process.argv.includes('--sql');
const dryRun = process.argv.includes('--dry-run');

const COLUMNS = [
  'avg_issue_close_hours',
  'median_issue_close_hours',
  'p95_issue_close_hours',
  'avg_pr_merge_hours',
  'median_pr_merge_hours',
  'p95_pr_merge_hours',
] as const;

interface SnapshotRow {
  id: number;
  snapshot_date: string;
  refreshed_at: string | null;
  raw_data: Uint8Array | string;
}

interface MetricRow {
  id: number;
  filter_config: string | null;
}

function sqlValue(value: number | null): string {
  return value === null ? 'NULL' : String(value);
}

/**
 * Snapshots written before version 2 carry issues without `author` /
 * `comments` and PRs without `reviews`. Close/merge durations don't read
 * those, but computeHealthMetrics iterates them, so fill in the blanks.
 */
function normalizeLegacyRawData(raw: RawGitHubHealthData): RawGitHubHealthData {
  return {
    ...raw,
    repository: {
      ...raw.repository,
      issues: raw.repository.issues.map((issue) => ({
        ...issue,
        author: issue.author ?? null,
        comments: issue.comments ?? [],
      })),
      pullRequests: raw.repository.pullRequests.map((pr) => ({
        ...pr,
        author: pr.author ?? null,
        reviews: pr.reviews ?? [],
      })),
    },
  };
}

async function main() {
  const db = new Kysely<Record<string, unknown>>({
    dialect: new SqliteDialect({ database: new Database(dbPath) }),
  });

  let snapshots = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const snapshotRows = (
      await db.executeQuery(
        CompiledQuery.raw(
          'SELECT id, snapshot_date, refreshed_at, raw_data FROM github_health_snapshots ORDER BY id'
        )
      )
    ).rows as SnapshotRow[];

    for (const snapshot of snapshotRows) {
      snapshots += 1;
      const raw = await decompressJson<RawGitHubHealthData>(snapshot.raw_data);
      if (!raw?.repository) {
        skipped += 1;
        continue;
      }
      const rawData = normalizeLegacyRawData(raw);
      const now = new Date(
        snapshot.refreshed_at ?? `${snapshot.snapshot_date}T23:59:59.000Z`
      );

      const metricRows = (
        await db.executeQuery(
          CompiledQuery.raw(
            'SELECT id, filter_config FROM github_health_metrics WHERE snapshot_id = ?',
            [snapshot.id]
          )
        )
      ).rows as MetricRow[];

      for (const row of metricRows) {
        const metrics = computeHealthMetrics(
          rawData,
          parseFilterConfig(row.filter_config),
          [],
          now
        );
        const values: Record<(typeof COLUMNS)[number], number | null> = {
          avg_issue_close_hours: metrics.avgIssueCloseHours,
          median_issue_close_hours: metrics.medianIssueCloseHours,
          p95_issue_close_hours: metrics.p95IssueCloseHours,
          avg_pr_merge_hours: metrics.avgPrMergeHours,
          median_pr_merge_hours: metrics.medianPrMergeHours,
          p95_pr_merge_hours: metrics.p95PrMergeHours,
        };
        updated += 1;

        if (dryRun) continue;

        if (printSql) {
          const assignments = COLUMNS.map(
            (column) => `${column} = ${sqlValue(values[column])}`
          ).join(', ');
          console.log(
            `UPDATE github_health_metrics SET ${assignments} WHERE id = ${row.id};`
          );
          continue;
        }

        await db.executeQuery(
          CompiledQuery.raw(
            `UPDATE github_health_metrics SET ${COLUMNS.map(
              (column) => `${column} = ?`
            ).join(', ')} WHERE id = ?`,
            [...COLUMNS.map((column) => values[column]), row.id]
          )
        );
      }
    }
  } finally {
    await db.destroy();
  }

  const verb = dryRun
    ? 'would update'
    : printSql
    ? 'emitted SQL for'
    : 'updated';
  console.error(
    `${dbPath}: ${snapshots} snapshots, ${verb} ${updated} metric rows, skipped ${skipped} unreadable snapshots.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
