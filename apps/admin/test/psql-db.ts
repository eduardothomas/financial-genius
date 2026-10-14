/**
 * Adaptador `Db` SOLO PARA PRUEBAS: ejecuta consultas con el cliente psql.
 * En la app se usa `pg` (ver lib/db.ts). Los parámetros se incrustan como literales escapados.
 */
import { execFileSync } from 'node:child_process';
import type { Db } from '../lib/catalog-service';

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
