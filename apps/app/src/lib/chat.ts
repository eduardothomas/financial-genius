/**
 * Lógica pura del chat del Genio: sugerencias y textos de las tarjetas. Con pruebas.
 */
import type { ChatAttachment, GoalView } from './api';
import { GOAL_LABEL, money } from './format';

/** Preguntas rápidas según lo que el usuario ya tiene. Máximo 3. */
export function suggestions(goals: GoalView[] | undefined, hasProfile: boolean): string[] {
  if (!goals || goals.length === 0) {
    return ['Quiero mi primera tarjeta de crédito', 'Quiero comprar un carro', 'Quiero comprar una casa'];
  }
  const main = [...goals].sort((a, b) => a.priority - b.priority)[0]!;
  const what = GOAL_LABEL[main.type].toLowerCase();
  const out = [`¿Estoy listo para ${main.type === 'mortgage' ? 'comprar casa' : main.type === 'auto_loan' ? 'el préstamo de auto' : 'una tarjeta'}?`];
  out.push('¿Qué hago esta semana?');
  out.push(hasProfile ? `¿Cuáles son mis mejores opciones de ${what}?` : '¿Qué datos necesitas de mí?');
  return out;
}

export interface CardView {
  title: string;
  detail: string;
  /** Pestaña o ruta a la que lleva la tarjeta. */
  href: '/productos' | '/plan' | `/meta/${string}`;
  goalId: string;
}

export function attachmentCard(a: ChatAttachment): CardView {
  switch (a.type) {
    case 'readiness':
      return {
        title: `${GOAL_LABEL[a.goalType]}: ${Math.round(a.score)} de 100`,
        detail: a.ready ? 'Listo para comparar opciones' : 'Aún no: mira tus frenos',
        href: `/meta/${a.goalId}`,
        goalId: a.goalId,
      };
    case 'ranking': {
      const first = a.top[0];
      return {
        title: first ? `#1 ${first.name}` : 'Sin opciones por ahora',
        detail: first
          ? `${first.institutionName}${first.estimatedMonthlyPayment != null ? ` · ${money(first.estimatedMonthlyPayment)} al mes aprox.` : ''} · ver las ${a.top.length}`
          : 'Hoy no cumples los requisitos públicos de ningún producto',
        href: '/productos',
        goalId: a.goalId,
      };
    }
    case 'plan':
      return { title: a.objective, detail: `Plan del mes: ${a.done} de ${a.total} misiones hechas`, href: '/plan', goalId: a.goalId };
    case 'goal':
      return {
        title: `Nueva meta: ${GOAL_LABEL[a.goalType]}`,
        detail: `Prioridad ${a.priority}${a.targetAmount ? ` · ${money(a.targetAmount)}` : ''}`,
        href: `/meta/${a.goalId}`,
        goalId: a.goalId,
      };
  }
}
