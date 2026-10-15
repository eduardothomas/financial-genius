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

/** CSV simple de psql --csv (comillas dobles, sin saltos de línea dentro de campos). */
function parseCsv(out: string): Record<string, string | null>[] {
  const lines = out.split('\n').filter((l) => l.length > 0);
  const split = (line: string) => {
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const [head, ...rows] = lines;
  if (!head) return [];
  const keys = split(head);
  return rows.map((r) => Object.fromEntries(split(r).map((v, i) => [keys[i]!, v === '' ? null : v])));
}

export function psqlDb(url: string): Db {
  const run = (args: string[]) =>
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const inlined = sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
      const writes = /\b(insert|update|delete)\b/i.test(inlined);
      // Escrituras sin RETURNING no devuelven filas: se ejecutan tal cual.
      if (/^\s*(insert|update|delete)\b/i.test(inlined) && !/\breturning\b/i.test(inlined)) {
        run(['-q', '-c', inlined]);
        return { rows: [] as T[] };
      }
      // Un WITH con escrituras no puede anidarse: se ejecuta tal cual y se lee en CSV (valores como texto).
      if (/^\s*with\b/i.test(inlined) && writes) {
        return { rows: parseCsv(run(['-q', '--csv', '-c', inlined])) as T[] };
      }
      const out = run(['-At', '-c', `WITH t AS (${inlined}) SELECT coalesce(json_agg(t), '[]') FROM t`]);
      return { rows: JSON.parse(out.trim()) as T[] };
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
