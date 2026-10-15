import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, authMessage, createSupabaseAuth, needsRefresh, type AuthSession } from '../src/lib/auth';
import { createApiClient } from '../src/lib/api';

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (url: string, body: any) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init.body ? JSON.parse(String(init.body)) : null);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const SESSION_BODY = {
  access_token: 'acc', refresh_token: 'ref', expires_in: 3600, expires_at: 2000,
  user: { id: 'u1', email: 'Ana@Ejemplo.test' },
};

describe('Supabase Auth por código', () => {
  it('pide el código con apikey y crea la cuenta si no existe', async () => {
    const { f, calls } = fakeFetch(() => ({ body: {} }));
    const a = createSupabaseAuth({ url: 'https://p.supabase.co/', anonKey: 'anon', fetchImpl: f });
    await a.requestCode('  Ana@Ejemplo.test ');
    assert.equal(calls[0]!.url, 'https://p.supabase.co/auth/v1/otp');
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { email: 'ana@ejemplo.test', create_user: true });
    assert.equal((calls[0]!.init.headers as Record<string, string>).apikey, 'anon');
  });

  it('verifica el código y arma la sesión', async () => {
    const { f, calls } = fakeFetch(() => ({ body: SESSION_BODY }));
    const a = createSupabaseAuth({ url: 'https://p.supabase.co', anonKey: 'anon', fetchImpl: f });
    const s = await a.verifyCode('ana@ejemplo.test', '123 456');
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { type: 'email', email: 'ana@ejemplo.test', token: '123456' });
    assert.deepEqual(s, { accessToken: 'acc', refreshToken: 'ref', expiresAt: 2000, userId: 'u1', email: 'ana@ejemplo.test' });
  });

  it('refresca con el refresh token y cierra sesión sin fallar si no hay red', async () => {
    const { f, calls } = fakeFetch((url) => (url.includes('logout') ? { status: 500, body: {} } : { body: { ...SESSION_BODY, access_token: 'acc2' } }));
    const a = createSupabaseAuth({ url: 'https://p.supabase.co', anonKey: 'anon', fetchImpl: f });
    const old: AuthSession = { accessToken: 'acc', refreshToken: 'ref', expiresAt: 1, userId: 'u1', email: 'a@b.c' };
    assert.equal((await a.refresh(old)).accessToken, 'acc2');
    assert.ok(calls[0]!.url.endsWith('/auth/v1/token?grant_type=refresh_token'));
    await a.signOut(old); // no lanza
    assert.equal((calls[1]!.init.headers as Record<string, string>).authorization, 'Bearer acc');
  });

  it('traduce errores de Supabase', async () => {
    const { f } = fakeFetch(() => ({ status: 403, body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } }));
    const a = createSupabaseAuth({ url: 'https://p.supabase.co', anonKey: 'anon', fetchImpl: f });
    await assert.rejects(a.verifyCode('a@b.c', '000000'), (e: unknown) => e instanceof AuthError && e.message === authMessage('otp_expired'));
    const net = createSupabaseAuth({ url: 'x', anonKey: 'a', fetchImpl: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
    await assert.rejects(net.requestCode('a@b.c'), /conectar/);
  });

  it('refresca 60 s antes de vencer', () => {
    const s = { expiresAt: 1000 } as AuthSession;
    assert.equal(needsRefresh(s, 900), false);
    assert.equal(needsRefresh(s, 940), true);
  });
});

describe('cliente de la API con sesión', () => {
  it('pide el token (puede ser asíncrono) y avisa ante 401', async () => {
    let unauthorized = 0;
    const seen: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>).authorization ?? '');
      return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'no' } }), { status: 401 });
    }) as unknown as typeof fetch;
    const api = createApiClient({ baseUrl: 'http://x', auth: async () => ({ authorization: 'Bearer t1' }), onUnauthorized: () => unauthorized++, fetchImpl: f });
    await assert.rejects(api.me(), /no/);
    assert.deepEqual(seen, ['Bearer t1']);
    assert.equal(unauthorized, 1);
  });
});
