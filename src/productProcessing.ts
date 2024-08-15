import { NutrientInfo, Metrics } from './types';
import { calculateMetrics } from './metrics';
import { reweShop } from './shops/rewe';
import { getCachedData, setCachedData } from './cacheUtils';
import { fetchProductData, createMetricsElement } from './domUtils';

export async function processProductCard(card: Element): Promise<void> {
  // Check if the metrics element already exists
  const existingMetricsElement = card.querySelector('.nutri-data-metrics');
  if (existingMetricsElement) {
    console.log('Metrics element already exists for this card');
    return;
  }

  const link = card.querySelector('a.search-service-productDetailsLink');
  if (!link) return;

  const url = (link as HTMLAnchorElement).href;

  // Try to get cached data
  const cachedData = await getCachedData(url);

  let nutrientInfo: NutrientInfo;
  let metrics: Metrics;

  if (cachedData) {
    // Use cached data if available
    nutrientInfo = cachedData.nutrientInfo;
    metrics = cachedData.metrics;
  } else {
    // Fetch and process data if not cached
    const doc = await fetchProductData(url);
    nutrientInfo = reweShop.getNutrientInfo(doc);

    // Break early if nutrient info is not available
    if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
      console.log('Nutrient information not available for this product');
      return;
    }

    const priceAndWeightInfo = reweShop.getPriceAndWeightInfo(doc);
    metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);

    // Cache the new data
    await setCachedData(url, {
      nutrientInfo,
      metrics,
      timestamp: Date.now(),
    });
  }

  if (metrics && nutrientInfo) {
    const metricsElement = createMetricsElement(metrics, nutrientInfo);

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
  } else {
    console.warn('Unable to calculate metrics or get nutrient info for product card:', card);
  }

  // Adjust the height of the product card
  if (card instanceof HTMLElement) {
    card.style.height = 'auto';
  }
}

export async function processAllProductCards(): Promise<void> {
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
