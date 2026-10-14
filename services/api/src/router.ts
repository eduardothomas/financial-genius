import type { Identity } from './auth.js';

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  /** Solo en rutas autenticadas. */
  userId: string;
  identity: Identity | null;
}

export interface Result {
  status?: number;
  body?: unknown;
}

export type Handler = (ctx: Ctx) => Promise<Result>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  public: boolean;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler, opts: { public?: boolean } = {}): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
        keys.push(k);
        return '([^/]+)';
      })}$`,
    );
    this.routes.push({ method, pattern, keys, handler, public: opts.public ?? false });
    return this;
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      return { route: r, params };
    }
    return pathMatched ? 'method' : null;
  }
}
