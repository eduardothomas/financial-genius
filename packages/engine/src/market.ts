import type { GoalRecipe } from './config.js';
import type { GoalType, Product } from './types.js';

/** Resumen del mercado para un tipo de meta, derivado del catálogo. */
export interface MarketContext {
  goalType: GoalType;
  productCount: number;
  /**
   * Ingreso mínimo más bajo entre productos que exigen ingreso (> 0).
   * null si ninguno exige ingreso (ej. solo tarjetas aseguradas).
   */
  lowestMinIncome: number | null;
  /** Mediana del punto medio de tasa (% anual). */
  medianRate: number | null;
  /** Abono mínimo más bajo del mercado (%). */
  lowestDownPaymentPct: number | null;
}

const midRate = (p: Product) => (p.rate.min + p.rate.max) / 2;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function marketContext(goalType: GoalType, products: Product[]): MarketContext {
  const ps = products.filter((p) => p.type === goalType);
  const incomes = ps.map((p) => p.requirements.minIncome).filter((x) => x > 0);
  const downs = ps
    .map((p) => p.conditions.minDownPaymentPct)
    .filter((x): x is number => typeof x === 'number');
  return {
    goalType,
    productCount: ps.length,
    lowestMinIncome: incomes.length ? Math.min(...incomes) : null,
    medianRate: median(ps.map(midRate)),
    lowestDownPaymentPct: downs.length ? Math.min(...downs) : null,
  };
}

export function downPaymentPct(market: MarketContext, recipe: GoalRecipe): number {
  return market.lowestDownPaymentPct ?? recipe.defaultDownPaymentPct;
}
