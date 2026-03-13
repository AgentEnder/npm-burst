import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover } from './popover';
import { SnapshotCalendar, type VersionRelease } from './snapshot-calendar';
import styles from './snapshot-controls.module.scss';

interface SnapshotControlsProps {
  currentIndex: number;
  totalSnapshots: number;
  currentDate: string | null; // null = live mode
  snapshotDates: string[];
  versionReleases: VersionRelease[];
  onPrevious: () => void;
  onNext: () => void;
  onLive: () => void;
  onSelectDate: (date: string) => void;
}

export const SnapshotControls = memo(function SnapshotControls({
  currentIndex,
  totalSnapshots,
  currentDate,
  snapshotDates,
  versionReleases,
  onPrevious,
  onNext,
  onLive,
  onSelectDate,
}: SnapshotControlsProps) {
  const isLive = currentDate === null;
  const isAtStart = currentIndex <= 0;
  const isAtEnd = isLive;

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button
          className={styles.navButton}
          onClick={onPrevious}
          disabled={isAtStart}
          title="Previous snapshot"
        >
          <ChevronLeft size={16} />
        </button>

        <Popover
          trigger="click"
          position="below"
          content={
            <SnapshotCalendar
              snapshotDates={snapshotDates}
              selectedDate={currentDate}
              versionReleases={versionReleases}
              onSelectDate={onSelectDate}
            />
          }
        >
          <button className={styles.dateButton}>
            {isLive ? 'Live' : currentDate}
          </button>
        </Popover>

        <button
          className={styles.navButton}
          onClick={onNext}
          disabled={isAtEnd}
          title={isLive ? 'Already at live' : 'Next snapshot'}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <span className={styles.counter}>
        {isLive
          ? `${totalSnapshots} snapshot${
              totalSnapshots !== 1 ? 's' : ''
            } available`
          : `${currentIndex + 1} / ${totalSnapshots}`}
      </span>

      {!isLive && (
        <button className={styles.liveLink} onClick={onLive}>
          View live data
        </button>
      )}
    </div>
  );
});
