import { createClient } from '@supabase/supabase-js';
import { Metrics, NutrientInfo, PriceAndWeightInfo, Shop } from '../../types';
import { createCustomSortSelectElement } from '../../utils/createCustomSortSelect';
import { Database, Json } from '../../database.types';
import { ProductData } from './ProductData';

const supabase = createClient<Database>(
  'https://knoubfoslxselhfbkniu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3ViZm9zbHhzZWxoZmJrbml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ4NDU1ODAsImV4cCI6MjA0MDQyMTU4MH0.CHq1VVeOxt8gFudDHqVFMbRB0EPs0tBKK0Gr3c-27Mo'
);

export const getCategories = (doc: Document): string[] => {
  const breadcrumbs = doc.querySelector('.lr-breadcrumbs');
  if (breadcrumbs) {
    const breadcrumbLinks = breadcrumbs.querySelectorAll('.lr-breadcrumbs__link');
    return Array.from(breadcrumbLinks)
      .map((link) => {
        // Remove the arrow characters and trim whitespace
        return (link.textContent || '').replace(/[←→]/g, '').trim();
      })
      .filter(Boolean); // Remove any empty strings
  }
  return [];
};

const getProductData = (doc: Document): ProductData | null => {
  const propstoreElement = doc.querySelector('script[id^="pdpr-propstore"]');
  if (propstoreElement) {
    try {
      const propstoreContent = JSON.parse(propstoreElement.textContent || '');
      return propstoreContent.productData;
    } catch (error) {
      console.error('Error parsing propstore content:', error);
    }
  }
  return null;
};

const getRewePriceAndWeightInfo = (data: ProductData): PriceAndWeightInfo => {
  const price = data.pricing.price / 100; // Convert cents to euros
  const weight = data.packaging.weightPerPiece;
  const { grammage } = data.pricing;

  if (['1l', '1kg'].includes(grammage)) {
    return { price, weight, pricePerKg: price };
  }

  const match = grammage.match(/(\d+(?:,\d+)?)\s*([a-zA-Z]+)\s*=\s*([\d,]+)\s*€/);
  if (!match) {
    return { price, weight, pricePerKg: null };
  }

  const [, amount, unit, priceStr] = match;
  const amountValue = parseFloat(amount.replace(',', '.'));
  const priceValue = parseFloat(priceStr.replace(',', '.'));

  let pricePerKg: number | null = null;
  switch (unit.toLowerCase()) {
    case 'kg':
      pricePerKg = priceValue;
      break;
    case 'g':
      pricePerKg = (priceValue / amountValue) * 1000;
      break;
    case 'l':
    case 'liter':
    case 'litre':
      pricePerKg = priceValue;
      break;
  }

  // Add a check for null pricePerKg
  if (pricePerKg === null) {
    console.warn(`Unable to calculate pricePerKg for product: ${data.productName}`);
  }

  return { price, weight, pricePerKg };
};

const saveDataToDb = async (doc: Document, nutritionalData: NutrientInfo) => {
  const productData = getProductData(doc);

  if (productData) {
    const priceAndWeightInfo = getRewePriceAndWeightInfo(productData);
    const transformedData: Database['public']['Tables']['product']['Insert'] = {
      shop: 'rewe',
      url: productData?.productDetailsLink,
      name: productData?.productName,
      description: productData?.description?.default,
      brand: productData?.brandKey,
      manufacturer: productData?.manufacturer?.name,
      image_url: productData?.mediaInformation?.[0]?.mediaUrl,
      Ingredients: productData.ingredientStatement,
      allergens: productData.allergenStatement,
      categories: getCategories(doc),
      shop_id: productData?.productId,
      price: priceAndWeightInfo.price,
      price_per_unit: priceAndWeightInfo.pricePerKg,
      nutritional_data: nutritionalData as unknown as Json,
      gtin: productData.gtin,
    };

    const { error } = await supabase.from('product').upsert(transformedData, {
      onConflict: 'url',
    });

    if (error) {
      console.error('Error saving product data to Supabase:', error);
    }
  }
};

export const reweShop: Shop = {
  name: 'rewe',
  getCurrency(): '€' | '£' {
    return '€';
  },
  async getNutrientInfo(doc: Document): Promise<NutrientInfo> {
    const productData = getProductData(doc);

    if (productData?.nutritionFacts?.length && productData.nutritionFacts.length > 0) {
      try {
        const nutritionalData: NutrientInfo =
          productData.nutritionFacts[0]?.nutrientInformation.reduce((acc, fact) => {
            const key = fact.nutrientType.code.toLowerCase();
            const value = `${fact.quantityContained.value} ${fact.quantityContained.uomShortText}`;
            switch (key) {
              case 'ener-':
                acc.calories = value;
                break;
              case 'choavl':
                acc.carbs = value;
                break;
              case 'fat':
                acc.fat = value;
                break;
              case 'fasat':
                acc.saturatedFat = value;
                break;
              case 'pro-':
                acc.protein = value;
                break;
              case 'fibtg':
                acc.fiber = value;
                break;
              case 'sugar-':
                acc.sugar = value;
                break;
              case 'salteq':
                acc.salt = value;
                break;
            }
            return acc;
          }, {} as NutrientInfo);

        await saveDataToDb(doc, nutritionalData);

        return nutritionalData;
      } catch (error) {
        console.error('Error parsing propstore content:', error);
      }
    }
    return {} as NutrientInfo;
  },

  async getPriceAndWeightInfo(doc: Document): Promise<PriceAndWeightInfo> {
    const productData = getProductData(doc);
    if (productData) {
      try {
        const { price, weight, pricePerKg } = getRewePriceAndWeightInfo(productData);

        return { price, weight, pricePerKg };
      } catch (error) {
        console.error('Error parsing product data:', error);
      }
    }
    return { price: 0, weight: null, pricePerKg: null };
  },

  getInsertionPoint(element: HTMLElement): HTMLElement | null {
    return element.querySelector(this.selectors?.productDetailCallToAction || '');
  },

  insertMetricsIntoCard(card: Element, metricsElement: HTMLElement): void {
    // Find the grammage element with the new class
    const grammageElement = card.querySelector(this.selectors?.grammage || '');

    if (grammageElement && grammageElement.parentNode) {
      // Insert metrics after the grammage element
      grammageElement.parentNode.insertBefore(metricsElement, grammageElement.nextSibling);
    } else {
      // Fallback: insert into the content area
      const contentArea = card.querySelector(this.selectors?.contentArea || '');
      if (contentArea) {
        contentArea.appendChild(metricsElement);
      }
    }
  },
  insertSortSelect(sortSelectElement: HTMLElement, container: HTMLElement): void {
    // For REWE, we want to append the sort select as a child
    container.appendChild(sortSelectElement);
  },
  createCustomSortSelect(
    onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void
  ): React.ReactElement {
    return createCustomSortSelectElement(onSort, 'ml-2', this.getCurrency());
  },
  selectors: {
    // Product listing page selectors
    productLink: 'a[href^="/shop/p/"]',
    productList: '.search-service-rsTiles',
    productCard: '[data-tracking-type="product"], div[id][class*="product-tile"]',
    grammage: '[id$="-grammage"]',
    contentArea: 'a[aria-labelledby]',

    // Product detail page selectors
    productDetailCallToAction: '.pdpr-ProductActionsContainer',

    // Other selectors
    adElement: 'rd-flagship',
    sortSelect: '.rsDisplayoptionsRightHideInMobile',
  },
};
