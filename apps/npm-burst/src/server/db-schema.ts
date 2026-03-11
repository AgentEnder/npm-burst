import { Generated } from 'kysely';

export interface Database {
  tracked_packages: TrackedPackagesTable;
  user_tracked_packages: UserTrackedPackagesTable;
  snapshots: SnapshotsTable;
}

interface TrackedPackagesTable {
  id: Generated<number>;
  package_name: string;
  created_at: Generated<string>;
}

interface UserTrackedPackagesTable {
  user_id: string;
  package_id: number;
}

interface SnapshotsTable {
  id: Generated<number>;
  package_id: number;
  snapshot_date: string;
  downloads: string; // JSON string
}
