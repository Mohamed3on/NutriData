import { Shop } from './types';
import { calculateMetrics } from './metrics';
import { createInfoElement } from './ui';
import { reweShop } from './shops/rewe';

const shops: Shop[] = [reweShop];

function detectShop(): Shop | null {
  const hostname = window.location.hostname;
  return shops.find((shop) => hostname.includes(shop.name)) || null;
}

async function displayInfo(shop: Shop) {
  const doc = document;
  const nutrientInfo = shop.getNutrientInfo(doc);

  // Break early if nutrient info is not available
  if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
    console.log('Nutrient information not available');
    return;
  }

  const priceAndWeightInfo = shop.getPriceAndWeightInfo(doc);
  const insertionPoint = shop.getInsertionPoint(doc.body);

  if (!insertionPoint) {
    console.error('Insertion point not found');
    return;
  }

  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);
  const infoElement = createInfoElement(nutrientInfo, metrics);

  insertionPoint.parentNode?.insertBefore(infoElement, insertionPoint.nextSibling);
}

const shop = detectShop();
if (shop) {
  displayInfo(shop);
}
