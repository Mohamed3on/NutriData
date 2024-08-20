import { processAllProductCards } from './productProcessing';
import { setupMutationObserver } from './observerSetup';
import { createCustomSortSelect } from './domUtils';
import { Metrics, NutrientInfo } from './types';
import './index.css';

let customSortSelect: HTMLSelectElement | null = null;

async function sortProductCards(metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) {
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

    // Handle 'N/A' values
    if (isNaN(metricA) && isNaN(metricB)) return 0;
    if (isNaN(metricA)) return ascending ? 1 : -1;
    if (isNaN(metricB)) return ascending ? -1 : 1;

    return ascending ? metricA - metricB : metricB - metricA;
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
