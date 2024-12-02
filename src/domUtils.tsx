import { Metrics, NutrientInfo } from './types';
import { MetricsCard } from './components/MetricsCard';
import { createRoot } from 'react-dom/client';
import React from 'react';

export async function fetchProductData(url: string): Promise<Document> {
  const response = await fetch(url);
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

export function createMetricsElement(
  metrics: Metrics | null | undefined,
  nutrientInfo: NutrientInfo | null | undefined
): HTMLElement {
  const metricsElement = document.createElement('div');
  metricsElement.className = 'nutri-data-metrics';
  metricsElement.style.display = 'grid';
  metricsElement.style.maxWidth = 'fit-content';
  metricsElement.style.width = 'max-content';

  if (metrics && nutrientInfo) {
    Object.entries(metrics).forEach(([key, value]) => {
      metricsElement.setAttribute(`data-${key}`, value);
    });
    Object.entries(nutrientInfo).forEach(([key, value]) => {
      metricsElement.setAttribute(`data-${key}`, value);
    });

    const root = createRoot(metricsElement);
    root.render(<MetricsCard metrics={metrics} nutrientInfo={nutrientInfo} />);
  }

  return metricsElement;
}
