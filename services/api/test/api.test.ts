/**
 * Pruebas de la API v1 levantando el servidor real contra PostgreSQL.
 * Requiere DATABASE_URL de una BD DESECHABLE (se reinicia).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { psqlDb, resetDatabase } from '@fg/db/testing';
import { defaultConfig, type ReadinessResult } from '@fg/engine';
import { createApp } from '../src/app.js';
import { signHs256, verifyHs256 } from '../src/auth.js';
import { buildMonthlyPlan, weekStart } from '../src/domain/plan.js';
import { familia, endeudado } from '../../../packages/engine/test/fixtures.js';

const URL_DB = process.env.DATABASE_URL;
if (!URL_DB) throw new Error('Falta DATABASE_URL (BD desechable)');
const SECRET = 'secreto-de-prueba-con-suficiente-longitud';
const TODAY = new Date('2026-10-14T15:00:00Z'); // miércoles

let server: Server;
let base = '';

before(async () => {
  resetDatabase(URL_DB);
  const handle = createApp({
    db: psqlDb(URL_DB),
    auth: { jwtSecret: SECRET, devUsers: true },
    now: () => TODAY,
    corsOrigins: ['http://localhost:8081'],
  });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function call(method: string, path: string, opts: { user?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.user) headers['x-dev-user'] = opts.user;
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const ANA = 'ana@ejemplo.test';
const LUIS = 'luis@ejemplo.test';

describe('plan del mes (unidad)', () => {
  it('weekStart devuelve el lunes', () => {
    assert.equal(weekStart(new Date('2026-10-14T15:00:00Z')), '2026-10-12');
    assert.equal(weekStart(new Date('2026-10-18T23:00:00Z')), '2026-10-12');
    assert.equal(weekStart(new Date('2026-10-19T00:00:00Z')), '2026-10-19');
  });
  it('sin frenos el objetivo es comparar; con frenos, el principal manda', () => {
    const listo = { obstacles: [] } as unknown as ReadinessResult;
    assert.equal(buildMonthlyPlan(listo, defaultConfig, TODAY).objective, defaultConfig.objectiveTemplates.ready);
    const conFrenos = {
      obstacles: [
        { factor: 'utilization', suggestedActions: ['a1', 'a2', 'a3'] },
        { factor: 'dti', suggestedActions: ['b1', 'b2'] },
        { factor: 'apc', suggestedActions: ['c1'] },
      ],
    } as unknown as ReadinessResult;
    const p = buildMonthlyPlan(conFrenos, defaultConfig, TODAY);
    assert.equal(p.objective, defaultConfig.objectiveTemplates.utilization);
    assert.deepEqual(p.actions.map((a) => a.title), ['a1', 'a2', 'b1', 'c1']);
    assert.equal(p.month, '2026-10-01');
  });
});

describe('autenticación', () => {
  it('rutas privadas exigen identidad; las públicas no', async () => {
    assert.equal((await call('GET', '/v1/me')).status, 401);
    const h = await call('GET', '/v1/health');
    assert.equal(h.status, 200);
    assert.match(h.body.catalogVersion, /^cat-/);
  });
  it('JWT HS256: válido entra; firma mala, vencido o alg distinto no', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const ok = signHs256({ sub: 'sb-123', email: 'jwt@ejemplo.test', exp }, SECRET);
    const me = await call('GET', '/v1/me', { token: ok });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, 'jwt@ejemplo.test');
    assert.equal((await call('GET', '/v1/me', { token: signHs256({ sub: 'x', email: 'a@b.c', exp }, 'otro') })).status, 401);
    assert.equal((await call('GET', '/v1/me', { token: signHs256({ sub: 'x', email: 'a@b.c', exp: 10 }, SECRET) })).status, 401);
    const none = ok.replace(/^[^.]+/, Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'));
    assert.throws(() => verifyHs256(none, SECRET));
  });
});

describe('flujo completo de un usuario', () => {
  let casa = '';
  let auto = '';

  it('sin perfil, la preparación responde 409 con un mensaje claro', async () => {
    const g = await call('POST', '/v1/goals', { user: ANA, body: { type: 'auto_loan', priority: 1, targetAmount: 25000, desiredTermMonths: 72 } });
    assert.equal(g.status, 201);
    auto = g.body.id;
    const r = await call('GET', `/v1/goals/${auto}/readiness`, { user: ANA });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'snapshot_required');
  });

  it('valida entradas con los contratos compartidos', async () => {
    const r = await call('POST', '/v1/me/snapshot', { user: ANA, body: { netMonthlyIncome: -5 } });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.some((d: { path: string }) => d.path === 'netMonthlyIncome'));
    assert.equal((await call('POST', '/v1/goals', { user: ANA, body: { type: 'yate', priority: 1 } })).status, 400);
  });

  it('guarda el perfil financiero y lo devuelve en el formato del motor', async () => {
    const r = await call('POST', '/v1/me/snapshot', { user: ANA, body: familia });
    assert.equal(r.status, 201);
    const s = await call('GET', '/v1/me/snapshot', { user: ANA });
    // Sin dato de atrasos se guarda 0 (el motor lo trata igual); el orden de las deudas se conserva.
    const esperado = { ...familia, debts: familia.debts.map((d) => ({ latePaymentsLast12m: 0, ...d })) };
    assert.deepEqual(s.body.snapshot, esperado);
  });

  it('preparación y recomendaciones coinciden con el motor y quedan guardadas', async () => {
    const r = await call('GET', `/v1/goals/${auto}/readiness`, { user: ANA });
    assert.equal(r.status, 200);
    assert.equal(r.body.score, 91.2); // mismo valor que el motor con el perfil "familia"
    assert.equal(r.body.readyToCompare, true);
    const rec = await call('GET', `/v1/goals/${auto}/recommendations`, { user: ANA });
    assert.equal(rec.status, 200);
    assert.deepEqual(rec.body.top.map((t: { productId: string }) => t.productId), ['alfa-auto', 'beta-auto', 'gamma-auto']);
    assert.equal(rec.body.notice, null);
    const goals = await call('GET', '/v1/goals', { user: ANA });
    assert.equal(goals.body.goals[0].readinessScore, 91.2);
  });

  it('meta no lista: recomendaciones con aviso, plan del mes con misiones', async () => {
    const g = await call('POST', '/v1/goals', { user: ANA, body: { type: 'mortgage', priority: 2, targetAmount: 150000 } });
    casa = g.body.id;
    const rec = await call('GET', `/v1/goals/${casa}/recommendations`, { user: ANA });
    assert.equal(rec.body.readyToCompare, false);
    assert.ok(rec.body.notice);
    assert.equal((await call('GET', `/v1/goals/${casa}/plan`, { user: ANA })).status, 404);
    const p = await call('POST', `/v1/goals/${casa}/plan`, { user: ANA });
    assert.equal(p.status, 201);
    assert.equal(p.body.month, '2026-10-01');
    assert.equal(p.body.objective, defaultConfig.objectiveTemplates.dti);
    assert.ok(p.body.actions.length >= 2 && p.body.actions.length <= 5);
    assert.ok(p.body.actions.every((a: { weekStart: string; status: string }) => a.weekStart === '2026-10-12' && a.status === 'pending'));
    assert.equal(p.body.actions[0].factor, 'dti');
    // Pedirlo otra vez devuelve el mismo plan, no uno nuevo
    const again = await call('POST', `/v1/goals/${casa}/plan`, { user: ANA });
    assert.equal(again.status, 200);
    assert.equal(again.body.id, p.body.id);
  });

  it('marcar una misión como hecha', async () => {
    const p = await call('GET', `/v1/goals/${casa}/plan`, { user: ANA });
    const a = p.body.actions[0];
    assert.equal((await call('PATCH', `/v1/actions/${a.id}`, { user: ANA, body: { status: 'done', result: 'Aboné 200' } })).status, 200);
    const p2 = await call('GET', `/v1/goals/${casa}/plan`, { user: ANA });
    const a2 = p2.body.actions.find((x: { id: string }) => x.id === a.id);
    assert.equal(a2.status, 'done');
    assert.equal(a2.result, 'Aboné 200');
  });

  it('editar una meta (prioridad, monto)', async () => {
    const r = await call('PATCH', `/v1/goals/${casa}`, { user: ANA, body: { priority: 1, targetAmount: 120000 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.priority, 1);
    assert.equal(r.body.targetAmount, 120000);
    assert.equal((await call('PATCH', `/v1/goals/${casa}`, { user: ANA, body: {} })).status, 400);
  });

  it('AISLAMIENTO: otro usuario no ve ni toca metas, planes ni misiones ajenas', async () => {
    await call('POST', '/v1/me/snapshot', { user: LUIS, body: endeudado });
    assert.equal((await call('GET', `/v1/goals/${casa}`, { user: LUIS })).status, 404);
    assert.equal((await call('GET', `/v1/goals/${casa}/readiness`, { user: LUIS })).status, 404);
    assert.equal((await call('GET', `/v1/goals/${casa}/plan`, { user: LUIS })).status, 404);
    assert.equal((await call('PATCH', `/v1/goals/${casa}`, { user: LUIS, body: { priority: 3 } })).status, 404);
    const p = await call('GET', `/v1/goals/${casa}/plan`, { user: ANA });
    assert.equal((await call('PATCH', `/v1/actions/${p.body.actions[1].id}`, { user: LUIS, body: { status: 'done' } })).status, 404);
    assert.deepEqual((await call('GET', '/v1/goals', { user: LUIS })).body.goals, []);
    assert.equal((await call('GET', '/v1/goals/no-es-uuid', { user: LUIS })).status, 404);
  });

  it('catálogo público con frescura; tipo inválido es 400', async () => {
    const c = await call('GET', '/v1/catalog/products?type=credit_card');
    assert.equal(c.status, 200);
    assert.equal(c.body.products.length, 4);
    assert.ok(c.body.products.every((p: { stale: boolean; commercial?: unknown }) => p.stale === false && !('commercial' in p)));
    assert.equal((await call('GET', '/v1/catalog/products?type=yate')).status, 400);
  });

  it('CORS solo para orígenes permitidos; errores de ruta y método', async () => {
    const ok = await fetch(`${base}/v1/health`, { headers: { origin: 'http://localhost:8081' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8081');
    const no = await fetch(`${base}/v1/health`, { headers: { origin: 'https://malo.test' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
    // Preflight: permite x-dev-user solo porque este servidor tiene usuarios de desarrollo activos
    const pre = await fetch(`${base}/v1/me`, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081', 'access-control-request-headers': 'x-dev-user' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers') ?? '', /x-dev-user/);
    assert.equal((await call('GET', '/v1/nada', { user: ANA })).status, 404);
    assert.equal((await call('PUT', '/v1/goals', { user: ANA })).status, 405);
  });

  it('borrar la cuenta elimina todos sus datos', async () => {
    assert.equal((await call('POST', '/v1/me/consents', { user: ANA, body: { purpose: 'financial_profile', granted: true } })).status, 201);
    assert.equal((await call('DELETE', '/v1/me', { user: ANA })).status, 204);
    const db = psqlDb(URL_DB);
    const { rows } = await db.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM app_user WHERE email = $1)
            + (SELECT count(*) FROM goal g WHERE g.id = $2::uuid)
            + (SELECT count(*) FROM consent c JOIN app_user u ON u.id = c.user_id WHERE u.email = $1) AS n`,
      [ANA, casa],
    );
    assert.equal(Number(rows[0]!.n), 0);
    // Si vuelve a entrar, empieza de cero
    const me = await call('GET', '/v1/me', { user: ANA });
    assert.equal(me.body.has_snapshot, false);
    assert.equal(me.body.goals, 0);
  });
});
