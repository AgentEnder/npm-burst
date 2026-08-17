import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

const NOW = new Date('2026-08-17T12:00:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

describe('formatRelativeTime', () => {
  it('reports sub-minute gaps as just now', () => {
    expect(formatRelativeTime(minutesAgo(0), NOW)).toBe('just now');
    expect(formatRelativeTime(minutesAgo(0.5), NOW)).toBe('just now');
  });

  it('reports minutes, singular and plural', () => {
    expect(formatRelativeTime(minutesAgo(1), NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(minutesAgo(42), NOW)).toBe('42 minutes ago');
  });

  it('reports hours once past an hour', () => {
    expect(formatRelativeTime(minutesAgo(60), NOW)).toBe('1 hour ago');
    expect(formatRelativeTime(minutesAgo(60 * 5 + 30), NOW)).toBe(
      '5 hours ago'
    );
  });

  it('reports days once past a day', () => {
    expect(formatRelativeTime(minutesAgo(60 * 24), NOW)).toBe('1 day ago');
    expect(formatRelativeTime(minutesAgo(60 * 24 * 12), NOW)).toBe(
      '12 days ago'
    );
  });

  it('falls back to a calendar date beyond 30 days', () => {
    const old = new Date('2026-01-05T08:00:00.000Z').toISOString();
    expect(formatRelativeTime(old, NOW)).toBe(
      new Date(old).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    );
  });

  it('does not report future timestamps as negative durations', () => {
    expect(formatRelativeTime(minutesAgo(-30), NOW)).toBe('just now');
  });

  it('returns null for missing or unparseable timestamps', () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime('not a date', NOW)).toBeNull();
  });
});
