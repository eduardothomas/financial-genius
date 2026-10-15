# @fg/api — API v1

Servidor HTTP de Node (sin framework) sobre `pg`. Los handlers no dependen del framework:
migrar a Fastify más adelante solo cambia el adaptador de `src/app.ts`.

```bash
export DATABASE_URL=postgres://localhost:5432/fg
pnpm --filter @fg/db reset
pnpm --filter @fg/api dev          # http://localhost:3000, acepta x-dev-user en desarrollo
curl localhost:3000/v1/health
curl -H 'x-dev-user: yo@ejemplo.test' localhost:3000/v1/me
DATABASE_URL=... pnpm --filter @fg/api test   # BD DESECHABLE: la reinicia
```

## Endpoints

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/v1/health` | Estado y versión del catálogo (público) |
| GET | `/v1/catalog/products?type=` | Productos vigentes con aviso de desactualizado (público) |
| GET / DELETE | `/v1/me` | Perfil del usuario / borrar cuenta y todos sus datos |
| POST | `/v1/me/consents` | Registrar un consentimiento (historial) |
| POST / GET | `/v1/me/snapshot` | Guardar perfil financiero (crea un snapshot nuevo) / el último |
| GET / POST | `/v1/goals` | Listar / crear metas |
| GET / PATCH | `/v1/goals/:id` | Ver / editar meta (prioridad, estado, monto, plazo, preferencias) |
| GET | `/v1/goals/:id/readiness` | Índice de preparación y frenos (se guarda) |
| GET | `/v1/goals/:id/recommendations` | Top 3 con razones (se guarda); aviso si aún no está listo |
| POST / GET | `/v1/goals/:id/plan` | Crear (una vez por mes) / ver el plan del mes con misiones |
| PATCH | `/v1/actions/:id` | Marcar una misión como hecha u omitida |
| POST | `/v1/chat` | Mensaje al Genio (crea o continúa una conversación); devuelve respuesta y tarjetas |
| GET | `/v1/chat/conversations[/:id]` | Conversaciones del usuario / mensajes de una |

Entradas validadas con `@fg/contracts` (los mismos esquemas que usará la app).

## Seguridad

- Auth: `Authorization: Bearer <access token de Supabase>`, verificado con el JWKS de `SUPABASE_URL` (ES256/RS256) o con `AUTH_JWT_SECRET` (HS256 heredado). Ver `docs/SUPABASE_AUTH.md`.
  Rechaza firma inválida, token vencido y algoritmos distintos de HS256.
- `x-dev-user` solo con `FG_DEV_USERS=1`, y el servidor se niega a arrancar así en producción.
- Toda consulta filtra por usuario: un recurso ajeno responde 404 (prueba de aislamiento incluida).
- CORS solo para `CORS_ORIGINS`. Cuerpo máximo 256 KB, solo JSON.

Pendiente antes de producción: límite de solicitudes por usuario y logs estructurados.
