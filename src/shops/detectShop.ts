import { Shop } from '../types';
import { amazonShop } from './amazon/amazon';
import { reweShop } from './rewe/rewe';

export function detectShop(): Shop {
  const hostname = window.location.hostname;
  if (hostname.includes('amazon')) return amazonShop;
  return reweShop;
}
