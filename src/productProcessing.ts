import { NutrientInfo, Metrics } from './types';
import { calculateMetrics } from './metrics';
import { reweShop } from './shops/rewe';
import { getCachedData, setCachedData } from './cacheUtils';
import { fetchProductData, createMetricsElement } from './domUtils';

// Main function to process all product cards
export async function processAllProductCards(): Promise<void> {
  const productCards = document.querySelectorAll('.search-service-product');
  const promises = Array.from(productCards).map(processProductCard);
  await Promise.allSettled(promises);
}

// Process individual product card
export async function processProductCard(card: Element): Promise<void> {
  try {
    if (isCardAlreadyProcessed(card)) return;

    const url = getProductUrl(card);
    if (!url) return;

    const { nutrientInfo, metrics } = await getProductData(url);
    if (!nutrientInfo || !metrics) return;

    insertMetricsIntoCard(card, metrics, nutrientInfo);
    adjustCardHeight(card);
  } catch (error) {
    console.error('Error processing product card:', error);
  }
}

// Helper functions
function isCardAlreadyProcessed(card: Element): boolean {
  if (card.hasAttribute('data-nutridata-processed')) {
    console.log('Card already processed');
    return true;
  }
  card.setAttribute('data-nutridata-processed', 'true');
  return false;
}

function getProductUrl(card: Element): string | null {
  const link = card.querySelector('a.search-service-productDetailsLink');
  return link ? (link as HTMLAnchorElement).href : null;
}

async function getProductData(
  url: string
): Promise<{ nutrientInfo: NutrientInfo | null; metrics: Metrics | null }> {
  const cachedData = await getCachedData(url);
  if (cachedData) {
    return { nutrientInfo: cachedData.nutrientInfo, metrics: cachedData.metrics };
  }

  const doc = await fetchProductData(url);
  const nutrientInfo = reweShop.getNutrientInfo(doc);

  if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
    console.log('Nutrient information not available for this product');
    return { nutrientInfo: null, metrics: null };
  }

  const priceAndWeightInfo = reweShop.getPriceAndWeightInfo(doc);
  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);

  await setCachedData(url, { nutrientInfo, metrics, timestamp: Date.now() });
  return { nutrientInfo, metrics };
}

function insertMetricsIntoCard(card: Element, metrics: Metrics, nutrientInfo: NutrientInfo): void {
  const metricsElement = createMetricsElement(metrics, nutrientInfo);
  const detailsWrapper = card.querySelector('.search-service-productDetailsWrapper');
  const grammageElement = detailsWrapper?.querySelector('.search-service-productGrammage');

  if (grammageElement && grammageElement.parentNode) {
    grammageElement.parentNode.insertBefore(metricsElement, grammageElement.nextSibling);
  } else if (detailsWrapper) {
    detailsWrapper.appendChild(metricsElement);
  }

  const productDetails = card.querySelector('.ProductDetailsWrapper_productDetails__7vI_z');
  if (productDetails instanceof HTMLElement) {
    productDetails.style.height = 'auto';
  }
}

function adjustCardHeight(card: Element): void {
  if (card instanceof HTMLElement) {
    card.style.height = 'auto';
  }
}
