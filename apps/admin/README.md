# @fg/admin — panel interno del catálogo

Next.js (App Router). Solo para el equipo: protegido con usuario y contraseña (`middleware.ts`).

| Pantalla | Qué hace |
| --- | --- |
| `/` | Productos vigentes, versión, fecha de revisión, aviso de desactualizado (>60 días) |
| `/importar` | Pegar la URL oficial → la IA propone la ficha con citas → propuesta pendiente |
| `/propuestas` | Cola de revisión, primero las de alto riesgo |
| `/propuestas/[id]` | Cambio campo a campo con la cita de la página; aprobar (publica nueva versión) o rechazar |

La lógica vive en `lib/catalog-service.ts` (sin Next.js) y está probada contra PostgreSQL real.

```bash
cp .env.example .env.local        # completa DATABASE_URL, ANTHROPIC_API_KEY y la contraseña
pnpm --filter @fg/db reset        # BD con el catálogo de ejemplo
pnpm --filter @fg/admin dev       # http://localhost:3001
DATABASE_URL=... pnpm --filter @fg/admin test   # BD DESECHABLE: la reinicia
```

Rastreo periódico (V2): `recheckAllSources()` revisa todas las fuentes y solo propone cuando la página cambió.
Se puede llamar desde un cron (ruta protegida o job) cuando se active.
