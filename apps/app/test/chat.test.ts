import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, type GoalView } from '../src/lib/api';
import { attachmentCard, suggestions } from '../src/lib/chat';

const goal = (type: GoalView['type'], priority: number): GoalView => ({
  id: `g-${type}`, type, priority, preferences: [], status: 'active', createdAt: '', readinessScore: null,
});

describe('chat: sugerencias', () => {
  it('sin metas propone empezar por una', () => {
    assert.deepEqual(suggestions([], false), ['Quiero mi primera tarjeta de crédito', 'Quiero comprar un carro', 'Quiero comprar una casa']);
  });
  it('con metas pregunta por la de mayor prioridad', () => {
    const s = suggestions([goal('auto_loan', 2), goal('mortgage', 1)], true);
    assert.equal(s[0], '¿Estoy listo para comprar casa?');
    assert.equal(s[2], '¿Cuáles son mis mejores opciones de comprar casa?');
    assert.equal(suggestions([goal('credit_card', 1)], false)[2], '¿Qué datos necesitas de mí?');
  });
});

describe('chat: tarjetas', () => {
  it('ranking lleva a Productos con la #1 y su cuota', () => {
    const c = attachmentCard({
      type: 'ranking', goalId: 'g1', readyToCompare: true,
      top: [{ position: 1, productId: 'a', name: 'Alfa Auto Nuevo', institutionName: 'Banco Alfa', estimatedMonthlyPayment: 389.03 }, { position: 2, productId: 'b', name: 'B', institutionName: 'Banco Beta', estimatedMonthlyPayment: 373 }],
    });
    assert.deepEqual(c, { title: '#1 Alfa Auto Nuevo', detail: 'Banco Alfa · B/. 389 al mes aprox. · ver las 2', href: '/productos', goalId: 'g1' });
  });
  it('preparación, plan y meta nueva', () => {
    assert.equal(attachmentCard({ type: 'readiness', goalId: 'g', goalType: 'mortgage', score: 65.1, ready: false }).title, 'Comprar casa: 65 de 100');
    assert.equal(attachmentCard({ type: 'plan', goalId: 'g', objective: 'Ahorrar para el abono', done: 1, total: 5 }).detail, 'Plan del mes: 1 de 5 misiones hechas');
    const g = attachmentCard({ type: 'goal', goalId: 'g9', goalType: 'mortgage', priority: 2, targetAmount: 150000 });
    assert.deepEqual([g.title, g.detail, g.href], ['Nueva meta: Comprar casa', 'Prioridad 2 · B/. 150,000', '/meta/g9']);
  });
});

describe('chat: cliente de la API', () => {
  it('envía el mensaje con la conversación y lee las conversaciones', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body as string | undefined });
      if (url.endsWith('/v1/chat')) return new Response(JSON.stringify({ conversationId: 'c1', messageId: 'm1', reply: 'hola', attachments: [] }));
      if (url.endsWith('/v1/chat/conversations')) return new Response(JSON.stringify({ conversations: [{ id: 'c1' }] }));
      return new Response(JSON.stringify({ id: 'c1', messages: [{ id: 'm1', role: 'assistant', content: 'hola', attachments: [], createdAt: '' }] }));
    }) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://api.test/', auth: () => ({}), fetchImpl: fake });
    assert.equal((await api.chat('hola', 'c1')).reply, 'hola');
    assert.deepEqual(JSON.parse(calls[0]!.body!), { message: 'hola', conversationId: 'c1' });
    await api.chat('nueva');
    assert.deepEqual(JSON.parse(calls[1]!.body!), { message: 'nueva' });
    assert.equal((await api.conversations())[0]!.id, 'c1');
    assert.equal((await api.conversation('c1'))[0]!.content, 'hola');
  });
});
