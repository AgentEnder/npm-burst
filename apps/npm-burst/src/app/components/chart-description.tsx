import styles from './chart-description.module.scss';

/**
 * Renders a concise chart description. Pass an array of short fragments
 * that will be joined with dot separators for easy scanning.
 */
export function ChartDescription({ parts }: { parts: string[] }) {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {filtered.map((part, i) => (
        <span key={i} className={i === 0 ? styles.summary : styles.detail}>
          {i > 0 && <span className={styles.separator} />}
          {part}
        </span>
      ))}
    </div>
  );
}
