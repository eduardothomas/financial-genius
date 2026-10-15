/**
 * Herramientas del Genio. Cada una llama a los mismos servicios que la app,
 * siempre con el usuario de la sesión: el modelo nunca elige de quién son los datos.
 */
import { GoalInputSchema } from '@fg/contracts';
import { ApiError } from '../errors.js';
import type { Services } from '../services.js';
import type { ToolDef } from './model.js';

/** Tarjetas que la app dibuja dentro del chat. */
export type Attachment =
  | { type: 'readiness'; goalId: string; goalType: string; score: number; ready: boolean }
  | {
      type: 'ranking';
      goalId: string;
      readyToCompare: boolean;
      top: Array<{ position: number; productId: string; name: string; institutionName: string; estimatedMonthlyPayment: number | null }>;
    }
  | { type: 'plan'; goalId: string; objective: string; done: number; total: number }
  | { type: 'goal'; goalId: string; goalType: string; priority: number; targetAmount: number | null };

const goalId = { type: 'string', description: 'id de la meta (de ver_metas)' };

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'ver_perfil',
    description: 'Perfil financiero más reciente del usuario: ingreso, empleo, gastos, deudas, ahorro, APC autodeclarado y documentos.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ver_metas',
    description: 'Metas activas del usuario con su prioridad y último índice de preparación.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ver_preparacion',
    description: 'Calcula el índice de preparación (0–100) de una meta y sus frenos con evidencia. No es el score de la APC.',
    input_schema: { type: 'object', properties: { goal_id: goalId }, required: ['goal_id'] },
  },
  {
    name: 'ver_opciones',
    description:
      'Top 3 de productos del catálogo para una meta, con razones (códigos), supuestos, cuota estimada, fuente y fecha. Única fuente válida de tasas y requisitos.',
    input_schema: { type: 'object', properties: { goal_id: goalId }, required: ['goal_id'] },
  },
  {
    name: 'ver_plan',
    description: 'Plan del mes de una meta: objetivo y misiones de la semana con su estado. null si aún no existe.',
    input_schema: { type: 'object', properties: { goal_id: goalId }, required: ['goal_id'] },
  },
  {
    name: 'crear_plan',
    description: 'Crea el plan del mes de una meta a partir de sus frenos (si ya existe, lo devuelve).',
    input_schema: { type: 'object', properties: { goal_id: goalId }, required: ['goal_id'] },
  },
  {
    name: 'crear_meta',
    description: 'Crea una meta cuando el usuario lo pide claramente. Confirma tipo y monto antes si no están claros.',
    input_schema: {
      type: 'object',
      properties: {
        type: { enum: ['credit_card', 'auto_loan', 'mortgage'] },
        priority: { type: 'integer', minimum: 1, maximum: 10 },
        target_amount: { type: 'number', description: 'Precio del carro o de la casa (no aplica a tarjeta)' },
        desired_term_months: { type: 'integer' },
        preferences: { type: 'array', items: { type: 'string' }, description: 'Para tarjetas: cashback, miles, points…' },
      },
      required: ['type', 'priority'],
    },
  },
  {
    name: 'marcar_mision',
    description: 'Marca una misión del plan como hecha, omitida o pendiente cuando el usuario lo informa.',
    input_schema: {
      type: 'object',
      properties: { action_id: { type: 'string' }, status: { enum: ['done', 'skipped', 'pending'] } },
      required: ['action_id', 'status'],
    },
  },
];

export interface ToolOutcome {
  /** Lo que ve el modelo (JSON compacto). */
  content: string;
  isError: boolean;
  attachment?: Attachment;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function runTool(
  svc: Services,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const ok = (data: unknown, attachment?: Attachment): ToolOutcome => ({ content: JSON.stringify(data), isError: false, attachment });
  try {
    switch (name) {
      case 'ver_perfil': {
        const s = await svc.snapshot(userId);
        return ok(s ? { fecha: s.createdAt, ...s.snapshot } : { perfil: null, nota: 'El usuario aún no completa su perfil (pestaña Perfil).' });
      }
      case 'ver_metas':
        return ok({ metas: await svc.listGoals(userId) });
      case 'ver_preparacion': {
        const { readiness: r } = await svc.readiness(userId, str(input.goal_id));
        return ok(
          { score: r.score, listoParaComparar: r.readyToCompare, frenos: r.obstacles.map(({ suggestedActions, ...o }) => o), factores: r.factors },
          { type: 'readiness', goalId: r.goalId, goalType: r.goalType, score: r.score, ready: r.readyToCompare },
        );
      }
      case 'ver_opciones': {
        const r = await svc.recommendations(userId, str(input.goal_id));
        return ok(
          {
            listoParaComparar: r.readyToCompare,
            aviso: r.notice,
            revisados: r.consideredCount,
            elegibles: r.eligibleCount,
            top: r.top.map((t) => ({
              posicion: t.position,
              producto: t.name,
              banco: t.institutionName,
              cuotaMensualEstimada: t.estimatedMonthlyPayment,
              razones: t.reasons,
              supuestos: t.assumptions,
              fuente: t.source,
            })),
            excluidos: r.excluded,
          },
          {
            type: 'ranking',
            goalId: r.goalId,
            readyToCompare: r.readyToCompare,
            top: r.top.map((t) => ({
              position: t.position,
              productId: t.productId,
              name: t.name,
              institutionName: t.institutionName,
              estimatedMonthlyPayment: t.estimatedMonthlyPayment,
            })),
          },
        );
      }
      case 'ver_plan':
      case 'crear_plan': {
        const gid = str(input.goal_id);
        const plan = name === 'ver_plan' ? await svc.plan(userId, gid) : (await svc.ensurePlan(userId, gid)).plan;
        if (!plan) return ok({ plan: null, nota: 'No hay plan este mes; se puede crear con crear_plan.' });
        return ok(plan, {
          type: 'plan',
          goalId: gid,
          objective: plan.objective,
          done: plan.actions.filter((a) => a.status === 'done').length,
          total: plan.actions.length,
        });
      }
      case 'crear_meta': {
        const parsed = GoalInputSchema.safeParse({
          type: input.type,
          priority: input.priority,
          targetAmount: input.target_amount ?? undefined,
          desiredTermMonths: input.desired_term_months ?? undefined,
          preferences: input.preferences ?? [],
        });
        if (!parsed.success) return { content: JSON.stringify({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }), isError: true };
        const g = await svc.createGoal(userId, parsed.data);
        return ok(g, { type: 'goal', goalId: g.id, goalType: g.type, priority: g.priority, targetAmount: g.targetAmount ?? null });
      }
      case 'marcar_mision': {
        const status = str(input.status) as 'done' | 'skipped' | 'pending';
        if (!['done', 'skipped', 'pending'].includes(status)) return { content: '{"error":"estado inválido"}', isError: true };
        const done = await svc.setAction(userId, str(input.action_id), { status });
        return done ? ok({ ok: true }) : { content: '{"error":"La misión no existe"}', isError: true };
      }
      default:
        return { content: JSON.stringify({ error: `Herramienta desconocida: ${name}` }), isError: true };
    }
  } catch (e) {
    if (e instanceof ApiError) return { content: JSON.stringify({ error: e.message, code: e.code }), isError: true };
    throw e;
  }
}
