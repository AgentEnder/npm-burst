import { PropsWithChildren } from 'react';
import styles from './card.module.scss';

export function Card({ children }: PropsWithChildren) {
  return <div className={styles.card}>{children}</div>;
}
