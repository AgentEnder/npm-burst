export function getYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Normalize a stored timestamp to ISO-8601 UTC.
 *
 * Rows written by SQLite's `datetime('now')` default look like
 * "2026-08-17 11:13:54" — UTC, but with no zone marker, so JS would parse them
 * as local time. Rows written by application code are already ISO.
 */
export function toIsoTimestamp(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
