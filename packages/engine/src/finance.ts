import type { FinancialSnapshot } from './types';

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const round = (x: number, decimals = 2): number => {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
};

/**
 * Cuota mensual con amortización francesa.
 * @param principal monto financiado
 * @param annualRatePct tasa anual en % (ej. 7.5)
 * @param termMonths plazo en meses
 */
export function monthlyPayment(principal: number, annualRatePct: number, termMonths: number): number {
  if (principal <= 0) return 0;
  if (termMonths <= 0) throw new Error('termMonths debe ser > 0');
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - (1 + r) ** -termMonths);
}

/** Total de intereses pagados en la vida del préstamo. */
export function totalInterest(principal: number, annualRatePct: number, termMonths: number): number {
  return monthlyPayment(principal, annualRatePct, termMonths) * termMonths - principal;
}

export function totalDebtPayments(s: FinancialSnapshot): number {
  return s.debts.reduce((acc, d) => acc + d.monthlyPayment, 0);
}

/** Ratio deuda/ingreso: pagos mensuales de deuda (+ nueva cuota) ÷ ingreso neto. */
export function debtToIncome(s: FinancialSnapshot, extraMonthlyPayment = 0): number {
  if (s.netMonthlyIncome <= 0) return Infinity;
  return (totalDebtPayments(s) + extraMonthlyPayment) / s.netMonthlyIncome;
}

/** Utilización de crédito rotativo: saldos de tarjetas ÷ límites. null si no tiene tarjetas. */
export function creditUtilization(s: FinancialSnapshot): number | null {
  const cards = s.debts.filter((d) => d.kind === 'credit_card' && (d.limit ?? 0) > 0);
  if (cards.length === 0) return null;
  const balance = cards.reduce((a, d) => a + d.balance, 0);
  const limit = cards.reduce((a, d) => a + (d.limit ?? 0), 0);
  return balance / limit;
}

/** Capacidad de pago mensual disponible para una nueva cuota. */
export function paymentCapacity(s: FinancialSnapshot, bufferPctOfIncome: number): number {
  return (
    s.netMonthlyIncome -
    s.fixedMonthlyExpenses -
    totalDebtPayments(s) -
    s.netMonthlyIncome * bufferPctOfIncome
  );
}

/** Interpolación lineal: valor <= good → 1, valor >= bad → 0. */
export function lowerIsBetter(value: number, good: number, bad: number): number {
  if (value <= good) return 1;
  if (value >= bad) return 0;
  return 1 - (value - good) / (bad - good);
}

/** Hash FNV-1a de 32 bits sobre JSON con claves ordenadas. Para auditoría. */
export function stableHash(value: unknown): string {
  const json = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}
