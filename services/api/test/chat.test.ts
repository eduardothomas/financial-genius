/**
 * Chat del Genio con un modelo GUIONADO (sin red) contra PostgreSQL real.
 * Requiere DATABASE_URL de una BD DESECHABLE (se reinicia).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { psqlDb, resetDatabase } from '@fg/db/testing';
import { createApp } from '../src/app.js';
import { MAX_TOOL_ROUNDS, systemPrompt } from '../src/chat/genio.js';
import { anthropicChatModel, type ChatModel, type ContentBlock, type ModelRequest } from '../src/chat/model.js';
import { familia } from '../../../packages/engine/test/fixtures.js';

const URL_DB = process.env.DATABASE_URL;
if (!URL_DB) throw new Error('Falta DATABASE_URL (BD desechable)');
const TODAY = new Date('2026-10-14T15:00:00Z');

/** Último bloque tool_result del historial, parseado. */
function lastResult(req: ModelRequest): { data: any; isError: boolean } | null {
  const last = req.messages.at(-1);
  if (!last || typeof last.content === 'string') return null;
  const r = last.content.find((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result');
  return r ? { data: JSON.parse(r.content), isError: !!r.is_error } : null;
}
const userText = (req: ModelRequest) => {
  const u = [...req.messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');
  return (u?.content as string) ?? '';
};
const tool = (name: string, input: Record<string, unknown> = {}) => ({
  content: [{ type: 'tool_use' as const, id: `t-${name}-${Math.random().toString(36).slice(2, 7)}`, name, input }],
  stopReason: 'tool_use',
});
const say = (text: string) => ({ content: [{ type: 'text' as const, text }], stopReason: 'end_turn' });

const seen: ModelRequest[] = [];
let foreignGoalId = '';

/** Guion: decide según el último mensaje del usuario y el último resultado de herramienta. */
const scripted: ChatModel = {
  async complete(req) {
    seen.push(structuredClone(req));
    const text = userText(req);
    const res = lastResult(req);
    const lastTool = [...req.messages].reverse().flatMap((m) => (typeof m.content === 'string' ? [] : m.content)).find((b) => b.type === 'tool_use') as
      | Extract<ContentBlock, { type: 'tool_use' }>
      | undefined;

    if (text.includes('opciones para el auto')) {
      if (!res) return tool('ver_metas');
      if (lastTool?.name === 'ver_metas') {
        const auto = res.data.metas.find((g: { type: string }) => g.type === 'auto_loan');
        return tool('ver_opciones', { goal_id: auto.id });
      }
      const top = res.data.top[0];
      return say(`Tu mejor opción es ${top.producto} de ${top.banco}, con cuota estimada de B/. ${Math.round(top.cuotaMensualEstimada)}.`);
    }
    if (text.includes('quiero comprar una casa')) {
      if (!res) return tool('crear_meta', { type: 'mortgage', priority: 2, target_amount: 150000 });
      if (lastTool?.name === 'crear_meta') return tool('crear_plan', { goal_id: res.data.id });
      return say(`Listo: creé tu meta y tu plan. Objetivo del mes: ${res.data.objective}.`);
    }
    if (text.includes('meta ajena')) {
      if (!res) return tool('ver_preparacion', { goal_id: foreignGoalId });
      return say(res.isError ? `No encontré esa meta (${res.data.error}).` : 'La vi.');
    }
    if (text.includes('bucle')) return tool('ver_metas');
    if (text.includes('qué te pregunté')) {
      const prev = req.messages.filter((m) => m.role === 'user' && typeof m.content === 'string').map((m) => m.content);
      return say(`Antes me preguntaste: ${prev[0]}`);
    }
    return say('Hola, soy tu Genio.');
  },
};

let server: Server;
let base = '';
let noModelBase = '';
let noModel: Server;

before(async () => {
  resetDatabase(URL_DB);
  const db = psqlDb(URL_DB);
  const mk = (chatModel?: ChatModel) => createApp({ db, auth: { devUsers: true }, now: () => TODAY, chatModel });
  const h1 = mk(scripted);
  const h2 = mk(undefined);
  server = createServer((q, r) => void h1(q, r));
  noModel = createServer((q, r) => void h2(q, r));
  await new Promise<void>((r) => server.listen(0, r));
  await new Promise<void>((r) => noModel.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  noModelBase = `http://localhost:${(noModel.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  noModel.close();
});

async function call(method: string, path: string, user: string, body?: unknown, b = base) {
  const res = await fetch(b + path, {
    method,
    headers: { 'x-dev-user': user, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}

const ANA = 'ana@ejemplo.test';
const LUIS = 'luis@ejemplo.test';

describe('chat del Genio', () => {
  let conv = '';

  it('sin modelo configurado responde 503', async () => {
    const r = await call('POST', '/v1/chat', ANA, { message: 'hola' }, noModelBase);
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'chat_unavailable');
  });

  it('valida el mensaje', async () => {
    assert.equal((await call('POST', '/v1/chat', ANA, { message: '   ' })).status, 400);
    assert.equal((await call('POST', '/v1/chat', ANA, { message: 'x'.repeat(2001) })).status, 400);
  });

  it('usa herramientas: metas → opciones, y responde con datos del motor y una tarjeta', async () => {
    await call('POST', '/v1/me/snapshot', ANA, familia);
    await call('POST', '/v1/goals', ANA, { type: 'auto_loan', priority: 1, targetAmount: 25000, desiredTermMonths: 72 });
    const r = await call('POST', '/v1/chat', ANA, { message: '¿Cuáles son mis opciones para el auto?'.toLowerCase() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    conv = r.body.conversationId;
    assert.match(r.body.reply, /Alfa Auto Nuevo de Banco Alfa, con cuota estimada de B\/\. 389/);
    const card = r.body.attachments.find((a: { type: string }) => a.type === 'ranking');
    assert.deepEqual(card.top.map((t: { productId: string }) => t.productId), ['alfa-auto', 'beta-auto', 'gamma-auto']);
    // El modelo recibió las herramientas y el sistema con las reglas
    const first = seen.at(-3)!;
    assert.ok(first.tools.some((t) => t.name === 'ver_opciones'));
    assert.ok(first.system.includes('Nunca inventes tasas'));
  });

  it('crea meta y plan por chat cuando el usuario lo pide', async () => {
    const r = await call('POST', '/v1/chat', ANA, { conversationId: conv, message: 'quiero comprar una casa de 150 mil' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.reply, /Objetivo del mes: Bajar tus pagos de deuda/);
    assert.deepEqual(r.body.attachments.map((a: { type: string }) => a.type).sort(), ['goal', 'plan']);
    const goals = await call('GET', '/v1/goals', ANA);
    assert.ok(goals.body.goals.some((g: { type: string }) => g.type === 'mortgage'));
  });

  it('el historial se envía al modelo y la conversación se puede leer', async () => {
    const r = await call('POST', '/v1/chat', ANA, { conversationId: conv, message: '¿qué te pregunté primero?' });
    assert.match(r.body.reply, /Antes me preguntaste: ¿cuáles son mis opciones para el auto\?/);
    const c = await call('GET', `/v1/chat/conversations/${conv}`, ANA);
    assert.equal(c.status, 200);
    assert.deepEqual(c.body.messages.map((m: { role: string }) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    assert.equal(c.body.messages[1].attachments[0].type, 'ranking');
    const list = await call('GET', '/v1/chat/conversations', ANA);
    assert.equal(list.body.conversations[0].id, conv);
    assert.equal(list.body.conversations[0].preview, '¿qué te pregunté primero?');
  });

  it('AISLAMIENTO: otro usuario no lee ni continúa la conversación, y sus herramientas no ven metas ajenas', async () => {
    assert.equal((await call('GET', `/v1/chat/conversations/${conv}`, LUIS)).status, 404);
    assert.equal((await call('POST', '/v1/chat', LUIS, { conversationId: conv, message: 'hola' })).status, 404);
    const goals = await call('GET', '/v1/goals', ANA);
    foreignGoalId = goals.body.goals[0].id;
    const r = await call('POST', '/v1/chat', LUIS, { message: 'muéstrame la meta ajena' });
    assert.equal(r.status, 200);
    assert.match(r.body.reply, /No encontré esa meta \(La meta no existe\)/);
    assert.deepEqual(r.body.attachments, []);
  });

  it(`corta el bucle de herramientas a las ${MAX_TOOL_ROUNDS} rondas`, async () => {
    const before = seen.length;
    const r = await call('POST', '/v1/chat', ANA, { message: 'bucle infinito' });
    assert.equal(r.status, 200);
    assert.match(r.body.reply, /me enredé/);
    assert.equal(seen.length - before, MAX_TOOL_ROUNDS + 1);
    assert.deepEqual(seen.at(-1)!.tools, [], 'la última ronda va sin herramientas');
  });

  it('borrar la cuenta borra sus conversaciones', async () => {
    assert.equal((await call('DELETE', '/v1/me', ANA)).status, 204);
    const { rows } = await psqlDb(URL_DB).query<{ n: number }>(`SELECT count(*)::int AS n FROM conversation WHERE id = $1::uuid`, [conv]);
    assert.equal(Number(rows[0]!.n), 0);
  });
});

describe('adaptador de Claude para el chat (sin red)', () => {
  it('envía sistema, historial y herramientas; devuelve bloques y motivo de parada', async () => {
    let body: any = null;
    const fake = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 'x', name: 'ver_metas', input: {} }], stop_reason: 'tool_use' }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = anthropicChatModel({ apiKey: 'k', model: 'modelo-prueba', fetchImpl: fake });
    const r = await m.complete({ system: systemPrompt(TODAY), messages: [{ role: 'user', content: 'hola' }], tools: [], maxTokens: 100 });
    assert.equal(r.stopReason, 'tool_use');
    assert.equal(body.model, 'modelo-prueba');
    assert.equal(body.max_tokens, 100);
    assert.ok(body.system.includes('2026-10-14'));
    await assert.rejects(
      anthropicChatModel({ apiKey: 'k', fetchImpl: (async () => new Response('x', { status: 401 })) as unknown as typeof fetch }).complete({ system: '', messages: [], tools: [], maxTokens: 1 }),
      /401/,
    );
  });
});
