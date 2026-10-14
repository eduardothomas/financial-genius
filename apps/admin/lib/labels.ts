export const TYPE_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  auto_loan: 'Préstamo de auto',
  mortgage: 'Hipoteca',
};

export const FIELD_LABEL: Record<string, string> = {
  name: 'Nombre',
  'rate.min': 'Tasa mínima (%)',
  'rate.max': 'Tasa máxima (%)',
  annualFee: 'Anualidad',
  oneTimeFees: 'Cargos de apertura/cierre',
  'requirements.minIncome': 'Ingreso mínimo',
  'requirements.minEmploymentMonths': 'Antigüedad laboral (meses)',
  'requirements.minAge': 'Edad mínima',
  'requirements.maxAge': 'Edad máxima',
  'requirements.residency': 'Residencia',
  'requirements.employmentTypes': 'Tipo de empleo',
  'conditions.minTermMonths': 'Plazo mínimo (meses)',
  'conditions.maxTermMonths': 'Plazo máximo (meses)',
  'conditions.minAmount': 'Monto mínimo',
  'conditions.maxAmount': 'Monto máximo',
  'conditions.minDownPaymentPct': 'Abono mínimo (%)',
  benefits: 'Beneficios',
  'source.url': 'Fuente',
  'source.capturedAt': 'Fecha de captura',
};

export const label = (f: string) => FIELD_LABEL[f] ?? f;

export const show = (v: unknown): string =>
  v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') || '—' : String(v);
