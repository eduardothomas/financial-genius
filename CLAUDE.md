# Financial Genius Panamá

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
