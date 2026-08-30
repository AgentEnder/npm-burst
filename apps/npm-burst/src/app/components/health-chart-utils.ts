/**
 * Which of `count` evenly spaced x-axis positions get a label when only
 * `maxLabels` fit without colliding. Thins by a constant step counted back
 * from the LAST position, so the latest snapshot is always labelled and the
 * gap is uniform; the first position is labelled only if it lands on the
 * step, never squeezed in beside its neighbour.
 */
export function pickAxisLabelIndexes(
  count: number,
  maxLabels: number
): Set<number> {
  const picked = new Set<number>();
  if (count <= 0 || maxLabels <= 0) return picked;
  const step = Math.max(1, Math.ceil(count / maxLabels));
  for (let index = count - 1; index >= 0; index -= step) {
    picked.add(index);
  }
  return picked;
}

/**
 * Text anchor for an axis label so the two ends stay inside the plot instead
 * of centring on the edge and spilling out of the SVG.
 */
export function axisLabelAnchor(
  index: number,
  count: number
): 'start' | 'middle' | 'end' {
  if (count <= 1) return 'middle';
  if (index === 0) return 'start';
  if (index === count - 1) return 'end';
  return 'middle';
}
