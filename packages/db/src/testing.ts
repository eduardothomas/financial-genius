/**
 * Adaptador `Db` SOLO PARA PRUEBAS: ejecuta consultas con el cliente psql.
 * En la app se usa `pg` (ver lib/db.ts). Los parámetros se incrustan como literales escapados.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './index.js';

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};

export function psqlDb(url: string): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const inlined = sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
      // Escrituras sin RETURNING no devuelven filas: se ejecutan tal cual.
      const noRows = /^\s*(insert|update|delete)\b/i.test(inlined) && !/\breturning\b/i.test(inlined);
      const wrapped = noRows ? inlined : `WITH t AS (${inlined}) SELECT coalesce(json_agg(t), '[]') FROM t`;
      const out = execFileSync('psql', [url, '-At', '-v', 'ON_ERROR_STOP=1', '-c', wrapped], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { rows: (noRows ? [] : JSON.parse(out.trim())) as T[] };
    },
  };
}

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Reinicia una BD DESECHABLE: borra todo, aplica migraciones y carga la semilla. */
export function resetDatabase(url: string): void {
  const psql = (...args: string[]) =>
    execFileSync('psql', [url, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'pipe' });
  psql('-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of readdirSync(join(PKG, 'migrations')).sort()) psql('-f', join(PKG, 'migrations', f));
  psql('-v', `catalog=${readFileSync(join(PKG, 'seed/catalog.sample.json'), 'utf8')}`, '-f', join(PKG, 'seed/seed.sql'));
}
