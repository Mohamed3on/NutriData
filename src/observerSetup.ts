import { processProductCard } from './productProcessing';

export function setupMutationObserver(): void {
  const targetNode = document.querySelector('.ProductList_rsPageableProductListWrapper__v1cS_');
  if (!targetNode) {
    console.error('Target node for MutationObserver not found');
    return;
  }

  const observerOptions = {
    childList: true,
    subtree: true,
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.classList.contains('search-service-product')) {
            processProductCard(node).catch((error) =>
              console.error('Error processing dynamically added product card:', error)
            );
          }
        });
      }
    });
  });

  observer.observe(targetNode, observerOptions);
}
