declare const chrome: any;

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import React, { useState, useEffect } from 'react';
import { Metrics, NutrientInfo } from '../types';
import { cn } from '../lib/utils';

import logo from './logo.png';

interface CustomSortSelectProps {
  onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void;
  className: string;
  shopCurrency: '€' | '£';
}

export function CustomSortSelect({ onSort, className, shopCurrency }: CustomSortSelectProps) {
  const [selectKey, setSelectKey] = useState(0);
  const [currentValue, setCurrentValue] = useState('');

  useEffect(() => {
    // this is called when the shop's sort select is changed to reset this select
    const handleUpdateKey = () => {
      setSelectKey((prevKey) => prevKey + 1);
      setCurrentValue('');
    };
    const customSortSelect = document.querySelector('.nutri-data-sort') as HTMLSelectElement;
    customSortSelect.addEventListener('updateKey', handleUpdateKey);

    return () => {
      customSortSelect.removeEventListener('updateKey', handleUpdateKey);
    };
  }, []);

  const metricOptions: [keyof Metrics | keyof NutrientInfo, string, boolean][] = [
    ['nutriScore', 'NutriScore (High to Low)', false],
    ['proteinPerCurrency', `Protein per ${shopCurrency} (High to Low)`, false],
    ['proteinPer100Calories', 'Protein per 100 Calories (High to Low)', false],
    ['proteinToCarbRatio', 'Protein to Carb Ratio (High to Low)', false],
    ['protein', 'Protein (High to Low)', false],
    ['carbs', 'Carbs (High to Low)', false],
    ['fat', 'Fat (High to Low)', false],
    ['saturatedFat', 'Saturated Fat (Low to High)', true],
    ['fiber', 'Fiber (High to Low)', false],
    ['calories', 'Calories (Low to High)', true],
    ['sugar', 'Sugar (Low to High)', true],
  ];

  const handleChange = (value: string) => {
    setCurrentValue(value);
    const [metric, ascending] = value.split(',');
    if (metric) {
      onSort(metric as keyof Metrics | keyof NutrientInfo, ascending === 'true');
    }
  };

  return (
    <div className={cn('font-sans flex items-center gap-1 nutri-data-sort', className)}>
      <button
        onClick={() => {
          onSort('nutriScore', false);
          setCurrentValue('nutriScore,false');
        }}
        className='appearance-none p-0 m-0 bg-transparent rounded-xl cursor-pointer transition-all duration-150 active:scale-95 border border-gray-200'
        title='Sort by NutriScore (High to Low)'
      >
        <img src={chrome.runtime.getURL(logo)} alt='logo' className='w-8 h-8' />
      </button>
      <Select onValueChange={handleChange} key={selectKey} value={currentValue}>
        <SelectTrigger>
          <SelectValue placeholder='Sort by Nutrient Metrics' />
        </SelectTrigger>
        <SelectContent className='font-sans'>
          {metricOptions.map(([metric, label, ascending]) => (
            <SelectItem key={metric} value={`${metric},${ascending}`}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
