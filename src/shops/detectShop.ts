'use strict';

import { Shop } from '../types';
import { amazonShop } from './amazon/amazon';
import { reweShop } from './rewe/rewe';
import { mercadonaShop } from './mercadona'; // Import the new shop

type ShopName = 'REWE' | 'AMAZON' | 'MERCADONA';

// Function to get the shop name based on hostname
function getShopName(): ShopName {
  const hostname = window.location.hostname;

  if (hostname.includes('rewe.de')) {
    return 'REWE';
  } else if (hostname.includes('amazon')) {
    // Could be amazon.de, amazon.co.uk, etc.
    return 'AMAZON';
  } else if (hostname === 'tienda.mercadona.es') {
    return 'MERCADONA';
  }

  return 'REWE';
}

// Function to get the corresponding shop object
export function detectShop(): Shop {
  const shopName = getShopName();

  switch (shopName) {
    case 'REWE':
      return reweShop;
    case 'AMAZON':
      return amazonShop;
    case 'MERCADONA':
      return mercadonaShop;
    default:
      console.warn('Unknown or unsupported shop:', window.location.hostname);
      return reweShop;
  }
}
