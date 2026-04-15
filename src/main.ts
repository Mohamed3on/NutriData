import { Shop } from './types';
import { calculateMetrics } from './metrics';
import { createInfoElement } from './ui';
import './index.css';
import { detectShop } from './shops/detectShop';
import { isShopEnabled } from './settings';

async function displayInfo(shop: Shop) {
  try {
    const nutrientInfo = await shop.getNutrientInfo(document);
    if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) return;

    const insertionPoint = shop.getInsertionPoint(document.body);
    if (!insertionPoint) return;

    const priceAndWeightInfo = await shop.getPriceAndWeightInfo(document);
    const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);
    const infoElement = createInfoElement(nutrientInfo, metrics);
    const extraStyle = shop.getMetricsCardExtraStyle?.();
    if (extraStyle) infoElement.style.cssText += extraStyle;

    insertionPoint.parentNode?.querySelector('.nutri-data-metrics')?.remove();
    insertionPoint.parentNode?.insertBefore(infoElement, insertionPoint.nextSibling);
  } catch (error) {
    console.error('[NutriData] displayInfo:', error);
  }
}

async function runDisplayInfo() {
  if (!(await isShopEnabled())) return;
  const shop = detectShop();
  if (shop) displayInfo(shop);
}

runDisplayInfo();

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'URL_CHANGED') runDisplayInfo();
  return true;
});
