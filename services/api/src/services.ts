/**
 * Operaciones de negocio por usuario. Las usan las rutas HTTP y las herramientas del chat,
 * así el Genio ve y hace exactamente lo mismo que la app (y con el mismo aislamiento por usuario).
 */
import type { GoalInput } from '@fg/contracts';
import type { Db } from '@fg/db';
import { assessReadiness, rankProducts, type EngineConfig } from '@fg/engine';
import { buildMonthlyPlan, monthStart } from './domain/plan.js';
import { conflict, notFound } from './errors.js';
import * as repo from './repo.js';

export function createServices(db: Db, cfg: EngineConfig, now: () => Date) {
  /** Meta + último snapshot + catálogo del tipo de la meta, o error claro si falta algo. */
  async function goalContext(userId: string, goalId: string) {
    const goal = await repo.getGoal(db, userId, goalId);
    if (!goal) throw notFound('La meta');
    const snap = await repo.latestSnapshot(db, userId);
    if (!snap) throw conflict('snapshot_required', 'Primero completa tu perfil financiero');
    const cat = await repo.catalog(db, goal.type);
    return { goal, snap, cat };
  }

  async function readiness(userId: string, goalId: string) {
    const { goal, snap, cat } = await goalContext(userId, goalId);
    const result = assessReadiness(goal, snap.snapshot, cat.products, cfg);
    const readinessId = await repo.saveReadiness(db, goal.id, snap.id, result);
    return { goal, snap, cat, readiness: result, readinessId };
  }

  async function recommendations(userId: string, goalId: string) {
    const { goal, snap, cat, readiness: r } = await readiness(userId, goalId);
    const ranking = rankProducts(goal, snap.snapshot, cat, cfg);
    await repo.saveRecommendations(db, goal.id, ranking);
    return {
      ...ranking,
      readyToCompare: r.readyToCompare,
      notice: r.readyToCompare ? null : 'Aún no recomendamos aplicar: revisa tus frenos y el plan del mes.',
    };
  }

  async function plan(userId: string, goalId: string) {
    const goal = await repo.getGoal(db, userId, goalId);
    if (!goal) throw notFound('La meta');
    return repo.getPlan(db, userId, goal.id, monthStart(now()));
  }

  /** Crea el plan del mes si no existe. `created` dice si es nuevo. */
  async function ensurePlan(userId: string, goalId: string) {
    const month = monthStart(now());
    const existing = await repo.getPlan(db, userId, goalId, month);
    if (existing) return { plan: existing, created: false };
    const { goal, readiness: r, readinessId } = await readiness(userId, goalId);
    await repo.createPlan(db, goal.id, readinessId, buildMonthlyPlan(r, cfg, now()));
    return { plan: (await repo.getPlan(db, userId, goal.id, month))!, created: true };
  }

  async function createGoal(userId: string, g: GoalInput) {
    const id = await repo.createGoal(db, userId, g);
    return (await repo.getGoal(db, userId, id))!;
  }

  return {
    goalContext,
    readiness,
    recommendations,
    plan,
    ensurePlan,
    createGoal,
    listGoals: (userId: string) => repo.listGoals(db, userId),
    snapshot: (userId: string) => repo.latestSnapshot(db, userId),
    setAction: repo.patchAction.bind(null, db),
  };
}

export type Services = ReturnType<typeof createServices>;
