import styles from './loading-skeleton.module.scss';

export function LoadingSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.spinner}></div>
      <p className={styles.loadingText}>Loading package data...</p>
      <div className={styles.chartSkeleton}></div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className={styles.tableSkeleton}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={styles.skeletonRow}></div>
      ))}
    </div>
  );
}
