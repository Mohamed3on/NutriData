import { NutrientInfo, Metrics } from './types';
import { calculateMetrics } from './metrics';
import { fetchProductData, createMetricsElement } from './domUtils';
import { getCachedData, setCachedData } from './cacheUtils';
import { detectShop } from './shops/detectShop';
import { isAutoResortEnabled } from './settings';

// Main function to process all product cards
export async function processAllProductCards(): Promise<void> {
  const shop = detectShop();
  const productCards = document.querySelectorAll(shop.selectors.productCard);
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

    const metricsElement = createMetricsElement(metrics, nutrientInfo);
    const shop = detectShop();
    shop.insertMetricsIntoCard(card, metricsElement);
    adjustCardHeight(card);

    // Trigger re-sort if enabled and sort is active
    if (await isAutoResortEnabled()) {
      triggerResortIfNeeded();
    }
  } catch (error) {
    console.error('Error processing product card:', error);
  }
}

// Helper functions
function isCardAlreadyProcessed(card: Element): boolean {
  if (card.hasAttribute('data-nutridata-processed')) {
    return true;
  }
  card.setAttribute('data-nutridata-processed', 'true');
  return false;
}

function getProductUrl(card: Element): string | null {
  const link = card.querySelector(detectShop().selectors.productLink) as HTMLAnchorElement | null;
  return link ? link.href : null;
}

async function getProductData(
  url: string
): Promise<{ nutrientInfo: NutrientInfo | null; metrics: Metrics | null }> {
  const cleanUrl = new URL(url);
  cleanUrl.search = '';

  const cachedData = await getCachedData(cleanUrl.toString());
  if (cachedData) {
    return { nutrientInfo: cachedData.nutrientInfo, metrics: cachedData.metrics };
  }

  const doc = await fetchProductData(url);
  const nutrientInfo = await detectShop().getNutrientInfo(doc);

  if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
    console.log('Nutrient information not available for this product');
    // Cache the "no nutrients available" result
    await setCachedData(cleanUrl.toString(), {
      nutrientInfo: null,
      metrics: null,
      timestamp: Date.now(),
    });
    return { nutrientInfo: null, metrics: null };
  }

  const priceAndWeightInfo = await detectShop().getPriceAndWeightInfo(doc);
  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);

  await setCachedData(cleanUrl.toString(), { nutrientInfo, metrics, timestamp: Date.now() });
  return { nutrientInfo, metrics };
}

function adjustCardHeight(card: Element): void {
  if (card instanceof HTMLElement) {
    card.style.height = 'auto';
    const productDetails: HTMLElement | null = card.querySelector('.search-service-productDetails');
    if (productDetails) {
      productDetails.style.height = 'auto';
    }
  }
}

function triggerResortIfNeeded(): void {
  // Emit a custom event that our sorting layer listens to
  document.dispatchEvent(new Event('nutridata:resort'));
}
