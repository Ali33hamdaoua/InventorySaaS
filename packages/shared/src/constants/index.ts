export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

export const CRITICAL_STOCK_THRESHOLD_RATIO = 1; // closingQty <= minStockLevel
