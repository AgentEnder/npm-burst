const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * Human-readable "time since" label, falling back to a calendar date once the
 * gap is wide enough that "37 days ago" stops being useful.
 * Returns null when the timestamp is missing or unparseable so callers can
 * decide what to render in its place.
 */
export function formatRelativeTime(
  timestamp: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!timestamp) return null;

  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;

  // Clock skew between the worker and the browser can put a fresh snapshot
  // slightly in the future; clamp rather than render "-1 minutes ago".
  const elapsed = Math.max(0, now.getTime() - then);

  if (elapsed < MINUTE_IN_MS) return 'just now';
  if (elapsed < HOUR_IN_MS) {
    return pluralize(Math.floor(elapsed / MINUTE_IN_MS), 'minute');
  }
  if (elapsed < DAY_IN_MS) {
    return pluralize(Math.floor(elapsed / HOUR_IN_MS), 'hour');
  }
  if (elapsed < 30 * DAY_IN_MS) {
    return pluralize(Math.floor(elapsed / DAY_IN_MS), 'day');
  }

  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Absolute label for the tooltip/title behind a relative timestamp. */
export function formatAbsoluteTime(
  timestamp: string | null | undefined
): string | null {
  if (!timestamp) return null;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;
  return new Date(then).toLocaleString();
}
