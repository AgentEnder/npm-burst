import * as d3 from 'd3';

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

    // For more colors, use a high-contrast rainbow
    return d3.quantize(d3.interpolateRainbow, count);
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

    // For more colors, use a high-contrast rainbow
    return d3.quantize(d3.interpolateRainbow, count);
  }
}

export function getThemeChartColors(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    return {
      centerFill: '#4ecdc4',
      centerHover: '#95e1d3',
      labelColor: 'rgba(255, 255, 255, 0.95)',
    };
  } else {
    return {
      centerFill: '#2a9d8f',
      centerHover: '#457b9d',
      labelColor: 'rgba(0, 0, 0, 0.87)',
    };
  }
}
