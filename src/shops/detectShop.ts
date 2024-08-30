import { Shop } from '../types/shop';
import { amazonShop } from './amazon/amazon';
import { reweShop } from './rewe/rewe';

export function detectShop(): Shop {
  const hostname = window.location.hostname;
  if (hostname.includes('amazon')) return amazonShop;
  return reweShop;
}
