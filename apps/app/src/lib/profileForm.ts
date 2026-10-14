/**
 * Formulario de perfil ↔ SnapshotInput. Puro y probado: la pantalla solo lo muestra.
 */
import { SnapshotInputSchema, type SnapshotInput } from '@fg/contracts';
import type { FinancialSnapshot } from '@fg/engine';
import { parseAmount } from './format';

export interface DebtForm {
  kind: 'credit_card' | 'personal_loan' | 'auto_loan' | 'mortgage' | 'other';
  balance: string;
  limit: string;
  monthlyPayment: string;
}

export interface ProfileForm {
  netMonthlyIncome: string;
  employmentType: SnapshotInput['employmentType'];
  employmentMonths: string;
  fixedMonthlyExpenses: string;
  dependents: string;
  age: string;
  residency: SnapshotInput['residency'];
  apcSelfReported: SnapshotInput['apcSelfReported'];
  savingsForDownPayment: string;
  documents: SnapshotInput['documents'];
  debts: DebtForm[];
}

export const emptyForm = (): ProfileForm => ({
  netMonthlyIncome: '',
  employmentType: 'salaried',
  employmentMonths: '',
  fixedMonthlyExpenses: '',
  dependents: '0',
  age: '',
  residency: 'national',
  apcSelfReported: 'unknown',
  savingsForDownPayment: '',
  documents: { incomeProof: false, employmentLetter: false, apcReport: false },
  debts: [],
});

const str = (n: number | undefined) => (n === undefined ? '' : String(n));

export function formFromSnapshot(s: FinancialSnapshot): ProfileForm {
  return {
    netMonthlyIncome: str(s.netMonthlyIncome),
    employmentType: s.employmentType,
    employmentMonths: str(s.employmentMonths),
    fixedMonthlyExpenses: str(s.fixedMonthlyExpenses),
    dependents: str(s.dependents),
    age: str(s.age),
    residency: s.residency,
    apcSelfReported: s.apcSelfReported,
    savingsForDownPayment: str(s.savingsForDownPayment),
    documents: { ...s.documents },
    debts: s.debts.map((d) => ({ kind: d.kind, balance: str(d.balance), limit: str(d.limit), monthlyPayment: str(d.monthlyPayment) })),
  };
}

const int = (s: string) => (s.trim() && /^\d+$/.test(s.trim()) ? Number(s) : NaN);

/** Valida con el mismo esquema que la API. Devuelve el payload o errores por campo. */
export function formToSnapshot(f: ProfileForm): { ok: true; value: SnapshotInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amount = (key: string, v: string, required: boolean) => {
    const n = parseAmount(v);
    if (n === null) {
      if (required || v.trim()) errors[key] = required && !v.trim() ? 'Requerido' : 'Escribe un monto válido';
      return 0;
    }
    return n;
  };
  const candidate = {
    netMonthlyIncome: amount('netMonthlyIncome', f.netMonthlyIncome, true),
    employmentType: f.employmentType,
    employmentMonths: int(f.employmentMonths),
    fixedMonthlyExpenses: amount('fixedMonthlyExpenses', f.fixedMonthlyExpenses, false),
    dependents: f.dependents.trim() ? int(f.dependents) : 0,
    age: int(f.age),
    residency: f.residency,
    apcSelfReported: f.apcSelfReported,
    savingsForDownPayment: amount('savingsForDownPayment', f.savingsForDownPayment, false),
    documents: f.documents,
    debts: f.debts.map((d, i) => ({
      kind: d.kind,
      balance: amount(`debts.${i}.balance`, d.balance, true),
      ...(d.kind === 'credit_card' ? { limit: amount(`debts.${i}.limit`, d.limit, true) } : {}),
      monthlyPayment: amount(`debts.${i}.monthlyPayment`, d.monthlyPayment, true),
    })),
  };
  const r = SnapshotInputSchema.safeParse(candidate);
  if (!r.success) {
    for (const i of r.error.issues) {
      const key = i.path.join('.');
      if (!errors[key]) errors[key] = MESSAGES[key] ?? 'Revisa este dato';
    }
  }
  if (Object.keys(errors).length || !r.success) return { ok: false, errors };
  return { ok: true, value: r.data };
}

const MESSAGES: Record<string, string> = {
  employmentMonths: 'Escribe los meses, por ejemplo 18',
  age: 'Escribe tu edad (16 o más)',
  dependents: 'Escribe un número, por ejemplo 0',
};
