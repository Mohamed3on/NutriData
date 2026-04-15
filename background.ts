/// <reference types="chrome" />

declare const chrome: any;

// Bridges Mercadona SPA navigation (history.pushState) to the content script,
// which otherwise wouldn't know the URL changed.

const debounceTimers: { [tabId: number]: NodeJS.Timeout } = {};
const DEBOUNCE_DELAY_MS = 200;

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
    if (debounceTimers[details.tabId]) clearTimeout(debounceTimers[details.tabId]);
    debounceTimers[details.tabId] = setTimeout(() => {
      if (details.url?.includes('tienda.mercadona.es/product') && details.frameId === 0) {
        chrome.tabs.sendMessage(details.tabId, { type: 'URL_CHANGED' }).catch((error: Error) => {
          if (!error.message.includes('Receiving end does not exist')) {
            console.error('Error sending message:', error);
          }
        });
      }
      delete debounceTimers[details.tabId];
    }, DEBOUNCE_DELAY_MS);
  }
);

export {};
