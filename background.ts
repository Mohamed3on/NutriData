/// <reference types="chrome" />

declare const chrome: any;

// Debounce timer storage
const debounceTimers: { [tabId: number]: NodeJS.Timeout } = {};
const DEBOUNCE_DELAY_MS = 200; // Adjust as needed

chrome.runtime.onInstalled.addListener((details: any) => {
  if (details.reason === 'update') {
    chrome.storage.local.clear(() => {
      console.log('Storage cleared due to extension update');
    });
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
    // This event fires when the history state is updated via pushState/replaceState

    // Clear any existing timer for this tab
    if (debounceTimers[details.tabId]) {
      clearTimeout(debounceTimers[details.tabId]);
    }

    // Set a new timer
    debounceTimers[details.tabId] = setTimeout(() => {
      // Check if the URL matches the patterns for the main content script
      if (details.url) {
        const isRelevantUrl = details.url.includes('tienda.mercadona.es/product');

        // Ensure we only act on the main frame (frameId === 0)
        if (isRelevantUrl && details.frameId === 0) {
          chrome.tabs.sendMessage(details.tabId, { type: 'URL_CHANGED' }).catch((error: Error) => {
            if (!error.message.includes('Receiving end does not exist')) {
              console.error('Error sending message:', error);
            }
          });
        }
      }
      // Clear the timer reference after execution
      delete debounceTimers[details.tabId];
    }, DEBOUNCE_DELAY_MS);
  },
  {
    // Optional: Filter events to specific URLs if needed, potentially improving performance
    // url: [{hostContains: 'rewe.de'}, {hostContains: 'amazon.de'}, /* ... */]
  }
);

export {};
