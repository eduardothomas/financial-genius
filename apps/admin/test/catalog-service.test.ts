/**
 * Pruebas del flujo del panel admin contra PostgreSQL real.
 * Requiere DATABASE_URL de una BD desechable: la reinicia (migración + semilla).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rankProducts, type Product } from '@fg/engine';
import type { Extractor } from '@fg/catalog';
import {
  approveProposal,
  getProposal,
  importFromUrl,
  listCatalog,
  listProposals,
  recheckAllSources,
  rejectProposal,
} from '../lib/catalog-service';
import { psqlDb } from './psql-db';
import { familia, metaAuto } from '../../../packages/engine/test/fixtures';

const URL_DB = process.env.DATABASE_URL;
if (!URL_DB) throw new Error('Falta DATABASE_URL (BD desechable)');
const DBDIR = join(import.meta.dirname, '../../../packages/db');
const db = psqlDb(URL_DB);
const psql = (...args: string[]) => execFileSync('psql', [URL_DB, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'pipe' });

// --- Página FICTICIA del Banco Omega, que cambia durante la prueba ---
let rate = '6.75';
let status = 200;
const page = () =>
  `<html><body><h1>Préstamo Auto Omega</h1><p>Tasa desde ${rate}% hasta 8.95% anual.</p>
   <p>Ingreso mínimo: B/. 1,000 mensuales. Plazo hasta 84 meses. Abono mínimo del 10%.</p>
   <p>Para panameños y residentes asalariados.</p></body></html>`;
const fakeFetch = (async () =>
  new Response(status === 200 ? page() : 'no encontrado', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })) as unknown as typeof fetch;

let lie = false;
const extractor: Extractor = {
  async extract() {
    const r = lie ? 4.5 : Number(rate);
    return {
      product: {
        name: 'Préstamo Auto Omega', type: 'auto_loan',
        rate: { min: r, max: 8.95 }, annualFee: 0, oneTimeFees: 0,
        requirements: { minIncome: 1000, minEmploymentMonths: null, minAge: null, maxAge: null, residency: ['national', 'resident'], employmentTypes: ['salaried'] },
        conditions: { minTermMonths: null, maxTermMonths: 84, minAmount: null, maxAmount: null, minDownPaymentPct: 10 },
        benefits: [],
      },
      citations: {
        'rate.min': lie ? 'Tasa promocional de 4.5%' : `Tasa desde ${rate}% hasta 8.95% anual`,
        'rate.max': `hasta 8.95% anual`,
        'requirements.minIncome': 'Ingreso mínimo: B/. 1,000 mensuales',
        annualFee: 'Préstamo Auto Omega',
      },
    };
  },
};
const deps = { extractor, fetchImpl: fakeFetch, now: () => new Date('2026-10-14T12:00:00Z') };
const input = {
  institutionId: 'omega', institutionName: 'Banco Omega', url: 'https://omega.test/auto',
  type: 'auto_loan' as const, productName: 'Auto Omega',
};

before(() => {
  psql('-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of readdirSync(join(DBDIR, 'migrations')).sort()) psql('-f', join(DBDIR, 'migrations', f));
  psql('-v', `catalog=${readFileSync(join(DBDIR, 'seed/catalog.sample.json'), 'utf8')}`, '-f', join(DBDIR, 'seed/seed.sql'));
});

describe('panel admin: flujo del catálogo', () => {
  let firstId = '';

  it('importar una URL nueva crea una propuesta pendiente de alto riesgo', async () => {
    const r = await importFromUrl(db, input, deps);
    assert.equal(r.status, 'proposed');
    if (r.status !== 'proposed') return;
    assert.equal(r.approvable, true);
    assert.equal(r.risk, 'high');
    firstId = r.proposalId;
    const pending = await listProposals(db);
    assert.equal(pending.length, 1);
    const p = await getProposal(db, firstId);
    assert.equal(p?.source_url, input.url);
    assert.ok(p?.diff.some((d) => d.field === 'rate.min' && d.after === 6.75));
  });

  it('aprobar publica la versión 1 y el motor ya la puede recomendar', async () => {
    await approveProposal(db, firstId, 'eduardo');
    const cat = await listCatalog(db);
    const omega = cat.find((c) => c.id === 'omega-auto-omega');
    assert.ok(omega, cat.map((c) => c.id).join(','));
    assert.equal(omega.version_no, 1);
    const { rows } = await db.query<{ p: Product[] }>(`SELECT engine_products('auto_loan') AS p`);
    const ranking = rankProducts(metaAuto, familia, { version: 'db', products: rows[0]!.p });
    assert.ok(ranking.top.some((t) => t.productId === 'omega-auto-omega'));
  });

  it('si la página no cambió, no se crea otra propuesta', async () => {
    const r = await importFromUrl(db, { ...input, productId: 'omega-auto-omega' }, deps);
    assert.equal(r.status, 'unchanged');
    const all = await recheckAllSources(db, deps);
    assert.deepEqual(all.map((x) => x.status), ['unchanged']);
  });

  it('si el banco cambia la tasa, el rastreo propone v2 con el cambio marcado', async () => {
    rate = '6.50';
    const [r] = await recheckAllSources(db, deps);
    assert.equal(r?.status, 'proposed');
    if (r?.status !== 'proposed') return;
    const p = await getProposal(db, r.proposalId);
    assert.deepEqual(
      p?.diff.filter((d) => d.field.startsWith('rate')),
      [{ field: 'rate.min', before: 6.75, after: 6.5, risk: 'high' }],
    );
    await approveProposal(db, r.proposalId, 'eduardo', 'baja de tasa');
    const omega = (await listCatalog(db)).find((c) => c.id === 'omega-auto-omega');
    assert.equal(omega?.version_no, 2);
    assert.equal(Number(omega?.rate_min), 6.5);
  });

  it('una propuesta con cita inventada no se puede aprobar, pero sí rechazar', async () => {
    lie = true;
    rate = '6.40'; // la página cambia para que haya propuesta
    const r = await importFromUrl(db, { ...input, productId: 'omega-auto-omega' }, deps);
    lie = false;
    assert.equal(r.status, 'proposed');
    if (r.status !== 'proposed') return;
    assert.equal(r.approvable, false);
    await assert.rejects(approveProposal(db, r.proposalId, 'eduardo'));
    await rejectProposal(db, r.proposalId, 'eduardo', 'cita no aparece en la página');
    await assert.rejects(rejectProposal(db, r.proposalId, 'eduardo', 'otra vez'));
    assert.equal((await getProposal(db, r.proposalId))?.status, 'rejected');
  });

  it('si la página falla, no se crea propuesta', async () => {
    status = 404;
    const r = await importFromUrl(db, { ...input, productId: 'omega-auto-omega', force: true }, deps);
    status = 200;
    assert.deepEqual(r, { status: 'fetch_failed', httpStatus: 404 });
  });
});
