import { parse } from 'semver';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import { ruleX, text } from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { parseDay } from './chart-kit';

export type ReleaseTickLevel = 'major' | 'minor' | 'patch';

export const RELEASE_TICK_OPTIONS = [
  { value: 'major' as const, label: 'Major' },
  { value: 'minor' as const, label: 'Minor' },
  { value: 'patch' as const, label: 'Patch' },
] as const;

/**
 * Filters version releases by semver level.
 * - 'major': only X.0.0 releases
 * - 'minor': only X.Y.0 releases (includes majors)
 * - 'patch': all releases
 */
export function filterReleasesByLevel(
  releases: VersionRelease[],
  level: ReleaseTickLevel
): VersionRelease[] {
  if (level === 'patch') return releases;

  return releases.filter((vr) => {
    const parsed = parse(vr.version);
    if (!parsed) return false;
    if (level === 'major') return parsed.minor === 0 && parsed.patch === 0;
    // 'minor'
    return parsed.patch === 0;
  });
}

/**
 * Dashed vertical rules with version labels for releases inside `domain`.
 * Labels sit at `labelY` in data space, normally the top of the y domain.
 */
export function releaseTickMarks(
  releases: VersionRelease[],
  domain: readonly [Date, Date],
  labelY: number
) {
  const [start, end] = domain;
  const visible = releases
    .map((release) => ({
      version: release.version,
      date: parseDay(release.date),
    }))
    .filter(({ date }) => date >= start && date <= end);

  return [
    decorative(
      ruleX(visible, {
        id: 'release-ticks',
        x: 'date',
        stroke: 'currentColor',
        strokeOpacity: 0.45,
        strokeWidth: 1,
        strokeDasharray: '4 3',
      })
    ),
    decorative(
      text(visible, {
        id: 'release-labels',
        x: 'date',
        y: () => labelY,
        text: 'version',
        fill: 'currentColor',
        fontSize: 9,
        anchor: 'start',
        dx: 4,
        dy: -4,
      })
    ),
  ];
}
