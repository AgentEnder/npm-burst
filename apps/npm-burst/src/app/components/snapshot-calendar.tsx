import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import styles from './snapshot-calendar.module.scss';

export interface VersionRelease {
  version: string;
  date: string;
}

interface SnapshotCalendarProps {
  snapshotDates: string[];
  selectedDate: string | null;
  versionReleases: VersionRelease[];
  onSelectDate: (date: string) => void;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const NEARBY_DAYS = 7;

interface VersionGroup {
  major: number;
  minors: {
    minor: number;
    releases: VersionRelease[];
  }[];
}

function groupVersions(releases: VersionRelease[]): VersionGroup[] {
  const majors = new Map<number, Map<number, VersionRelease[]>>();

  for (const r of releases) {
    const parts = r.version.split('.');
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);

    if (!majors.has(major)) majors.set(major, new Map());
    const minorMap = majors.get(major)!;
    if (!minorMap.has(minor)) minorMap.set(minor, []);
    minorMap.get(minor)!.push(r);
  }

  const groups: VersionGroup[] = [];
  for (const [major, minorMap] of [...majors.entries()].sort((a, b) => b[0] - a[0])) {
    const minors = [...minorMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([minor, releases]) => ({ minor, releases }));
    groups.push({ major, minors });
  }
  return groups;
}

function findNearestSnapshot(
  releaseDate: string,
  snapshotDates: string[],
  maxDays: number
): string | null {
  const releaseMs = new Date(releaseDate).getTime();
  let best: string | null = null;
  let bestDist = Infinity;

  for (const snap of snapshotDates) {
    const dist = Math.abs(new Date(snap).getTime() - releaseMs);
    const daysDist = dist / (1000 * 60 * 60 * 24);
    if (daysDist <= maxDays && daysDist < bestDist) {
      bestDist = daysDist;
      best = snap;
    }
  }
  return best;
}

export function SnapshotCalendar({
  snapshotDates,
  selectedDate,
  versionReleases,
  onSelectDate,
}: SnapshotCalendarProps) {
  const snapshotSet = useMemo(() => new Set(snapshotDates), [snapshotDates]);

  const snapshotMonths = useMemo(() => {
    const months = new Set<string>();
    for (const d of snapshotDates) {
      months.add(d.slice(0, 7));
    }
    return months;
  }, [snapshotDates]);

  const snapshotYears = useMemo(() => {
    const years = new Set<number>();
    for (const d of snapshotDates) {
      years.add(parseInt(d.slice(0, 4), 10));
    }
    return years;
  }, [snapshotDates]);

  const releaseDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of versionReleases) {
      s.add(r.date);
    }
    return s;
  }, [versionReleases]);

  const initialDate = selectedDate ?? snapshotDates[snapshotDates.length - 1];
  const [year, month] = initialDate
    ? initialDate.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];

  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  const [pickerMode, setPickerMode] = useState<'days' | 'months' | 'years'>('days');
  const [expandedMajors, setExpandedMajors] = useState<Set<number>>(new Set());
  const [expandedMinors, setExpandedMinors] = useState<Set<string>>(new Set());

  const goToPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }, []);

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const formatDate = (day: number) =>
    `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const versionGroups = useMemo(() => groupVersions(versionReleases), [versionReleases]);

  const toggleMajor = useCallback((major: number) => {
    setExpandedMajors((prev) => {
      const next = new Set(prev);
      if (next.has(major)) next.delete(major);
      else next.add(major);
      return next;
    });
  }, []);

  const toggleMinor = useCallback((key: string) => {
    setExpandedMinors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleVersionClick = useCallback(
    (releaseDate: string) => {
      const nearest = findNearestSnapshot(releaseDate, snapshotDates, NEARBY_DAYS);
      if (nearest) {
        onSelectDate(nearest);
      }
      // Always navigate calendar to that month
      const [y, m] = releaseDate.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m);
      setPickerMode('days');
    },
    [snapshotDates, onSelectDate]
  );

  const yearRangeStart = Math.floor(viewYear / 10) * 10 - 1;
  const yearRange = Array.from({ length: 12 }, (_, i) => yearRangeStart + i);

  return (
    <div className={styles.calendarWrapper}>
      <div className={styles.calendar}>
        {pickerMode === 'days' && (
          <>
            <div className={styles.header}>
              <button className={styles.monthNav} onClick={goToPrevMonth}>
                <ChevronLeft size={14} />
              </button>
              <button
                className={styles.headerButton}
                onClick={() => setPickerMode('months')}
              >
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </button>
              <button className={styles.monthNav} onClick={goToNextMonth}>
                <ChevronRight size={14} />
              </button>
            </div>

            <div className={styles.dayLabels}>
              {DAY_LABELS.map((label) => (
                <span key={label} className={styles.dayLabel}>{label}</span>
              ))}
            </div>

            <div className={styles.grid}>
              {days.map((day, i) => {
                if (day === null) {
                  return <span key={`empty-${i}`} className={styles.empty} />;
                }

                const dateStr = formatDate(day);
                const hasSnapshot = snapshotSet.has(dateStr);
                const hasRelease = releaseDateSet.has(dateStr);
                const isSelected = dateStr === selectedDate;

                return (
                  <button
                    key={day}
                    className={`${styles.day} ${hasSnapshot ? styles.hasSnapshot : styles.noSnapshot} ${isSelected ? styles.selected : ''}`}
                    disabled={!hasSnapshot}
                    onClick={() => onSelectDate(dateStr)}
                  >
                    {day}
                    {hasRelease && <span className={styles.releaseDot} />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {pickerMode === 'months' && (
          <>
            <div className={styles.header}>
              <button className={styles.monthNav} onClick={() => setViewYear((y) => y - 1)}>
                <ChevronLeft size={14} />
              </button>
              <button className={styles.headerButton} onClick={() => setPickerMode('years')}>
                {viewYear}
              </button>
              <button className={styles.monthNav} onClick={() => setViewYear((y) => y + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div className={styles.pickerGrid}>
              {MONTH_SHORT.map((name, i) => {
                const key = `${viewYear}-${String(i + 1).padStart(2, '0')}`;
                const hasData = snapshotMonths.has(key);
                const isCurrent = viewMonth === i + 1;
                return (
                  <button
                    key={name}
                    className={`${styles.pickerCell} ${hasData ? styles.hasSnapshot : styles.noSnapshot} ${isCurrent ? styles.selected : ''}`}
                    disabled={!hasData}
                    onClick={() => { setViewMonth(i + 1); setPickerMode('days'); }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {pickerMode === 'years' && (
          <>
            <div className={styles.header}>
              <button className={styles.monthNav} onClick={() => setViewYear((y) => y - 10)}>
                <ChevronLeft size={14} />
              </button>
              <span className={styles.headerLabel}>
                {yearRangeStart + 1}&ndash;{yearRangeStart + 10}
              </span>
              <button className={styles.monthNav} onClick={() => setViewYear((y) => y + 10)}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div className={styles.pickerGrid}>
              {yearRange.map((yr) => {
                const hasData = snapshotYears.has(yr);
                const isCurrent = viewYear === yr;
                return (
                  <button
                    key={yr}
                    className={`${styles.pickerCell} ${hasData ? styles.hasSnapshot : styles.noSnapshot} ${isCurrent ? styles.selected : ''}`}
                    disabled={!hasData}
                    onClick={() => { setViewYear(yr); setPickerMode('months'); }}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className={styles.releasesSidebar}>
        <span className={styles.releasesTitle}>Releases</span>
        {versionGroups.length === 0 ? (
          <span className={styles.releasesEmpty}>No versions</span>
        ) : (
          <div className={styles.releaseTree}>
            {versionGroups.map((group) => {
              const majorExpanded = expandedMajors.has(group.major);
              // A major is "near" if any of its releases have a nearby snapshot
              const majorHasNearby = group.minors.some((m) =>
                m.releases.some((r) => findNearestSnapshot(r.date, snapshotDates, NEARBY_DAYS) !== null)
              );

              return (
                <div key={group.major} className={styles.treeNode}>
                  <button
                    className={`${styles.treeBranch} ${majorHasNearby ? '' : styles.treeMuted}`}
                    onClick={() => toggleMajor(group.major)}
                  >
                    {majorExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>v{group.major}</span>
                  </button>

                  {majorExpanded && group.minors.map((minor) => {
                    const minorKey = `${group.major}.${minor.minor}`;
                    const minorExpanded = expandedMinors.has(minorKey);
                    const minorHasNearby = minor.releases.some(
                      (r) => findNearestSnapshot(r.date, snapshotDates, NEARBY_DAYS) !== null
                    );

                    return (
                      <div key={minorKey} className={styles.treeChild}>
                        <button
                          className={`${styles.treeBranch} ${minorHasNearby ? '' : styles.treeMuted}`}
                          onClick={() => toggleMinor(minorKey)}
                        >
                          {minorExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          <span>v{minorKey}</span>
                        </button>

                        {minorExpanded && minor.releases.map((r) => {
                          const nearest = findNearestSnapshot(r.date, snapshotDates, NEARBY_DAYS);
                          const hasNearby = nearest !== null;

                          return (
                            <button
                              key={r.version}
                              className={`${styles.treeLeaf} ${hasNearby ? '' : styles.treeMuted}`}
                              onClick={() => handleVersionClick(r.date)}
                              title={`${r.version} — ${r.date}`}
                            >
                              <span className={styles.leafVersion}>{r.version}</span>
                              <span className={styles.leafDate}>{r.date.slice(5)}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
