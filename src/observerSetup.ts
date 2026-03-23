import { detectShop } from './shops/detectShop';
import { processProductCard } from './productProcessing';
import { getCachedSettings, getCurrentShopKey } from './settings';
import { unmountRemovedRoots, abortPendingFetches } from './domUtils';

export function setupMutationObserver(): void {
  const shop = detectShop();
  const productCardSelector = shop.selectors.productCard;
  const productListSelector = shop.selectors.productList;
  const shopKey = getCurrentShopKey();

  const inProgressElements = new Set<HTMLElement>();
  let sweepTimeout: ReturnType<typeof setTimeout>;
  let isSortSelectListenerAdded = false;
  let observingList: Element | null = null;

  function sweep() {
    unmountRemovedRoots();
    const settings = getCachedSettings();
    if (!settings?.enabledShops[shopKey] || !settings.searchUIEnabled) return;

    for (const card of document.querySelectorAll(productCardSelector)) {
      if (!(card instanceof HTMLElement) || card.tagName === 'SCRIPT') continue;
      if (!inProgressElements.has(card)) {
        inProgressElements.add(card);
        processProductCard(card)
          .finally(() => inProgressElements.delete(card));
      }
    }

    if (settings.autoSortByNutriScore) {
      document.dispatchEvent(new Event('nutridata:resort'));
    }
  }

  function onListMutation() {
    if (!isSortSelectListenerAdded) {
      const sortSelect = document.querySelector('#sorting') as HTMLSelectElement;
      if (sortSelect) {
        sortSelect.addEventListener('change', updateKey);
        isSortSelectListenerAdded = true;
      }
    }
    clearTimeout(sweepTimeout);
    sweepTimeout = setTimeout(sweep, 400);
  }

  const listObserver = new MutationObserver(onListMutation);

  function attachToList() {
    const list = document.querySelector(productListSelector);
    if (list && list !== observingList) {
      listObserver.disconnect();
      listObserver.observe(list, { childList: true, subtree: true });
      observingList = list;
      sweep();
    } else if (!list && observingList) {
      listObserver.disconnect();
      observingList = null;
      abortPendingFetches();
      unmountRemovedRoots();
    }
  }

  attachToList();

  // Poll for product list appearing/disappearing (SPA navigation).
  // Cheaper than a MutationObserver on document.body with subtree:true.
  setInterval(attachToList, 1000);

  function updateKey() {
    const customSortSelect = document.querySelector('.nutri-data-sort') as HTMLSelectElement;
    if (customSortSelect) {
      customSortSelect.dispatchEvent(new CustomEvent('updateKey'));
    }
  }
}
