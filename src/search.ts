import { processAllProductCards } from './productProcessing';
import { setupMutationObserver } from './observerSetup';

import { Metrics, NutrientInfo } from './types';
import './index.css';
import { detectShop } from './shops/detectShop';
import { createRoot } from 'react-dom/client';

async function sortProductCards(metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) {
  const shop = detectShop();
  const productList = document.querySelector(shop.selectors.productList);
  if (!productList) return;

  const productCards = Array.from(productList.querySelectorAll(shop.selectors.productCard));
  productCards.sort((a, b) => {
    const metricA = parseFloat(
      a.querySelector(`.nutri-data-metrics`)?.getAttribute(`data-${metric}`) || '0'
    );
    const metricB = parseFloat(
      b.querySelector(`.nutri-data-metrics`)?.getAttribute(`data-${metric}`) || '0'
    );

    // Handle 'N/A' values
    if (isNaN(metricA) && isNaN(metricB)) return 0;
    if (isNaN(metricA)) return ascending ? 1 : -1;
    if (isNaN(metricB)) return ascending ? -1 : 1;

    return ascending ? metricA - metricB : metricB - metricA;
  });

  if (shop.name === 'amazon') {
    // Find the last 3 [data-index] elements
    const dataIndexElements = Array.from(productList.querySelectorAll('[data-index]'));
    const lastThreeDataIndexElements = dataIndexElements.slice(-3);

    // Clear the product list
    while (productList.firstChild) {
      productList.removeChild(productList.firstChild);
    }

    // Reinsert the sorted product cards
    productCards.forEach((card) => {
      productList.appendChild(card);
    });

    // Append the last 3 [data-index] elements
    lastThreeDataIndexElements.forEach((element) => {
      productList.appendChild(element);
    });
  } else {
    // For other shops, continue with the previous sorting method
    while (productList.firstChild) {
      productList.removeChild(productList.firstChild);
    }
    productCards.forEach((card) => {
      productList.appendChild(card);
    });
  }
}

function removeAdElements() {
  const shop = detectShop();
  const adElements = document.querySelectorAll(shop.selectors.adElement);
  adElements.forEach((element) => element.remove());
}

async function main() {
  try {
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
          existingSelect.parentNode?.insertBefore(
            customSortSelectContainer,
            existingSelect.nextSibling
          );

          const root = createRoot(customSortSelectContainer);
          root.render(shop.createCustomSortSelect(sortProductCards));
        }
      }
    }
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();
