declare const chrome: any;

export type ShopKey = 'rewe' | 'amazon' | 'mercadona';

export interface ExtensionSettings {
  enabledShops: Record<ShopKey, boolean>;
  autoResort: boolean;
  searchUIEnabled: boolean;
}

export const defaultSettings: ExtensionSettings = {
  enabledShops: {
    rewe: true,
    amazon: true,
    mercadona: true,
  },
  // Default off per request
  autoResort: false,
  // Show metrics cards and related UI on search result pages by default
  searchUIEnabled: true,
};

export function getCurrentShopKey(): ShopKey {
  const hostname = window.location.hostname;
  if (hostname.includes('rewe.de')) return 'rewe';
  if (hostname.includes('amazon')) return 'amazon';
  return 'mercadona';
}

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('nutridata_settings', (result: { [key: string]: any }) => {
      const stored = (result && result.nutridata_settings) || {};
      const merged: ExtensionSettings = {
        enabledShops: {
          rewe: stored.enabledShops?.rewe ?? defaultSettings.enabledShops.rewe,
          amazon: stored.enabledShops?.amazon ?? defaultSettings.enabledShops.amazon,
          mercadona: stored.enabledShops?.mercadona ?? defaultSettings.enabledShops.mercadona,
        },
        autoResort: stored.autoResort ?? defaultSettings.autoResort,
        searchUIEnabled: stored.searchUIEnabled ?? defaultSettings.searchUIEnabled,
      };
      resolve(merged);
    });
  });
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ nutridata_settings: settings }, resolve);
  });
}

export async function isShopEnabled(): Promise<boolean> {
  const settings = await getSettings();
  const key = getCurrentShopKey();
  return Boolean(settings.enabledShops[key]);
}

export async function isAutoResortEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return Boolean(settings.autoResort);
}

export async function isSearchUIEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return Boolean(settings.searchUIEnabled);
}
