import { defaultConfig, type EngineConfig, type GoalRecipe } from './config.js';
import {
  clamp01,
  creditUtilization,
  debtToIncome,
  lowerIsBetter,
  monthlyPayment,
  round,
} from './finance.js';
import { downPaymentPct, marketContext, type MarketContext } from './market.js';
import type {
  FactorId,
  FactorResult,
  FinancialSnapshot,
  Goal,
  Obstacle,
  Product,
  ReadinessResult,
} from './types.js';

interface FactorEval {
  score: number;
  blocking: boolean;
  evidence: Record<string, number | string | null>;
}

/** Cuota estimada de la nueva deuda (auto / hipoteca) con datos medianos del mercado. */
export function estimateNewPayment(
  goal: Goal,
  market: MarketContext,
  recipe: GoalRecipe,
): { payment: number; principal: number | null; rate: number | null; term: number | null } {
  if (goal.type === 'credit_card' || !goal.targetAmount || market.medianRate === null) {
    return { payment: 0, principal: null, rate: market.medianRate, term: null };
  }
  const down = downPaymentPct(market, recipe);
  const principal = goal.targetAmount * (1 - down / 100);
  const term = goal.desiredTermMonths ?? recipe.defaultTermMonths;
  return {
    payment: monthlyPayment(principal, market.medianRate, term),
    principal,
    rate: market.medianRate,
    term,
  };
}

function evalFactor(
  factor: FactorId,
  goal: Goal,
  s: FinancialSnapshot,
  market: MarketContext,
  recipe: GoalRecipe,
  cfg: EngineConfig,
): FactorEval {
  switch (factor) {
    case 'income': {
      const min = market.lowestMinIncome;
      if (min === null) {
        // Sin productos en catálogo → neutro. Productos sin exigencia de ingreso → no es freno.
        const score = market.productCount > 0 ? 1 : 0.5;
        return { score, blocking: false, evidence: { income: s.netMonthlyIncome, marketMin: null } };
      }
      const ratio = s.netMonthlyIncome / min;
      // <0.5x → 0 · 1x → 0.7 · ≥1.5x → 1
      const score =
        ratio >= 1.5 ? 1 : ratio >= 1 ? 0.7 + (0.3 * (ratio - 1)) / 0.5 : clamp01((ratio - 0.5) * 1.4);
      return {
        score,
        blocking: ratio < 1,
        evidence: { income: s.netMonthlyIncome, marketMin: min, ratio: round(ratio) },
      };
    }
    case 'dti': {
      const np = estimateNewPayment(goal, market, recipe);
      const dti = debtToIncome(s, np.payment);
      return {
        score: Number.isFinite(dti) ? lowerIsBetter(dti, recipe.dtiGood, recipe.dtiMax) : 0,
        blocking: dti >= recipe.dtiMax,
        evidence: {
          dti: Number.isFinite(dti) ? round(dti, 3) : null,
          estimatedNewPayment: round(np.payment),
          dtiGood: recipe.dtiGood,
          dtiMax: recipe.dtiMax,
        },
      };
    }
    case 'employment': {
      const target = recipe.employmentMonthsTarget;
      return {
        score: clamp01(s.employmentMonths / target),
        blocking: false,
        evidence: { months: s.employmentMonths, target },
      };
    }
    case 'apc': {
      return {
        score: recipe.apcScores[s.apcSelfReported],
        blocking: false,
        evidence: { selfReported: s.apcSelfReported },
      };
    }
    case 'down_payment': {
      if (!goal.targetAmount) {
        return { score: 0.5, blocking: false, evidence: { required: null, saved: s.savingsForDownPayment } };
      }
      const pct = downPaymentPct(market, recipe);
      const required = (goal.targetAmount * pct) / 100;
      const score = required <= 0 ? 1 : clamp01(s.savingsForDownPayment / required);
      return {
        score,
        blocking: false,
        evidence: { required: round(required), saved: s.savingsForDownPayment, pct },
      };
    }
    case 'utilization': {
      const u = creditUtilization(s);
      if (u === null) return { score: 1, blocking: false, evidence: { utilization: null } };
      return {
        score: lowerIsBetter(u, cfg.utilizationGood, cfg.utilizationMax),
        blocking: false,
        evidence: { utilization: round(u, 3), good: cfg.utilizationGood },
      };
    }
    case 'documents': {
      const d = s.documents;
      const ready = [d.incomeProof, d.employmentLetter, d.apcReport].filter(Boolean).length;
      return { score: ready / 3, blocking: false, evidence: { ready, total: 3 } };
    }
  }
}

/**
 * Índice de preparación (0–100) de una meta, con sus frenos.
 * Determinista: mismas entradas → misma salida.
 */
export function assessReadiness(
  goal: Goal,
  snapshot: FinancialSnapshot,
  products: Product[],
  cfg: EngineConfig = defaultConfig,
): ReadinessResult {
  const recipe = cfg.goals[goal.type];
  const market = marketContext(goal.type, products);
  const factorIds = (Object.keys(recipe.weights) as FactorId[]).filter((f) => recipe.weights[f] > 0);
  const totalWeight = factorIds.reduce((a, f) => a + recipe.weights[f], 0);

  const evals = factorIds.map((f) => ({ f, e: evalFactor(f, goal, snapshot, market, recipe, cfg) }));

  const factors: FactorResult[] = evals.map(({ f, e }) => ({
    factor: f,
    score: round(e.score, 3),
    weight: recipe.weights[f],
    evidence: e.evidence,
  }));

  const score = round(
    (evals.reduce((a, { f, e }) => a + e.score * recipe.weights[f], 0) / totalWeight) * 100,
    1,
  );

  const obstacles: Obstacle[] = evals
    .filter(({ e }) => e.score < cfg.obstacleThreshold || e.blocking)
    .map(({ f, e }) => ({
      factor: f,
      impactPoints: round(((1 - e.score) * recipe.weights[f] * 100) / totalWeight, 1),
      blocking: e.blocking,
      evidence: e.evidence,
      suggestedActions: cfg.missionTemplates[f],
    }))
    .sort(
      (a, b) =>
        Number(b.blocking) - Number(a.blocking) ||
        b.impactPoints - a.impactPoints ||
        a.factor.localeCompare(b.factor),
    )
    .slice(0, cfg.maxObstaclesShown);

  const hasBlocking = evals.some(({ e }) => e.blocking);

  return {
    goalId: goal.id,
    goalType: goal.type,
    score,
    readyToCompare: score >= cfg.readyThreshold && !hasBlocking,
    factors,
    obstacles,
    weightsVersion: cfg.version,
  };
}
