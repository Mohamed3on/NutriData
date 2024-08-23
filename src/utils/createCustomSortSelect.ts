import { globalCurrency } from '../globalState';
import { Metrics, NutrientInfo } from '../types';

export function createCustomSortSelect(
  onSort: (metric: keyof Metrics | keyof NutrientInfo, ascending: boolean) => void,
  className: string,
  styles: Partial<CSSStyleDeclaration>
): HTMLSelectElement {
  const customSelect = document.createElement('select');
  customSelect.className = className;
  Object.assign(customSelect.style, styles);

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Sort by Nutrient Metrics';
  customSelect.appendChild(defaultOption);

  const metricOptions: [keyof Metrics | keyof NutrientInfo, string, boolean][] = [
    ['proteinPerCurrency', `Protein per ${globalCurrency} (High to Low)`, false],
    ['proteinPer100Calories', 'Protein per 100 Calories (High to Low)', false],
    ['proteinToCarbRatio', 'Protein to Carb Ratio (High to Low)', false],
    ['protein', 'Protein (High to Low)', false],
    ['carbs', 'Carbs (High to Low)', false],
    ['fat', 'Fat (High to Low)', false],
    ['fiber', 'Fiber (High to Low)', false],
    ['calories', 'Calories (Low to High)', true],
    ['sugar', 'Sugar (Low to High)', true],
  ];

  metricOptions.forEach(([metric, label, ascending]) => {
    const option = document.createElement('option');
    option.value = `${metric},${ascending}`;
    option.textContent = label;
    customSelect.appendChild(option);
  });

  customSelect.addEventListener('change', (event) => {
    const [metric, ascending] = (event.target as HTMLSelectElement).value.split(',');
    if (metric) {
      onSort(metric as keyof Metrics | keyof NutrientInfo, ascending === 'true');
    }
  });

  return customSelect;
}
