import { processProductCard } from './productProcessing';

export function setupMutationObserver(): void {
  const targetNode = document.querySelector('.search-service-rsTiles');
  if (!targetNode) {
    console.error('Target node for MutationObserver not found');
    return;
  }

  const observerOptions = {
    childList: true,
    subtree: true,
  };

  // Set to keep track of elements currently being processed
  const inProgressElements = new Set<HTMLElement>();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.classList.contains('search-service-product')) {
            // Check if the element is not currently being processed
            if (!inProgressElements.has(node)) {
              const metricsElement = node.querySelector('.nutri-data-metrics');
              if (!metricsElement) {
                console.log(node.querySelector('.LinesEllipsis')?.textContent);
                // Add the element to the in-progress set before processing
                // This prevents multiple instances of the same element from being processed simultaneously, which is a weird race condition that I can't be bothered to fix
                inProgressElements.add(node);
                processProductCard(node)
                  .then(() => {
                    // Remove the element from the in-progress set after successful processing
                    inProgressElements.delete(node);
                  })
                  .catch((error) => {
                    console.error('Error processing dynamically added product card:', error);
                    // Remove the element from the in-progress set if processing fails
                    inProgressElements.delete(node);
                  });
              }
            }
          }
        });
      }
    });
  });

  observer.observe(targetNode, observerOptions);
}
