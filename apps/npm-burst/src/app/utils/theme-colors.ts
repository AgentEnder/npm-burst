/**
 * Categorical arc colors for the version charts.
 *
 * unslop-ignore -- the wide hue spread here is deliberate and must stay wide.
 * These are qualitative colors identifying *which version* an arc is, and a
 * package under inspection can easily show a large version range at once. A
 * narrow brand-derived ramp would collapse neighbouring versions into
 * indistinguishable neighbours, which is the opposite of what the chart is for.
 * Maximum mutual distinguishability beats palette harmony in this one place.
 *
 * The surrounding chart chrome (center, tooltips, labels) follows the app
 * palette through CSS variables in `styles.scss`.
 */
export function generateThemeColorPalette(
  count: number,
  theme: 'light' | 'dark'
): string[] {
  if (theme === 'dark') {
    // Dark theme: highly saturated, distinct colors with maximum contrast
    const baseColors = [
      '#ff6b6b', // Bright red
      '#4ecdc4', // Bright teal
      '#ffe66d', // Bright yellow
      '#a8e6cf', // Mint green
      '#ff8b94', // Salmon
      '#95e1d3', // Aqua
      '#ffd3b6', // Peach
      '#ffaaa5', // Light coral
      '#a8dadc', // Powder blue
      '#dda15e', // Tan
      '#bc6c25', // Brown
      '#c77dff', // Lavender
      '#7209b7', // Purple
      '#3a0ca3', // Deep blue
      '#f72585', // Hot pink
      '#4cc9f0', // Sky blue
      '#06ffa5', // Bright green
      '#f77f00', // Bright orange
      '#d62828', // Dark red
      '#023e8a', // Navy
    ];

    if (count <= baseColors.length) {
      return baseColors.slice(0, count);
    }

    return spreadHues(count);
  } else {
    // Light theme: Rich, saturated colors that stand out on light background
    const baseColors = [
      '#e63946', // Bright red
      '#2a9d8f', // Teal
      '#f4a261', // Sandy orange
      '#457b9d', // Steel blue
      '#e76f51', // Terracotta
      '#06d6a0', // Bright green
      '#118ab2', // Ocean blue
      '#ffd166', // Golden yellow
      '#ef476f', // Pink red
      '#073b4c', // Dark teal
      '#8338ec', // Vibrant purple
      '#3a86ff', // Bright blue
      '#fb5607', // Bright orange
      '#ff006e', // Hot magenta
      '#8ac926', // Lime green
      '#ffbe0b', // Amber
      '#06aed5', // Cyan
      '#dd1c1a', // Fire red
      '#9381ff', // Periwinkle
      '#06d6a0', // Mint
    ];

    if (count <= baseColors.length) {
      return baseColors.slice(0, count);
    }

    return spreadHues(count);
  }
}

/** Evenly spaced hues for palettes larger than the curated lists. */
function spreadHues(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    hslToHex((i * 360) / count, 0.75, 0.55)
  );
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Applies an alpha channel to a `#rrggbb` color. */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}

/** Assigns palette colors by label position so a label keeps its color. */
export function buildColorMap(
  labels: string[],
  palette: string[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < labels.length; i++) {
    map.set(labels[i], palette[i % palette.length]);
  }
  return map;
}
