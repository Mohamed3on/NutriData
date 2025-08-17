import { detectShop } from './shops/detectShop';
import { processProductCard } from './productProcessing';

export function setupMutationObserver(): void {
  const targetNode = document.body;
  if (!targetNode) return;

  const observerOptions = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
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

    // Debounce processing to avoid excessive calls
    let processingTimeout: NodeJS.Timeout;
    
    const processUnprocessedProducts = () => {
      const shop = detectShop();
      const allProducts = document.querySelectorAll(`${shop.selectors.productCard}:not([data-nutridata-processed])`);
      allProducts.forEach((product) => {
        if (product instanceof HTMLElement) {
          inProgressElements.add(product);
          processProductCard(product)
            .then(() => {
              inProgressElements.delete(product);
            })
            .catch((error) => {
              console.error('Error processing product card:', error);
              inProgressElements.delete(product);
            });
        }
      });
    };

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // Process all added nodes to find product cards
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const products = node.querySelectorAll(detectShop().selectors.productCard);
            products.forEach((product) => {
              if (product instanceof HTMLElement && !product.hasAttribute('data-nutridata-processed')) {
                inProgressElements.add(product);
                processProductCard(product)
                  .then(() => {
                    inProgressElements.delete(product);
                  })
                  .catch((error) => {
                    console.error('Error processing product card:', error);
                    inProgressElements.delete(product);
                  });
              }
            });
          }
        });
      }
      
      // For any mutation, check for unprocessed products after a delay
      clearTimeout(processingTimeout);
      processingTimeout = setTimeout(() => {
        processUnprocessedProducts();
        // Trigger a safe resort to re-apply order after re-render or replacements
        document.dispatchEvent(new Event('nutridata:resort'));
      }, 400);
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
