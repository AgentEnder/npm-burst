/**
 * The Npm Burst mark: three unequal segments of a ring, with the dominant one
 * breaking out past the others.
 *
 * It is the product reduced to one glyph — a version distribution rather than
 * an evenly divided pie, and a share surging past the rest, which is the thing
 * the charts exist to show. The centre is open and the segments are few
 * because the binding constraint is the 16px favicon; anything finer turns to
 * mush at that size.
 *
 * Geometry is shared with `public/favicon.svg` — change both together.
 *
 * Decorative: every use so far sits beside the wordmark, so it is hidden from
 * assistive tech rather than duplicating the text next to it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      focusable="false"
    >
      <path d="M15.48 1.01A15.0 15.0 0 0 1 24.39 28.44L20.25 22.30A7.6 7.6 0 0 0 15.73 8.40Z" />
      <path d="M19.31 27.54A12.0 12.0 0 0 1 4.12 17.67L8.47 17.06A7.6 7.6 0 0 0 18.09 23.31Z" />
      <path d="M4.18 13.92A12.0 12.0 0 0 1 11.50 4.87L13.15 8.95A7.6 7.6 0 0 0 8.52 14.68Z" />
    </svg>
  );
}
