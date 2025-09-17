// src/shops/mercadona.ts
import {
  NutrientInfo,
  PriceAndWeightInfo,
  Shop,
  Metrics, // Import Metrics type
} from '../types';
import React from 'react'; // Import React for createCustomSortSelect
// Import the cache utility functions
import { getCachedData, setCachedData } from '../cacheUtils';

// Define a type for the data we store in chrome.storage specific to mercadona products
// We need nutrient and price info fetched via product ID/EAN
type MercadonaProductCache = {
  nutrientInfo: NutrientInfo | null;
  priceInfo: PriceAndWeightInfo | null;
  timestamp: number; // Include timestamp for potential expiration logic in cacheUtils
};

// Cache key prefix
const CACHE_KEY_PREFIX = 'mercadona-product-';

// Helper to extract product ID from URL
function getProductId(): string | null {
  const match = window.location.pathname.match(/\/product\/(\d+)/);
  return match ? match[1] : null;
}

// Helper to fetch EAN and basic product data from Mercadona API
async function fetchProductDetails(
  productId: string
): Promise<{ ean: string | null; priceInfo: PriceAndWeightInfo } | null> {
  try {
    const response = await fetch(`https://tienda.mercadona.es/api/products/${productId}`);
    if (!response.ok) {
      console.error(`Mercadona API request failed: ${response.status} ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    const priceInstructions = data?.price_instructions;
    const priceInfo: PriceAndWeightInfo = {
      price: priceInstructions?.unit_price ? parseFloat(priceInstructions.unit_price) : undefined,
      weight: priceInstructions?.unit_size
        ? parseFloat(priceInstructions.unit_size) // Assuming unit_size is in kg if size_format is kg
        : undefined,
      pricePerKg: priceInstructions?.reference_price
        ? parseFloat(priceInstructions.reference_price)
        : undefined,
    };
    // TODO: Adjust weight if format is 'g' or other units (needs confirmation from API docs)
    // if (priceInstructions?.size_format === 'g' && priceInfo.weight) {
    //     priceInfo.weight /= 1000;
    // }

    return {
      ean: data?.ean || null,
      priceInfo: priceInfo,
    };
  } catch (error) {
    console.error('Error fetching product details from Mercadona API:', error);
    return null;
  }
}

// Helper to fetch nutrition data from Open Food Facts API
async function fetchNutritionDataFromOFF(ean: string): Promise<NutrientInfo | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${ean}?fields=nutriments`
    );
    if (!response.ok) {
      console.error(
        `Open Food Facts API request failed: ${response.status} ${response.statusText}`
      );
      return null;
    }
    const data = await response.json();
    if (data.status !== 1 || !data.product?.nutriments) {
      console.warn(
        `No nutrient data found on Open Food Facts for EAN: ${ean}. Status: ${data.status}`
      );
      return null;
    }

    const nutriments = data.product.nutriments;

    // Helper to parse, round (1 decimal), and format nutrient values
    const formatNutrient = (value: any): string | undefined => {
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return undefined; // Keep undefined for optional fields if original value is absent or empty
      }
      const num = parseFloat(value);
      return !isNaN(num) ? num.toFixed(1) : undefined; // Return undefined if parsing fails for optional
    };

    const formatRequiredNutrient = (value: any): string => {
      const formatted = formatNutrient(value);
      return formatted !== undefined ? formatted : 'N/A'; // Use 'N/A' if formatting fails or value is absent
    };

    // Map OFF data to our NutrientInfo structure, applying formatting
    const nutrientInfo: NutrientInfo = {
      protein: formatRequiredNutrient(nutriments.proteins_100g),
      carbs: formatRequiredNutrient(nutriments.carbohydrates_100g),
      sugar: formatRequiredNutrient(nutriments.sugars_100g),
      fat: formatRequiredNutrient(nutriments.fat_100g),
      calories: formatRequiredNutrient(nutriments['energy-kcal_100g']), // Use kcal
      fiber: formatNutrient(nutriments.fiber_100g),
      salt: formatNutrient(nutriments.salt_100g),
      saturatedFat: formatNutrient(nutriments['saturated-fat_100g']),
    };

    return nutrientInfo;
  } catch (error) {
    console.error('Error fetching nutrition data from Open Food Facts:', error);
    return null;
  }
}

// --- Updated Function to Manage Cache (chrome.storage) and Fetching ---
async function getOrFetchProductData(
  productId: string
): Promise<{ nutrientInfo: NutrientInfo | null; priceInfo: PriceAndWeightInfo | null }> {
  const cacheKey = `${CACHE_KEY_PREFIX}${productId}`;

  // Check cache first using cacheUtils
  // We cast the result as getCachedData returns a generic CachedData or null
  const cached = (await getCachedData(cacheKey)) as MercadonaProductCache | null;

  if (cached?.nutrientInfo && cached?.priceInfo) {
    console.log(`Mercadona: Cache hit for Product ID: ${productId} from chrome.storage`);
    // cacheUtils already checks expiration, so if we get data, it's valid
    return { nutrientInfo: cached.nutrientInfo, priceInfo: cached.priceInfo };
  }

  // Fetch product details (price, EAN)
  const productDetails = await fetchProductDetails(productId);
  const ean = productDetails?.ean;
  const priceInfo = productDetails?.priceInfo || null; // Store null if fetch fails

  let nutrientInfo: NutrientInfo | null = null;
  if (ean) {
    nutrientInfo = await fetchNutritionDataFromOFF(ean); // Store null if fetch fails
  } else {
    console.warn('Mercadona: No EAN found, skipping nutrition data fetch.');
  }

  // Store in cache using cacheUtils
  // Only cache when both nutrientInfo and priceInfo are present and nutrientInfo appears complete
  const parse = (v?: string | null) => {
    if (!v) return null;
    const n = parseFloat(
      String(v)
        .replace(/[^0-9.,-]/g, '')
        .replace(',', '.')
    );
    return isNaN(n) ? null : n;
  };
  const isComplete =
    nutrientInfo &&
    parse(nutrientInfo.protein) !== null &&
    parse(nutrientInfo.carbs) !== null &&
    parse(nutrientInfo.fat) !== null &&
    parse(nutrientInfo.sugar) !== null &&
    parse(nutrientInfo.calories) !== null &&
    !!priceInfo;

  if (isComplete) {
    const dataToCache: MercadonaProductCache = {
      nutrientInfo,
      priceInfo,
      timestamp: Date.now(),
    };

    // Note: setCachedData expects a type compatible with `CachedData` from types.ts
    await setCachedData(cacheKey, dataToCache as any);
    console.log(
      `Mercadona: Stored data in chrome.storage cache for Product ID: ${productId}`,
      dataToCache
    );
  } else {
    console.warn('Mercadona: Skipping cache due to incomplete data.');
  }

  return { nutrientInfo, priceInfo };
}

export const mercadonaShop: Shop = {
  name: 'MERCADONA',
  getCurrency: () => '€', // Mercadona Spain uses Euro

  getNutrientInfo: async (): Promise<NutrientInfo> => {
    const productId = getProductId();
    if (!productId) {
      console.error('Mercadona: Could not extract product ID.');
      throw new Error('Could not extract product ID.');
    }

    // Data is fetched/retrieved from cache here
    const { nutrientInfo } = await getOrFetchProductData(productId);

    if (!nutrientInfo) {
      console.warn('Mercadona: Could not retrieve nutrition data (fetch or cache).');
      throw new Error('Could not retrieve nutrition data for the product.');
    }

    return nutrientInfo;
  },

  getPriceAndWeightInfo: async (): Promise<PriceAndWeightInfo> => {
    const productId = getProductId();
    if (!productId) {
      console.error('Mercadona: Could not extract product ID.');
      return {};
    }

    // Data is fetched/retrieved from cache here
    const { priceInfo } = await getOrFetchProductData(productId);

    if (!priceInfo) {
      console.warn('Mercadona: Could not retrieve price info (fetch or cache). Returning empty.');
      return {};
    }

    return priceInfo;
  },

  // --- Stubs for other required Shop interface methods ---
  getInsertionPoint: (element: HTMLElement): HTMLElement | null => {
    return element.querySelector('.private-product-detail__button:last-child');
  },

  insertMetricsIntoCard: (_card: Element, _metricsElement: HTMLElement): void => {
    console.warn('Mercadona: insertMetricsIntoCard not implemented.');
    // TODO: Implement appending the metrics UI to product cards (if needed for search page later)
  },

  insertSortSelect: (_sortSelectElement: HTMLElement, _container: HTMLElement): void => {
    console.warn('Mercadona: insertSortSelect not implemented.');
    // TODO: Implement adding sort functionality (if needed for search page later)
  },

  createCustomSortSelect: (
    _onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void
  ): React.ReactElement => {
    console.warn('Mercadona: createCustomSortSelect not implemented.');
    // Return a dummy element for now
    return React.createElement('div', null, 'Sorting not available for Mercadona yet.');
  },

  selectors: {
    // TODO: Fill these with actual selectors for Mercadona pages
    productList: 'mercadona-product-list-selector', // Placeholder
    productCard: 'mercadona-product-card-selector', // Placeholder
    adElement: 'mercadona-ad-selector', // Placeholder
    sortSelect: 'mercadona-sort-select-container', // Placeholder
    productLink: 'a[href*="/product/"]', // Basic product link selector, needs refinement
  },
};
