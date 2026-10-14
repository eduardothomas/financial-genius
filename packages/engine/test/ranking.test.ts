import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, rankProducts, type Catalog } from '../src';
import { catalog, endeudado, familia, joven, metaAuto, metaCasa, metaTarjeta } from './fixtures';

describe('rankProducts', () => {
  it('devuelve como máximo 3 productos del tipo de la meta', () => {
    for (const g of [metaTarjeta, metaAuto, metaCasa]) {
      const r = rankProducts(g, familia, catalog);
      assert.ok(r.top.length <= defaultConfig.topN);
      const ids = new Set(catalog.products.filter((p) => p.type === g.type).map((p) => p.id));
      for (const t of r.top) assert.ok(ids.has(t.productId));
      assert.deepEqual(r.top.map((t) => t.position), r.top.map((_, i) => i + 1));
    }
  });

  it('excluye productos cuyos requisitos públicos no se cumplen', () => {
    const r = rankProducts(metaTarjeta, joven, catalog);
    const beta = r.excluded.find((e) => e.productId === 'beta-millas');
    assert.ok(beta, 'beta-millas debe quedar fuera');
    assert.ok(beta.failed.includes('min_income'));
    assert.ok(!r.top.some((t) => t.productId === 'beta-millas'));
  });

  it('respeta preferencias: cashback sube a tarjetas con cashback', () => {
    const r = rankProducts(metaTarjeta, joven, catalog);
    assert.ok(['alfa-clasica', 'gamma-cash'].includes(r.top[0]!.productId), r.top[0]!.productId);
    assert.ok(r.top[0]!.reasons.some((x) => x.code === 'matches_preferences'));
  });

  it('préstamos incluyen cuota estimada y supuestos', () => {
    const r = rankProducts(metaAuto, familia, catalog);
    assert.ok(r.top.length > 0);
    for (const t of r.top) {
      assert.ok(t.estimatedMonthlyPayment !== null && t.estimatedMonthlyPayment > 0);
      assert.ok(t.assumptions.length >= 2);
      assert.ok(t.source.url && t.source.capturedAt);
      assert.ok(t.reasons.length <= 4);
    }
  });

  it('es determinista y registra auditoría', () => {
    const a = rankProducts(metaCasa, familia, catalog);
    const b = rankProducts(metaCasa, familia, catalog);
    assert.deepEqual(a, b);
    assert.equal(a.audit.catalogVersion, catalog.version);
    assert.equal(a.audit.weightsVersion, defaultConfig.version);
    assert.match(a.audit.inputHash, /^[0-9a-f]{8}$/);
  });

  it('el orden del catálogo no cambia el resultado', () => {
    const reversed: Catalog = { ...catalog, products: [...catalog.products].reverse() };
    assert.deepEqual(rankProducts(metaAuto, familia, catalog).top, rankProducts(metaAuto, familia, reversed).top);
  });

  it('el endeudado no recibe productos que no puede pagar como "cuota cómoda"', () => {
    const r = rankProducts(metaAuto, endeudado, catalog);
    for (const t of r.top) assert.ok(!t.reasons.some((x) => x.code === 'affordable_payment'));
  });

  it('cada préstamo usa el abono que exige su propio banco', () => {
    const r = rankProducts(metaAuto, familia, catalog);
    const beta = r.top.find((t) => t.productId === 'beta-auto');
    const alfa = r.top.find((t) => t.productId === 'alfa-auto');
    assert.ok(beta && alfa);
    assert.ok(beta.assumptions.some((a) => a.includes('abono de 15%')), beta.assumptions.join(' | '));
    assert.ok(alfa.assumptions.some((a) => a.includes('abono de 10%')), alfa.assumptions.join(' | '));
  });

  /**
   * REGLA DE ORO — no borrar este test.
   * Ningún dato comercial (patrocinio, comisión) puede alterar el ranking.
   */
  it('REGLA DE ORO: los datos comerciales no alteran el ranking', () => {
    const conComision: Catalog = {
      ...catalog,
      products: catalog.products.map((p, i) => ({
        ...p,
        commercial: { sponsored: i % 2 === 0, commissionPct: (i * 7) % 13 },
      })),
    };
    const invertido: Catalog = {
      ...catalog,
      products: catalog.products.map((p, i) => ({
        ...p,
        commercial: { sponsored: i % 2 === 1, commissionPct: 100 - ((i * 7) % 13) },
      })),
    };
    for (const g of [metaTarjeta, metaAuto, metaCasa]) {
      for (const s of [joven, familia, endeudado]) {
        const base = rankProducts(g, s, catalog);
        assert.deepEqual(rankProducts(g, s, conComision), base);
        assert.deepEqual(rankProducts(g, s, invertido), base);
      }
    }
  });
});
