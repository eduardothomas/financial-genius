/**
 * Punto de entrada del servidor. Variables de entorno:
 *   DATABASE_URL        conexión a PostgreSQL
 *   AUTH_JWT_SECRET     secreto HS256 del proveedor de auth (ej. Supabase)
 *   FG_DEV_USERS=1      acepta x-dev-user en desarrollo (prohibido en producción)
 *   CORS_ORIGINS        orígenes permitidos separados por coma
 *   PORT                por defecto 3000
 */
import { createServer } from 'node:http';
import pg from 'pg';
import type { Db } from '@fg/db';
import { createApp } from './app.js';

const prod = process.env.NODE_ENV === 'production';
const devUsers = process.env.FG_DEV_USERS === '1';
if (prod && devUsers) throw new Error('FG_DEV_USERS no se permite en producción');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db: Db = { query: (sql, params) => pool.query(sql, params as unknown[]) as never };

const handle = createApp({
  db,
  auth: { jwtSecret: process.env.AUTH_JWT_SECRET, devUsers },
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});

const port = Number(process.env.PORT ?? 3000);
createServer((req, res) => void handle(req, res)).listen(port, () => {
  console.log(`[api] escuchando en http://localhost:${port}${devUsers ? ' (usuarios de desarrollo activos)' : ''}`);
});
