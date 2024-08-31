import React from 'react';
import { Metrics, NutrientInfo } from '../types';
import { CustomSortSelect } from '../components/CustomSortSelect';

export function createCustomSortSelectElement(
  onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void,
  className: string,
  shopCurrency: '€' | '£'
): React.ReactElement {
  return <CustomSortSelect onSort={onSort} className={className} shopCurrency={shopCurrency} />;
}
