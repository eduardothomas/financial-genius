import type { ProductDraft } from './draft.js';

export type Risk = 'low' | 'high';

export interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
  risk: Risk;
}

/**
 * Campos de bajo riesgo: no afectan costo ni elegibilidad.
 * Todo lo demás (tasas, cargos, requisitos, condiciones) es de alto riesgo.
 */
const LOW_RISK_PREFIXES = ['benefits', 'name', 'institutionName', 'source.capturedAt', 'source.url'];

const isLow = (field: string) => LOW_RISK_PREFIXES.some((p) => field === p || field.startsWith(`${p}.`));

function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = Array.isArray(obj) ? [...obj].map(String).sort() : obj;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Comparación campo a campo entre la versión vigente y la propuesta. */
export function diffDrafts(current: ProductDraft | null, proposed: ProductDraft): DiffEntry[] {
  const before = current ? flatten(current) : {};
  const after = flatten(proposed);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys
    .filter((k) => !same(before[k], after[k]))
    .map((k) => ({ field: k, before: before[k] ?? null, after: after[k] ?? null, risk: isLow(k) ? 'low' : 'high' }));
}

/** Riesgo global: alto si cambia algún campo de alto riesgo o si el producto es nuevo. */
export function overallRisk(current: ProductDraft | null, diff: DiffEntry[]): Risk {
  if (!current) return 'high';
  return diff.some((d) => d.risk === 'high') ? 'high' : 'low';
}
