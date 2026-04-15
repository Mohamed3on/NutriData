import { NutrientInfo, Metrics } from './types';
import { calculateMetrics } from './metrics';
import { fetchProductData, createMetricsElement } from './domUtils';
import { getCachedData, setCachedData } from './cacheUtils';
import { detectShop } from './shops/detectShop';
import { isSearchUIEnabled } from './settings';
import { isNutrientInfoComplete } from './utils';

const NO_DATA_ATTR = 'data-nutridata-no-data';
const NO_DATA_RETRY_MS = 5 * 60 * 1000;

function markNoData(card: Element): void {
  card.setAttribute(NO_DATA_ATTR, String(Date.now() + NO_DATA_RETRY_MS));
}

export async function processProductCard(card: Element): Promise<void> {
  if (!(await isSearchUIEnabled())) return;

  const shop = detectShop();
  const link = card.querySelector(shop.selectors.productLink) as HTMLAnchorElement | null;
  if (!link?.href) return;

  let result: { nutrientInfo: NutrientInfo | null; metrics: Metrics | null };
  try {
    result = await getProductData(link.href);
  } catch (error) {
    // Transient (network/rate-limit) — cooldown and retry later.
    markNoData(card);
    console.error('[NutriData] getProductData threw:', error);
    return;
  }
  if (!result.nutrientInfo || !result.metrics) {
    markNoData(card);
    return;
  }
  if (!card.isConnected) return;

  card.removeAttribute(NO_DATA_ATTR);
  const metricsElement = createMetricsElement(result.metrics, result.nutrientInfo);
  shop.insertMetricsIntoCard(card, metricsElement);
  adjustCardHeight(card);
}

async function getProductData(
  url: string
): Promise<{ nutrientInfo: NutrientInfo | null; metrics: Metrics | null }> {
  const cleanUrl = new URL(url);
  cleanUrl.search = '';
  const shop = detectShop();
  // Mercadona resolves from the bundled dump + in-memory maps — persistent
  // URL cache just adds storage I/O. REWE/Amazon benefit (HTML parse is slow).
  const useUrlCache = shop.name !== 'MERCADONA';

  if (useUrlCache) {
    const cached = await getCachedData(cleanUrl.toString());
    if (cached && isNutrientInfoComplete(cached.nutrientInfo)) {
      return { nutrientInfo: cached.nutrientInfo, metrics: cached.metrics };
    }
  }

  const doc = shop.fetchProductData ? await shop.fetchProductData(url) : await fetchProductData(url);
  const nutrientInfo = await shop.getNutrientInfo(doc);
  if (!isNutrientInfoComplete(nutrientInfo)) return { nutrientInfo: null, metrics: null };

  const priceAndWeightInfo = await shop.getPriceAndWeightInfo(doc);
  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);

  if (useUrlCache) {
    await setCachedData(cleanUrl.toString(), { nutrientInfo, metrics, timestamp: Date.now() });
  }
  return { nutrientInfo, metrics };
}

function adjustCardHeight(card: Element): void {
  if (!(card instanceof HTMLElement)) return;
  card.style.height = 'auto';
  const details = card.querySelector<HTMLElement>('.search-service-productDetails');
  if (details) details.style.height = 'auto';
}
