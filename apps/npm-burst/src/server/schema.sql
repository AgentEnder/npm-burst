CREATE TABLE IF NOT EXISTS tracked_packages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT UNIQUE NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_tracked_packages (
  user_id    TEXT NOT NULL,
  package_id INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, package_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id    INTEGER NOT NULL REFERENCES tracked_packages(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  downloads     TEXT NOT NULL,
  UNIQUE (package_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_package_date ON snapshots(package_id, snapshot_date);
