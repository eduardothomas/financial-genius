import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessReadiness, defaultConfig } from '../src';
import { endeudado, familia, joven, metaAuto, metaCasa, metaTarjeta, products } from './fixtures';

describe('assessReadiness', () => {
  it('es determinista', () => {
    const a = assessReadiness(metaAuto, familia, products);
    const b = assessReadiness(metaAuto, familia, products);
    assert.deepEqual(a, b);
  });

  it('el puntaje está entre 0 y 100 y usa la versión de pesos', () => {
    for (const s of [joven, familia, endeudado]) {
      for (const g of [metaTarjeta, metaAuto, metaCasa]) {
        const r = assessReadiness(g, s, products);
        assert.ok(r.score >= 0 && r.score <= 100, `${g.type}: ${r.score}`);
        assert.equal(r.weightsVersion, defaultConfig.version);
        assert.ok(r.obstacles.length <= defaultConfig.maxObstaclesShown);
      }
    }
  });

  it('la tarjeta no evalúa abono (peso 0)', () => {
    const r = assessReadiness(metaTarjeta, joven, products);
    assert.ok(!r.factors.some((f) => f.factor === 'down_payment'));
  });

  it('familia con buen historial está más preparada para auto que el endeudado', () => {
    const f = assessReadiness(metaAuto, familia, products);
    const e = assessReadiness(metaAuto, endeudado, products);
    assert.ok(f.score > e.score, `familia ${f.score} vs endeudado ${e.score}`);
  });

  it('el endeudado tiene utilización y DTI entre sus frenos', () => {
    const r = assessReadiness(metaAuto, endeudado, products);
    const ids = r.obstacles.map((o) => o.factor);
    assert.ok(ids.includes('utilization'), ids.join(','));
    assert.ok(ids.includes('dti'), ids.join(','));
    assert.equal(r.readyToCompare, false);
    for (const o of r.obstacles) assert.ok(o.suggestedActions.length > 0);
  });

  it('los frenos bloqueantes van primero y luego por impacto', () => {
    const r = assessReadiness(metaCasa, endeudado, products);
    for (let i = 1; i < r.obstacles.length; i++) {
      const prev = r.obstacles[i - 1]!;
      const cur = r.obstacles[i]!;
      assert.ok(
        Number(prev.blocking) > Number(cur.blocking) ||
          (prev.blocking === cur.blocking && prev.impactPoints >= cur.impactPoints),
      );
    }
  });

  it('ingreso bajo el mínimo de todo el mercado es bloqueante', () => {
    const pobre = { ...joven, netMonthlyIncome: 500 };
    const r = assessReadiness(metaCasa, pobre, products);
    const income = r.obstacles.find((o) => o.factor === 'income');
    assert.ok(income?.blocking);
    assert.equal(r.readyToCompare, false);
  });

  it('un producto sin ingreso mínimo (tarjeta asegurada) no anula el factor ingreso', () => {
    const r = assessReadiness(metaTarjeta, joven, products);
    const income = r.factors.find((f) => f.factor === 'income')!;
    assert.equal(income.evidence.marketMin, 600);
    assert.ok(income.score >= 0.7, String(income.score));
  });

  it('bajar la utilización sube el índice', () => {
    const antes = assessReadiness(metaTarjeta, endeudado, products).score;
    const mejor = {
      ...endeudado,
      debts: endeudado.debts.map((d) => (d.kind === 'credit_card' ? { ...d, balance: (d.limit ?? 0) * 0.2 } : d)),
    };
    const despues = assessReadiness(metaTarjeta, mejor, products).score;
    assert.ok(despues > antes, `${antes} → ${despues}`);
  });

  it('respeta la configuración inyectada (umbral de listo)', () => {
    const r = assessReadiness(metaTarjeta, familia, products, { ...defaultConfig, readyThreshold: 101 });
    assert.equal(r.readyToCompare, false);
  });
});
