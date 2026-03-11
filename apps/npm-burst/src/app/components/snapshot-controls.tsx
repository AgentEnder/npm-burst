import { memo } from 'react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import styles from './snapshot-controls.module.scss';

interface SnapshotControlsProps {
  currentIndex: number;
  totalSnapshots: number;
  currentDate: string | null; // null = live mode
  onPrevious: () => void;
  onNext: () => void;
  onLive: () => void;
}

export const SnapshotControls = memo(function SnapshotControls({
  currentIndex,
  totalSnapshots,
  currentDate,
  onPrevious,
  onNext,
  onLive,
}: SnapshotControlsProps) {
  const isLive = currentDate === null;
  const isAtStart = currentIndex <= 0;
  const isAtEnd = isLive;

  return (
    <div className={styles.controls}>
      <button
        className={styles.navButton}
        onClick={onPrevious}
        disabled={isAtStart}
        title="Previous snapshot"
      >
        <ChevronLeft size={16} />
      </button>

      <span className={styles.dateLabel}>
        {isLive ? 'Live' : currentDate}
      </span>

      <button
        className={styles.navButton}
        onClick={onNext}
        disabled={isAtEnd}
        title={isLive ? 'Already at live' : 'Next snapshot'}
      >
        <ChevronRight size={16} />
      </button>

      {!isLive && (
        <button
          className={styles.liveButton}
          onClick={onLive}
          title="Return to live data"
        >
          <Zap size={16} />
          Live
        </button>
      )}

      <span className={styles.counter}>
        {isLive
          ? `${totalSnapshots} snapshot${totalSnapshots !== 1 ? 's' : ''} available`
          : `${currentIndex + 1} / ${totalSnapshots}`}
      </span>
    </div>
  );
});
