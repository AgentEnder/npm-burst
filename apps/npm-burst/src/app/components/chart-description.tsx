import styles from './chart-description.module.scss';

export function ChartDescription({ children }: { children: React.ReactNode }) {
  return <div className={styles.description}>{children}</div>;
}
