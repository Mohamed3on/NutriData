import { Shop } from './types';
import { calculateMetrics } from './metrics';
import { createInfoElement } from './ui';
import './index.css';
import { detectShop } from './shops/detectShop';

async function displayInfo(shop: Shop) {
  const nutrientInfo = await shop.getNutrientInfo(document);

  if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
    console.log('Nutrient information not available');
    return;
  }

  const priceAndWeightInfo = shop.getPriceAndWeightInfo(document);
  const insertionPoint = shop.getInsertionPoint(document.body);

  if (!insertionPoint) {
    console.log('Insertion point not found, probably because the page is not loaded yet');
    return;
  }

  const metricsCardExtraStyle = shop.getMetricsCardExtraStyle?.();

  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);
  const infoElement = createInfoElement(nutrientInfo, metrics);
  if (metricsCardExtraStyle) {
    infoElement.style.cssText += metricsCardExtraStyle;
  }

  insertionPoint.parentNode?.insertBefore(infoElement, insertionPoint.nextSibling);
}

const shop = detectShop();
if (shop) {
  displayInfo(shop);
}
