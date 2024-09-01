import { detectShop } from './shops/detectShop';
import { processProductCard } from './productProcessing';

export function setupMutationObserver(): void {
  const targetNode = document.querySelector(detectShop().selectors.productList);
  if (!targetNode) {
    console.log('This page is probably not a product list page. Aborting observer setup.');
    return;
  }

  const observerOptions = {
    childList: true,
    subtree: true,
  };

  let isSortSelectListenerAdded = false;
  const observer = new MutationObserver((mutations) => {
    const sortSelect = document.querySelector('#sorting') as HTMLSelectElement;
    if (sortSelect && !isSortSelectListenerAdded) {
      sortSelect.addEventListener('change', updateKey);
      isSortSelectListenerAdded = true;
    }

    // Set to keep track of elements currently being processed
    const inProgressElements = new Set<HTMLElement>();

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.classList.contains('search-service-product')) {
            // Check if the element has not been processed yet
            if (!node.hasAttribute('data-nutridata-processed')) {
              inProgressElements.add(node);
              processProductCard(node)
                .then(() => {
                  inProgressElements.delete(node);
                })
                .catch((error) => {
                  console.error('Error processing dynamically added product card:', error);
                  inProgressElements.delete(node);
                });
            }
          }
        });
      }
    });
  });

  observer.observe(targetNode, observerOptions);

  function updateKey() {
    const customSortSelect = document.querySelector('.nutri-data-sort') as HTMLSelectElement;
    if (customSortSelect) {
      const event = new CustomEvent('updateKey');
      customSortSelect.dispatchEvent(event);
    }
  }
}
