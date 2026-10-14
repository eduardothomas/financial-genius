import { ProductDraftSchema, type Extraction, type Issue, type ProductDraft } from './draft.js';
import { normalizeText } from './text.js';

/** Límites razonables. Fuera de ellos → error o advertencia para el revisor. */
export const LIMITS = {
  rateMax: 60,
  rateWarn: 45,
  incomeMax: 50000,
  termMax: 480,
  ageMin: 16,
  ageMax: 100,
};

export interface DraftContext {
  id: string;
  institutionId: string;
  institutionName: string;
  sourceUrl: string;
  capturedAt: string;
}

/**
 * Convierte la extracción de la IA en un borrador del producto.
 * Los campos que el banco no publica reciben un valor por defecto conservador
 * y una advertencia, para que el revisor lo vea.
 */
export function extractionToDraft(ex: Extraction, ctx: DraftContext): { draft: ProductDraft | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const p = ex.product;
  const warn = (field: string, message: string) => issues.push({ field, severity: 'warning', message });
  const err = (field: string, message: string) => issues.push({ field, severity: 'error', message });

  let rateMin = p.rate.min;
  let rateMax = p.rate.max;
  if (rateMin === null && rateMax === null) err('rate', 'La fuente no publica la tasa');
  if (rateMin === null && rateMax !== null) {
    rateMin = rateMax;
    warn('rate.min', 'Solo se publica tasa máxima; se usa como mínima');
  }
  if (rateMax === null && rateMin !== null) {
    rateMax = rateMin;
    warn('rate.max', 'Solo se publica "desde"; se usa la misma tasa como máxima');
  }

  const req = p.requirements;
  if (req.minIncome === null) warn('requirements.minIncome', 'Ingreso mínimo no publicado; se asume 0');
  if (req.residency === null) warn('requirements.residency', 'Residencia no publicada; se asume nacional y residente');
  if (req.employmentTypes === null) warn('requirements.employmentTypes', 'Tipo de empleo no publicado; se asume asalariado');
  if (p.annualFee === null && p.type === 'credit_card') warn('annualFee', 'Anualidad no publicada; se asume 0');

  const c = p.conditions;
  if (p.type !== 'credit_card' && c.maxTermMonths === null) warn('conditions.maxTermMonths', 'Plazo máximo no publicado');

  if (rateMin === null || rateMax === null) return { draft: null, issues };

  const opt = (x: number | null) => (x === null ? undefined : x);
  const candidate = {
    id: ctx.id,
    institutionId: ctx.institutionId,
    institutionName: ctx.institutionName,
    type: p.type,
    name: p.name,
    rate: { min: rateMin, max: rateMax },
    annualFee: p.annualFee ?? 0,
    oneTimeFees: p.oneTimeFees ?? 0,
    requirements: {
      minIncome: req.minIncome ?? 0,
      minEmploymentMonths: Math.round(req.minEmploymentMonths ?? 0),
      minAge: Math.round(req.minAge ?? 18),
      maxAge: req.maxAge === null ? undefined : Math.round(req.maxAge),
      residency: req.residency ?? ['national', 'resident'],
      employmentTypes: req.employmentTypes ?? ['salaried'],
    },
    conditions: {
      minTermMonths: opt(c.minTermMonths),
      maxTermMonths: opt(c.maxTermMonths),
      minAmount: opt(c.minAmount),
      maxAmount: opt(c.maxAmount),
      minDownPaymentPct: opt(c.minDownPaymentPct),
    },
    benefits: [...new Set(p.benefits.map((b) => b.trim().toLowerCase()).filter(Boolean))].sort(),
    source: { url: ctx.sourceUrl, capturedAt: ctx.capturedAt },
  };

  const parsed = ProductDraftSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(i.path.join('.'), i.message);
    return { draft: null, issues };
  }
  return { draft: parsed.data, issues };
}

/** Reglas de negocio sobre un borrador ya armado. */
export function validateDraft(d: ProductDraft): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, message: string) => issues.push({ field, severity: 'error', message });
  const warn = (field: string, message: string) => issues.push({ field, severity: 'warning', message });

  if (d.rate.min < 0 || d.rate.max > LIMITS.rateMax) err('rate', `Tasa fuera de rango (0–${LIMITS.rateMax}%)`);
  else if (d.rate.max > LIMITS.rateWarn) warn('rate', `Tasa muy alta (>${LIMITS.rateWarn}%); confirmar`);
  if (d.rate.min > d.rate.max) err('rate', 'Tasa mínima mayor que la máxima');
  if (d.type !== 'credit_card' && d.rate.max < 1) warn('rate', 'Tasa de préstamo menor a 1%; ¿está en decimal en vez de %?');

  const r = d.requirements;
  if (r.minIncome < 0 || r.minIncome > LIMITS.incomeMax) err('requirements.minIncome', 'Ingreso mínimo fuera de rango');
  if (r.minAge < LIMITS.ageMin || r.minAge > LIMITS.ageMax) err('requirements.minAge', 'Edad mínima fuera de rango');
  if (r.maxAge !== undefined && r.maxAge < r.minAge) err('requirements.maxAge', 'Edad máxima menor que la mínima');

  const c = d.conditions;
  for (const k of ['minTermMonths', 'maxTermMonths'] as const) {
    const v = c[k];
    if (v !== undefined && (v <= 0 || v > LIMITS.termMax)) err(`conditions.${k}`, `Plazo fuera de rango (1–${LIMITS.termMax} meses)`);
  }
  if (c.minTermMonths !== undefined && c.maxTermMonths !== undefined && c.minTermMonths > c.maxTermMonths)
    err('conditions', 'Plazo mínimo mayor que el máximo');
  if (c.minAmount !== undefined && c.maxAmount !== undefined && c.minAmount > c.maxAmount)
    err('conditions', 'Monto mínimo mayor que el máximo');
  if (c.minDownPaymentPct !== undefined && (c.minDownPaymentPct < 0 || c.minDownPaymentPct > 100))
    err('conditions.minDownPaymentPct', 'Abono fuera de rango (0–100%)');
  if (d.annualFee < 0 || d.oneTimeFees < 0) err('fees', 'Cargos negativos');
  if (!d.source.url.startsWith('https://')) warn('source.url', 'La fuente no usa https');
  return issues;
}

/** Campos que siempre deben venir con cita textual de la fuente. */
export const CITATION_REQUIRED = ['rate.min', 'rate.max', 'requirements.minIncome', 'annualFee'] as const;

/**
 * Anti-alucinación: cada cita debe aparecer literalmente en el texto de la fuente,
 * y los campos clave con valor deben tener cita.
 */
export function verifyCitations(ex: Extraction, sourceText: string): Issue[] {
  const issues: Issue[] = [];
  const hay = normalizeText(sourceText);
  for (const [field, quote] of Object.entries(ex.citations)) {
    const needle = normalizeText(quote);
    if (needle.length < 3 || !hay.includes(needle)) {
      issues.push({ field, severity: 'error', message: `La cita no aparece en la fuente: "${quote.slice(0, 80)}"` });
    }
  }
  const p = ex.product;
  const values: Record<(typeof CITATION_REQUIRED)[number], number | null> = {
    'rate.min': p.rate.min,
    'rate.max': p.rate.max,
    'requirements.minIncome': p.requirements.minIncome,
    annualFee: p.annualFee,
  };
  for (const field of CITATION_REQUIRED) {
    if (values[field] !== null && !ex.citations[field]) {
      issues.push({ field, severity: 'warning', message: 'Valor sin cita de la fuente; verificar a mano' });
    }
  }
  return issues;
}
