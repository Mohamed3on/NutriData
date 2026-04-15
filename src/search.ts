import { setupMutationObserver } from './observerSetup';

import { Metrics, NutrientInfo } from './types';
import './index.css';
import { detectShop } from './shops/detectShop';
import { createRoot } from 'react-dom/client';
import { isShopEnabled, isAutoSortEnabled, loadSettings } from './settings';
import { parseNumeric } from './utils';

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
  if (shop.name === 'amazon') return;
  // Sort each `.product-container` independently — `style.order` only affects
  // siblings within the same flex parent, and category pages have one per section.
  for (const productList of document.querySelectorAll<HTMLElement>(shop.selectors.productList)) {
    sortProductList(productList, shop.selectors.productCard, metric, ascending);
  }
}

function sortProductList(
  productList: HTMLElement,
  productCardSelector: string,
  metric: keyof Metrics | keyof NutrientInfo,
  ascending: boolean
) {
  const containers = new Set<HTMLElement>();
  for (const card of productList.querySelectorAll(productCardSelector)) {
    const direct = findDirectChildContainer(card, productList);
    if (direct) containers.add(direct as HTMLElement);
  }

  const ranked = Array.from(containers, (container) => ({
    container,
    value: parseNumeric(
      container.querySelector(`.nutri-data-metrics`)?.getAttribute(`data-${metric}`)
    ),
  }));

  ranked.sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return ascending ? a.value - b.value : b.value - a.value;
  });

  ranked.forEach(({ container }, index) => {
    container.style.order = String(index);
  });
}

function handleSort(metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) {
  lastSort = { metric, ascending };
  sortProductCards(metric, ascending);
}

document.addEventListener('nutridata:resort', () => {
  isAutoSortEnabled().then((enabled) => {
    if (!enabled) return;
    const shop = detectShop();
    if (!shop) return;
    // Default to NutriScore if user hasn't picked a different sort
    const sort = lastSort ?? { metric: 'nutriScore' as keyof Metrics, ascending: false };
    sortProductCards(sort.metric, sort.ascending);
  });
});

function removeAdElements() {
  const shop = detectShop();
  const adElements = document.querySelectorAll(shop.selectors.adElement);
  adElements.forEach((element) => element.remove());
}

async function main() {
  try {
    await loadSettings();
    const enabled = await isShopEnabled();
    if (!enabled) return;
    const shop = detectShop();

    let observerInitialized = false;
    const tryInit = () => {
      const hasListing =
        !!document.querySelector(shop.selectors.productList) ||
        !!document.querySelector(shop.selectors.productCard);
      if (!hasListing) return;
      if (!observerInitialized) {
        removeAdElements();
        setupMutationObserver();
        observerInitialized = true;
      }
      if (!document.querySelector('.nutri-data-sort')) {
        const sortContainer = document.querySelector<HTMLElement>(shop.selectors.sortSelect);
        if (sortContainer) {
          const customSortSelectContainer = document.createElement('div');
          const root = createRoot(customSortSelectContainer);
          root.render(shop.createCustomSortSelect(handleSort));
          shop.insertSortSelect(customSortSelectContainer, sortContainer);
        }
      }
    };
    tryInit();
    // Re-run on DOM changes (SPA route changes + async renders). Debounced to avoid
    // thrashing on busy React apps that fire many mutations per second.
    let initTimeout: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
      clearTimeout(initTimeout);
      initTimeout = setTimeout(tryInit, 250);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();
