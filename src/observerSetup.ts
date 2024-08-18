import { processProductCard } from './productProcessing';

export function setupMutationObserver(): void {
  const targetNode = document.querySelector('.search-service-rsTiles');
  if (!targetNode) {
    console.log('This page is probably not a product list page. Aborting observer setup.');
    return;
  }

  const observerOptions = {
    childList: true,
    subtree: true,
  };

  // Set to keep track of elements currently being processed
  const inProgressElements = new Set<HTMLElement>();

  const observer = new MutationObserver((mutations) => {
    let newCardAdded = false;

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.classList.contains('search-service-product')) {
            // Check if the element has not been processed yet
            if (!node.hasAttribute('data-nutridata-processed')) {
              newCardAdded = true;
              console.log(node.querySelector('.LinesEllipsis')?.textContent);
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
    // Reset the sorting select if different products were added
    if (newCardAdded) {
      const customSortSelect = document.querySelector('.nutri-data-sort') as HTMLSelectElement;
      if (customSortSelect) {
        customSortSelect.value = '';
      }
    }
    newCardAdded = false;
  });

  observer.observe(targetNode, observerOptions);
}
