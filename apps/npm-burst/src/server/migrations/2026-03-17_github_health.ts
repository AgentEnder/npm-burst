import { Kysely, sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE github_installations (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      installation_id        INTEGER NOT NULL UNIQUE,
      owner                  TEXT NOT NULL,
      owner_type             TEXT NOT NULL CHECK(owner_type IN ('Organization', 'User')),
      encrypted_access_token BLOB,
      token_expires_at       TEXT,
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_gh_installations_owner ON github_installations(owner)
  `.execute(db);

  await sql`
    CREATE TABLE github_repos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      installation_id INTEGER REFERENCES github_installations(id) ON DELETE SET NULL,
      owner           TEXT NOT NULL,
      name            TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (owner, name)
    )
  `.execute(db);

  await sql`
    CREATE TABLE github_repo_packages (
      repo_id                INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
      package_name           TEXT NOT NULL,
      filter_config          TEXT,
      is_maintainer_override INTEGER NOT NULL DEFAULT 0,
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (repo_id, package_name)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_gh_repo_packages_pkg ON github_repo_packages(package_name)
  `.execute(db);

  await sql`
    CREATE TABLE github_health_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id       INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      raw_data      TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (repo_id, snapshot_date)
    )
  `.execute(db);

  await sql`
    CREATE TABLE github_health_metrics (
      id                                INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id                       INTEGER NOT NULL REFERENCES github_health_snapshots(id) ON DELETE CASCADE,
      repo_id                           INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
      filter_config                     TEXT,
      issues_opened_30d                 INTEGER NOT NULL DEFAULT 0,
      issues_closed_30d                 INTEGER NOT NULL DEFAULT 0,
      prs_opened_30d                    INTEGER NOT NULL DEFAULT 0,
      prs_merged_30d                    INTEGER NOT NULL DEFAULT 0,
      prs_closed_unmerged_30d           INTEGER NOT NULL DEFAULT 0,
      median_issue_first_response_hours REAL,
      median_issue_close_hours          REAL,
      median_pr_first_review_hours      REAL,
      median_pr_merge_hours             REAL,
      active_contributors_30d           INTEGER NOT NULL DEFAULT 0,
      stale_issues_count                INTEGER NOT NULL DEFAULT 0,
      created_at                        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_gh_health_metrics_repo_filter
    ON github_health_metrics(repo_id, filter_config)
  `.execute(db);

  await sql`
    CREATE TABLE github_bot_patterns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type  TEXT NOT NULL CHECK(pattern_type IN ('username', 'email', 'username_suffix')),
      pattern_value TEXT NOT NULL,
      created_by    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (pattern_type, pattern_value)
    )
  `.execute(db);

  await sql`
    INSERT INTO github_bot_patterns (pattern_type, pattern_value, created_by)
    VALUES ('username_suffix', '[bot]', 'system')
  `.execute(db);

  await sql`
    INSERT INTO github_bot_patterns (pattern_type, pattern_value, created_by)
    VALUES ('email', 'noreply@github.com', 'system')
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('github_bot_patterns').execute();
  await db.schema.dropTable('github_health_metrics').execute();
  await db.schema.dropTable('github_health_snapshots').execute();
  await db.schema.dropTable('github_repo_packages').execute();
  await db.schema.dropTable('github_repos').execute();
  await db.schema.dropTable('github_installations').execute();
}
