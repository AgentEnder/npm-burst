import { describe, expect, it } from 'vitest';
import { toIsoTimestamp } from './utils';

describe('toIsoTimestamp', () => {
  it('treats SQLite datetime() output as UTC', () => {
    // SQLite's datetime('now') has no zone marker; JS would otherwise parse it
    // as local time and shift the value by the machine's offset.
    expect(toIsoTimestamp('2026-08-17 11:13:54')).toBe(
      '2026-08-17T11:13:54.000Z'
    );
  });

  it('passes ISO timestamps through unchanged in value', () => {
    expect(toIsoTimestamp('2026-08-17T11:13:54.000Z')).toBe(
      '2026-08-17T11:13:54.000Z'
    );
  });

  it('normalizes offset timestamps to UTC', () => {
    expect(toIsoTimestamp('2026-08-17T13:13:54.000+02:00')).toBe(
      '2026-08-17T11:13:54.000Z'
    );
  });

  it('returns null for missing or unparseable values', () => {
    expect(toIsoTimestamp(null)).toBeNull();
    expect(toIsoTimestamp(undefined)).toBeNull();
    expect(toIsoTimestamp('')).toBeNull();
    expect(toIsoTimestamp('whenever')).toBeNull();
  });
});
