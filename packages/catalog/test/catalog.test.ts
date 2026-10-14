import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankProducts } from '@fg/engine';
import {
  anthropicExtractor,
  buildExtractionInput,
  detectChange,
  diffDrafts,
  htmlToText,
  isStale,
  proposalFromRaw,
  proposeFromSource,
  type DraftContext,
  type Extractor,
} from '../src';
import { familia, metaAuto } from '../../engine/test/fixtures';

// Página FICTICIA de un banco inventado.
const HTML = `<html><head><style>.x{}</style><script>track()</script></head><body>
<h1>Préstamo Auto Omega</h1>
<p>Tasa de inter&eacute;s desde <b>6.75%</b> hasta 8.95% anual.</p>
<ul><li>Ingreso mínimo: B/. 1,000 mensuales</li><li>Antigüedad laboral de 1 año</li>
<li>Plazo hasta 84 meses</li><li>Abono mínimo del 10%</li><li>Comisión de cierre: B/. 250</li></ul>
<p>Para panameños y residentes asalariados.</p></body></html>`;
const TEXT = htmlToText(HTML);

const ctx: DraftContext = {
  id: 'omega-auto',
  institutionId: 'omega',
  institutionName: 'Banco Omega',
  sourceUrl: 'https://omega.test/auto',
  capturedAt: '2026-10-14',
};

const goodExtraction = {
  product: {
    name: 'Préstamo Auto Omega',
    type: 'auto_loan',
    rate: { min: 6.75, max: 8.95 },
    annualFee: null,
    oneTimeFees: 250,
    requirements: {
      minIncome: 1000, minEmploymentMonths: 12, minAge: null, maxAge: null,
      residency: ['national', 'resident'], employmentTypes: ['salaried'],
    },
    conditions: { minTermMonths: null, maxTermMonths: 84, minAmount: null, maxAmount: null, minDownPaymentPct: 10 },
    benefits: [],
  },
  citations: {
    'rate.min': 'desde 6.75% hasta 8.95% anual',
    'rate.max': 'desde 6.75% hasta 8.95% anual',
    'requirements.minIncome': 'Ingreso mínimo: B/. 1,000 mensuales',
    'requirements.minEmploymentMonths': 'Antigüedad laboral de 1 año',
    'conditions.maxTermMonths': 'Plazo hasta 84 meses',
    'conditions.minDownPaymentPct': 'Abono mínimo del 10%',
    oneTimeFees: 'Comisión de cierre: B/. 250',
  },
};

describe('texto y cambios', () => {
  it('htmlToText quita scripts, estilos, etiquetas y entidades', () => {
    assert.ok(!TEXT.includes('track()'));
    assert.ok(!TEXT.includes('<'));
    assert.ok(TEXT.includes('Tasa de interés desde 6.75% hasta 8.95% anual'));
  });
  it('detectChange ignora espacios y mayúsculas, detecta cambios reales', () => {
    const a = detectChange(null, 'Tasa desde 6.75%');
    assert.equal(a.changed, true);
    assert.equal(detectChange(a.hash, '  tasa   DESDE 6.75% ').changed, false);
    assert.equal(detectChange(a.hash, 'Tasa desde 6.50%').changed, true);
  });
  it('isStale a los 60 días', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    assert.equal(isStale('2026-08-01T00:00:00Z', now), true);
    assert.equal(isStale('2026-09-01T00:00:00Z', now), false);
  });
});

describe('propuesta desde la fuente', () => {
  it('extracción correcta → borrador aprobable con advertencias de campos no publicados', () => {
    const p = proposalFromRaw(goodExtraction, TEXT, ctx, null);
    assert.equal(p.approvable, true, JSON.stringify(p.issues));
    assert.equal(p.proposed?.rate.min, 6.75);
    assert.equal(p.proposed?.requirements.minAge, 18);
    assert.equal(p.risk, 'high', 'producto nuevo siempre es alto riesgo');
    assert.ok(!p.issues.some((i) => i.severity === 'error'));
    // En tarjetas, una anualidad no publicada se advierte al revisor
    const tarjeta = structuredClone(goodExtraction);
    tarjeta.product.type = 'credit_card';
    const pt = proposalFromRaw(tarjeta, TEXT, ctx, null);
    assert.ok(pt.issues.some((i) => i.severity === 'warning' && i.field === 'annualFee'));
  });

  it('ANTI-ALUCINACIÓN: una cita que no está en la fuente bloquea la aprobación', () => {
    const fake = structuredClone(goodExtraction);
    fake.product.rate.min = 4.5;
    fake.citations['rate.min'] = 'Tasa preferencial de 4.5% para clientes';
    const p = proposalFromRaw(fake, TEXT, ctx, null);
    assert.equal(p.approvable, false);
    assert.ok(p.issues.some((i) => i.field === 'rate.min' && i.severity === 'error'));
  });

  it('un valor clave sin cita genera advertencia', () => {
    const sinCita = structuredClone(goodExtraction);
    delete (sinCita.citations as Record<string, string>)['requirements.minIncome'];
    const p = proposalFromRaw(sinCita, TEXT, ctx, null);
    assert.ok(p.issues.some((i) => i.field === 'requirements.minIncome' && i.severity === 'warning'));
  });

  it('tasa fuera de rango es error; respuesta con forma inválida es error', () => {
    const alta = structuredClone(goodExtraction);
    alta.product.rate = { min: 6.75, max: 95 };
    assert.equal(proposalFromRaw(alta, TEXT, ctx, null).approvable, false);
    const rota = proposalFromRaw({ product: { name: 'x' } }, TEXT, ctx, null);
    assert.equal(rota.approvable, false);
    assert.equal(rota.proposed, null);
  });

  it('sin tasa publicada no hay borrador', () => {
    const sinTasa = structuredClone(goodExtraction);
    sinTasa.product.rate = { min: null as unknown as number, max: null as unknown as number };
    const p = proposalFromRaw(sinTasa, TEXT, ctx, null);
    assert.equal(p.proposed, null);
    assert.equal(p.approvable, false);
  });

  it('el borrador funciona directo en el motor', () => {
    const p = proposalFromRaw(goodExtraction, TEXT, ctx, null);
    const r = rankProducts(metaAuto, familia, { version: 't', products: [p.proposed!] });
    assert.equal(r.top[0]?.productId, 'omega-auto');
  });
});

describe('comparación con la versión vigente', () => {
  const base = proposalFromRaw(goodExtraction, TEXT, ctx, null).proposed!;

  it('sin cambios → diff vacío y riesgo bajo', () => {
    assert.deepEqual(diffDrafts(base, structuredClone(base)), []);
  });
  it('cambio de beneficios → riesgo bajo', () => {
    const next = { ...structuredClone(base), benefits: ['insurance_included'] };
    const p = proposalFromRaw({ ...goodExtraction, product: { ...goodExtraction.product, benefits: ['insurance_included'] } }, TEXT, ctx, base);
    assert.equal(diffDrafts(base, next).every((d) => d.risk === 'low'), true);
    assert.equal(p.risk, 'low');
  });
  it('cambio de tasa → riesgo alto, con antes y después', () => {
    const next = structuredClone(base);
    next.rate.min = 6.5;
    const d = diffDrafts(base, next);
    assert.deepEqual(d, [{ field: 'rate.min', before: 6.75, after: 6.5, risk: 'high' }]);
  });
  it('cambiar el tipo de producto es error', () => {
    const tarjeta = structuredClone(goodExtraction);
    tarjeta.product.type = 'credit_card';
    assert.equal(proposalFromRaw(tarjeta, TEXT, ctx, base).approvable, false);
  });
});

describe('extractor de Claude (sin red)', () => {
  it('envía tool use forzado y devuelve el input de la herramienta', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({ content: [{ type: 'tool_use', name: 'record_product', input: goodExtraction }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const ex = anthropicExtractor({ apiKey: 'k', model: 'modelo-prueba', fetchImpl: fakeFetch });
    const p = await proposeFromSource({ extractor: ex, sourceText: TEXT, context: ctx, current: null });
    assert.equal(p.approvable, true);
    assert.ok(sent);
    const s = sent as { url: string; init: RequestInit };
    assert.equal(s.url, 'https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(s.init.body));
    assert.equal(body.model, 'modelo-prueba');
    assert.deepEqual(body.tool_choice, { type: 'tool', name: 'record_product' });
    assert.ok(body.messages[0].content.includes('<fuente>'));
    assert.equal((s.init.headers as Record<string, string>)['x-api-key'], 'k');
  });

  it('errores de la API se propagan con el código', async () => {
    const fail = (async () => new Response('sobrecargado', { status: 529 })) as unknown as typeof fetch;
    await assert.rejects(anthropicExtractor({ apiKey: 'k', fetchImpl: fail }).extract(buildExtractionInput(TEXT, { institutionName: 'Omega' })), /529/);
  });

  it('un extractor que alucina no pasa la validación', async () => {
    const liar: Extractor = {
      async extract() {
        const x = structuredClone(goodExtraction);
        x.product.requirements.minIncome = 500;
        x.citations['requirements.minIncome'] = 'Ingreso mínimo: B/. 500';
        return x;
      },
    };
    const p = await proposeFromSource({ extractor: liar, sourceText: TEXT, context: ctx, current: null });
    assert.equal(p.approvable, false);
  });
});
