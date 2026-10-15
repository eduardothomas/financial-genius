/**
 * Autenticación de la API.
 *
 * Producción: access tokens de Supabase Auth.
 *  - Claves asimétricas (ES256 o RS256) publicadas en `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 *  - HS256 con el JWT secret heredado, solo si se configura (no recomendado).
 * Se exige: firma válida, `exp`/`nbf`, `iss` del proyecto, `aud` "authenticated", rol "authenticated",
 * `sub` y `email`. La anon key (rol "anon") nunca autentica a un usuario.
 *
 * Desarrollo: encabezado x-dev-user (solo con FG_DEV_USERS=1; main.ts lo prohíbe en producción).
 */
import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify, type JsonWebKey, type KeyObject } from 'node:crypto';
import { unauthorized } from './errors.js';

export interface Identity {
  subject: string;
  email: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}
interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  role?: string;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function decode(token: string): { header: JwtHeader; payload: JwtPayload; signed: string; sig: Buffer } {
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized('Token mal formado');
  const [h, p, s] = parts as [string, string, string];
  try {
    return {
      header: JSON.parse(b64url(h).toString('utf8')),
      payload: JSON.parse(b64url(p).toString('utf8')),
      signed: `${h}.${p}`,
      sig: b64url(s),
    };
  } catch {
    throw unauthorized('Token mal formado');
  }
}

// ---------------- JWKS ----------------

export interface JwksProvider {
  /** Clave pública por `kid`; null si no existe ni después de refrescar. */
  key(kid: string): Promise<{ key: KeyObject; alg: string } | null>;
}

/**
 * JWKS remoto con caché (10 min, como el borde de Supabase). Si llega un `kid` desconocido
 * refresca una vez (rotación de claves), con un mínimo de 30 s entre refrescos forzados.
 */
export function remoteJwks(url: string, opts: { fetchImpl?: typeof fetch; ttlMs?: number; now?: () => number } = {}): JwksProvider {
  const f = opts.fetchImpl ?? fetch;
  const ttl = opts.ttlMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  let keys = new Map<string, { key: KeyObject; alg: string }>();
  let fetchedAt = -Infinity;

  async function refresh() {
    const res = await f(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw unauthorized(`No se pudieron leer las claves de autenticación (${res.status})`);
    const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };
    const next = new Map<string, { key: KeyObject; alg: string }>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || (jwk.use && jwk.use !== 'sig')) continue;
      const alg = jwk.alg ?? (jwk.kty === 'EC' ? 'ES256' : jwk.kty === 'RSA' ? 'RS256' : '');
      if (alg !== 'ES256' && alg !== 'RS256') continue;
      next.set(jwk.kid, { key: createPublicKey({ key: jwk, format: 'jwk' }), alg });
    }
    keys = next;
    fetchedAt = now();
  }

  return {
    async key(kid) {
      if (now() - fetchedAt > ttl) await refresh();
      if (!keys.has(kid) && now() - fetchedAt > 30_000) await refresh();
      return keys.get(kid) ?? null;
    },
  };
}

// ---------------- Verificación ----------------

export interface VerifyOptions {
  jwks?: JwksProvider;
  /** JWT secret heredado (HS256). Si no se configura, HS256 se rechaza. */
  hs256Secret?: string;
  /** Emisor esperado, ej. https://<proyecto>.supabase.co/auth/v1 */
  issuer?: string;
  audience?: string;
  nowSec?: number;
}

export async function verifyJwt(token: string, opts: VerifyOptions): Promise<Identity> {
  const { header, payload, signed, sig } = decode(token);
  const alg = header.alg;

  if (alg === 'HS256') {
    if (!opts.hs256Secret) throw unauthorized('Algoritmo de token no permitido');
    const expected = createHmac('sha256', opts.hs256Secret).update(signed).digest();
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) throw unauthorized('Firma inválida');
  } else if (alg === 'ES256' || alg === 'RS256') {
    if (!opts.jwks || !header.kid) throw unauthorized('Token sin clave conocida');
    const k = await opts.jwks.key(header.kid);
    if (!k || k.alg !== alg) throw unauthorized('Token sin clave conocida');
    const ok =
      alg === 'ES256'
        ? cryptoVerify('sha256', Buffer.from(signed), { key: k.key, dsaEncoding: 'ieee-p1363' }, sig)
        : cryptoVerify('sha256', Buffer.from(signed), k.key, sig);
    if (!ok) throw unauthorized('Firma inválida');
  } else {
    throw unauthorized('Algoritmo de token no permitido');
  }

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw unauthorized('Token vencido');
  if (typeof payload.nbf === 'number' && payload.nbf > now) throw unauthorized('Token aún no válido');
  if (opts.issuer && payload.iss !== opts.issuer) throw unauthorized('Emisor de token no válido');
  const aud = opts.audience ?? 'authenticated';
  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!auds.includes(aud)) throw unauthorized('Audiencia de token no válida');
  if (payload.role !== undefined && payload.role !== 'authenticated') throw unauthorized('El token no es de un usuario');
  if (!payload.sub || !payload.email) throw unauthorized('Token sin sub o email');
  return { subject: payload.sub, email: payload.email.toLowerCase() };
}

/** Compatibilidad: verificación HS256 síncrona (pruebas y proyectos con secreto heredado). */
export function signHs256(claims: Record<string, unknown>, secret: string): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc(claims);
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

// ---------------- Opciones de la API ----------------

export interface AuthOptions {
  /** Verificación de tokens de Supabase (JWKS y/o secreto heredado, emisor). */
  jwt?: Omit<VerifyOptions, 'nowSec'>;
  /** Desarrollo local: acepta el encabezado x-dev-user: <email>. Nunca en producción. */
  devUsers?: boolean;
}

/** Opciones a partir de SUPABASE_URL (y AUTH_JWT_SECRET si el proyecto aún usa el secreto heredado). */
export function supabaseAuth(supabaseUrl: string | undefined, legacySecret?: string, fetchImpl?: typeof fetch): AuthOptions['jwt'] {
  if (!supabaseUrl && !legacySecret) return undefined;
  const base = supabaseUrl?.replace(/\/+$/, '');
  return {
    jwks: base ? remoteJwks(`${base}/auth/v1/.well-known/jwks.json`, { fetchImpl }) : undefined,
    hs256Secret: legacySecret || undefined,
    issuer: base ? `${base}/auth/v1` : undefined,
    audience: 'authenticated',
  };
}

export async function identify(headers: Record<string, string | string[] | undefined>, opts: AuthOptions): Promise<Identity> {
  const auth = headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    if (!opts.jwt) throw unauthorized('Autenticación por token no configurada');
    return verifyJwt(auth.slice(7), opts.jwt);
  }
  const dev = headers['x-dev-user'];
  if (opts.devUsers && typeof dev === 'string' && /^[^@\s]+@[^@\s]+$/.test(dev)) {
    return { subject: `dev:${dev.toLowerCase()}`, email: dev.toLowerCase() };
  }
  throw unauthorized();
}
