import React from 'react';
import { Metrics, NutrientInfo } from '../types';
import { COLOR_THRESHOLDS, getColorForValue, formatLabel } from '../utils';
import { detectShop } from '../shops/detectShop';

import { Tooltip } from './Tooltip';

interface MetricsCardProps {
  metrics: Metrics;
  nutrientInfo: NutrientInfo;
}

const shop = detectShop();

export const MetricsCard: React.FC<MetricsCardProps> = ({ metrics, nutrientInfo }) => {
  const metricOrder: (keyof Metrics)[] = [
    'proteinPerCurrency',
    'proteinPer100Calories',
    'proteinToCarbRatio',
  ];

  const nutrientOrder: (keyof NutrientInfo)[] = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'sugar',
    'fiber',
  ];

  const hasProteinData = nutrientInfo.protein !== undefined;

  return (
    <div className='bg-gray-100 border border-gray-300 rounded-lg p-4 my-4 font-sans text-sm text-gray-800'>
      {hasProteinData && (
        <>
          <div className='font-bold mb-2 flex items-center gap-2'>
            Protein Analysis
            <Tooltip />
          </div>
          {metricOrder.map(
            (key) =>
              metrics[key] !== undefined && (
                <div key={key}>
                  {formatLabel(key, shop.getCurrency(window.location.href))}:{' '}
                  <span
                    style={{
                      color: getColorForValue(
                        metrics[key],
                        COLOR_THRESHOLDS[key as keyof typeof COLOR_THRESHOLDS]
                      ),
                    }}
                    className={`font-bold`}
                  >
                    {metrics[key]}
                    {key === 'proteinPerCurrency' &&
                      metrics[key] !== 'N/A' &&
                      `g/${shop.getCurrency(window.location.href)}`}
                    {key === 'proteinPer100Calories' && metrics[key] !== 'N/A' && 'g'}
                  </span>
                </div>
              )
          )}
          <div className='border-t border-gray-300 my-2'></div>
        </>
      )}
      <div className='font-bold mb-2'>Nutrients per 100g</div>
      {nutrientOrder.map(
        (key) =>
          nutrientInfo[key] && (
            <div key={key}>
              {key.charAt(0).toUpperCase() + key.slice(1)}:{' '}
              <span className='font-bold'>{nutrientInfo[key]}</span>
            </div>
          )
      )}
    </div>
  );
};
