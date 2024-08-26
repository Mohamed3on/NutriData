import { Shop } from '../types/shop';
import { amazonShop } from './amazon';
import { reweShop } from './rewe';

export function detectShop(): Shop {
  const hostname = window.location.hostname;
  if (hostname.includes('amazon')) return amazonShop;
  return reweShop;
}
