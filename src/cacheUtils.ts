import { CachedData } from './types';

declare const chrome: any;
// A cached entry carries `metrics`, and those embed price — protein-per-€ and
// the NutriScore built on it — so this is a price cache as much as a nutrition
// one. At a year, every REWE product stayed frozen at whatever it cost when
// first seen, and because a cache hit returns before maybeCollect() runs, it
// also silenced the crowd-sourced price updates feeding the protein index.
// Keep it just above collect.ts's 6-day resend window, so each miss both
// refreshes the shown price and contributes one update.
const CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000; // 7 days

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
