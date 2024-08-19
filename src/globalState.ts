export let globalCurrency: '€' | '£' = '€';

export function setGlobalCurrency(currency: '€' | '£') {
  globalCurrency = currency;
}
