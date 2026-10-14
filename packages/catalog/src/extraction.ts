import { ExtractionSchema, type Extraction, type Issue, type ProductDraft } from './draft.js';
import { diffDrafts, overallRisk, type DiffEntry, type Risk } from './diff.js';
import { extractionToDraft, validateDraft, verifyCitations, type DraftContext } from './validate.js';

/**
 * Cualquier proveedor de IA que convierta texto de una fuente en una Extracción.
 * Mantenerlo como interfaz permite cambiar de proveedor y probar sin red.
 */
export interface Extractor {
  extract(input: ExtractionInput): Promise<unknown>;
}

export interface ExtractionInput {
  system: string;
  user: string;
  /** JSON Schema de la salida esperada (para tool use / salida estructurada). */
  schema: Record<string, unknown>;
}

export const EXTRACTION_SYSTEM = `Eres un analista que transcribe condiciones de productos bancarios de Panamá.
Reglas:
- Usa SOLO el texto de la fuente. Si un dato no aparece, devuelve null. Nunca estimes ni completes con conocimiento general.
- Tasas en % anual como número (7.5 = 7.5%). Montos en USD/balboas como número sin símbolos.
- Plazos en meses. Si la fuente dice años, multiplica por 12.
- Para cada campo con valor, agrega en "citations" la frase EXACTA de la fuente de la que sale (copiada literal, 3 a 25 palabras).
- Beneficios: palabras clave cortas en inglés minúsculas (cashback, miles, points, lounge, insurance_included, discounts, secured).
- "Desde X%" significa rate.min = X; si no hay máximo, rate.max = null.`;

/** JSON Schema equivalente a ExtractionSchema (para el proveedor de IA). */
const num = { type: ['number', 'null'] };
export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['product', 'citations'],
  properties: {
    product: {
      type: 'object',
      required: ['name', 'type', 'rate', 'annualFee', 'oneTimeFees', 'requirements', 'conditions', 'benefits'],
      properties: {
        name: { type: 'string' },
        type: { enum: ['credit_card', 'auto_loan', 'mortgage'] },
        rate: { type: 'object', required: ['min', 'max'], properties: { min: num, max: num } },
        annualFee: num,
        oneTimeFees: num,
        requirements: {
          type: 'object',
          required: ['minIncome', 'minEmploymentMonths', 'minAge', 'maxAge', 'residency', 'employmentTypes'],
          properties: {
            minIncome: num, minEmploymentMonths: num, minAge: num, maxAge: num,
            residency: { type: ['array', 'null'], items: { enum: ['national', 'resident', 'foreign'] } },
            employmentTypes: {
              type: ['array', 'null'],
              items: { enum: ['salaried', 'self_employed', 'informal', 'retired'] },
            },
          },
        },
        conditions: {
          type: 'object',
          required: ['minTermMonths', 'maxTermMonths', 'minAmount', 'maxAmount', 'minDownPaymentPct'],
          properties: { minTermMonths: num, maxTermMonths: num, minAmount: num, maxAmount: num, minDownPaymentPct: num },
        },
        benefits: { type: 'array', items: { type: 'string' } },
      },
    },
    citations: { type: 'object', additionalProperties: { type: 'string' } },
  },
};

export function buildExtractionInput(sourceText: string, hint: { institutionName: string; productName?: string; type?: string }): ExtractionInput {
  const MAX = 60_000; // caracteres; las páginas de producto caben de sobra
  const text = sourceText.length > MAX ? sourceText.slice(0, MAX) : sourceText;
  return {
    system: EXTRACTION_SYSTEM,
    user: [
      `Banco: ${hint.institutionName}`,
      hint.productName ? `Producto esperado: ${hint.productName}` : null,
      hint.type ? `Tipo esperado: ${hint.type}` : null,
      '',
      '<fuente>',
      text,
      '</fuente>',
    ]
      .filter((x) => x !== null)
      .join('\n'),
    schema: EXTRACTION_JSON_SCHEMA,
  };
}

export interface Proposal {
  proposed: ProductDraft | null;
  citations: Record<string, string>;
  diff: DiffEntry[];
  risk: Risk;
  issues: Issue[];
  /** true si no hay errores (las advertencias no bloquean). */
  approvable: boolean;
}

/**
 * Flujo completo: fuente → IA → validación → comparación con la versión vigente.
 * El resultado se guarda como version_proposal para que una persona lo apruebe.
 */
export async function proposeFromSource(args: {
  extractor: Extractor;
  sourceText: string;
  context: DraftContext;
  current: ProductDraft | null;
  hint?: { productName?: string; type?: string };
}): Promise<Proposal> {
  const input = buildExtractionInput(args.sourceText, { institutionName: args.context.institutionName, ...args.hint });
  const raw = await args.extractor.extract(input);
  return proposalFromRaw(raw, args.sourceText, args.context, args.current);
}

/** Parte síncrona y pura del flujo (fácil de probar). */
export function proposalFromRaw(
  raw: unknown,
  sourceText: string,
  context: DraftContext,
  current: ProductDraft | null,
): Proposal {
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      proposed: null,
      citations: {},
      diff: [],
      risk: 'high',
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || 'extraction',
        severity: 'error' as const,
        message: `Respuesta de la IA inválida: ${i.message}`,
      })),
      approvable: false,
    };
  }
  const ex: Extraction = parsed.data;
  const { draft, issues } = extractionToDraft(ex, context);
  issues.push(...verifyCitations(ex, sourceText));
  if (draft) issues.push(...validateDraft(draft));
  if (draft && current && current.type !== draft.type)
    issues.push({ field: 'type', severity: 'error', message: `El tipo cambió de ${current.type} a ${draft.type}` });

  const diff = draft ? diffDrafts(current, draft) : [];
  return {
    proposed: draft,
    citations: ex.citations,
    diff,
    risk: draft ? overallRisk(current, diff) : 'high',
    issues,
    approvable: draft !== null && !issues.some((i) => i.severity === 'error'),
  };
}
