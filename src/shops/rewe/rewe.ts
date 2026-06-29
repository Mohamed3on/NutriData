import { CollectPayload, Metrics, NutrientInfo, PriceAndWeightInfo, Shop } from '../../types';
import { createCustomSortSelectElement } from '../../utils/createCustomSortSelect';
import { parseNumeric } from '../../utils';
import { ProductData } from './ProductData';

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

// Full category path (incl. the leaf, e.g. "Mozzarella") from the product
// page breadcrumb. The propstore `categories` can be shallower; the breadcrumb
// is the authoritative path.
const getBreadcrumbCategories = (doc: Document): string[] => {
  const links = doc.querySelectorAll(
    '.plr-ProductPageBreadcrumbs__List a.plr-ProductPageBreadcrumbs__Link'
  );
  return Array.from(links)
    .map((a) => (a.textContent || '').trim())
    .filter((t) => t && t.toLowerCase() !== 'shop startseite');
};

const getRewePriceAndWeightInfo = (data: ProductData): PriceAndWeightInfo => {
  const price = data.pricing.price / 100; // Convert cents to euros
  const weight = data.packaging.weightPerPiece;
  const { grammage } = data.pricing;

  if (['1l', '1kg'].includes(grammage)) {
    return { price, weight, pricePerKg: price };
  }

  const match = grammage.match(/(\d+(?:,\d+)?)\s*([a-zA-Z]+)\s*=\s*([\d,]+)\s*€/);
  if (!match) return { price, weight, pricePerKg: null };

  const [, amount, unit, priceStr] = match;
  const amountValue = parseNumeric(amount);
  const priceValue = parseNumeric(priceStr);
  if (amountValue === null || priceValue === null || amountValue === 0) {
    return { price, weight, pricePerKg: null };
  }

  let pricePerKg: number | null = null;
  switch (unit.toLowerCase()) {
    case 'kg':
    case 'l':
    case 'liter':
    case 'litre':
      pricePerKg = priceValue;
      break;
    case 'g':
    case 'ml':
      pricePerKg = (priceValue / amountValue) * 1000;
      break;
  }

  return { price, weight, pricePerKg };
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

  buildCollectPayload(doc: Document, nutrientInfo: NutrientInfo): CollectPayload | null {
    const data = getProductData(doc);
    if (!data) return null;
    const id = data.productId || data.articleId;
    if (!id) return null;

    let price: number | null = null;
    let pricePerKg: number | null = null;
    try {
      const pw = getRewePriceAndWeightInfo(data);
      price = pw.price ?? null;
      pricePerKg = pw.pricePerKg ?? null;
    } catch {
      // pricing is optional — keep nutrition even if grammage is unparseable
    }

    const breadcrumb = getBreadcrumbCategories(doc);
    const categories = breadcrumb.length
      ? breadcrumb
      : Array.isArray(data.categories) && data.categories.length
        ? data.categories
        : null;

    return {
      shop: 'rewe',
      shop_id: String(id),
      name: data.productName || null,
      url: data.slug ? `https://shop.rewe.de/p/${data.slug}/${id}` : data.productDetailsLink || null,
      image_url: data.mediaInformation?.find((m) => m.mediaUrl)?.mediaUrl || null,
      categories,
      price,
      price_per_unit: pricePerKg,
      unit: null,
      brand: data.brandKey || data.manufacturer?.name || null,
      gtin: data.gtin || null,
      nutritional_data: nutrientInfo,
    };
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
      // Fallback for lrms tiles: insert after product info
      const productInfo = card.querySelector('.lrms-productInformation');
      if (productInfo && productInfo.parentNode) {
        productInfo.parentNode.insertBefore(metricsElement, productInfo.nextSibling);
      } else {
        // Fallback: insert into the content area
        const contentArea = card.querySelector(this.selectors?.contentArea || '');
        if (contentArea) {
          contentArea.appendChild(metricsElement);
        }
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
    productLink: 'a[href^="/shop/p/"], a[href^="/shop/products/"]',
    productList: '.search-service-rsTiles',
    productCard: '[data-tracking-type="product"], [data-theme="tile-responsive"], .lrms-productTile',
    grammage: '[id$="-grammage"]',
    contentArea: 'a[aria-labelledby]',

    // Product detail page selectors
    productDetailCallToAction: '.pdpr-ProductActionsContainer',

    // Other selectors
    adElement: 'rd-flagship',
    sortSelect: '.rsDisplayoptionsRightHideInMobile, .productCountWrapper',
  },
};
