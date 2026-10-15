import { createHmac, timingSafeEqual } from 'node:crypto';
import { unauthorized } from './errors.js';

export interface Identity {
  subject: string;
  email: string;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Verifica un JWT HS256 (por ejemplo, el access token de Supabase Auth con su JWT secret).
 * Rechaza otros algoritmos, firmas inválidas y tokens vencidos.
 */
export function verifyHs256(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): Identity {
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized('Token mal formado');
  const [h, p, sig] = parts as [string, string, string];
  let header: { alg?: string };
  let payload: { sub?: string; email?: string; exp?: number; nbf?: number };
  try {
    header = JSON.parse(b64url(h).toString('utf8'));
    payload = JSON.parse(b64url(p).toString('utf8'));
  } catch {
    throw unauthorized('Token mal formado');
  }
  if (header.alg !== 'HS256') throw unauthorized('Algoritmo de token no permitido');
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = b64url(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized('Firma inválida');
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) throw unauthorized('Token vencido');
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec) throw unauthorized('Token aún no válido');
  if (!payload.sub || !payload.email) throw unauthorized('Token sin sub o email');
  return { subject: payload.sub, email: payload.email };
}

/** Solo para pruebas y desarrollo local: firma un JWT HS256. */
export function signHs256(claims: Record<string, unknown>, secret: string): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc(claims);
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

export interface AuthOptions {
  jwtSecret?: string;
  /** Desarrollo local: acepta el encabezado x-dev-user: <email>. Nunca en producción. */
  devUsers?: boolean;
}

export function identify(headers: Record<string, string | string[] | undefined>, opts: AuthOptions): Identity {
  const auth = headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    if (!opts.jwtSecret) throw unauthorized('Autenticación por token no configurada');
    return verifyHs256(auth.slice(7), opts.jwtSecret);
  }
  const dev = headers['x-dev-user'];
  if (opts.devUsers && typeof dev === 'string' && /^[^@\s]+@[^@\s]+$/.test(dev)) {
    return { subject: `dev:${dev.toLowerCase()}`, email: dev.toLowerCase() };
  }
  throw unauthorized();
}
