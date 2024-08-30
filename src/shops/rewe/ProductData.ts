export interface ProductData {
  productId: string;
  articleId: string;
  listingId: string;
  listingVersion: string;
  productGroupId: string;
  productGroupSlug: string;
  slug: string;
  articleGroupId: string;
  gtin: string;
  storeServiceType: string;
  marketCode: string;
  nan: string;
  productName: string;
  description: {
    default: string;
  };
  categories: string[];
  categorySlug: string;
  tags: string[];
  allergenStatement: string;
  ingredientStatement: string;
  regulatedProductName: string;
  mediaInformation: Array<{
    dimensions: {
      height: number;
      width: number;
    };
    mediaUrl: string;
    type: string;
  }>;
  bio: boolean;
  new: boolean;
  qsCertificationMark: boolean;
  nutritionFacts: Array<{
    preparationState: {
      code: string;
      text: string;
    };
    nutrientInformation: Array<{
      nutrientType: {
        code: string;
        text: string;
      };
      measurementPrecision: {
        code: string;
        text: string;
      };
      quantityContained: {
        value: number;
        uom: string;
        uomShortText: string;
        uomLongText: string;
      };
    }>;
    servingSize: {
      value: number;
      uom: string;
      uomShortText: string;
      uomLongText: string;
    };
  }>;
  packaging: {
    weightPerPiece: number;
    volumeCode: string;
  };
  pricing: {
    grammage: string;
    price: number;
    regularPrice: number;
    bulkDiscounts: Array<{
      basePrice: {
        measure: {
          quantity: number;
          uom: string;
        };
        value: number;
      };
      discountRate: number;
      grammage: string;
      minimumQuantity: number;
      price: number;
    }>;
  };
  limitations: {
    orderLimit: number;
    regularOrderLimit: number;
  };
  merchant: {
    name: string;
    type: string;
    mediaInformation: {
      logo: {
        defaultUrl: string;
      };
    };
    address: {
      city: string;
      companyName: string;
      country: string;
      houseNumber: string;
      street: string;
      zipCode: string;
    };
  };
  brandKey: string;
  manufacturer: {
    name: string;
    communicationAddress: string;
  };
  attributeGroups: Array<{
    label: string;
    attributes: Array<{
      name: string;
      label: string;
      showLabel: boolean;
      value: string;
      index: number;
    }>;
    index: number;
  }>;
  isBuyable: boolean;
  isMarketSelected: boolean;
  noIndex: boolean;
  productDetailsLink: string;
}
