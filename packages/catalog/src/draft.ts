import { z } from 'zod';

/**
 * Lo que la IA devuelve al leer la página o el PDF de un banco.
 * Todo campo puede ser null = "el banco no lo publica". Nunca se inventa.
 */
const nullableNum = z.number().finite().nullable();

export const ExtractionSchema = z.object({
  product: z.object({
    name: z.string().min(1),
    type: z.enum(['credit_card', 'auto_loan', 'mortgage']),
    rate: z.object({ min: nullableNum, max: nullableNum }),
    annualFee: nullableNum,
    oneTimeFees: nullableNum,
    requirements: z.object({
      minIncome: nullableNum,
      minEmploymentMonths: nullableNum,
      minAge: nullableNum,
      maxAge: nullableNum,
      residency: z.array(z.enum(['national', 'resident', 'foreign'])).nullable(),
      employmentTypes: z.array(z.enum(['salaried', 'self_employed', 'informal', 'retired'])).nullable(),
    }),
    conditions: z.object({
      minTermMonths: nullableNum,
      maxTermMonths: nullableNum,
      minAmount: nullableNum,
      maxAmount: nullableNum,
      minDownPaymentPct: nullableNum,
    }),
    benefits: z.array(z.string()),
  }),
  /** Cita textual de la fuente por cada campo con valor. Clave = ruta, ej. "rate.min". */
  citations: z.record(z.string(), z.string()),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

/** Producto propuesto, en el formato de @fg/engine (sin datos comerciales). */
export const ProductDraftSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  institutionId: z.string().regex(/^[a-z0-9-]+$/),
  institutionName: z.string().min(1),
  type: z.enum(['credit_card', 'auto_loan', 'mortgage']),
  name: z.string().min(1),
  rate: z.object({ min: z.number(), max: z.number() }),
  annualFee: z.number(),
  oneTimeFees: z.number(),
  requirements: z.object({
    minIncome: z.number(),
    minEmploymentMonths: z.number().int(),
    minAge: z.number().int(),
    maxAge: z.number().int().optional(),
    residency: z.array(z.enum(['national', 'resident', 'foreign'])).min(1),
    employmentTypes: z.array(z.enum(['salaried', 'self_employed', 'informal', 'retired'])).min(1),
  }),
  conditions: z.object({
    minTermMonths: z.number().int().optional(),
    maxTermMonths: z.number().int().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    minDownPaymentPct: z.number().optional(),
  }),
  benefits: z.array(z.string()),
  source: z.object({ url: z.string().url(), capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
});

export type ProductDraft = z.infer<typeof ProductDraftSchema>;

export type Severity = 'error' | 'warning';

export interface Issue {
  field: string;
  severity: Severity;
  message: string;
}

export const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
