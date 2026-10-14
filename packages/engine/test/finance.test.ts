import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  creditUtilization,
  debtToIncome,
  lowerIsBetter,
  monthlyPayment,
  paymentCapacity,
  stableHash,
  totalInterest,
} from '../src';
import { endeudado, familia, joven } from './fixtures';

const near = (a: number, b: number, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `esperado ≈${b}, obtenido ${a}`);

describe('monthlyPayment', () => {
  it('calcula la cuota francesa estándar', () => {
    // 20,000 al 7% anual a 60 meses → 396.02
    near(monthlyPayment(20000, 7, 60), 396.02);
    // 135,000 al 6% a 360 meses → 809.39
    near(monthlyPayment(135000, 6, 360), 809.39);
  });
  it('con tasa 0 divide el principal entre el plazo', () => {
    assert.equal(monthlyPayment(1200, 0, 12), 100);
  });
  it('principal 0 → cuota 0; plazo inválido lanza error', () => {
    assert.equal(monthlyPayment(0, 7, 60), 0);
    assert.throws(() => monthlyPayment(1000, 7, 0));
  });
  it('total de intereses = cuotas − principal', () => {
    near(totalInterest(20000, 7, 60), 396.02 * 60 - 20000, 1);
  });
});

describe('ratios', () => {
  it('DTI suma deudas actuales y nueva cuota', () => {
    near(debtToIncome(familia), 300 / 2600, 1e-9);
    near(debtToIncome(familia, 400), 700 / 2600, 1e-9);
    assert.equal(debtToIncome(joven), 0);
  });
  it('utilización solo considera tarjetas; null si no tiene', () => {
    near(creditUtilization(endeudado)!, 4100 / 4500, 1e-9);
    assert.equal(creditUtilization(joven), null);
  });
  it('capacidad de pago descuenta gastos, deudas y colchón', () => {
    near(paymentCapacity(familia, 0.1), 2600 - 1100 - 300 - 260, 1e-9);
  });
  it('lowerIsBetter interpola entre bueno y malo', () => {
    assert.equal(lowerIsBetter(0.2, 0.3, 0.5), 1);
    assert.equal(lowerIsBetter(0.6, 0.3, 0.5), 0);
    near(lowerIsBetter(0.4, 0.3, 0.5), 0.5, 1e-9);
  });
});

describe('stableHash', () => {
  it('no depende del orden de las claves', () => {
    assert.equal(stableHash({ a: 1, b: [1, 2] }), stableHash({ b: [1, 2], a: 1 }));
    assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
  });
});
