import { memo } from 'react';
import { satisfies, validRange } from 'semver';
import styles from './version-filter-bar.module.scss';

export interface VersionFilterMatch {
  matchingLabels: Set<string>;
  isRangeActive: boolean;
  query: string;
}

function labelToRepresentativeVersion(label: string): string | null {
  const stripped = label.startsWith('v') ? label.slice(1) : label;
  const parts = stripped.split('.');
  if (parts.length === 0) return null;
  while (parts.length < 3) parts.push('0');
  const candidate = parts.slice(0, 3).join('.');
  return /^\d+\.\d+\.\d+$/.test(candidate) ? candidate : null;
}

export function matchVersionFilter(
  labels: string[],
  input: string
): VersionFilterMatch {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      matchingLabels: new Set(labels),
      isRangeActive: false,
      query: '',
    };
  }
  const range = validRange(trimmed);
  const matching = new Set<string>();
  if (range) {
    for (const label of labels) {
      const repr = labelToRepresentativeVersion(label);
      if (!repr) continue;
      try {
        if (satisfies(repr, range)) matching.add(label);
      } catch {
        // ignore — semver shouldn't throw on a parsed range, but be defensive
      }
    }
  } else {
    const lower = trimmed.toLowerCase();
    for (const label of labels) {
      if (label.toLowerCase().includes(lower)) matching.add(label);
    }
  }
  return { matchingLabels: matching, isRangeActive: range !== null, query: trimmed };
}

export interface VersionFilterBarProps {
  value: string;
  onChange: (value: string) => void;
  totalCount: number;
  matchingCount: number;
  isRangeActive: boolean;
  /** Optional — omit both to hide the button group entirely. */
  onShowMatching?: () => void;
  onHideMatching?: () => void;
}

export const VersionFilterBar = memo(function VersionFilterBar({
  value,
  onChange,
  totalCount,
  matchingCount,
  isRangeActive,
  onShowMatching,
  onHideMatching,
}: VersionFilterBarProps) {
  const placeholder = `Filter ${totalCount} version${
    totalCount === 1 ? '' : 's'
  } — substring or semver range (^22, ~1.2, >=3 <4)`;
  const showCount = value.trim().length > 0;
  const buttonsDisabled = matchingCount === 0;

  return (
    <div className={styles.bar}>
      <div className={styles.inputWrap}>
        <input
          type="search"
          className={`${styles.input} ${
            isRangeActive ? styles.inputRange : ''
          }`}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Filter versions by name or semver range"
        />
        {isRangeActive ? (
          <span className={styles.rangeHint} title="Treated as a semver range">
            range
          </span>
        ) : null}
      </div>
      {showCount ? (
        <span className={styles.matchCount}>
          {matchingCount} / {totalCount} match
          {matchingCount === 1 ? '' : 'es'}
        </span>
      ) : null}
      {onShowMatching || onHideMatching ? (
        <div className={styles.buttons}>
          {onShowMatching ? (
            <button
              type="button"
              className={styles.button}
              onClick={onShowMatching}
              disabled={buttonsDisabled}
            >
              Show all
            </button>
          ) : null}
          {onHideMatching ? (
            <button
              type="button"
              className={styles.button}
              onClick={onHideMatching}
              disabled={buttonsDisabled}
            >
              Hide all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
