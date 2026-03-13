import { PropsWithChildren } from 'react';
import styles from './card.module.scss';

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ children, className }: CardProps) {
  const cls = className ? `${styles.card} ${className}` : styles.card;
  return <div className={cls}>{children}</div>;
}
