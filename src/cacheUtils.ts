import { CachedData } from './types';

declare const chrome: any;
const CACHE_EXPIRATION = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

export async function getCachedData(url: string): Promise<CachedData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(url, (result: { [key: string]: any }) => {
      const cachedData = result[url] as CachedData | undefined;
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_EXPIRATION) {
        resolve(cachedData);
      } else {
        resolve(null);
      }
    });
  });
}

export async function setCachedData(url: string, data: CachedData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [url]: data }, resolve);
  });
}
