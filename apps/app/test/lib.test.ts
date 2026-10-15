import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequestError, createApiClient } from '../src/lib/api.js';
import { levelLabel, money, monthLabel, obstacleDetail, parseAmount, pct, reasonText, weekLabel } from '../src/lib/format.js';

describe('formatos', () => {
  it('money en balboas con miles y decimales', () => {
    assert.equal(money(0), 'B/. 0');
    assert.equal(money(1234), 'B/. 1,234');
    assert.equal(money(150000), 'B/. 150,000');
    assert.equal(money(389.03, 2), 'B/. 389.03');
    assert.equal(money(-50), '-B/. 50');
  });
  it('pct, semana y mes', () => {
    assert.equal(pct(91.23), '91.2%');
    assert.equal(pct(30, 0), '30%');
    assert.equal(weekLabel('2026-10-12'), 'semana del 12 de octubre');
    assert.equal(monthLabel('2026-10-01'), 'octubre');
  });
  it('parseAmount entiende lo que la gente escribe', () => {
    assert.equal(parseAmount('1,250.50'), 1250.5);
    assert.equal(parseAmount('B/. 900'), 900);
    assert.equal(parseAmount('$ 2,000'), 2000);
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount('abc'), null);
    assert.equal(parseAmount('-5'), null);
  });
  it('nivel en palabras', () => {
    assert.equal(levelLabel(91, true), 'Listo para comparar');
    assert.equal(levelLabel(75, false), 'Casi listo');
    assert.equal(levelLabel(55, false), 'En camino');
    assert.equal(levelLabel(20, false), 'Empezando');
  });
});

describe('textos de razones y frenos', () => {
  it('cada código de razón tiene texto y usa solo sus parámetros', () => {
    assert.equal(reasonText({ code: 'lowest_cost', params: { compared: 3 } }), 'El costo más bajo de 3 opciones que calificas');
    assert.equal(reasonText({ code: 'matches_preferences', params: { benefits: 'cashback,miles' } }), 'Tiene lo que buscas: reembolso en efectivo, millas');
    assert.equal(
      reasonText({ code: 'affordable_payment', params: { payment: 389.03, capacity: 940 } }),
      'Cuota estimada de B/. 389, cómoda para tu capacidad de B/. 940',
    );
    assert.equal(
      reasonText({ code: 'higher_down_payment', params: { pct: 15, lowest: 10 } }),
      'Pide 15% de abono (otras opciones piden 10%): cuota más baja, pero necesitas más ahorro',
    );
    for (const code of ['low_cost', 'no_annual_fee', 'tight_payment', 'comfortable_requirements', 'tight_requirements'] as const) {
      assert.ok(reasonText({ code, params: { payment: 1, capacity: 1, minIncome: 1, compared: 1 } }).length > 5);
    }
  });
  it('frenos con evidencia real del motor', () => {
    assert.equal(
      obstacleDetail('utilization', { utilization: 0.911, good: 0.3 }),
      'Usas el 91% del límite de tus tarjetas. Lo ideal es menos de 30%.',
    );
    assert.equal(
      obstacleDetail('dti', { dti: 0.466, estimatedNewPayment: 912.44, dtiGood: 0.3, dtiMax: 0.45 }),
      'Con la nueva cuota, tus deudas serían el 47% de tu ingreso. Lo ideal es hasta 30%.',
    );
    assert.equal(obstacleDetail('down_payment', { required: 15000, saved: 4000, pct: 10 }), 'Tienes B/. 4,000 de B/. 15,000 de abono (10%).');
    assert.equal(obstacleDetail('documents', { ready: 2, total: 3 }), 'Tienes 2 de 3 documentos listos.');
  });
});

describe('cliente de la API (sin red)', () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  let next: Response = reply(200, {});
  const api = createApiClient({
    baseUrl: 'http://api.test/',
    auth: () => ({ 'x-dev-user': 'ana@ejemplo.test' }),
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return next;
    }) as unknown as typeof fetch,
  });

  it('envía auth, JSON y ruta correcta', async () => {
    next = reply(201, { id: 'g1', type: 'auto_loan' });
    await api.createGoal({ type: 'auto_loan', priority: 1, preferences: [] });
    const c = calls.at(-1)!;
    assert.equal(c.url, 'http://api.test/v1/goals');
    assert.equal(c.init.method, 'POST');
    assert.equal((c.init.headers as Record<string, string>)['x-dev-user'], 'ana@ejemplo.test');
    assert.equal((c.init.headers as Record<string, string>)['content-type'], 'application/json');
  });
  it('404 en plan o perfil devuelve null; otros errores lanzan con código', async () => {
    next = reply(404, { error: { code: 'not_found', message: 'no' } });
    assert.equal(await api.plan('g1'), null);
    next = reply(404, { error: { code: 'not_found', message: 'no' } });
    assert.equal(await api.snapshot(), null);
    next = reply(409, { error: { code: 'snapshot_required', message: 'Primero completa tu perfil financiero' } });
    await assert.rejects(api.readiness('g1'), (e: unknown) => e instanceof ApiRequestError && e.code === 'snapshot_required' && e.status === 409);
  });
  it('204 y error de red', async () => {
    next = new Response(null, { status: 204 });
    assert.equal(await api.deleteMe(), undefined);
    const offline = createApiClient({ baseUrl: 'http://x', auth: () => ({}), fetchImpl: (async () => { throw new TypeError('fail'); }) as unknown as typeof fetch });
    await assert.rejects(offline.me(), (e: unknown) => e instanceof ApiRequestError && e.code === 'network');
  });
});

import { emptyForm, formFromSnapshot, formToSnapshot } from '../src/lib/profileForm.js';

describe('formulario de perfil', () => {
  it('vacío marca los campos requeridos', () => {
    const r = formToSnapshot(emptyForm());
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.errors.netMonthlyIncome, 'Requerido');
    assert.equal(r.errors.age, 'Escribe tu edad (16 o más)');
    assert.equal(r.errors.employmentMonths, 'Escribe los meses, por ejemplo 18');
  });
  it('acepta montos como los escribe la gente y arma el payload de la API', () => {
    const f = { ...emptyForm(), netMonthlyIncome: '2,600', employmentMonths: '30', age: '37', fixedMonthlyExpenses: 'B/. 1,100',
      debts: [{ kind: 'credit_card' as const, balance: '1,800', limit: '3000', monthlyPayment: '120' }] };
    const r = formToSnapshot(f);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.netMonthlyIncome, 2600);
    assert.equal(r.value.fixedMonthlyExpenses, 1100);
    assert.deepEqual(r.value.debts, [{ kind: 'credit_card', balance: 1800, limit: 3000, monthlyPayment: 120 }]);
  });
  it('tarjeta sin límite es error; ida y vuelta desde un snapshot', () => {
    const f = { ...emptyForm(), netMonthlyIncome: '1000', employmentMonths: '12', age: '30',
      debts: [{ kind: 'credit_card' as const, balance: '100', limit: '', monthlyPayment: '20' }] };
    const r = formToSnapshot(f);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.errors['debts.0.limit'], 'Requerido');
    const snap = { netMonthlyIncome: 2600, employmentType: 'salaried' as const, employmentMonths: 30, fixedMonthlyExpenses: 1100,
      dependents: 2, age: 37, residency: 'national' as const, apcSelfReported: 'good' as const, savingsForDownPayment: 4000,
      documents: { incomeProof: true, employmentLetter: true, apcReport: false },
      debts: [{ kind: 'personal_loan' as const, balance: 4000, monthlyPayment: 180 }] };
    const back = formToSnapshot(formFromSnapshot(snap));
    assert.equal(back.ok, true);
    if (back.ok) assert.deepEqual({ ...back.value, fieldSources: undefined }, { ...snap, fieldSources: undefined });
  });
});
