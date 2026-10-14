import { defaultConfig, type EngineConfig } from './config.js';
import { clamp01, lowerIsBetter, monthlyPayment, paymentCapacity, round, stableHash, totalInterest } from './finance.js';
import { downPaymentPct, marketContext } from './market.js';
import type {
  Catalog,
  ExcludedProduct,
  FinancialSnapshot,
  Goal,
  Product,
  RankedProduct,
  RankingResult,
  Reason,
} from './types.js';

/**
 * Vista del producto que el ranking puede leer.
 * Lista blanca explícita: `commercial` (patrocinio, comisión) queda fuera
 * por construcción. No agregar campos comerciales aquí.
 */
type RankingView = Omit<Product, 'commercial'>;

function toRankingView(p: Product): RankingView {
  return {
    id: p.id,
    institutionId: p.institutionId,
    institutionName: p.institutionName,
    type: p.type,
    name: p.name,
    rate: p.rate,
    annualFee: p.annualFee,
    oneTimeFees: p.oneTimeFees,
    requirements: p.requirements,
    conditions: p.conditions,
    benefits: p.benefits,
    source: p.source,
  };
}

/** Saldo promedio supuesto para estimar el costo de intereses de una tarjeta. */
const CARD_ASSUMED_BALANCE = 1000;

const midRate = (p: RankingView) => (p.rate.min + p.rate.max) / 2;

interface LoanTerms {
  principal: number;
  term: number;
  downPct: number;
}

function hardFilter(p: RankingView, s: FinancialSnapshot, loan: LoanTerms | null): string[] {
  const r = p.requirements;
  const failed: string[] = [];
  if (s.netMonthlyIncome < r.minIncome) failed.push('min_income');
  if (s.employmentMonths < r.minEmploymentMonths) failed.push('min_employment_months');
  if (s.age < r.minAge || (r.maxAge !== undefined && s.age > r.maxAge)) failed.push('age');
  if (!r.residency.includes(s.residency)) failed.push('residency');
  if (!r.employmentTypes.includes(s.employmentType)) failed.push('employment_type');
  if (loan) {
    const c = p.conditions;
    if (c.minAmount !== undefined && loan.principal < c.minAmount) failed.push('min_amount');
    if (c.maxAmount !== undefined && loan.principal > c.maxAmount) failed.push('max_amount');
    if (c.maxTermMonths !== undefined && loan.term > c.maxTermMonths) failed.push('max_term');
    if (c.minTermMonths !== undefined && loan.term < c.minTermMonths) failed.push('min_term');
  }
  return failed;
}

function costIndex(p: RankingView, loan: LoanTerms | null): number {
  if (!loan) return p.annualFee + (midRate(p) / 100) * CARD_ASSUMED_BALANCE;
  const years = loan.term / 12;
  return totalInterest(loan.principal, midRate(p), loan.term) + p.oneTimeFees + p.annualFee * years;
}

/**
 * Ranking de productos para una meta. Devuelve el top N con razones
 * estructuradas y supuestos. El LLM solo convierte las razones en texto.
 */
export function rankProducts(
  goal: Goal,
  snapshot: FinancialSnapshot,
  catalog: Catalog,
  cfg: EngineConfig = defaultConfig,
): RankingResult {
  const recipe = cfg.goals[goal.type];
  const w = recipe.rankingWeights;
  const views = catalog.products.filter((p) => p.type === goal.type).map(toRankingView);
  const market = marketContext(goal.type, views);

  // Términos del préstamo (auto / hipoteca) por producto: cada banco exige su propio abono.
  // Tarjetas o meta sin monto: null.
  const loanFor = (v: RankingView): LoanTerms | null => {
    if (goal.type === 'credit_card' || !goal.targetAmount) return null;
    const downPct = v.conditions.minDownPaymentPct ?? downPaymentPct(market, recipe);
    return {
      principal: goal.targetAmount * (1 - downPct / 100),
      term: goal.desiredTermMonths ?? recipe.defaultTermMonths,
      downPct,
    };
  };

  const excluded: ExcludedProduct[] = [];
  const eligible: RankingView[] = [];
  for (const v of views) {
    const failed = hardFilter(v, snapshot, loanFor(v));
    if (failed.length) excluded.push({ productId: v.id, failed });
    else eligible.push(v);
  }

  const costs = eligible.map((v) => costIndex(v, loanFor(v)));
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const capacity = paymentCapacity(snapshot, cfg.bufferPctOfIncome);
  const prefs = goal.preferences ?? [];
  const totalW = w.cost + w.eligibility + w.benefits + w.affordability;

  const scored = eligible.map((v, i) => {
    const loan = loanFor(v);
    const cost = maxCost === minCost ? 1 : 1 - (costs[i]! - minCost) / (maxCost - minCost);

    const incomeRatio = v.requirements.minIncome > 0 ? snapshot.netMonthlyIncome / v.requirements.minIncome : 2;
    const eligibility =
      0.7 * clamp01(incomeRatio - 1) +
      0.3 * clamp01((snapshot.employmentMonths - v.requirements.minEmploymentMonths) / 12);

    const matched = prefs.filter((x) => v.benefits.includes(x));
    const benefits = prefs.length === 0 ? 0.5 : matched.length / prefs.length;

    const payment = loan ? monthlyPayment(loan.principal, midRate(v), loan.term) : null;
    const payRatio = payment === null ? 0 : capacity > 0 ? payment / capacity : Infinity;
    const affordability = payment === null ? 1 : lowerIsBetter(payRatio, 0.5, 1);

    const score =
      ((cost * w.cost + eligibility * w.eligibility + benefits * w.benefits + affordability * w.affordability) /
        totalW) *
      100;

    return { v, loan, cost, eligibility, benefits, affordability, payment, payRatio, matched, score };
  });

  scored.sort((a, b) => b.score - a.score || b.cost - a.cost || a.v.id.localeCompare(b.v.id));

  const top: RankedProduct[] = scored.slice(0, cfg.topN).map((x, i) => {
    const reasons: Reason[] = [];
    if (x.cost === 1 && eligible.length > 1) reasons.push({ code: 'lowest_cost', params: { compared: eligible.length } });
    else if (x.cost >= 0.7) reasons.push({ code: 'low_cost', params: { compared: eligible.length } });
    if (x.v.annualFee === 0 && goal.type === 'credit_card') reasons.push({ code: 'no_annual_fee', params: {} });
    if (x.matched.length) reasons.push({ code: 'matches_preferences', params: { benefits: x.matched.join(',') } });
    if (x.payment !== null && x.payRatio <= 0.5)
      reasons.push({ code: 'affordable_payment', params: { payment: round(x.payment), capacity: round(capacity) } });
    if (x.payment !== null && x.payRatio > 0.8)
      reasons.push({ code: 'tight_payment', params: { payment: round(x.payment), capacity: round(capacity) } });
    if (x.eligibility >= 0.6) reasons.push({ code: 'comfortable_requirements', params: { minIncome: x.v.requirements.minIncome } });
    else if (x.eligibility < 0.2) reasons.push({ code: 'tight_requirements', params: { minIncome: x.v.requirements.minIncome } });

    const assumptions = [
      `Tasa estimada con el punto medio del rango publicado (${x.v.rate.min}%–${x.v.rate.max}%); la tasa final la define el banco según tu perfil.`,
    ];
    if (x.loan) {
      assumptions.push(
        `Monto financiado ${round(x.loan.principal)} con abono de ${x.loan.downPct}% y plazo de ${x.loan.term} meses.`,
      );
    } else {
      assumptions.push(`Costo de intereses estimado con un saldo promedio de ${CARD_ASSUMED_BALANCE}.`);
    }

    return {
      position: i + 1,
      productId: x.v.id,
      institutionName: x.v.institutionName,
      name: x.v.name,
      score: round(x.score, 1),
      components: {
        cost: round(x.cost, 3),
        eligibility: round(x.eligibility, 3),
        benefits: round(x.benefits, 3),
        affordability: round(x.affordability, 3),
      },
      estimatedMonthlyPayment: x.payment === null ? null : round(x.payment),
      reasons: reasons.slice(0, 4),
      assumptions,
      source: x.v.source,
    };
  });

  return {
    goalId: goal.id,
    top,
    eligibleCount: eligible.length,
    consideredCount: views.length,
    excluded,
    audit: {
      catalogVersion: catalog.version,
      weightsVersion: cfg.version,
      // Ordenado por id: el hash no depende del orden en que llega el catálogo.
      inputHash: stableHash({ goal, snapshot, products: [...views].sort((a, b) => a.id.localeCompare(b.id)) }),
    },
  };
}
