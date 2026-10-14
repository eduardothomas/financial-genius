import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { createApiClient, type ApiClient } from './api';

/**
 * Sesión de DESARROLLO: identifica al usuario por correo (encabezado x-dev-user).
 * Se reemplaza por Supabase Auth (JWT) antes de lanzar.
 */
const KEY = 'fg.devEmail';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function readStored(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}
function writeStored(v: string | null) {
  if (Platform.OS !== 'web') return;
  try {
    if (v) globalThis.localStorage?.setItem(KEY, v);
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible: la sesión vive en memoria */
  }
}

interface Session {
  email: string | null;
  api: ApiClient;
  signIn: (email: string) => void;
  signOut: () => void;
  /** Meta elegida para las pestañas Plan y Productos. */
  goalId: string | null;
  setGoalId: (id: string | null) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => readStored());
  const [goalId, setGoalId] = useState<string | null>(null);
  const api = useMemo(
    () => createApiClient({ baseUrl: API_URL, auth: () => (email ? { 'x-dev-user': email } : {}) }),
    [email],
  );
  const value: Session = {
    email,
    api,
    goalId,
    setGoalId,
    signIn: (e) => {
      const v = e.trim().toLowerCase();
      writeStored(v);
      setEmail(v);
    },
    signOut: () => {
      writeStored(null);
      setEmail(null);
      setGoalId(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fuera de SessionProvider');
  return s;
}
