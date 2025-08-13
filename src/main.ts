import { Shop } from './types';
import { calculateMetrics } from './metrics';
import { createInfoElement } from './ui';
import './index.css';
import { detectShop } from './shops/detectShop';

async function displayInfo(shop: Shop) {
  try {
    const nutrientInfo = await shop.getNutrientInfo(document);

    if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
      console.log('Nutrient information not available');
      return;
    }

    const priceAndWeightInfo = await shop.getPriceAndWeightInfo(document);
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

    // Check for and remove existing card before inserting the new one
    const existingCard = insertionPoint.parentNode?.querySelector('.nutri-data-metrics');
    if (existingCard) {
      existingCard.remove();
    }

    insertionPoint.parentNode?.insertBefore(infoElement, insertionPoint.nextSibling);
  } catch (error) {
    console.log('Error:', error);
    return;
  }
}

function runDisplayInfo() {
  const shop = detectShop();
  if (shop) {
    displayInfo(shop);
  }
}

// Run on initial load
runDisplayInfo();

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request) => {
  // Check if the message indicates a URL change
  if (request.type === 'URL_CHANGED') {
    runDisplayInfo();
  }
  // Keep the listener active for future messages (important for async responses, though not used here)
  return true;
});
