import { Metrics, NutrientInfo } from './types';
import { MetricsCard } from './components/MetricsCard';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';

let fetchController: AbortController | null = null;

// Abort all in-flight product fetches (e.g. when navigating away)
export function abortPendingFetches(): void {
  fetchController?.abort();
  fetchController = null;
}

export async function fetchProductData(url: string): Promise<Document> {
  if (!fetchController) fetchController = new AbortController();
  const response = await fetch(url, { signal: fetchController.signal });
  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.documentElement.dataset.sourceUrl = url;
  return doc;
}

// Track React roots so we can unmount them when cards are removed from the DOM
const reactRoots = new Map<HTMLElement, Root>();

export function unmountRemovedRoots(): void {
  for (const [element, root] of reactRoots) {
    if (!element.isConnected) {
      root.unmount();
      reactRoots.delete(element);
    }
  }
}

// Remove a metrics element and unmount its React root synchronously. Without
// this, removing stale metrics via `el.remove()` leaves the root in the map
// until the next sweep — during Mercadona's keystroke-driven re-renders this
// accumulates hundreds of orphan roots per second.
export function removeMetricsElement(el: Element): void {
  const root = reactRoots.get(el as HTMLElement);
  if (root) {
    root.unmount();
    reactRoots.delete(el as HTMLElement);
  }
  el.remove();
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
    reactRoots.set(metricsElement, root);
  }

  return metricsElement;
}
