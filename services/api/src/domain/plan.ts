import type { EngineConfig, ReadinessResult } from '@fg/engine';

export interface MonthlyPlan {
  month: string; // YYYY-MM-01
  objective: string;
  actions: Array<{ title: string; factor: string | null; weekStart: string }>;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Lunes de la semana de `d` (UTC). */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // lunes = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return iso(x);
}

export const monthStart = (d: Date) => iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));

/**
 * Plan del mes a partir de la preparación: el freno principal define el objetivo
 * y los frenos más importantes dan las misiones de esta semana (máximo `maxActions`).
 */
export function buildMonthlyPlan(r: ReadinessResult, cfg: EngineConfig, today: Date, maxActions = 5): MonthlyPlan {
  const month = monthStart(today);
  const week = weekStart(today);
  const top = r.obstacles[0];

  if (!top) {
    return {
      month,
      objective: cfg.objectiveTemplates.ready,
      actions: [{ title: 'Revisa tus 3 mejores opciones y lo que debes confirmar con cada banco', factor: null, weekStart: week }],
    };
  }

  const actions: MonthlyPlan['actions'] = [];
  // El freno principal aporta hasta 2 misiones; los demás, 1 cada uno.
  for (const [i, o] of r.obstacles.entries()) {
    const take = i === 0 ? 2 : 1;
    for (const title of o.suggestedActions.slice(0, take)) {
      if (actions.length < maxActions && !actions.some((a) => a.title === title)) {
        actions.push({ title, factor: o.factor, weekStart: week });
      }
    }
  }
  return { month, objective: cfg.objectiveTemplates[top.factor], actions };
}
