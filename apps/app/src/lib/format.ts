/**
 * Textos y formatos de la app (español de Panamá). Funciones puras, con pruebas.
 */
import type { FactorId, GoalType, Reason } from '@fg/engine';

/** B/. 1,234 o B/. 1,234.50 (balboa = dólar). */
export function money(n: number, decimals: 0 | 2 = 0): string {
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}B/. ${grouped}${dec ? `.${dec}` : ''}`;
}

export const pct = (n: number, decimals = 1) => `${Number(n.toFixed(decimals))}%`;

export const GOAL_LABEL: Record<GoalType, string> = {
  credit_card: 'Tarjeta de crédito',
  auto_loan: 'Préstamo de auto',
  mortgage: 'Comprar casa',
};

export const GOAL_HINT: Record<GoalType, string> = {
  credit_card: 'Tu primera tarjeta o una mejor que la que tienes',
  auto_loan: 'Financiar un carro nuevo o usado',
  mortgage: 'Hipoteca para tu vivienda',
};

export const FACTOR_LABEL: Record<FactorId, string> = {
  income: 'Ingreso',
  dti: 'Deudas frente a tu ingreso',
  employment: 'Antigüedad laboral',
  apc: 'Historial de crédito',
  down_payment: 'Abono ahorrado',
  utilization: 'Uso de tus tarjetas',
  documents: 'Documentos',
};

/** Explicación corta de un freno a partir de su evidencia. */
export function obstacleDetail(factor: FactorId, ev: Record<string, number | string | null>): string {
  switch (factor) {
    case 'income':
      return ev.marketMin != null
        ? `Ganas ${money(Number(ev.income))} y el mínimo más bajo del mercado es ${money(Number(ev.marketMin))}.`
        : 'Aún no hay suficientes productos para comparar tu ingreso.';
    case 'dti':
      return ev.dti != null
        ? `Con la nueva cuota, tus deudas serían el ${pct(Number(ev.dti) * 100, 0)} de tu ingreso. Lo ideal es hasta ${pct(Number(ev.dtiGood) * 100, 0)}.`
        : 'No pudimos calcular tus deudas frente a tu ingreso.';
    case 'employment':
      return `Llevas ${ev.months} meses en tu empleo; los bancos suelen pedir ${ev.target}.`;
    case 'apc':
      return APC_TEXT[String(ev.selfReported)] ?? 'Revisa tu historial de crédito.';
    case 'down_payment':
      return ev.required != null
        ? `Tienes ${money(Number(ev.saved))} de ${money(Number(ev.required))} de abono (${ev.pct}%).`
        : 'Indica el monto de tu meta para calcular el abono.';
    case 'utilization':
      return ev.utilization != null
        ? `Usas el ${pct(Number(ev.utilization) * 100, 0)} del límite de tus tarjetas. Lo ideal es menos de ${pct(Number(ev.good) * 100, 0)}.`
        : 'No tienes tarjetas registradas.';
    case 'documents':
      return `Tienes ${ev.ready} de ${ev.total} documentos listos.`;
  }
}

const APC_TEXT: Record<string, string> = {
  good: 'Dices que tu historial es bueno.',
  fair: 'Dices que tu historial tiene algunos atrasos.',
  poor: 'Dices que tu historial tiene problemas.',
  none: 'Dices que aún no tienes historial de crédito.',
  unknown: 'No sabemos cómo está tu historial de crédito.',
};

/** Razón estructurada del ranking → frase. El texto nunca agrega datos que no vengan en la razón. */
export function reasonText(r: Reason): string {
  const p = r.params;
  switch (r.code) {
    case 'lowest_cost':
      return `El costo más bajo de ${p.compared} opciones que calificas`;
    case 'low_cost':
      return 'De las más baratas para tu caso';
    case 'no_annual_fee':
      return 'Sin anualidad';
    case 'matches_preferences':
      return `Tiene lo que buscas: ${String(p.benefits).split(',').map(benefitLabel).join(', ')}`;
    case 'affordable_payment':
      return `Cuota estimada de ${money(Number(p.payment))}, cómoda para tu capacidad de ${money(Number(p.capacity))}`;
    case 'tight_payment':
      return `Cuota estimada de ${money(Number(p.payment))}: queda justa frente a tu capacidad de ${money(Number(p.capacity))}`;
    case 'comfortable_requirements':
      return `Cumples con holgura el ingreso mínimo de ${money(Number(p.minIncome))}`;
    case 'tight_requirements':
      return `Cumples justo el ingreso mínimo de ${money(Number(p.minIncome))}`;
  }
}

const BENEFITS: Record<string, string> = {
  cashback: 'reembolso en efectivo',
  miles: 'millas',
  points: 'puntos',
  lounge: 'salas VIP',
  insurance_included: 'seguro incluido',
  discounts: 'descuentos',
  secured: 'tarjeta asegurada',
};
export const benefitLabel = (b: string) => BENEFITS[b] ?? b;

/** Nivel de preparación en palabras. */
export function levelLabel(score: number, ready: boolean): string {
  if (ready) return 'Listo para comparar';
  if (score >= 70) return 'Casi listo';
  if (score >= 40) return 'En camino';
  return 'Empezando';
}

/** "2026-10-12" → "semana del 12 de octubre" */
export function weekLabel(isoDate: string): string {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [, m, d] = isoDate.split('-').map(Number);
  return `semana del ${d} de ${MONTHS[(m ?? 1) - 1]}`;
}

/** "2026-10-01" → "octubre" */
export function monthLabel(isoDate: string): string {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return MONTHS[Number(isoDate.slice(5, 7)) - 1] ?? '';
}

/** Lee un número escrito por el usuario: "1,250.50", "B/. 900", "900" → número; vacío o inválido → null. */
export function parseAmount(s: string): number | null {
  const clean = s.replace(/b\/\.|\$|\s|,/gi, '');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
