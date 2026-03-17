import { parse } from 'semver';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { Selection } from 'd3';

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
 * Renders vertical dashed release tick lines on a D3 chart group.
 * Accepts a mapping function that converts a date string to an x-coordinate,
 * returning null if the date is outside the visible range.
 */
export function renderReleaseTicks(
  g: Selection<SVGGElement, unknown, null, undefined>,
  releases: VersionRelease[],
  xMap: (date: string) => number | null,
  innerHeight: number,
  theme: string
): void {
  const stroke =
    theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)';
  const labelFill =
    theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';

  for (const vr of releases) {
    const x = xMap(vr.date);
    if (x === null) continue;

    g.append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', stroke)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');

    // Version label at top of tick
    g.append('text')
      .attr('x', x + 4)
      .attr('y', -4)
      .attr('font-size', '9px')
      .attr('fill', labelFill)
      .text(vr.version);
  }
}
