/**
 * Carga datos de ejemplo en una API corriendo con FG_DEV_USERS=1:
 * usuario demo@ejemplo.test con el perfil "familia", metas de auto y casa, y el plan del mes.
 * Uso: FG_API_URL=http://localhost:3000 tsx services/api/scripts/datos-demo.ts
 */
import { familia } from '../../../packages/engine/test/fixtures.js';

const API = process.env.FG_API_URL ?? 'http://localhost:3000';
const H = { 'x-dev-user': 'demo@ejemplo.test', 'content-type': 'application/json' };

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

async function main() {
  await call('POST', '/v1/me/snapshot', familia);
  const auto = await call('POST', '/v1/goals', { type: 'auto_loan', priority: 1, targetAmount: 25000, desiredTermMonths: 72 });
  const casa = await call('POST', '/v1/goals', { type: 'mortgage', priority: 2, targetAmount: 150000 });
  await call('GET', `/v1/goals/${auto.id}/readiness`);
  const plan = await call('POST', `/v1/goals/${casa.id}/plan`);
  await call('PATCH', `/v1/actions/${plan.actions[0].id}`, { status: 'done' });
  console.log(`Datos demo listos: metas ${auto.id} (auto) y ${casa.id} (casa)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
