import { BASE_PRICE, CPI_WEIGHTS, GOODS, type Good } from './types.js';

/** Gini coefficient of non-negative values (negatives are clamped to 0). 0 = equal, 1 = one has all. */
export function gini(values: number[]): number {
  const v = values.map((x) => Math.max(0, x)).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    sum += v[i];
    weighted += (i + 1) * v[i];
  }
  if (sum <= 0) return 0;
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

/** Consumer price index, 100 = starting prices. */
export function cpi(price: Record<Good, number>): number {
  let now = 0;
  let base = 0;
  for (const g of GOODS) {
    now += CPI_WEIGHTS[g] * price[g];
    base += CPI_WEIGHTS[g] * BASE_PRICE[g];
  }
  return (now / base) * 100;
}

/** Inflation per "year" (100 ticks), from the CPI change over the last `window` ticks. */
export function annualInflation(cpiNow: number, cpiThen: number, window: number): number {
  if (cpiThen <= 0 || window <= 0) return 0;
  const r = Math.pow(cpiNow / cpiThen, 100 / window) - 1;
  return Math.max(-99, Math.min(9999, r * 100));
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
