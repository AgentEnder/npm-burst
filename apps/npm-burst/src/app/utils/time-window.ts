export type TimeWindow = '30d' | '90d' | '6mo' | '1y' | 'all';
export type MigrationTimeWindow = '90d' | '180d' | '1y' | 'all';

/**
 * Returns the cutoff date for a given time window relative to today.
 * Returns null for 'all' (no filtering).
 */
export function getTimeWindowCutoff(window: TimeWindow): Date | null {
  if (window === 'all') return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (window) {
    case '30d':
      now.setDate(now.getDate() - 30);
      return now;
    case '90d':
      now.setDate(now.getDate() - 90);
      return now;
    case '6mo':
      now.setMonth(now.getMonth() - 6);
      return now;
    case '1y':
      now.setFullYear(now.getFullYear() - 1);
      return now;
  }
}

/**
 * Returns the max days for a migration time window.
 * Returns null for 'all' (no filtering).
 */
export function getMigrationMaxDays(
  window: MigrationTimeWindow
): number | null {
  switch (window) {
    case '90d':
      return 90;
    case '180d':
      return 180;
    case '1y':
      return 365;
    case 'all':
      return null;
  }
}
