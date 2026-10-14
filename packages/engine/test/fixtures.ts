/**
 * Datos de prueba. Bancos y productos FICTICIOS: no representan ofertas reales.
 */
import type { Catalog, FinancialSnapshot, Goal, Product } from '../src';

const src = (id: string) => ({ url: `https://ejemplo.test/${id}`, capturedAt: '2026-10-01' });
const anyResidency = ['national', 'resident'] as const;

export const products: Product[] = [
  // ---- Tarjetas ----
  {
    id: 'alfa-clasica', institutionId: 'alfa', institutionName: 'Banco Alfa', type: 'credit_card',
    name: 'Alfa Clásica', rate: { min: 24, max: 30 }, annualFee: 0, oneTimeFees: 0,
    requirements: { minIncome: 600, minEmploymentMonths: 6, minAge: 21, residency: [...anyResidency], employmentTypes: ['salaried', 'self_employed'] },
    conditions: {}, benefits: ['cashback'], source: src('alfa-clasica'),
  },
  {
    id: 'beta-millas', institutionId: 'beta', institutionName: 'Banco Beta', type: 'credit_card',
    name: 'Beta Millas Platinum', rate: { min: 22, max: 26 }, annualFee: 120, oneTimeFees: 0,
    requirements: { minIncome: 2000, minEmploymentMonths: 12, minAge: 21, residency: [...anyResidency], employmentTypes: ['salaried'] },
    conditions: {}, benefits: ['miles', 'lounge'], source: src('beta-millas'),
  },
  {
    id: 'gamma-cash', institutionId: 'gamma', institutionName: 'Banco Gamma', type: 'credit_card',
    name: 'Gamma Cashback', rate: { min: 26, max: 32 }, annualFee: 50, oneTimeFees: 0,
    requirements: { minIncome: 800, minEmploymentMonths: 3, minAge: 18, residency: [...anyResidency], employmentTypes: ['salaried', 'self_employed'] },
    conditions: {}, benefits: ['cashback', 'discounts'], source: src('gamma-cash'),
  },
  {
    id: 'delta-asegurada', institutionId: 'delta', institutionName: 'Banco Delta', type: 'credit_card',
    name: 'Delta Asegurada', rate: { min: 28, max: 34 }, annualFee: 25, oneTimeFees: 0,
    requirements: { minIncome: 0, minEmploymentMonths: 0, minAge: 18, residency: ['national', 'resident', 'foreign'], employmentTypes: ['salaried', 'self_employed', 'informal', 'retired'] },
    conditions: {}, benefits: ['secured'], source: src('delta-asegurada'),
  },
  // ---- Préstamos de auto ----
  {
    id: 'alfa-auto', institutionId: 'alfa', institutionName: 'Banco Alfa', type: 'auto_loan',
    name: 'Alfa Auto Nuevo', rate: { min: 6.5, max: 8.5 }, annualFee: 0, oneTimeFees: 300,
    requirements: { minIncome: 900, minEmploymentMonths: 12, minAge: 21, maxAge: 70, residency: [...anyResidency], employmentTypes: ['salaried'] },
    conditions: { minTermMonths: 12, maxTermMonths: 84, minAmount: 5000, maxAmount: 80000, minDownPaymentPct: 10 },
    benefits: [], source: src('alfa-auto'),
  },
  {
    id: 'beta-auto', institutionId: 'beta', institutionName: 'Banco Beta', type: 'auto_loan',
    name: 'Beta Autos', rate: { min: 7, max: 9 }, annualFee: 0, oneTimeFees: 150,
    requirements: { minIncome: 1200, minEmploymentMonths: 24, minAge: 21, residency: [...anyResidency], employmentTypes: ['salaried', 'self_employed'] },
    conditions: { maxTermMonths: 96, minAmount: 8000, minDownPaymentPct: 15 },
    benefits: ['insurance_included'], source: src('beta-auto'),
  },
  {
    id: 'gamma-auto', institutionId: 'gamma', institutionName: 'Banco Gamma', type: 'auto_loan',
    name: 'Gamma Auto Fácil', rate: { min: 8.5, max: 11 }, annualFee: 0, oneTimeFees: 0,
    requirements: { minIncome: 700, minEmploymentMonths: 6, minAge: 18, residency: [...anyResidency], employmentTypes: ['salaried', 'self_employed'] },
    conditions: { maxTermMonths: 72, minDownPaymentPct: 10 },
    benefits: [], source: src('gamma-auto'),
  },
  // ---- Hipotecas ----
  {
    id: 'alfa-hogar', institutionId: 'alfa', institutionName: 'Banco Alfa', type: 'mortgage',
    name: 'Alfa Hogar', rate: { min: 5.5, max: 6.75 }, annualFee: 0, oneTimeFees: 1500,
    requirements: { minIncome: 1500, minEmploymentMonths: 24, minAge: 21, maxAge: 75, residency: [...anyResidency], employmentTypes: ['salaried'] },
    conditions: { maxTermMonths: 360, minAmount: 40000, maxAmount: 400000, minDownPaymentPct: 10 },
    benefits: [], source: src('alfa-hogar'),
  },
  {
    id: 'beta-vivienda', institutionId: 'beta', institutionName: 'Banco Beta', type: 'mortgage',
    name: 'Beta Vivienda', rate: { min: 6, max: 7.25 }, annualFee: 0, oneTimeFees: 900,
    requirements: { minIncome: 1200, minEmploymentMonths: 12, minAge: 21, residency: [...anyResidency], employmentTypes: ['salaried', 'self_employed'] },
    conditions: { maxTermMonths: 360, minAmount: 30000, minDownPaymentPct: 5 },
    benefits: [], source: src('beta-vivienda'),
  },
  {
    id: 'gamma-casa', institutionId: 'gamma', institutionName: 'Banco Gamma', type: 'mortgage',
    name: 'Gamma Mi Casa', rate: { min: 6.75, max: 8 }, annualFee: 0, oneTimeFees: 0,
    requirements: { minIncome: 1000, minEmploymentMonths: 12, minAge: 21, residency: [...anyResidency], employmentTypes: ['salaried'] },
    conditions: { maxTermMonths: 300, minDownPaymentPct: 10 },
    benefits: [], source: src('gamma-casa'),
  },
];

export const catalog: Catalog = { version: 'catalog-test-v1', products };

// ---------- Perfiles ----------

/** Asalariado joven, sin historial, sin deudas. Meta: primera tarjeta. */
export const joven: FinancialSnapshot = {
  netMonthlyIncome: 1100, employmentType: 'salaried', employmentMonths: 14, fixedMonthlyExpenses: 450,
  dependents: 0, age: 26, residency: 'national', apcSelfReported: 'none', debts: [],
  savingsForDownPayment: 800, documents: { incomeProof: true, employmentLetter: false, apcReport: false },
};

/** Familia con ingreso estable, algunas deudas. Meta: auto y luego casa. */
export const familia: FinancialSnapshot = {
  netMonthlyIncome: 2600, employmentType: 'salaried', employmentMonths: 30, fixedMonthlyExpenses: 1100,
  dependents: 2, age: 37, residency: 'national', apcSelfReported: 'good',
  debts: [
    { kind: 'credit_card', balance: 1800, limit: 3000, monthlyPayment: 120 },
    { kind: 'personal_loan', balance: 4000, monthlyPayment: 180 },
  ],
  savingsForDownPayment: 4000, documents: { incomeProof: true, employmentLetter: true, apcReport: false },
};

/** Endeudado: alta utilización y DTI alto. */
export const endeudado: FinancialSnapshot = {
  netMonthlyIncome: 1300, employmentType: 'salaried', employmentMonths: 40, fixedMonthlyExpenses: 500,
  dependents: 1, age: 33, residency: 'national', apcSelfReported: 'fair',
  debts: [
    { kind: 'credit_card', balance: 2700, limit: 3000, monthlyPayment: 160, latePaymentsLast12m: 1 },
    { kind: 'credit_card', balance: 1400, limit: 1500, monthlyPayment: 90 },
    { kind: 'personal_loan', balance: 6000, monthlyPayment: 260 },
  ],
  savingsForDownPayment: 300, documents: { incomeProof: true, employmentLetter: true, apcReport: true },
};

// ---------- Metas ----------

export const metaTarjeta: Goal = { id: 'g-card', type: 'credit_card', priority: 1, preferences: ['cashback'] };
export const metaAuto: Goal = { id: 'g-auto', type: 'auto_loan', priority: 1, targetAmount: 25000, desiredTermMonths: 72 };
export const metaCasa: Goal = { id: 'g-casa', type: 'mortgage', priority: 2, targetAmount: 150000, desiredTermMonths: 360 };
