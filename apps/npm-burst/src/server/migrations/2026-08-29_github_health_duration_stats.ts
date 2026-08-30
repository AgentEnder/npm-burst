import { Kysely, sql } from 'kysely';

// Average and P95 companions to the median close / merge columns, plus
// backlog age (how long currently-open items have been open). All nullable:
// null means "not computable for this snapshot", never zero.
const COLUMNS = [
  'avg_issue_close_hours',
  'p95_issue_close_hours',
  'avg_pr_merge_hours',
  'p95_pr_merge_hours',
  'avg_issue_age_hours',
  'p95_issue_age_hours',
  'avg_pr_age_hours',
  'p95_pr_age_hours',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  for (const column of COLUMNS) {
    await sql`
      ALTER TABLE github_health_metrics
      ADD COLUMN ${sql.ref(column)} REAL
    `.execute(db);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const column of [...COLUMNS].reverse()) {
    await sql`
      ALTER TABLE github_health_metrics
      DROP COLUMN ${sql.ref(column)}
    `.execute(db);
  }
}
