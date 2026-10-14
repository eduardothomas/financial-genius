/**
 * Prueba de punta a punta: la BD alimenta al motor y el resultado es idéntico
 * al de los datos de prueba del motor. Requiere DATABASE_URL con migración + semilla.
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { assessReadiness, rankProducts, type Product } from '@fg/engine';
import * as f from '../../engine/test/fixtures';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');
const q = (sql: string) => execFileSync('psql', [url, '-At', '-c', sql], { encoding: 'utf8' }).trim();

const dbProducts: Product[] = JSON.parse(q('select engine_products()'));
const version = q('select version from catalog_state');
const byId = (ps: Product[]) => [...ps].sort((a, b) => a.id.localeCompare(b.id));
assert.deepEqual(byId(dbProducts), byId(f.products), 'engine_products() no coincide con los fixtures');

let n = 0;
for (const s of [f.joven, f.familia, f.endeudado]) {
  for (const g of [f.metaTarjeta, f.metaAuto, f.metaCasa]) {
    const a = rankProducts(g, s, { version, products: f.products });
    const b = rankProducts(g, s, { version, products: dbProducts });
    assert.deepEqual(b, a);
    assert.deepEqual(assessReadiness(g, s, dbProducts), assessReadiness(g, s, f.products));
    n++;
  }
}
console.log(`ok - BD → motor idéntico en ${n} combinaciones (catálogo ${version})`);
