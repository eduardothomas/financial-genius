/**
 * Verificación de tokens de Supabase Auth con claves reales (ES256 y RS256) y JWKS simulado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { identify, remoteJwks, signHs256, supabaseAuth, verifyJwt } from '../src/auth.js';

const SB = 'https://proyecto.supabase.co';
const ISS = `${SB}/auth/v1`;
const NOW = 1_800_000_000;

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ecOtro = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signAsym(alg: 'ES256' | 'RS256', kid: string, key: KeyObject, claims: Record<string, unknown>): string {
  const h = enc({ alg, kid, typ: 'JWT' });
  const p = enc(claims);
  const sig =
    alg === 'ES256'
      ? cryptoSign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' })
      : cryptoSign('sha256', Buffer.from(`${h}.${p}`), key);
  return `${h}.${p}.${sig.toString('base64url')}`;
}

const user = { sub: 'uuid-ana', email: 'Ana@Ejemplo.test', aud: 'authenticated', role: 'authenticated', iss: ISS, exp: NOW + 3600 };

function jwksFetch(keys: Array<{ kid: string; pub: KeyObject; alg: string }>, counter = { n: 0 }) {
  return (async () => {
    counter.n++;
    return new Response(JSON.stringify({ keys: keys.map((k) => ({ ...k.pub.export({ format: 'jwk' }), kid: k.kid, alg: k.alg, use: 'sig' })) }), { status: 200 });
  }) as unknown as typeof fetch;
}

const keys = [
  { kid: 'ec-1', pub: ec.publicKey, alg: 'ES256' },
  { kid: 'rsa-1', pub: rsa.publicKey, alg: 'RS256' },
];
const opts = () => ({ jwks: remoteJwks(`${ISS}/.well-known/jwks.json`, { fetchImpl: jwksFetch(keys) }), issuer: ISS, nowSec: NOW });

describe('tokens de Supabase', () => {
  it('ES256 y RS256 válidos → identidad con email en minúsculas', async () => {
    assert.deepEqual(await verifyJwt(signAsym('ES256', 'ec-1', ec.privateKey, user), opts()), { subject: 'uuid-ana', email: 'ana@ejemplo.test' });
    assert.equal((await verifyJwt(signAsym('RS256', 'rsa-1', rsa.privateKey, user), opts())).subject, 'uuid-ana');
  });

  it('rechaza firma de otra clave, kid desconocido o alg que no coincide con la clave', async () => {
    await assert.rejects(verifyJwt(signAsym('ES256', 'ec-1', ecOtro.privateKey, user), opts()), /Firma inválida/);
    await assert.rejects(verifyJwt(signAsym('ES256', 'nadie', ec.privateKey, user), opts()), /clave conocida/);
    await assert.rejects(verifyJwt(signAsym('RS256', 'ec-1', rsa.privateKey, user), opts()), /clave conocida/);
  });

  it('rechaza vencido, aún no válido, otro emisor, otra audiencia y la anon key', async () => {
    const t = (c: Record<string, unknown>) => verifyJwt(signAsym('ES256', 'ec-1', ec.privateKey, { ...user, ...c }), opts());
    await assert.rejects(t({ exp: NOW - 1 }), /vencido/);
    await assert.rejects(t({ nbf: NOW + 60 }), /aún no válido/);
    await assert.rejects(t({ iss: 'https://otro.supabase.co/auth/v1' }), /Emisor/);
    await assert.rejects(t({ aud: 'otra' }), /Audiencia/);
    await assert.rejects(t({ role: 'anon', sub: undefined, email: undefined }), /no es de un usuario/);
    await assert.rejects(t({ email: undefined }), /sin sub o email/);
  });

  it('rechaza alg none y HS256 cuando no hay secreto heredado (confusión de algoritmos)', async () => {
    const none = `${enc({ alg: 'none' })}.${enc(user)}.`;
    await assert.rejects(verifyJwt(none, opts()), /no permitido/);
    // HS256 firmado con la clave pública como "secreto": ataque clásico
    const pubPem = ec.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const h = enc({ alg: 'HS256', kid: 'ec-1' });
    const p = enc(user);
    const forged = `${h}.${p}.${createHmac('sha256', pubPem).update(`${h}.${p}`).digest('base64url')}`;
    await assert.rejects(verifyJwt(forged, opts()), /no permitido/);
  });

  it('HS256 heredado funciona solo si se configura el secreto', async () => {
    const tok = signHs256({ ...user }, 'secreto-heredado');
    assert.equal((await verifyJwt(tok, { ...opts(), hs256Secret: 'secreto-heredado' })).subject, 'uuid-ana');
    await assert.rejects(verifyJwt(tok, { ...opts(), hs256Secret: 'otro' }), /Firma inválida/);
  });

  it('JWKS en caché; ante un kid nuevo (rotación) refresca una vez', async () => {
    let t = 0;
    const counter = { n: 0 };
    const current = [...keys];
    const jwks = remoteJwks('x', { fetchImpl: jwksFetch(current, counter), now: () => t });
    const o = { jwks, issuer: ISS, nowSec: NOW };
    await verifyJwt(signAsym('ES256', 'ec-1', ec.privateKey, user), o);
    await verifyJwt(signAsym('ES256', 'ec-1', ec.privateKey, user), o);
    assert.equal(counter.n, 1, 'segunda verificación usa la caché');
    current.push({ kid: 'ec-2', pub: ecOtro.publicKey, alg: 'ES256' });
    t = 31_000;
    assert.equal((await verifyJwt(signAsym('ES256', 'ec-2', ecOtro.privateKey, user), o)).subject, 'uuid-ana');
    assert.equal(counter.n, 2, 'refrescó por el kid nuevo');
  });
});

describe('identify', () => {
  it('Bearer usa la verificación; x-dev-user solo con usuarios de desarrollo', async () => {
    const jwt = supabaseAuth(SB, undefined, jwksFetch(keys))!;
    const tok = signAsym('ES256', 'ec-1', ec.privateKey, { ...user, exp: Math.floor(Date.now() / 1000) + 600 });
    assert.equal((await identify({ authorization: `Bearer ${tok}` }, { jwt })).email, 'ana@ejemplo.test');
    await assert.rejects(identify({ 'x-dev-user': 'a@b.c' }, { jwt }), /Autenticación requerida/);
    assert.equal((await identify({ 'x-dev-user': 'A@B.c' }, { devUsers: true })).subject, 'dev:a@b.c');
    await assert.rejects(identify({ authorization: `Bearer ${tok}` }, { devUsers: true }), /no configurada/);
  });
  it('supabaseAuth arma JWKS y emisor a partir de la URL del proyecto', () => {
    const o = supabaseAuth(`${SB}/`, undefined)!;
    assert.equal(o.issuer, ISS);
    assert.equal(o.audience, 'authenticated');
    assert.equal(supabaseAuth(undefined, undefined), undefined);
  });
});
