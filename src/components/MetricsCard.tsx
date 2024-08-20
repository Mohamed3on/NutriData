import React from 'react';
import { Metrics, NutrientInfo } from '../types';
import { COLOR_THRESHOLDS, getColorForValue, formatLabel } from '../utils';
import { globalCurrency } from '../globalState';
import { Tooltip } from './Tooltip';

interface MetricsCardProps {
  metrics: Metrics;
  nutrientInfo: NutrientInfo;
}

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

  return (
    <div>
      <style>
        {`
          .nutri-data-metrics {
            background-color: #f8f8f8;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 16px;
            margin: 16px 0;
            font-size: 12px;
            font-family: system-ui;
            color: #333;
            position: relative;
            width: max-content;
          }
          .section-title {
            font-weight: bold;
            margin-bottom: 5px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
        `}
      </style>
      <div className='section-title'>
        Protein Analysis
        <Tooltip />
      </div>
      {metricOrder.map((key) => (
        <div key={key}>
          {formatLabel(key, globalCurrency)}:{' '}
          <span
            style={{
              fontWeight: 'bold',
              color: getColorForValue(
                metrics[key],
                COLOR_THRESHOLDS[key as keyof typeof COLOR_THRESHOLDS]
              ),
            }}
          >
            {metrics[key]}
            {key === 'proteinPerCurrency' && metrics[key] !== 'N/A' && `g/${globalCurrency}`}
            {key === 'proteinPer100Calories' && metrics[key] !== 'N/A' && 'g'}
          </span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #ddd', margin: '10px 0' }}></div>
      <div className='section-title'>Nutrients per 100g</div>
      {nutrientOrder.map(
        (key) =>
          nutrientInfo[key] && (
            <div key={key}>
              {key.charAt(0).toUpperCase() + key.slice(1)}:{' '}
              <span style={{ fontWeight: 'bold' }}>{nutrientInfo[key]}</span>
            </div>
          )
      )}
    </div>
  );
};
