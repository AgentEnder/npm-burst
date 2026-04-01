import styles from './chart-description.module.scss';

export function ChartDescription({ children }: { children: React.ReactNode }) {
  return <p className={styles.description}>{children}</p>;
}
