import { processAllProductCards } from './productProcessing';
import { setupMutationObserver } from './observerSetup';
import { createCustomSortSelect } from './domUtils';
import { Metrics } from './types';

let customSortSelect: HTMLSelectElement | null = null;

async function sortProductCards(metric: keyof Metrics) {
  const productList = document.querySelector('.search-service-rsTiles');
  if (!productList) return;

  const productCards = Array.from(productList.querySelectorAll('.search-service-product'));

  productCards.sort((a, b) => {
    const metricA = parseFloat(
      a.querySelector(`.nutri-data-metrics`)?.getAttribute(`data-${metric}`) || '0'
    );
    const metricB = parseFloat(
      b.querySelector(`.nutri-data-metrics`)?.getAttribute(`data-${metric}`) || '0'
    );
    return metricB - metricA; // Sort in descending order
  });

  productCards.forEach((card) => productList.appendChild(card));
}

function removeAdElements() {
  const adElements = document.querySelectorAll('rd-flagship');
  adElements.forEach((element) => element.remove());
}

async function main() {
  try {
    removeAdElements(); // Remove ad elements initially
    await processAllProductCards();
    setupMutationObserver();

    // Add custom sort select next to the existing one
    const existingSelect = document.querySelector('#sorting') as HTMLSelectElement;
    if (existingSelect) {
      customSortSelect = createCustomSortSelect(sortProductCards);
      existingSelect.parentNode?.insertBefore(customSortSelect, existingSelect.nextSibling);
    }
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();
