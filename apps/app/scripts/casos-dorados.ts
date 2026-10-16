/**
 * Casos dorados: entradas y salidas esperadas de los textos y formatos de la app,
 * generados desde esta implementación (TypeScript). La app iOS nativa (Swift) debe
 * producir exactamente lo mismo: su prueba carga este JSON.
 *
 *   pnpm --filter @fg/app casos-dorados   # regenera apps/ios/FinancialGeniusCore/Tests/FinancialGeniusCoreTests/casos-dorados.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FactorId, GoalType, Reason } from '@fg/engine';
import type { ChatAttachment, GoalView } from '../src/lib/api';
import { attachmentCard, suggestions } from '../src/lib/chat';
import {
  benefitLabel,
  FACTOR_LABEL,
  GOAL_HINT,
  GOAL_LABEL,
  levelLabel,
  money,
  monthLabel,
  obstacleDetail,
  parseAmount,
  pct,
  reasonText,
  weekLabel,
} from '../src/lib/format';

export const ARCHIVO = join(dirname(fileURLToPath(import.meta.url)), '../../ios/FinancialGeniusCore/Tests/FinancialGeniusCoreTests/casos-dorados.json');

const goal = (type: GoalType, priority: number): GoalView => ({
  id: `g-${type}`, type, priority, preferences: [], status: 'active', createdAt: '', readinessScore: null,
});

export function generar() {
  const montos: Array<[number, 0 | 2]> = [
    [0, 0], [7, 0], [389.03, 0], [389.5, 0], [388.5, 0], [1000, 0], [22500, 0], [1234567.89, 0], [-1500, 0],
    [389.03, 2], [1250.5, 2], [0.005, 2], [1.005, 2], [999.999, 2], [-12.3, 2],
  ];
  const porcentajes: Array<[number, number]> = [[46.6, 0], [30, 0], [7.25, 1], [60.04, 1], [0.5, 0], [12.345, 2]];
  const razones: Reason[] = [
    { code: 'lowest_cost', params: { compared: 3 } },
    { code: 'low_cost', params: { compared: 3 } },
    { code: 'no_annual_fee', params: {} },
    { code: 'matches_preferences', params: { benefits: 'cashback,miles' } },
    { code: 'matches_preferences', params: { benefits: 'otro' } },
    { code: 'affordable_payment', params: { payment: 389.03, capacity: 940 } },
    { code: 'tight_payment', params: { payment: 912.44, capacity: 940 } },
    { code: 'comfortable_requirements', params: { minIncome: 1500 } },
    { code: 'tight_requirements', params: { minIncome: 1200 } },
    { code: 'higher_down_payment', params: { pct: 15, lowest: 10 } },
  ];
  const frenos: Array<[FactorId, Record<string, number | string | null>]> = [
    ['income', { income: 1100, marketMin: 600, ratio: 1.83 }],
    ['income', { income: 1100, marketMin: null }],
    ['dti', { dti: 0.466, estimatedNewPayment: 912.44, dtiGood: 0.3, dtiMax: 0.45 }],
    ['dti', { dti: null, estimatedNewPayment: 0, dtiGood: 0.3, dtiMax: 0.45 }],
    ['employment', { months: 14, target: 24 }],
    ['apc', { selfReported: 'good' }], ['apc', { selfReported: 'fair' }], ['apc', { selfReported: 'poor' }],
    ['apc', { selfReported: 'none' }], ['apc', { selfReported: 'unknown' }],
    ['down_payment', { required: 7500, saved: 4000, pct: 5 }],
    ['down_payment', { required: null, saved: 800 }],
    ['utilization', { utilization: 0.6, good: 0.3 }],
    ['utilization', { utilization: null }],
    ['documents', { ready: 2, total: 3 }],
  ];
  const adjuntos: ChatAttachment[] = [
    { type: 'readiness', goalId: 'g1', goalType: 'mortgage', score: 65.1, ready: false },
    { type: 'readiness', goalId: 'g2', goalType: 'auto_loan', score: 91.2, ready: true },
    {
      type: 'ranking', goalId: 'g2', readyToCompare: true,
      top: [
        { position: 1, productId: 'alfa-auto', name: 'Alfa Auto Nuevo', institutionName: 'Banco Alfa', estimatedMonthlyPayment: 389.03 },
        { position: 2, productId: 'beta-auto', name: 'Beta Autos', institutionName: 'Banco Beta', estimatedMonthlyPayment: 372.58 },
      ],
    },
    { type: 'ranking', goalId: 'g3', readyToCompare: false, top: [{ position: 1, productId: 'c', name: 'Alfa Clásica', institutionName: 'Banco Alfa', estimatedMonthlyPayment: null }] },
    { type: 'ranking', goalId: 'g4', readyToCompare: false, top: [] },
    { type: 'plan', goalId: 'g1', objective: 'Bajar tus pagos de deuda frente a tu ingreso', done: 1, total: 5 },
    { type: 'goal', goalId: 'g9', goalType: 'mortgage', priority: 2, targetAmount: 150000 },
    { type: 'goal', goalId: 'g8', goalType: 'credit_card', priority: 1, targetAmount: null },
  ];
  const sugerencias: Array<{ goals: GoalView[]; hasProfile: boolean }> = [
    { goals: [], hasProfile: false },
    { goals: [goal('auto_loan', 2), goal('mortgage', 1)], hasProfile: true },
    { goals: [goal('credit_card', 1)], hasProfile: false },
    { goals: [goal('auto_loan', 1)], hasProfile: true },
  ];

  return {
    _nota: 'Generado por apps/app/scripts/casos-dorados.ts. No editar a mano.',
    money: montos.map(([n, d]) => ({ n, decimals: d, out: money(n, d) })),
    pct: porcentajes.map(([n, d]) => ({ n, decimals: d, out: pct(n, d) })),
    goalLabel: GOAL_LABEL,
    goalHint: GOAL_HINT,
    factorLabel: FACTOR_LABEL,
    benefitLabel: ['cashback', 'miles', 'points', 'lounge', 'insurance_included', 'discounts', 'secured', 'otro'].map((b) => ({ in: b, out: benefitLabel(b) })),
    reasonText: razones.map((r) => ({ reason: r, out: reasonText(r) })),
    obstacleDetail: frenos.map(([factor, evidence]) => ({ factor, evidence, out: obstacleDetail(factor, evidence) })),
    levelLabel: [[95, true], [72, false], [65.1, false], [40, false], [39.9, false], [0, false]].map(([score, ready]) => ({
      score, ready, out: levelLabel(score as number, ready as boolean),
    })),
    weekLabel: ['2026-10-12', '2026-01-05', '2026-12-28'].map((d) => ({ in: d, out: weekLabel(d) })),
    monthLabel: ['2026-10-01', '2026-01-01', '2026-12-01'].map((d) => ({ in: d, out: monthLabel(d) })),
    parseAmount: ['1,250.50', 'B/. 900', 'b/.900', '$1,000', ' 750 ', '', 'abc', '-5', '0'].map((s) => ({ in: s, out: parseAmount(s) })),
    suggestions: sugerencias.map((c) => ({ goals: c.goals.map((g) => ({ type: g.type, priority: g.priority })), hasProfile: c.hasProfile, out: suggestions(c.goals, c.hasProfile) })),
    attachmentCard: adjuntos.map((a) => ({ attachment: a, out: attachmentCard(a) })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(ARCHIVO, `${JSON.stringify(generar(), null, 2)}\n`);
  console.log(`Casos dorados escritos en ${ARCHIVO}`);
}
