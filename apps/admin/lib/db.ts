import { Pool } from 'pg';
import type { Db } from './catalog-service';

const globalForPg = globalThis as unknown as { fgPool?: Pool };

/** Pool único (sobrevive al hot reload de Next en desarrollo). */
export const pool: Pool =
  globalForPg.fgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
if (process.env.NODE_ENV !== 'production') globalForPg.fgPool = pool;

export const db: Db = {
  query: (sql, params) => pool.query(sql, params as unknown[]) as never,
};
