/**
 * Tipos del dominio del motor financiero.
 * Montos en USD (balboa = USD). Tasas en % anual (ej. 7.5 = 7.5%).
 */

export type GoalType = 'credit_card' | 'auto_loan' | 'mortgage';

export type EmploymentType = 'salaried' | 'self_employed' | 'informal' | 'retired';

/** Historial APC tal como lo declara el usuario. NO es el score oficial de APC. */
export type ApcSelfReported = 'good' | 'fair' | 'poor' | 'none' | 'unknown';

export type Residency = 'national' | 'resident' | 'foreign';

export type DebtKind = 'credit_card' | 'personal_loan' | 'auto_loan' | 'mortgage' | 'other';

export interface Debt {
  kind: DebtKind;
  institution?: string;
  balance: number;
  /** Solo tarjetas / líneas de crédito. */
  limit?: number;
  monthlyPayment: number;
  latePaymentsLast12m?: number;
}

export interface FinancialSnapshot {
  netMonthlyIncome: number;
  employmentType: EmploymentType;
  employmentMonths: number;
  fixedMonthlyExpenses: number;
  dependents: number;
  age: number;
  residency: Residency;
  apcSelfReported: ApcSelfReported;
  debts: Debt[];
  /** Ahorro disponible para abono / enganche. */
  savingsForDownPayment: number;
  documents: {
    incomeProof: boolean;
    employmentLetter: boolean;
    apcReport: boolean;
  };
}

export interface Goal {
  id: string;
  type: GoalType;
  priority: number;
  /** Precio del auto / casa, o límite deseado de tarjeta. */
  targetAmount?: number;
  desiredTermMonths?: number;
  /** Preferencias de beneficios, ej. ['cashback', 'miles']. */
  preferences?: string[];
}

export interface RateRange {
  min: number;
  max: number;
}

export interface Product {
  id: string;
  institutionId: string;
  institutionName: string;
  type: GoalType;
  name: string;
  rate: RateRange;
  annualFee: number;
  /** Cargos únicos de apertura / cierre. */
  oneTimeFees: number;
  requirements: {
    minIncome: number;
    minEmploymentMonths: number;
    minAge: number;
    maxAge?: number;
    residency: Residency[];
    employmentTypes: EmploymentType[];
  };
  conditions: {
    minTermMonths?: number;
    maxTermMonths?: number;
    minAmount?: number;
    maxAmount?: number;
    /** % mínimo de abono, ej. 10 = 10%. */
    minDownPaymentPct?: number;
  };
  benefits: string[];
  source: { url: string; capturedAt: string };
  /**
   * Datos comerciales (patrocinio, comisión).
   * El ranking NUNCA los lee. Hay un test que lo garantiza.
   */
  commercial?: { sponsored?: boolean; commissionPct?: number };
}

export interface Catalog {
  version: string;
  products: Product[];
}

// ---------- Salidas del motor ----------

export type FactorId =
  | 'income'
  | 'dti'
  | 'employment'
  | 'apc'
  | 'down_payment'
  | 'utilization'
  | 'documents';

export interface FactorResult {
  factor: FactorId;
  /** 0..1 */
  score: number;
  weight: number;
  evidence: Record<string, number | string | null>;
}

export interface Obstacle {
  factor: FactorId;
  /** Puntos de preparación (0..100) que se ganarían resolviéndolo. */
  impactPoints: number;
  blocking: boolean;
  evidence: Record<string, number | string | null>;
  suggestedActions: string[];
}

export interface ReadinessResult {
  goalId: string;
  goalType: GoalType;
  /** 0..100 — índice propio, no es el APC. */
  score: number;
  readyToCompare: boolean;
  factors: FactorResult[];
  /** Ordenados por impacto, máximo `maxObstaclesShown`. */
  obstacles: Obstacle[];
  weightsVersion: string;
}

export type ReasonCode =
  | 'lowest_cost'
  | 'low_cost'
  | 'comfortable_requirements'
  | 'tight_requirements'
  | 'matches_preferences'
  | 'affordable_payment'
  | 'tight_payment'
  | 'no_annual_fee';

export interface Reason {
  code: ReasonCode;
  params: Record<string, number | string>;
}

export interface RankedProduct {
  position: number;
  productId: string;
  institutionName: string;
  name: string;
  score: number;
  components: { cost: number; eligibility: number; benefits: number; affordability: number };
  estimatedMonthlyPayment: number | null;
  reasons: Reason[];
  assumptions: string[];
  source: Product['source'];
}

export interface ExcludedProduct {
  productId: string;
  failed: string[];
}

export interface RankingResult {
  goalId: string;
  top: RankedProduct[];
  eligibleCount: number;
  consideredCount: number;
  excluded: ExcludedProduct[];
  audit: {
    catalogVersion: string;
    weightsVersion: string;
    inputHash: string;
  };
}
