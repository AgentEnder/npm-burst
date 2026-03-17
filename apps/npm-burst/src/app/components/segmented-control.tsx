import { memo, useCallback, useEffect, useRef, useState } from 'react';
import styles from './segmented-control.module.scss';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentedControlOption<T>[];
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
      <div
        className={styles.group}
        ref={containerRef}
        role="radiogroup"
        aria-label={label}
      >
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
        {label && <span className={styles.label} aria-hidden="true">{label}</span>}
        {options.map((opt) => (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(opt.value, el);
              else buttonRefs.current.delete(opt.value);
            }}
            role="radio"
            aria-checked={value === opt.value}
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
        <span className={styles.selectChevron} aria-hidden="true">▾</span>
      </div>
    </>
  );
}) as <T extends string = string>(
  props: SegmentedControlProps<T>
) => React.ReactElement;
