import { NutrientInfo, Metrics } from './types';
import { calculateMetrics } from './metrics';
import { fetchProductData, createMetricsElement } from './domUtils';
import { getCachedData, setCachedData } from './cacheUtils';
import { detectShop } from './shops/detectShop';
import { isSearchUIEnabled } from './settings';

function parseNumeric(value?: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function isNutrientInfoComplete(nutrientInfo: NutrientInfo | null | undefined): boolean {
  if (!nutrientInfo) return false;
  const requiredKeys: (keyof NutrientInfo)[] = ['protein', 'carbs', 'fat', 'sugar', 'calories'];
  return requiredKeys.every((key) => parseNumeric(nutrientInfo[key]) !== null);
}

// Process individual product card
export async function processProductCard(card: Element): Promise<void> {
  try {
    if (!(await isSearchUIEnabled())) return;
    if (isCardAlreadyProcessed(card)) return;

    const url = getProductUrl(card);
    if (!url) return;

    const { nutrientInfo, metrics } = await getProductData(url);
    if (!nutrientInfo || !metrics) return;

    if (!card.isConnected) return;

    const metricsElement = createMetricsElement(metrics, nutrientInfo);
    const shop = detectShop();
    shop.insertMetricsIntoCard(card, metricsElement);
    adjustCardHeight(card);
  } catch (error) {
    console.error('[NutriData] Error processing product card:', error);
  }
}

// Helper functions
function isCardAlreadyProcessed(card: Element): boolean {
  if (card.hasAttribute('data-nutridata-processed')) {
    // Metrics div may have been destroyed by the site re-rendering the card's inner content
    if (!card.querySelector('.nutri-data-metrics')) {
      card.removeAttribute('data-nutridata-processed');
      return false;
    }
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
  if (cachedData && isNutrientInfoComplete(cachedData.nutrientInfo)) {
    return { nutrientInfo: cachedData.nutrientInfo, metrics: cachedData.metrics };
  }

  const doc = await fetchProductData(url);
  const nutrientInfo = await detectShop().getNutrientInfo(doc);

  if (!isNutrientInfoComplete(nutrientInfo)) {
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
