/**
 * Cliente tipado de la API v1. Sin dependencias: solo fetch.
 */
import type { GoalInput, GoalPatch, SnapshotInput } from '@fg/contracts';
import type { FinancialSnapshot, GoalType, RankingResult, ReadinessResult } from '@fg/engine';

export interface Me {
  id: string;
  email: string;
  plan: string;
  has_snapshot: boolean;
  goals: number;
}

export interface GoalView {
  id: string;
  type: GoalType;
  priority: number;
  targetAmount?: number;
  desiredTermMonths?: number;
  preferences: string[];
  status: string;
  createdAt: string;
  readinessScore: number | null;
}

export interface PlanView {
  id: string;
  month: string;
  objective: string;
  actions: Array<{ id: string; title: string; weekStart: string; status: 'pending' | 'done' | 'skipped'; factor: string | null; result: string | null }>;
}

export type RecommendationsView = RankingResult & { readyToCompare: boolean; notice: string | null };
export type ReadinessView = ReadinessResult & { snapshotDate: string };

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Encabezados de autenticación (Bearer o x-dev-user). */
  auth: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method,
        headers: { ...opts.auth(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(0, 'network', 'No pudimos conectar con el servidor. Revisa tu conexión.');
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = data?.error ?? {};
      throw new ApiRequestError(res.status, e.code ?? 'unknown', e.message ?? `Error ${res.status}`, e.details);
    }
    return data as T;
  }

  /** 404 → null (para recursos que pueden no existir todavía). */
  async function maybe<T>(p: Promise<T>): Promise<T | null> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  }

  return {
    me: () => request<Me>('GET', '/v1/me'),
    deleteMe: () => request<void>('DELETE', '/v1/me'),
    snapshot: () => maybe(request<{ id: string; createdAt: string; snapshot: FinancialSnapshot }>('GET', '/v1/me/snapshot')),
    saveSnapshot: (s: SnapshotInput) => request<{ id: string }>('POST', '/v1/me/snapshot', s),
    goals: () => request<{ goals: GoalView[] }>('GET', '/v1/goals').then((r) => r.goals),
    goal: (id: string) => request<GoalView>('GET', `/v1/goals/${encodeURIComponent(id)}`),
    createGoal: (g: GoalInput) => request<GoalView>('POST', '/v1/goals', g),
    patchGoal: (id: string, p: GoalPatch) => request<GoalView>('PATCH', `/v1/goals/${encodeURIComponent(id)}`, p),
    readiness: (id: string) => request<ReadinessView>('GET', `/v1/goals/${encodeURIComponent(id)}/readiness`),
    recommendations: (id: string) => request<RecommendationsView>('GET', `/v1/goals/${encodeURIComponent(id)}/recommendations`),
    plan: (id: string) => maybe(request<PlanView>('GET', `/v1/goals/${encodeURIComponent(id)}/plan`)),
    createPlan: (id: string) => request<PlanView>('POST', `/v1/goals/${encodeURIComponent(id)}/plan`),
    setAction: (id: string, status: PlanView['actions'][number]['status']) =>
      request<{ ok: true }>('PATCH', `/v1/actions/${encodeURIComponent(id)}`, { status }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
