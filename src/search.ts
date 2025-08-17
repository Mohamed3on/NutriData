import { processAllProductCards } from './productProcessing';
import { setupMutationObserver } from './observerSetup';

import { Metrics, NutrientInfo } from './types';
import './index.css';
import { detectShop } from './shops/detectShop';
import { createRoot } from 'react-dom/client';
import { isShopEnabled, isAutoResortEnabled } from './settings';

let lastSort: { metric: keyof Metrics | keyof NutrientInfo; ascending: boolean } | null = null;

function findDirectChildContainer(node: Element, container: Element): Element | null {
  let current: Element | null = node;
  while (current && current.parentElement) {
    if (current.parentElement === container) return current;
    current = current.parentElement;
  }
  return null;
}

async function sortProductCards(metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) {
  const shop = detectShop();
  // Disable custom sorting on Amazon entirely
  if (shop.name === 'amazon') return;
  const productList = document.querySelector(shop.selectors.productList) as HTMLElement;
  if (!productList) return;

  const productCards = Array.from(
    productList.querySelectorAll(shop.selectors.productCard)
  ) as HTMLElement[];

  // Map cards to their direct child containers of productList
  const containers = productCards
    .map((card) => findDirectChildContainer(card, productList))
    .filter((el): el is HTMLElement => Boolean(el));

  // Deduplicate containers (some selectors might point inside the same wrapper)
  const uniqueContainers = Array.from(new Set(containers));

  // Build sortable tuples of container and metric value
  const containersWithMetrics = uniqueContainers.map((container) => {
    const metricValue = parseFloat(
      (container.querySelector(`.nutri-data-metrics`) as HTMLElement)?.getAttribute(
        `data-${metric}`
      ) || 'NaN'
    );
    return { container, metricValue };
  });

  // Sort the array
  containersWithMetrics.sort((a, b) => {
    // Handle 'N/A' values
    if (isNaN(a.metricValue) && isNaN(b.metricValue)) return 0;
    if (isNaN(a.metricValue)) return ascending ? 1 : -1;
    if (isNaN(b.metricValue)) return ascending ? -1 : 1;

    return ascending ? a.metricValue - b.metricValue : b.metricValue - a.metricValue;
  });

  // Apply CSS order instead of moving DOM nodes (Amazon returns early above)
  containersWithMetrics.forEach(({ container }, index) => {
    (container as HTMLElement).style.order = index.toString();
  });
}

function handleSort(metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) {
  lastSort = { metric, ascending };
  sortProductCards(metric, ascending);
}

document.addEventListener('nutridata:resort', () => {
  isAutoResortEnabled().then((enabled) => {
    if (!enabled) return;
    // Only resort on supported shops
    const shop = detectShop();
    if (!shop) return;
    if (lastSort) {
      sortProductCards(lastSort.metric, lastSort.ascending);
    }
  });
});

function removeAdElements() {
  const shop = detectShop();
  const adElements = document.querySelectorAll(shop.selectors.adElement);
  adElements.forEach((element) => element.remove());
}

async function main() {
  try {
    const enabled = await isShopEnabled();
    if (!enabled) return;
    const shop = detectShop();
    const isSearchPage = !!document.querySelector(shop.selectors.productList);
    if (isSearchPage) {
      removeAdElements();
      await processAllProductCards();
      setupMutationObserver();

      // Check if there's a metrics card on the page
      const hasMetricsCard = !!document.querySelector('.nutri-data-metrics');

      if (hasMetricsCard) {
        const existingSelect = document.querySelector(
          shop.selectors.sortSelect
        ) as HTMLSelectElement;
        if (existingSelect) {
          const customSortSelectContainer = document.createElement('div');
          const root = createRoot(customSortSelectContainer);
          root.render(shop.createCustomSortSelect(handleSort));
          shop.insertSortSelect(customSortSelectContainer, existingSelect);
        }
      }
    }
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();
