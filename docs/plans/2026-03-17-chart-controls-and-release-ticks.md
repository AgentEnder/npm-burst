# Chart Controls & Release Tick Generalization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-view controls (time window, release tick filter, lifecycle filters) and extract a shared `SegmentedControl` component with animated sliding background that replaces all button groups.

**Architecture:** Build a shared `SegmentedControl` React component with an animated pill indicator, then use it to add time-window selectors to each chart view, a release-tick-filter control, and lifecycle-specific filters. Shared D3 utility extracts duplicated release tick rendering. All new state lives in the Zustand app store.

**Tech Stack:** React 18, Zustand, D3, SCSS modules, semver, Vitest + React Testing Library

---

### Task 1: Create `SegmentedControl` Component

**Files:**
- Create: `apps/npm-burst/src/app/components/segmented-control.tsx`
- Create: `apps/npm-burst/src/app/components/segmented-control.module.scss`
- Create: `apps/npm-burst/src/app/components/segmented-control.spec.tsx`

This is the reusable animated button group that replaces all existing button groups in the app. It renders buttons with an absolutely-positioned "pill" div that slides to the active button using CSS `transform: translateX()` + `transition`.

**Step 1: Write the failing test**

```tsx
// segmented-control.spec.tsx
import { render, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './segmented-control';

describe('SegmentedControl', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ];

  it('should render all option labels', () => {
    const { getByText } = render(
      <SegmentedControl options={options} value="a" onChange={() => {}} />
    );
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
    expect(getByText('Gamma')).toBeTruthy();
  });

  it('should call onChange with the new value when clicked', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <SegmentedControl options={options} value="a" onChange={onChange} />
    );
    fireEvent.click(getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('should not call onChange when clicking the active option', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <SegmentedControl options={options} value="a" onChange={onChange} />
    );
    fireEvent.click(getByText('Alpha'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should render an optional label prefix', () => {
    const { getByText } = render(
      <SegmentedControl
        options={options}
        value="a"
        onChange={() => {}}
        label="Group by"
      />
    );
    expect(getByText('Group by')).toBeTruthy();
  });

  it('should render a select dropdown for mobile', () => {
    const { container } = render(
      <SegmentedControl options={options} value="b" onChange={() => {}} />
    );
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe('b');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test npm-burst -- --run --reporter=verbose 2>&1 | tail -30`
Expected: FAIL — `SegmentedControl` module not found

**Step 3: Write the component**

```tsx
// segmented-control.tsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import styles from './segmented-control.module.scss';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export const SegmentedControl = memo(function SegmentedControl<
  T extends string = string,
>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pillStyle, setPillStyle] = useState<{
    width: number;
    transform: string;
  } | null>(null);

  const updatePill = useCallback(() => {
    const container = containerRef.current;
    const activeBtn = buttonRefs.current.get(value);
    if (!container || !activeBtn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setPillStyle({
      width: btnRect.width,
      transform: `translateX(${btnRect.left - containerRect.left}px)`,
    });
  }, [value]);

  useEffect(() => {
    updatePill();
    // Recalculate on resize
    const observer = new ResizeObserver(updatePill);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updatePill, options]);

  return (
    <>
      {/* Desktop: button group with animated pill */}
      <div className={styles.group} ref={containerRef}>
        {/* Animated pill background */}
        {pillStyle && (
          <div
            className={styles.pill}
            style={{
              width: pillStyle.width,
              transform: pillStyle.transform,
            }}
          />
        )}
        {label && <span className={styles.label}>{label}</span>}
        {options.map((opt) => (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(opt.value, el);
              else buttonRefs.current.delete(opt.value);
            }}
            className={`${styles.button} ${value === opt.value ? styles.active : ''}`}
            onClick={() => {
              if (opt.value !== value) onChange(opt.value);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mobile: native select dropdown */}
      <div className={styles.selectWrapper}>
        {label && <span className={styles.selectLabel}>{label}</span>}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={styles.select}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}) as <T extends string = string>(
  props: SegmentedControlProps<T>
) => React.ReactElement;
```

**Step 4: Write the SCSS**

```scss
// segmented-control.module.scss
.group {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 3px;
}

.pill {
  position: absolute;
  top: 3px;
  left: 0;
  height: calc(100% - 6px);
  border-radius: 16px;
  background: linear-gradient(135deg, var(--primary-main), var(--accent-main));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1),
    width 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  z-index: 0;
}

.label {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  padding: 0 8px;
  font-weight: 500;
  white-space: nowrap;
  z-index: 1;
}

.button {
  position: relative;
  z-index: 1;
  padding: 4px 12px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  font-family: var(--font-family);
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  transition: color var(--transition-fast);
  white-space: nowrap;

  &:hover {
    color: var(--text-secondary);
  }
}

.active {
  color: var(--text-primary);

  &:hover {
    color: var(--text-primary);
  }
}

// Mobile select — hidden on desktop
.selectWrapper {
  display: none;
  align-items: center;
  gap: var(--spacing-xs);
}

.selectLabel {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-weight: 500;
  white-space: nowrap;
}

.select {
  appearance: none;
  padding: 6px 28px 6px 12px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  font-family: var(--font-family);
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--primary-main), var(--accent-main));
  border: none;
  border-radius: 18px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);

  &:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
}

@media (max-width: 768px) {
  .group {
    display: none;
  }

  .selectWrapper {
    display: flex;
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx nx test npm-burst -- --run --reporter=verbose 2>&1 | tail -30`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add apps/npm-burst/src/app/components/segmented-control.tsx apps/npm-burst/src/app/components/segmented-control.module.scss apps/npm-burst/src/app/components/segmented-control.spec.tsx
git commit -m "feat: add SegmentedControl component with animated sliding pill"
```

---

### Task 2: Replace Dashboard Header View Mode Tabs with SegmentedControl

**Files:**
- Modify: `apps/npm-burst/src/app/components/dashboard-header.tsx:9-78`
- Modify: `apps/npm-burst/src/app/components/dashboard-header.module.scss:85-165`

**Step 1: Update dashboard-header.tsx**

Replace the VIEW_MODES button group (lines 50-60) and mobile select (lines 63-78) with a single `SegmentedControl`. The `VIEW_MODES` array stays as-is.

```tsx
// Replace lines 50-78 (the viewModeGroup div and viewModeSelect div) with:
<SegmentedControl
  options={VIEW_MODES}
  value={viewMode}
  onChange={setViewMode}
/>
```

Add import at top:
```tsx
import { SegmentedControl } from './segmented-control';
```

**Step 2: Clean up unused SCSS classes**

Remove from `dashboard-header.module.scss`:
- `.viewModeGroup` (lines 85-92)
- `.viewModeSelect`, `.viewModeSelectInput`, `.viewModeSelectIcon` (lines 94-130)
- `.viewModeButton`, `.viewModeActive` (lines 132-165)
- Mobile rules for `.viewModeGroup` and `.viewModeSelect` (lines 386-392)

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/components/dashboard-header.tsx apps/npm-burst/src/app/components/dashboard-header.module.scss
git commit -m "refactor: replace view mode tabs with SegmentedControl"
```

---

### Task 3: Replace Adoption Chart Grouping Buttons with SegmentedControl

**Files:**
- Modify: `apps/npm-burst/src/app/components/version-adoption-chart.tsx:354-365`
- Modify: `apps/npm-burst/src/app/components/version-adoption-chart.module.scss:16-66`

**Step 1: Update version-adoption-chart.tsx**

Replace the grouping selector div (lines 354-365) with:

```tsx
<SegmentedControl
  options={GROUPING_OPTIONS}
  value={grouping}
  onChange={(v) => setGrouping(v as AdoptionGrouping)}
  label="Group by"
/>
```

Add near the top of the file (after GROUPING_LABELS):
```tsx
const GROUPING_OPTIONS = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'patch', label: 'Patch' },
] as const;
```

Add import:
```tsx
import { SegmentedControl } from './segmented-control';
```

**Step 2: Clean up unused SCSS classes**

Remove from `version-adoption-chart.module.scss`:
- `.groupingSelector` (lines 16-24)
- `.groupingLabel` (lines 26-32)
- `.groupingButton` (lines 34-51)
- `.groupingActive` (lines 53-66)
- Mobile rule for `.groupingSelector` (lines 177-179)

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/components/version-adoption-chart.tsx apps/npm-burst/src/app/components/version-adoption-chart.module.scss
git commit -m "refactor: replace adoption grouping buttons with SegmentedControl"
```

---

### Task 4: Add App Store Fields for New Controls

**Files:**
- Modify: `apps/npm-burst/src/app/store/app-store.ts:27-91` (AppState interface)
- Modify: `apps/npm-burst/src/app/store/app-store.ts:110-252` (createStore)

**Step 1: Add new state fields and actions to AppState interface**

Add these fields to the `AppState` interface after the `viewMode` field (line 55):

```typescript
// Chart controls
timeWindow: '30d' | '90d' | '6mo' | '1y' | 'all';
migrationTimeWindow: '90d' | '180d' | '1y' | 'all';
releaseTickFilter: 'major' | 'minor' | 'patch';
lifecycleShowOnlySnapshotted: boolean;
lifecycleMinPeak: number;
```

Add these action signatures after `setViewMode` (line 84):

```typescript
setTimeWindow: (v: '30d' | '90d' | '6mo' | '1y' | 'all') => void;
setMigrationTimeWindow: (v: '90d' | '180d' | '1y' | 'all') => void;
setReleaseTickFilter: (v: 'major' | 'minor' | 'patch') => void;
setLifecycleShowOnlySnapshotted: (v: boolean) => void;
setLifecycleMinPeak: (v: number) => void;
```

**Step 2: Add defaults and action implementations**

Add defaults in the `createStore` call after `viewMode: 'sunburst'`:

```typescript
timeWindow: 'all',
migrationTimeWindow: 'all',
releaseTickFilter: 'major',
lifecycleShowOnlySnapshotted: false,
lifecycleMinPeak: 0,
```

Add implementations after the `setViewMode` action:

```typescript
setTimeWindow: (v) => set({ timeWindow: v }),
setMigrationTimeWindow: (v) => set({ migrationTimeWindow: v }),
setReleaseTickFilter: (v) => set({ releaseTickFilter: v }),
setLifecycleShowOnlySnapshotted: (v) => set({ lifecycleShowOnlySnapshotted: v }),
setLifecycleMinPeak: (v) => set({ lifecycleMinPeak: v }),
```

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/store/app-store.ts
git commit -m "feat: add store fields for time window, release tick filter, lifecycle controls"
```

---

### Task 5: Create Shared Release Tick Utilities

**Files:**
- Create: `apps/npm-burst/src/app/utils/release-ticks.ts`

This utility provides two things:
1. A function to filter `VersionRelease[]` by semver level (major/minor/patch)
2. A D3 rendering function for release tick lines

**Step 1: Write the utility**

```typescript
// release-ticks.ts
import { parse } from 'semver';
import type { VersionRelease } from '../../server/functions/versions.telefunc';
import type { Selection } from 'd3';

export type ReleaseTickLevel = 'major' | 'minor' | 'patch';

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
 * Supports both d3.scaleTime and a custom mapping function for scalePoint charts.
 */
export function renderReleaseTicks(
  g: Selection<SVGGElement, unknown, null, undefined>,
  releases: VersionRelease[],
  xMap: (date: string) => number | null,
  innerHeight: number,
  theme: string
): void {
  const stroke =
    theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

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
  }
}
```

**Step 2: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 3: Commit**

```bash
git add apps/npm-burst/src/app/utils/release-ticks.ts
git commit -m "feat: add shared release tick filter and D3 rendering utilities"
```

---

### Task 6: Create Shared Time Window Filter Utility

**Files:**
- Create: `apps/npm-burst/src/app/utils/time-window.ts`

**Step 1: Write the utility**

```typescript
// time-window.ts
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
export function getMigrationMaxDays(window: MigrationTimeWindow): number | null {
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
```

**Step 2: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 3: Commit**

```bash
git add apps/npm-burst/src/app/utils/time-window.ts
git commit -m "feat: add time window cutoff utilities"
```

---

### Task 7: Wire Up Controls to Adoption Chart

**Files:**
- Modify: `apps/npm-burst/src/app/components/version-adoption-chart.tsx`
- Modify: `apps/npm-burst/src/app/package-dashboard.tsx:131-137`

The adoption chart gets: time window selector + release tick filter. Both read from the app store.

**Step 1: Update package-dashboard.tsx to pass new props**

Add store reads in PackageDashboard:
```typescript
const timeWindow = useAppStore((s) => s.timeWindow);
const setTimeWindow = useAppStore((s) => s.setTimeWindow);
const releaseTickFilter = useAppStore((s) => s.releaseTickFilter);
const setReleaseTickFilter = useAppStore((s) => s.setReleaseTickFilter);
```

Update the adoption chart rendering (lines 131-137):
```tsx
<VersionAdoptionChart
  snapshots={snapshots}
  liveData={liveData}
  versionReleases={versionReleases}
  lowPassFilter={lowPassFilter}
  timeWindow={timeWindow}
  onTimeWindowChange={setTimeWindow}
  releaseTickFilter={releaseTickFilter}
  onReleaseTickFilterChange={setReleaseTickFilter}
/>
```

**Step 2: Update VersionAdoptionChart to accept and use new props**

Add to the props:
```typescript
timeWindow: TimeWindow;
onTimeWindowChange: (v: TimeWindow) => void;
releaseTickFilter: ReleaseTickLevel;
onReleaseTickFilterChange: (v: ReleaseTickLevel) => void;
```

Add imports:
```typescript
import { filterReleasesByLevel, renderReleaseTicks, ReleaseTickLevel } from '../utils/release-ticks';
import { getTimeWindowCutoff, TimeWindow } from '../utils/time-window';
```

**Filter snapshots by time window** — wrap the existing `series` useMemo to pre-filter snapshots:

```typescript
const filteredSnapshots = useMemo(() => {
  const cutoff = getTimeWindowCutoff(timeWindow);
  if (!cutoff) return snapshots;
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return snapshots.filter((s) => s.date >= cutoffStr);
}, [snapshots, timeWindow]);
```

Then pass `filteredSnapshots` instead of `snapshots` to `getVersionAdoptionData`.

**Replace inline release tick rendering** (lines 221-247) with:

```typescript
if (allDates.length >= 2) {
  const firstDate = new Date(allDates[0] + 'T00:00:00');
  const lastDate = new Date(allDates[allDates.length - 1] + 'T00:00:00');
  const timeScale = d3
    .scaleTime()
    .domain([firstDate, lastDate])
    .range([xScale(allDates[0]) ?? 0, xScale(allDates[allDates.length - 1]) ?? innerWidth]);

  const filtered = filterReleasesByLevel(versionReleases, releaseTickFilter);
  renderReleaseTicks(
    g,
    filtered,
    (date) => {
      const vrDate = new Date(date + 'T00:00:00');
      if (vrDate < firstDate || vrDate > lastDate) return null;
      return timeScale(vrDate);
    },
    innerHeight,
    theme
  );
}
```

**Add controls** in the return JSX, in the controls div alongside the grouping selector:

```tsx
<div className={styles.controls}>
  <SegmentedControl
    options={GROUPING_OPTIONS}
    value={grouping}
    onChange={(v) => setGrouping(v as AdoptionGrouping)}
    label="Group by"
  />
  <SegmentedControl
    options={TIME_WINDOW_OPTIONS}
    value={timeWindow}
    onChange={onTimeWindowChange}
    label="Window"
  />
  <SegmentedControl
    options={RELEASE_TICK_OPTIONS}
    value={releaseTickFilter}
    onChange={onReleaseTickFilterChange}
    label="Releases"
  />
  <div className={styles.visibilityControls}>
    {/* existing visibility buttons */}
  </div>
</div>
```

Define the option arrays at the top of the file:
```typescript
const TIME_WINDOW_OPTIONS = [
  { value: '30d' as const, label: '30d' },
  { value: '90d' as const, label: '90d' },
  { value: '6mo' as const, label: '6mo' },
  { value: '1y' as const, label: '1y' },
  { value: 'all' as const, label: 'All' },
];

const RELEASE_TICK_OPTIONS = [
  { value: 'major' as const, label: 'Major' },
  { value: 'minor' as const, label: 'Minor' },
  { value: 'patch' as const, label: 'Patch' },
];
```

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/components/version-adoption-chart.tsx apps/npm-burst/src/app/package-dashboard.tsx
git commit -m "feat: add time window and release tick filter to adoption chart"
```

---

### Task 8: Wire Up Controls to Volume Chart

**Files:**
- Modify: `apps/npm-burst/src/app/components/download-volume-chart.tsx`
- Modify: `apps/npm-burst/src/app/package-dashboard.tsx`

Volume chart gets: time window selector + release tick filter. Currently has zero controls.

**Step 1: Update package-dashboard.tsx**

Update the volume chart rendering:
```tsx
<DownloadVolumeChart
  totalDownloads={totalDownloads}
  versionReleases={versionReleases}
  timeWindow={timeWindow}
  onTimeWindowChange={setTimeWindow}
  releaseTickFilter={releaseTickFilter}
  onReleaseTickFilterChange={setReleaseTickFilter}
/>
```

**Step 2: Update DownloadVolumeChart**

Add new props to the component:
```typescript
timeWindow: TimeWindow;
onTimeWindowChange: (v: TimeWindow) => void;
releaseTickFilter: ReleaseTickLevel;
onReleaseTickFilterChange: (v: ReleaseTickLevel) => void;
```

Add imports:
```typescript
import { filterReleasesByLevel, renderReleaseTicks, ReleaseTickLevel } from '../utils/release-ticks';
import { getTimeWindowCutoff, TimeWindow } from '../utils/time-window';
import { SegmentedControl } from './segmented-control';
```

**Filter volumeData by time window:**
```typescript
const filteredVolumeData = useMemo(() => {
  const cutoff = getTimeWindowCutoff(timeWindow);
  if (!cutoff) return volumeData;
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return volumeData.filter((d) => d.date >= cutoffStr);
}, [volumeData, timeWindow]);
```

Use `filteredVolumeData` instead of `volumeData` in all D3 rendering.

**Replace inline release tick rendering** (lines 132-150) with:
```typescript
const filtered = filterReleasesByLevel(versionReleases, releaseTickFilter);
renderReleaseTicks(
  g,
  filtered,
  (date) => {
    const vrDate = parseDate(date);
    if (vrDate < domainStart || vrDate > domainEnd) return null;
    return xScale(vrDate);
  },
  innerHeight,
  theme
);
```

**Add controls section** before the chart div in the return:
```tsx
<div className={styles.controls}>
  <SegmentedControl
    options={TIME_WINDOW_OPTIONS}
    value={timeWindow}
    onChange={onTimeWindowChange}
    label="Window"
  />
  <SegmentedControl
    options={RELEASE_TICK_OPTIONS}
    value={releaseTickFilter}
    onChange={onReleaseTickFilterChange}
    label="Releases"
  />
</div>
```

Add a `.controls` class to `download-volume-chart.module.scss`:
```scss
.controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .controls {
    flex-direction: column;
    align-items: stretch;
  }
}
```

Define the same option arrays (TIME_WINDOW_OPTIONS, RELEASE_TICK_OPTIONS) at the top.

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/components/download-volume-chart.tsx apps/npm-burst/src/app/components/download-volume-chart.module.scss apps/npm-burst/src/app/package-dashboard.tsx
git commit -m "feat: add time window and release tick filter to volume chart"
```

---

### Task 9: Wire Up Controls to Migration Chart

**Files:**
- Modify: `apps/npm-burst/src/app/components/migration-velocity-chart.tsx`
- Modify: `apps/npm-burst/src/app/components/migration-velocity-chart.module.scss`
- Modify: `apps/npm-burst/src/app/package-dashboard.tsx`

Migration chart gets: migration time window (days-based, not calendar).

**Step 1: Update package-dashboard.tsx**

Add store reads:
```typescript
const migrationTimeWindow = useAppStore((s) => s.migrationTimeWindow);
const setMigrationTimeWindow = useAppStore((s) => s.setMigrationTimeWindow);
```

Update migration chart rendering:
```tsx
<MigrationVelocityChart
  snapshots={snapshots}
  liveData={liveData}
  versionReleases={versionReleases}
  migrationTimeWindow={migrationTimeWindow}
  onMigrationTimeWindowChange={setMigrationTimeWindow}
/>
```

**Step 2: Update MigrationVelocityChart**

Add new props:
```typescript
migrationTimeWindow: MigrationTimeWindow;
onMigrationTimeWindowChange: (v: MigrationTimeWindow) => void;
```

Add imports:
```typescript
import { getMigrationMaxDays, MigrationTimeWindow } from '../utils/time-window';
import { SegmentedControl } from './segmented-control';
```

**Cap the X-axis domain** by the migration time window. In the D3 `useEffect`, after computing `maxDays`:
```typescript
const windowMaxDays = getMigrationMaxDays(migrationTimeWindow);
const effectiveMaxDays = windowMaxDays !== null ? Math.min(maxDays, windowMaxDays) : maxDays;
// Use effectiveMaxDays for xScale domain instead of maxDays
```

Also filter out points beyond the window when drawing lines:
```typescript
const cappedSeries = visibleSeries.map((s) => ({
  ...s,
  points: windowMaxDays !== null
    ? s.points.filter((p) => p.daysSinceRelease <= windowMaxDays)
    : s.points,
}));
// Use cappedSeries for rendering instead of visibleSeries
```

**Add controls section** before the chart div:
```tsx
<div className={styles.controls}>
  <SegmentedControl
    options={MIGRATION_WINDOW_OPTIONS}
    value={migrationTimeWindow}
    onChange={onMigrationTimeWindowChange}
    label="Window"
  />
</div>
```

Define options:
```typescript
const MIGRATION_WINDOW_OPTIONS = [
  { value: '90d' as const, label: '90d' },
  { value: '180d' as const, label: '180d' },
  { value: '1y' as const, label: '1y' },
  { value: 'all' as const, label: 'All' },
];
```

Add `.controls` class to `migration-velocity-chart.module.scss` (same pattern as volume chart).

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/components/migration-velocity-chart.tsx apps/npm-burst/src/app/components/migration-velocity-chart.module.scss apps/npm-burst/src/app/package-dashboard.tsx
git commit -m "feat: add migration time window control to migration chart"
```

---

### Task 10: Wire Up Controls to Lifecycle Chart

**Files:**
- Modify: `apps/npm-burst/src/app/components/version-lifecycle-chart.tsx`
- Modify: `apps/npm-burst/src/app/components/version-lifecycle-chart.module.scss`
- Modify: `apps/npm-burst/src/app/package-dashboard.tsx`

Lifecycle chart gets: time window, pre-snapshot filter toggle, min peak filter. The threshold slider stays as-is (it's internal state).

**Step 1: Update package-dashboard.tsx**

Add store reads:
```typescript
const lifecycleShowOnlySnapshotted = useAppStore((s) => s.lifecycleShowOnlySnapshotted);
const setLifecycleShowOnlySnapshotted = useAppStore((s) => s.setLifecycleShowOnlySnapshotted);
const lifecycleMinPeak = useAppStore((s) => s.lifecycleMinPeak);
const setLifecycleMinPeak = useAppStore((s) => s.setLifecycleMinPeak);
```

Update lifecycle chart rendering:
```tsx
<VersionLifecycleChart
  snapshots={snapshots}
  liveData={liveData}
  versionReleases={versionReleases}
  timeWindow={timeWindow}
  onTimeWindowChange={setTimeWindow}
  showOnlySnapshotted={lifecycleShowOnlySnapshotted}
  onShowOnlySnapshottedChange={setLifecycleShowOnlySnapshotted}
  minPeak={lifecycleMinPeak}
  onMinPeakChange={setLifecycleMinPeak}
/>
```

**Step 2: Update VersionLifecycleChart**

Add new props:
```typescript
timeWindow: TimeWindow;
onTimeWindowChange: (v: TimeWindow) => void;
showOnlySnapshotted: boolean;
onShowOnlySnapshottedChange: (v: boolean) => void;
minPeak: number;
onMinPeakChange: (v: number) => void;
```

Add imports:
```typescript
import { getTimeWindowCutoff, TimeWindow } from '../utils/time-window';
import { SegmentedControl } from './segmented-control';
```

**Filter milestones:**
```typescript
const filteredMilestones = useMemo(() => {
  let result = milestones;

  // Filter by time window (hide versions whose bars fall entirely outside the window)
  const cutoff = getTimeWindowCutoff(timeWindow);
  if (cutoff) {
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    result = result.filter((m) => {
      // Keep if release date is within window, or if the version is still active past cutoff
      return m.releaseDate >= cutoffStr || m.stillAboveThreshold || (m.droppedBelowDate && m.droppedBelowDate >= cutoffStr);
    });
  }

  // Filter pre-snapshot versions
  if (showOnlySnapshotted && snapshots.length > 0) {
    const earliestSnapshot = snapshots[0].date;
    result = result.filter((m) => m.releaseDate >= earliestSnapshot);
  }

  // Filter by min peak
  if (minPeak > 0) {
    result = result.filter((m) => m.peakPercent >= minPeak);
  }

  return result;
}, [milestones, timeWindow, showOnlySnapshotted, snapshots, minPeak]);
```

Use `filteredMilestones` instead of `milestones` in all D3 rendering and the empty check.

**Update controls section** (replace lines 296-314):
```tsx
<div className={styles.controls}>
  <SegmentedControl
    options={TIME_WINDOW_OPTIONS}
    value={timeWindow}
    onChange={onTimeWindowChange}
    label="Window"
  />
  <div className={styles.thresholdGroup}>
    <span className={styles.thresholdLabel}>Threshold</span>
    <input
      type="number"
      step={5}
      min={1}
      max={100}
      value={threshold}
      onChange={(e) => {
        const val = e.target.valueAsNumber;
        if (!Number.isNaN(val) && val > 0 && val <= 100)
          setThreshold(val);
      }}
      className={styles.thresholdInput}
    />
    <span className={styles.thresholdSuffix}>%</span>
  </div>
  <div className={styles.thresholdGroup}>
    <span className={styles.thresholdLabel}>Min peak</span>
    <input
      type="number"
      step={5}
      min={0}
      max={100}
      value={minPeak}
      onChange={(e) => {
        const val = e.target.valueAsNumber;
        if (!Number.isNaN(val) && val >= 0 && val <= 100)
          onMinPeakChange(val);
      }}
      className={styles.thresholdInput}
    />
    <span className={styles.thresholdSuffix}>%</span>
  </div>
  <label className={styles.checkboxLabel}>
    <input
      type="checkbox"
      checked={showOnlySnapshotted}
      onChange={(e) => onShowOnlySnapshottedChange(e.target.checked)}
      className={styles.checkbox}
    />
    Only tracked versions
  </label>
</div>
```

**Add checkbox styles** to `version-lifecycle-chart.module.scss`:
```scss
.checkboxLabel {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  white-space: nowrap;
  font-weight: 500;
  transition: border-color var(--transition-fast);

  &:hover {
    border-color: var(--primary-main);
  }
}

.checkbox {
  accent-color: var(--primary-main);
  margin: 0;
}
```

Define TIME_WINDOW_OPTIONS at the top (same as adoption/volume).

**Step 3: Verify build passes**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 4: Commit**

```bash
git add apps/npm-burst/src/app/components/version-lifecycle-chart.tsx apps/npm-burst/src/app/components/version-lifecycle-chart.module.scss apps/npm-burst/src/app/package-dashboard.tsx
git commit -m "feat: add time window, pre-snapshot filter, and min peak filter to lifecycle chart"
```

---

### Task 11: Final Cleanup and Verification

**Files:**
- Verify all modified files
- Run full test suite and build

**Step 1: Run all tests**

Run: `npx nx test npm-burst -- --run --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS

**Step 2: Run build**

Run: `npx nx build npm-burst 2>&1 | tail -5`
Expected: "Successfully ran target build"

**Step 3: Verify no unused imports or dead code**

Check that no old button group styles remain in dashboard-header.module.scss or version-adoption-chart.module.scss that are now unused.

**Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: cleanup unused styles after SegmentedControl migration"
```
