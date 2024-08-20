import { Metrics, NutrientInfo } from './types';
import { createMetricsElement } from './domUtils';

export function createInfoElement(
  nutrientInfo: NutrientInfo | null | undefined,
  metrics: Metrics | null | undefined
): HTMLElement {
  return createMetricsElement(metrics, nutrientInfo);
}
