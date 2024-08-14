import { processAllProductCards } from './productProcessing';
import { setupMutationObserver } from './observerSetup';

async function main() {
  try {
    await processAllProductCards();
    setupMutationObserver();
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();
