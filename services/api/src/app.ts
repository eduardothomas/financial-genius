import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z, ZodTypeAny } from 'zod';
import {
  ActionPatchSchema,
  ChatInputSchema,
  ConsentInputSchema,
  GoalInputSchema,
  GoalPatchSchema,
  GoalTypeSchema,
  SnapshotInputSchema,
} from '@fg/contracts';
import type { Db } from '@fg/db';
import { defaultConfig, type EngineConfig } from '@fg/engine';
import { identify, type AuthOptions } from './auth.js';
import { ApiError, badRequest, notFound } from './errors.js';
import * as repo from './repo.js';
import { Router } from './router.js';
import { createServices } from './services.js';
import { runTurn } from './chat/genio.js';
import type { ChatModel } from './chat/model.js';

export interface AppOptions {
  db: Db;
  auth: AuthOptions;
  config?: EngineConfig;
  now?: () => Date;
  /** Orígenes permitidos para CORS (la app web). */
  corsOrigins?: string[];
  maxBodyBytes?: number;
  /** Modelo del Genio. Sin modelo, el chat responde 503. */
  chatModel?: ChatModel;
}

function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw badRequest(
      'Datos inválidos',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export function createApp(opts: AppOptions) {
  const db = opts.db;
  const cfg = opts.config ?? defaultConfig;
  const now = opts.now ?? (() => new Date());
  const router = new Router();

  const svc = createServices(db, cfg, now);

  router
    // ---- Público ----
    .add(
      'GET',
      '/v1/health',
      async () => {
        const { version } = await repo.catalog(db);
        return { body: { ok: true, catalogVersion: version } };
      },
      { public: true },
    )
    .add(
      'GET',
      '/v1/catalog/products',
      async (ctx) => {
        const t = ctx.query.get('type');
        const type = t ? parse(GoalTypeSchema, t) : undefined;
        const cat = await repo.catalog(db, type);
        const fresh = await repo.catalogWithFreshness(db, type);
        return {
          body: {
            catalogVersion: cat.version,
            products: cat.products.map((p) => ({ ...p, stale: fresh.get(p.id)?.stale ?? false })),
          },
        };
      },
      { public: true },
    )

    // ---- Usuario ----
    .add('GET', '/v1/me', async (ctx) => ({ body: await repo.getUser(db, ctx.userId) }))
    .add('DELETE', '/v1/me', async (ctx) => {
      await repo.deleteUser(db, ctx.userId);
      return { status: 204 };
    })
    .add('POST', '/v1/me/consents', async (ctx) => {
      await repo.addConsent(db, ctx.userId, parse(ConsentInputSchema, ctx.body));
      return { status: 201, body: { ok: true } };
    })
    .add('POST', '/v1/me/snapshot', async (ctx) => {
      const id = await repo.insertSnapshot(db, ctx.userId, parse(SnapshotInputSchema, ctx.body));
      return { status: 201, body: { id } };
    })
    .add('GET', '/v1/me/snapshot', async (ctx) => {
      const s = await repo.latestSnapshot(db, ctx.userId);
      if (!s) throw notFound('El perfil financiero');
      return { body: s };
    })

    // ---- Metas ----
    .add('GET', '/v1/goals', async (ctx) => ({ body: { goals: await repo.listGoals(db, ctx.userId) } }))
    .add('POST', '/v1/goals', async (ctx) => ({
      status: 201,
      body: await svc.createGoal(ctx.userId, parse(GoalInputSchema, ctx.body)),
    }))
    .add('GET', '/v1/goals/:id', async (ctx) => {
      const g = await repo.getGoal(db, ctx.userId, ctx.params.id!);
      if (!g) throw notFound('La meta');
      return { body: g };
    })
    .add('PATCH', '/v1/goals/:id', async (ctx) => {
      const ok = await repo.patchGoal(db, ctx.userId, ctx.params.id!, parse(GoalPatchSchema, ctx.body));
      if (!ok) throw notFound('La meta');
      return { body: await repo.getGoal(db, ctx.userId, ctx.params.id!) };
    })
    .add('GET', '/v1/goals/:id/readiness', async (ctx) => {
      const { readiness, snap } = await svc.readiness(ctx.userId, ctx.params.id!);
      return { body: { ...readiness, snapshotDate: snap.createdAt } };
    })
    .add('GET', '/v1/goals/:id/recommendations', async (ctx) => ({
      body: await svc.recommendations(ctx.userId, ctx.params.id!),
    }))
    .add('GET', '/v1/goals/:id/plan', async (ctx) => {
      const plan = await svc.plan(ctx.userId, ctx.params.id!);
      if (!plan) throw notFound('El plan de este mes');
      return { body: plan };
    })
    .add('POST', '/v1/goals/:id/plan', async (ctx) => {
      const { plan, created } = await svc.ensurePlan(ctx.userId, ctx.params.id!);
      return { status: created ? 201 : 200, body: plan };
    })
    // ---- Chat del Genio ----
    .add('POST', '/v1/chat', async (ctx) => {
      if (!opts.chatModel) throw new ApiError(503, 'chat_unavailable', 'El Genio no está disponible en este momento');
      const input = parse(ChatInputSchema, ctx.body);
      let conversationId = input.conversationId;
      if (conversationId && !(await repo.ownsConversation(db, ctx.userId, conversationId))) throw notFound('La conversación');
      conversationId ??= await repo.createConversation(db, ctx.userId);
      const history = (await repo.chatMessages(db, ctx.userId, conversationId, 20)).map((m) => ({ role: m.role, content: m.content }));
      const turn = await runTurn({ model: opts.chatModel, svc, userId: ctx.userId, history, message: input.message, today: now() });
      const messageId = await repo.addChatTurn(db, conversationId, input.message, turn.reply, {
        attachments: turn.attachments,
        trace: turn.trace,
      });
      return { body: { conversationId, messageId, reply: turn.reply, attachments: turn.attachments } };
    })
    .add('GET', '/v1/chat/conversations', async (ctx) => ({ body: { conversations: await repo.listConversations(db, ctx.userId) } }))
    .add('GET', '/v1/chat/conversations/:id', async (ctx) => {
      const id = ctx.params.id!;
      if (!/^[0-9a-f-]{36}$/i.test(id) || !(await repo.ownsConversation(db, ctx.userId, id))) throw notFound('La conversación');
      return { body: { id, messages: await repo.chatMessages(db, ctx.userId, id) } };
    })
    .add('PATCH', '/v1/actions/:id', async (ctx) => {
      const ok = await repo.patchAction(db, ctx.userId, ctx.params.id!, parse(ActionPatchSchema, ctx.body));
      if (!ok) throw notFound('La misión');
      return { body: { ok: true } };
    });

  // ---------- Adaptador HTTP (node:http) ----------
  const maxBody = opts.maxBodyBytes ?? 256 * 1024;
  const userCache = new Map<string, string>();

  async function readBody(req: IncomingMessage): Promise<unknown> {
    if (req.method === 'GET' || req.method === 'DELETE') return undefined;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > maxBody) throw new ApiError(413, 'payload_too_large', 'El cuerpo es demasiado grande');
      chunks.push(c as Buffer);
    }
    if (size === 0) return undefined;
    if (!String(req.headers['content-type'] ?? '').includes('application/json'))
      throw new ApiError(415, 'unsupported_media_type', 'Usa Content-Type: application/json');
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw badRequest('JSON inválido');
    }
  }

  function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
    const headers: Record<string, string> = {
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    };
    if (origin && opts.corsOrigins?.includes(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers['vary'] = 'Origin';
    }
    if (body === undefined || status === 204) {
      res.writeHead(status, headers).end();
      return;
    }
    headers['content-type'] = 'application/json; charset=utf-8';
    res.writeHead(status, headers).end(JSON.stringify(body));
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'OPTIONS') {
        if (origin && opts.corsOrigins?.includes(origin)) {
          res.writeHead(204, {
            'access-control-allow-origin': origin,
            'access-control-allow-methods': 'GET,POST,PATCH,DELETE',
            'access-control-allow-headers': opts.auth.devUsers ? 'authorization,content-type,x-dev-user' : 'authorization,content-type',
            'access-control-max-age': '600',
            vary: 'Origin',
          });
        } else res.writeHead(204);
        res.end();
        return;
      }
      const m = router.match(req.method ?? 'GET', url.pathname.replace(/\/+$/, '') || '/');
      if (m === null) throw notFound('La ruta');
      if (m === 'method') throw new ApiError(405, 'method_not_allowed', 'Método no permitido');

      let userId = '';
      let identity = null;
      if (!m.route.public) {
        identity = identify(req.headers, opts.auth);
        userId = userCache.get(identity.subject) ?? (await repo.upsertUser(db, identity.subject, identity.email));
        userCache.set(identity.subject, userId);
      }
      const body = await readBody(req);
      const result = await m.route.handler({ params: m.params, query: url.searchParams, body, userId, identity });
      if (req.method === 'DELETE' && url.pathname.startsWith('/v1/me') && identity) userCache.delete(identity.subject);
      send(res, result.status ?? 200, result.body, origin);
    } catch (e) {
      if (e instanceof ApiError) {
        send(res, e.status, { error: { code: e.code, message: e.message, details: e.details } }, origin);
      } else {
        console.error('[api] error no controlado', e);
        send(res, 500, { error: { code: 'internal', message: 'Error interno' } }, origin);
      }
    }
  };
}
