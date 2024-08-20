declare const chrome: any;

chrome.runtime.onInstalled.addListener((details: any) => {
  if (details.reason === 'update') {
    chrome.storage.local.clear(() => {
      console.log('Storage cleared due to extension update');
    });
  }
});

export {};
