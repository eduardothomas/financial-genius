/**
 * Contratos de la API v1, compartidos entre services/api y apps/app.
 * Una sola fuente de verdad para validar entradas en el servidor y en el cliente.
 */
import { z } from 'zod';

export const GoalTypeSchema = z.enum(['credit_card', 'auto_loan', 'mortgage']);
export const EmploymentTypeSchema = z.enum(['salaried', 'self_employed', 'informal', 'retired']);
export const ApcSchema = z.enum(['good', 'fair', 'poor', 'none', 'unknown']);
export const ResidencySchema = z.enum(['national', 'resident', 'foreign']);
export const DebtKindSchema = z.enum(['credit_card', 'personal_loan', 'auto_loan', 'mortgage', 'other']);

const money = z.number().finite().min(0).max(10_000_000);

export const DebtInputSchema = z.object({
  kind: DebtKindSchema,
  institution: z.string().max(80).optional(),
  balance: money,
  limit: money.optional(),
  monthlyPayment: money,
  latePaymentsLast12m: z.number().int().min(0).max(12).optional(),
});

/** Datos financieros del usuario. Cada envío crea un snapshot nuevo (historial). */
export const SnapshotInputSchema = z.object({
  netMonthlyIncome: money,
  employmentType: EmploymentTypeSchema,
  employmentMonths: z.number().int().min(0).max(720),
  fixedMonthlyExpenses: money.default(0),
  dependents: z.number().int().min(0).max(20).default(0),
  age: z.number().int().min(16).max(120),
  residency: ResidencySchema,
  apcSelfReported: ApcSchema.default('unknown'),
  debts: z.array(DebtInputSchema).max(30).default([]),
  savingsForDownPayment: money.default(0),
  documents: z
    .object({ incomeProof: z.boolean(), employmentLetter: z.boolean(), apcReport: z.boolean() })
    .default({ incomeProof: false, employmentLetter: false, apcReport: false }),
  /** De dónde salió cada campo: declarado por el usuario o extraído de un documento. */
  fieldSources: z.record(z.string(), z.enum(['declared', 'document'])).default({}),
});
export type SnapshotInput = z.infer<typeof SnapshotInputSchema>;

export const GoalInputSchema = z.object({
  type: GoalTypeSchema,
  priority: z.number().int().min(1).max(10),
  targetAmount: z.number().positive().max(10_000_000).optional(),
  desiredTermMonths: z.number().int().min(1).max(480).optional(),
  preferences: z.array(z.string().max(40)).max(10).default([]),
});
export type GoalInput = z.infer<typeof GoalInputSchema>;

export const GoalPatchSchema = z
  .object({
    priority: z.number().int().min(1).max(10),
    status: z.enum(['active', 'paused', 'achieved', 'abandoned']),
    targetAmount: z.number().positive().max(10_000_000).nullable(),
    desiredTermMonths: z.number().int().min(1).max(480).nullable(),
    preferences: z.array(z.string().max(40)).max(10),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nada que actualizar');
export type GoalPatch = z.infer<typeof GoalPatchSchema>;

export const ActionPatchSchema = z.object({
  status: z.enum(['pending', 'done', 'skipped']),
  result: z.string().max(500).optional(),
});
export type ActionPatch = z.infer<typeof ActionPatchSchema>;

export const ConsentInputSchema = z.object({
  purpose: z.enum(['financial_profile', 'document_extraction', 'notifications', 'product_updates']),
  granted: z.boolean(),
});
export type ConsentInput = z.infer<typeof ConsentInputSchema>;

/** Error estándar de la API. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Mensaje al Genio. Sin conversationId se crea una conversación nueva. */
export const ChatInputSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;
