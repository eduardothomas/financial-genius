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
- iOS: app nativa SwiftUI (iOS 26, Liquid Glass) en `apps/ios`. Android y Web: la app Expo en `apps/app`. No crear más clientes.
- Los textos y formatos de iOS son copia fiel de `apps/app/src/lib`: si cambias `format.ts` o `chat.ts`, corre `pnpm --filter @fg/app casos-dorados` y ajusta `FinancialGeniusCore` hasta que `swift test` pase.
- Textos de la app en español de Panamá.
- Tests con `node:test` + `tsx` (sin vitest). Corre `pnpm test` antes de cada commit.
- Migraciones en SQL plano en `packages/db/migrations/`, numeradas. Nunca edites una migración ya aplicada en producción: crea otra.
- Imports relativos con extensión `.js` (ESM en Node).
- Datos de prueba: bancos ficticios (Alfa, Beta, Gamma, Delta, Omega). Nunca datos reales de usuarios.

## Estructura
- `packages/engine` motor puro · `packages/catalog` captura con IA · `packages/contracts` esquemas zod API↔app
- `packages/db` migraciones SQL, semilla, `Db` y utilidades de prueba (`@fg/db/testing`)
- `services/api` API v1 (node:http; handlers independientes del framework; lógica en `src/services.ts`, compartida con las herramientas del chat en `src/chat/`) · `apps/admin` panel del catálogo (Next.js)
- `apps/app` app Expo Router (Web/Android); lógica en `src/lib` con pruebas; tokens de diseño en `src/ui/theme.ts` (motivo: nivel de esclusa)
- `apps/ios` app nativa SwiftUI (iOS 26): `FinancialGeniusCore` (paquete Swift sin UI: modelos, API, Supabase Auth, textos; `swift test`, corre también en Linux) + `FinancialGenius` (pantallas). Proyecto con XcodeGen (`project.yml`; el `.xcodeproj` no se versiona). CI en `ios.yml` (macOS 26, capturas en `capturas-movil/ios-nativo`)
- El CI publica la web de cada PR en la rama `vista-previa-web` (para revisión visual)
- Las pruebas de API y admin reinician la BD de `DATABASE_URL`: usar siempre una BD desechable.
- Dependencias: el CI instala con `--frozen-lockfile`. Para agregar o actualizar dependencias sin acceso a npm, sube una rama `actualizar-dependencias-*`: el workflow regenera `pnpm-lock.yaml` y alinea Expo en esa rama.
- Auth: Supabase (código por correo); la API verifica con JWKS (`src/auth.ts`). Sin variables de Supabase, la app y la API usan `x-dev-user` (solo desarrollo). Ver `docs/SUPABASE_AUTH.md`.
- Chat: el Genio solo obtiene datos por herramientas (`src/chat/tools.ts`) que reciben el userId de la sesión, nunca del modelo.
