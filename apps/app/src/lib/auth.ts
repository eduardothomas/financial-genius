/**
 * Inicio de sesión con Supabase Auth por código de un solo uso enviado al correo (sin contraseñas).
 * Usa la API REST de Supabase Auth con fetch: sin dependencias, igual en web, iOS y Android.
 */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Segundos Unix en que vence el access token. */
  expiresAt: number;
  userId: string;
  email: string;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SupabaseAuthOptions {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Mensajes en español para los errores más comunes de Supabase Auth. */
export function authMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'otp_expired':
      return 'El código venció o no es correcto. Pide uno nuevo.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Espera un momento antes de pedir otro código.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Revisa que el correo esté bien escrito.';
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'session_not_found':
      return 'Tu sesión terminó. Vuelve a entrar.';
    case 'network':
      return 'No pudimos conectar. Revisa tu conexión.';
    default:
      return fallback ?? 'No pudimos completar el inicio de sesión. Intenta de nuevo.';
  }
}

/** ¿Hay que refrescar ya? (margen de 60 s antes del vencimiento) */
export const needsRefresh = (s: AuthSession, nowSec: number, marginSec = 60) => s.expiresAt - nowSec <= marginSec;

export function createSupabaseAuth(opts: SupabaseAuthOptions) {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = `${opts.url.replace(/\/+$/, '')}/auth/v1`;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));

  async function post(path: string, body: unknown, bearer?: string): Promise<any> {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method: 'POST',
        headers: {
          apikey: opts.anonKey,
          'content-type': 'application/json',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError('network', authMessage('network'));
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const code = data?.error_code ?? data?.code ?? data?.error ?? `http_${res.status}`;
      throw new AuthError(String(code), authMessage(String(code)));
    }
    return data;
  }

  function toSession(d: any): AuthSession {
    if (!d?.access_token || !d?.refresh_token || !d?.user?.id) throw new AuthError('bad_response', authMessage('bad_response'));
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt: typeof d.expires_at === 'number' ? d.expires_at : now() + Number(d.expires_in ?? 3600),
      userId: d.user.id,
      email: String(d.user.email ?? '').toLowerCase(),
    };
  }

  return {
    /** Envía el código al correo (crea la cuenta si no existe). */
    requestCode: async (email: string) => {
      await post('/otp', { email: email.trim().toLowerCase(), create_user: true });
    },
    /** Cambia correo + código por una sesión. */
    verifyCode: async (email: string, code: string) =>
      toSession(await post('/verify', { type: 'email', email: email.trim().toLowerCase(), token: code.replace(/\s+/g, '') })),
    refresh: async (s: AuthSession) => toSession(await post('/token?grant_type=refresh_token', { refresh_token: s.refreshToken })),
    /** Cierra la sesión en el servidor; si falla, igual se borra localmente. */
    signOut: async (s: AuthSession) => {
      try {
        await post('/logout', {}, s.accessToken);
      } catch {
        /* sin conexión o sesión ya cerrada */
      }
    },
  };
}

export type SupabaseAuth = ReturnType<typeof createSupabaseAuth>;
