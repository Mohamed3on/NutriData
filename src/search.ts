import { Metrics } from './types';
import { COLOR_THRESHOLDS, getColorForValue, formatLabel } from './utils';
import { calculateMetrics } from './metrics';
import { reweShop } from './shops/rewe';

async function fetchProductData(url: string): Promise<Document> {
  const response = await fetch(url);
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function createMetricsElement(metrics: Metrics): HTMLElement {
  const metricsElement = document.createElement('div');
  metricsElement.className = 'nutri-data-metrics';
  metricsElement.style.cssText = `
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 5px;
    margin: 8px 0;
    font-size: 12px;
  `;

  const labelMap: Record<keyof Metrics, string> = {
    proteinPerEuro: 'Protein g per €',
    proteinToCarbRatio: 'Protein to Carb Ratio',
    proteinPer100Calories: 'Protein g per 100 calories',
  };

  metricsElement.innerHTML = Object.entries(metrics)
    .map(
      ([key, value]) => `
    <div>
      ${labelMap[key as keyof Metrics] || formatLabel(key)}:
      <span style="font-weight: bold; color: ${getColorForValue(
        value,
        COLOR_THRESHOLDS[key as keyof typeof COLOR_THRESHOLDS]
      )}">
        ${value}${key === 'proteinPerEuro' && value !== 'N/A' ? 'g' : ''}
      </span>
    </div>
  `
    )
    .join('');

  return metricsElement;
}

async function processProductCard(card: Element): Promise<void> {
  const link = card.querySelector('a.search-service-productDetailsLink');
  if (!link) return;

  const url = (link as HTMLAnchorElement).href;
  const doc = await fetchProductData(url);

  const nutrientInfo = reweShop.getNutrientInfo(doc);

  // Break early if nutrient info is not available
  if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
    console.log('Nutrient information not available for this product');
    return;
  }

  const priceAndWeightInfo = reweShop.getPriceAndWeightInfo(doc);
  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);

  const metricsElement = createMetricsElement(metrics);

  // Find the correct insertion point within the card
  const detailsWrapper = card.querySelector('.search-service-productDetailsWrapper');
  const grammageElement = detailsWrapper?.querySelector('.search-service-productGrammage');

  // Set the height of ProductDetailsWrapper_productDetails__7vI_z to auto
  const productDetails = card.querySelector('.ProductDetailsWrapper_productDetails__7vI_z');
  if (productDetails instanceof HTMLElement) {
    productDetails.style.height = 'auto';
  }

  if (grammageElement && grammageElement.parentNode) {
    grammageElement.parentNode.insertBefore(metricsElement, grammageElement.nextSibling);
  } else if (detailsWrapper) {
    // Fallback: append to detailsWrapper if grammageElement is not found
    detailsWrapper.appendChild(metricsElement);
  }

  // Adjust the height of the product card
  if (card instanceof HTMLElement) {
    card.style.height = 'auto';
  }
}

async function processAllProductCards(): Promise<void> {
  const productCards = document.querySelectorAll('.search-service-product');

  const promises = Array.from(productCards).map(async (card) => {
    try {
      await processProductCard(card);
    } catch (error) {
      console.error('Error processing product card:', error);
    }
  });

  await Promise.allSettled(promises);
}

// Run the script
processAllProductCards().catch((error) => console.error('Error processing product cards:', error));
