import { detectShop } from './shops/detectShop';
import { processProductCard } from './productProcessing';
import { getCachedSettings, getCurrentShopKey } from './settings';
import { unmountRemovedRoots, abortPendingFetches } from './domUtils';
import { debounce } from './utils/debounce';

export function setupMutationObserver(): void {
  const shop = detectShop();
  const productCardSelector = shop.selectors.productCard;
  const productListSelector = shop.selectors.productList;
  const shopKey = getCurrentShopKey();
  const MAX_ACTIVE_CARDS = shop.name === 'MERCADONA' ? 12 : 6;

  const inProgressElements = new Set<HTMLElement>();
  let isSortSelectListenerAdded = false;
  let observingList: Element | null = null;
  let continuationSweepTimeout: ReturnType<typeof setTimeout> | undefined;
  const debouncedSweep = debounce(sweep, 400);

  function queueContinuationSweep() {
    clearTimeout(continuationSweepTimeout);
    continuationSweepTimeout = setTimeout(() => {
      if (observingList) sweep();
    }, 0);
  }

  function sweep() {
    unmountRemovedRoots();
    const settings = getCachedSettings();
    if (!settings?.enabledShops[shopKey] || !settings.searchUIEnabled) return;

    const now = Date.now();
    const queuedCards: HTMLElement[] = [];
    for (const card of document.querySelectorAll<HTMLElement>(productCardSelector)) {
      // REWE's card selector can match a <script> too — skip non-element nodes.
      if (card.tagName === 'SCRIPT') continue;
      if (inProgressElements.has(card)) continue;
      const retry = card.getAttribute('data-nutridata-no-data');
      if (retry && +retry > now) continue;
      if (card.querySelector('.nutri-data-metrics')) continue;
      queuedCards.push(card);
    }

    const availableSlots = Math.max(0, MAX_ACTIVE_CARDS - inProgressElements.size);
    for (const card of queuedCards.slice(0, availableSlots)) {
      inProgressElements.add(card);
      processProductCard(card).finally(() => {
        inProgressElements.delete(card);
        queueContinuationSweep();
      });
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
    debouncedSweep();
  }

  const listObserver = new MutationObserver(onListMutation);

  function attachToList() {
    const list = document.querySelector(productListSelector);
    if (list && list !== observingList) {
      listObserver.disconnect();
      // childList-only: Mercadona's React re-renders fire thousands of subtree
      // mutations per keystroke. We only need card add/remove notifications.
      listObserver.observe(list, { childList: true });
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
  setInterval(attachToList, 1000);

  function updateKey() {
    const customSortSelect = document.querySelector('.nutri-data-sort') as HTMLSelectElement;
    if (customSortSelect) {
      customSortSelect.dispatchEvent(new CustomEvent('updateKey'));
    }
  }
}
