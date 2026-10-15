import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from './api';
import { createSupabaseAuth, needsRefresh, type AuthSession } from './auth';
import { getItem, setItem } from './storage';

/**
 * Sesión del usuario.
 *  - Supabase Auth (producción): con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.
 *    Código por correo, token Bearer que se refresca solo, guardado en Keychain/Keystore o localStorage.
 *  - Desarrollo: sin esas variables, se entra solo con el correo (encabezado x-dev-user).
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const authMode: 'supabase' | 'dev' = SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'dev';
const supabase = authMode === 'supabase' ? createSupabaseAuth({ url: SUPABASE_URL!, anonKey: SUPABASE_ANON_KEY! }) : null;

const KEY_DEV = 'fg.devEmail';
const KEY_AUTH = 'fg.auth';

interface Session {
  /** false mientras se lee la sesión guardada. */
  ready: boolean;
  mode: typeof authMode;
  email: string | null;
  api: ApiClient;
  /** Modo desarrollo. */
  signIn: (email: string) => void;
  /** Modo Supabase: paso 1 y paso 2. */
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => void;
  /** Meta elegida para las pestañas Plan y Productos. */
  goalId: string | null;
  setGoalId: (id: string | null) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [devEmail, setDevEmail] = useState<string | null>(null);
  const [auth, setAuthState] = useState<AuthSession | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const authRef = useRef<AuthSession | null>(null);
  const refreshing = useRef<Promise<AuthSession | null> | null>(null);

  const setAuth = useCallback((s: AuthSession | null) => {
    authRef.current = s;
    setAuthState(s);
    void setItem(KEY_AUTH, s ? JSON.stringify(s) : null);
  }, []);

  useEffect(() => {
    (async () => {
      if (authMode === 'supabase') {
        const raw = await getItem(KEY_AUTH);
        if (raw) {
          try {
            const s = JSON.parse(raw) as AuthSession;
            authRef.current = s;
            setAuthState(s);
          } catch {
            /* sesión guardada corrupta: se ignora */
          }
        }
      } else {
        setDevEmail(await getItem(KEY_DEV));
      }
      setReady(true);
    })();
  }, []);

  const signOut = useCallback(() => {
    const s = authRef.current;
    if (s && supabase) void supabase.signOut(s);
    setAuth(null);
    void setItem(KEY_DEV, null);
    setDevEmail(null);
    setGoalId(null);
  }, [setAuth]);

  /** Token vigente; refresca una sola vez aunque haya varias peticiones a la vez. */
  const freshToken = useCallback(async (): Promise<string | null> => {
    const s = authRef.current;
    if (!s || !supabase) return null;
    if (!needsRefresh(s, Math.floor(Date.now() / 1000))) return s.accessToken;
    refreshing.current ??= supabase
      .refresh(s)
      .then((n) => {
        setAuth(n);
        return n;
      })
      .catch(() => {
        signOut();
        return null;
      })
      .finally(() => {
        refreshing.current = null;
      });
    return (await refreshing.current)?.accessToken ?? null;
  }, [setAuth, signOut]);

  const email = authMode === 'supabase' ? (auth?.email ?? null) : devEmail;

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        auth: async (): Promise<Record<string, string>> => {
          if (authMode === 'supabase') {
            const t = await freshToken();
            return t ? { authorization: `Bearer ${t}` } : {};
          }
          return devEmail ? { 'x-dev-user': devEmail } : {};
        },
        onUnauthorized: () => {
          if (authMode === 'supabase' && authRef.current) signOut();
        },
      }),
    [devEmail, freshToken, signOut],
  );

  const value: Session = {
    ready,
    mode: authMode,
    email,
    api,
    goalId,
    setGoalId,
    signIn: (e) => {
      const v = e.trim().toLowerCase();
      void setItem(KEY_DEV, v);
      setDevEmail(v);
    },
    requestCode: async (e) => {
      if (!supabase) throw new Error('Supabase no está configurado');
      await supabase.requestCode(e);
    },
    verifyCode: async (e, code) => {
      if (!supabase) throw new Error('Supabase no está configurado');
      setAuth(await supabase.verifyCode(e, code));
    },
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fuera de SessionProvider');
  return s;
}
