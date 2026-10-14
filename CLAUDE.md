# Financial Genius Panamá

Repo: github.com/eduardothomas/financial-genius (privado). `main` es producción; cada cambio en rama + PR (ver README, "Flujo de cambios").

Lee docs/PRODUCT.md y docs/MVP.md antes de cualquier tarea.

## Reglas
- El motor (packages/engine) es TypeScript puro: sin I/O, sin UI, sin LLM. Todo con tests.
- El LLM nunca es fuente de tasas, requisitos ni ranking. Solo explica datos del motor y del catálogo.
- Ningún campo comercial entra al ranking. Hay un test que lo verifica; no lo borres.
- Todo dato de producto lleva fuente y fecha. El catálogo se versiona, nunca se edita en sitio.
- Los documentos subidos se procesan en memoria y no se guardan.
- Pesos, umbrales y plantillas de misiones viven en configuración, no en código.
- Una sola app Expo para Web, iOS y Android. No crear apps nativas separadas.
- Textos de la app en español de Panamá.
- Tests con `node:test` + `tsx` (sin vitest). Corre `pnpm test` antes de cada commit.
- Migraciones en SQL plano en `packages/db/migrations/`, numeradas. Nunca edites una migración ya aplicada en producción: crea otra.
- Imports relativos con extensión `.js` (ESM en Node).
- Datos de prueba: bancos ficticios (Alfa, Beta, Gamma, Delta, Omega). Nunca datos reales de usuarios.

## Estructura
- `packages/engine` motor puro · `packages/catalog` captura con IA · `packages/contracts` esquemas zod API↔app
- `packages/db` migraciones SQL, semilla, `Db` y utilidades de prueba (`@fg/db/testing`)
- `services/api` API v1 (node:http; handlers independientes del framework) · `apps/admin` panel del catálogo (Next.js)
- `apps/app` app Expo Router (Web/iOS/Android); lógica en `src/lib` con pruebas; tokens de diseño en `src/ui/theme.ts` (motivo: nivel de esclusa)
- El CI publica la web de cada PR en la rama `vista-previa-web` (para revisión visual)
- Las pruebas de API y admin reinician la BD de `DATABASE_URL`: usar siempre una BD desechable.
- El repo aún no tiene `pnpm-lock.yaml`: generarlo con `pnpm install` en una máquina con acceso a npm y subirlo en un PR.
