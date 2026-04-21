import { Shop } from './types';
import { calculateMetrics } from './metrics';
import { createInfoElement } from './ui';
import './index.css';
import { detectShop } from './shops/detectShop';
import { getCachedSettings, getCurrentShopKey, loadSettings } from './settings';
import { debounce } from './utils/debounce';

const INJECTED_SIG_ATTR = 'data-nutridata-sig';

function currentSignature(shop: Shop): string {
  return shop.getContentSignature?.(document) ?? window.location.href;
}

async function displayInfo(shop: Shop) {
  const insertionPoint = shop.getInsertionPoint(document.body);
  if (!insertionPoint) return;

  const sig = currentSignature(shop);
  const container = insertionPoint.parentElement;
  const existing = container?.querySelector('.nutri-data-metrics');
  if (existing?.getAttribute(INJECTED_SIG_ATTR) === sig) return;

  const [nutrientInfo, priceAndWeightInfo] = await Promise.all([
    shop.getNutrientInfo(document),
    shop.getPriceAndWeightInfo(document),
  ]);
  if (!nutrientInfo || Object.values(nutrientInfo).every((value) => value === '')) {
    // New product has no data — drop the previous product's card so we don't leave stale info.
    existing?.remove();
    return;
  }

  const metrics = calculateMetrics(nutrientInfo, priceAndWeightInfo);
  const infoElement = createInfoElement(nutrientInfo, metrics);
  const extraStyle = shop.getMetricsCardExtraStyle?.();
  if (extraStyle) infoElement.style.cssText += extraStyle;
  infoElement.setAttribute(INJECTED_SIG_ATTR, sig);

  existing?.remove();
  insertionPoint.parentNode?.insertBefore(infoElement, insertionPoint.nextSibling);
}

function runDisplayInfo() {
  const settings = getCachedSettings();
  if (!settings?.enabledShops[getCurrentShopKey()]) return;
  const shop = detectShop();
  if (!shop) return;
  displayInfo(shop).catch((error) => console.error('[NutriData] displayInfo:', error));
}

// Trailing debounce: fire once the DOM settles after a mutation burst.
// Handles initial render, SPA re-renders, and in-place modal swaps.
loadSettings().then(() => {
  const schedule = debounce(runDisplayInfo, 150);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
});
