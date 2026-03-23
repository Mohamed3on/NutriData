import { detectShop } from './shops/detectShop';
import { processProductCard } from './productProcessing';
import { getCachedSettings, getCurrentShopKey } from './settings';
import { unmountRemovedRoots } from './domUtils';

export function setupMutationObserver(): void {
  const targetNode = document.body;
  if (!targetNode) return;

  const shop = detectShop();
  const productCardSelector = shop.selectors.productCard;
  const shopKey = getCurrentShopKey();

  let isSortSelectListenerAdded = false;
  const inProgressElements = new Set<HTMLElement>();
  let sweepTimeout: ReturnType<typeof setTimeout>;

  function sweep() {
    unmountRemovedRoots();
    const settings = getCachedSettings();
    if (!settings?.enabledShops[shopKey] || !settings.searchUIEnabled) return;

    const allCards = document.querySelectorAll(productCardSelector);
    for (const card of allCards) {
      if (card instanceof HTMLElement && !inProgressElements.has(card)) {
        inProgressElements.add(card);
        processProductCard(card)
          .finally(() => inProgressElements.delete(card));
      }
    }

    if (settings.autoResort) {
      document.dispatchEvent(new Event('nutridata:resort'));
    }
  }

  function scheduleSweep() {
    clearTimeout(sweepTimeout);
    sweepTimeout = setTimeout(sweep, 400);
  }

  const observer = new MutationObserver(() => {
    if (!isSortSelectListenerAdded) {
      const sortSelect = document.querySelector('#sorting') as HTMLSelectElement;
      if (sortSelect) {
        sortSelect.addEventListener('change', updateKey);
        isSortSelectListenerAdded = true;
      }
    }
    scheduleSweep();
  });

  observer.observe(targetNode, { childList: true, subtree: true });

  // Process cards already in the DOM
  sweep();

  function updateKey() {
    const customSortSelect = document.querySelector('.nutri-data-sort') as HTMLSelectElement;
    if (customSortSelect) {
      customSortSelect.dispatchEvent(new CustomEvent('updateKey'));
    }
  }
}
