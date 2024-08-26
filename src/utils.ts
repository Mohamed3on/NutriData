import { ColorThresholds } from './types';

// source: i made them up
export const COLOR_THRESHOLDS: Record<string, ColorThresholds> = {
  proteinPerCurrency: { good: 12, bad: 4 },
  proteinToCarbRatio: { good: 2, bad: 0.1 },
  proteinPer100Calories: { good: 10, bad: 3 },
};

export function interpolateColor(color1: number[], color2: number[], factor: number): number[] {
  return color1.map((channel, i) => Math.round(channel + factor * (color2[i] - channel)));
}

export function getColorForValue(value: string, thresholds: ColorThresholds): string {
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return '';

  const minValue = thresholds.bad;
  const maxValue = thresholds.good;
  const midValue = (minValue + maxValue) / 2;

  const red = [220, 38, 38]; // Tailwind red-600
  const yellow = [202, 138, 4]; // Tailwind yellow-600
  const green = [22, 163, 74]; // Tailwind green-600

  let color: number[];
  if (numValue <= minValue) {
    color = red;
  } else if (numValue >= maxValue) {
    color = green;
  } else if (numValue < midValue) {
    const factor = (numValue - minValue) / (midValue - minValue);
    color = interpolateColor(red, yellow, factor);
  } else {
    const factor = (numValue - midValue) / (maxValue - midValue);
    color = interpolateColor(yellow, green, factor);
  }

  return `rgb(${color.join(',')})`;
}

export function formatLabel(key: string, currency: string | null = null): string {
  switch (key) {
    case 'proteinPerCurrency':
      return `Protein per ${currency}`;
    case 'proteinPer100Calories':
      return 'Protein per 100 Calories';
    default:
      return (
        key.charAt(0).toUpperCase() +
        key
          .slice(1)
          .replace(/([A-Z])/g, ' $1')
          .trim()
      );
  }
}
