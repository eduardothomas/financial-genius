# Financial Genius Panamá

App de genio financiero para Panamá (Web + iOS + Android). La especificación completa está en `docs/MASTER_SPEC_v1.md`, partida por tema en `docs/`. Los 7 conceptos de UX originales están en `docs/ux-experiments/`.

## Estructura

```text
financial-genius/
├── CLAUDE.md                  ← reglas para Claude Code
├── docs/
│   ├── PRODUCT.md             ← secciones 1–4 y 11
│   ├── MVP.md                 ← secciones 5 y 12
│   ├── ENGINE.md              ← sección 6
│   ├── BANKING_CATALOG.md     ← sección 7
│   ├── DATA_MODEL.md          ← sección 8
│   ├── ARCHITECTURE.md        ← sección 9
│   ├── PRIVACY_LEGAL.md       ← sección 10
│   └── ux-experiments/        ← los 7 .docx originales
├── apps/
│   ├── app/                   ← Expo: Web + Android
│   ├── ios/                   ← SwiftUI nativo (iOS 26, Liquid Glass)
│   └── admin/                 ← Next.js: panel del catálogo
├── services/
│   └── api/                   ← Fastify: módulos de la sección 9
├── packages/
│   ├── engine/                ← motor financiero puro + tests
│   ├── contracts/             ← esquemas Zod / OpenAPI compartidos
│   ├── db/                    ← esquema, migraciones, seed del catálogo
│   └── ui/                    ← componentes compartidos
└── turbo.json
```

Las reglas para Claude Code están en `CLAUDE.md`.

## Estado

- [x] Monorepo (pnpm + Turborepo)
- [x] `packages/engine` — cálculos, índice de preparación y ranking (28 tests)
- [x] `packages/db` — esquema PostgreSQL, semilla, flujo propuesta → aprobación (9 tests SQL + prueba con el motor)
- [x] `packages/catalog` — extracción con IA, citas anti-alucinación, validación, comparación (16 tests)
- [x] `apps/admin` — panel del catálogo; lógica probada contra PostgreSQL (6 tests), pantallas Next.js sin ejecutar aún
- [x] `services/api` — API v1: perfil, metas, preparación, top 3, plan y misiones, borrar cuenta (15 tests)
- [x] `packages/contracts` — esquemas de entrada compartidos API ↔ app
- [x] `apps/app` — app Expo para Web y Android: Genio, Metas, Plan, Productos y Perfil
- [x] `apps/ios` — app nativa SwiftUI para iOS 26 con Liquid Glass (mismas pantallas; textos verificados con casos dorados)
- [x] Chat del Genio con herramientas y login con Supabase Auth

## Primeros pasos

Necesitas Node 22+, pnpm y PostgreSQL 16 (por ejemplo `brew install postgresql@16`).

```bash
pnpm install
createdb fg && export DATABASE_URL=postgres://localhost:5432/fg
pnpm --filter @fg/db reset       # esquema + catálogo de ejemplo (bancos ficticios)
pnpm test                        # todos los paquetes
cp apps/admin/.env.example apps/admin/.env.local   # completa las claves
pnpm --filter @fg/admin dev      # panel en http://localhost:3001
pnpm --filter @fg/api dev        # API en http://localhost:3000
pnpm --filter @fg/app web        # app en el navegador (también android)
# iOS nativo: ver apps/ios/README.md (Xcode 26 + XcodeGen)
```

> Las pruebas de `apps/admin` y `services/api` reinician la base de datos: úsalas con una BD desechable.

## Orden de trabajo sugerido con Claude Code

1. Crear el monorepo y el `CLAUDE.md`; copiar este documento partido en `docs/`.
2. `packages/engine`: cálculos, índice de preparación y ranking con tests, usando 3 perfiles de ejemplo y 10 productos ficticios.
3. `packages/db` + `apps/admin`: esquema, migraciones y panel para cargar el catálogo real.
4. `services/api`: auth, metas, motor y catálogo expuestos con contratos.
5. `apps/app`: tabs Metas, Plan y Productos primero (sin chat), conectadas a la API.
6. Orquestador de chat con tool calling sobre la API; tab Genio.
7. Lectura de documentos, notificaciones, analytics y build de beta.

Por qué el chat va al final: si el motor y las pantallas funcionan sin chat, el chat solo tiene que explicarlos, y es mucho más fácil de probar.

## Flujo de cambios

- `main` es producción: nunca commits directos.
- Cada cambio en una rama con nombre en español (`api-v1`, `fix-ranking`), commits pequeños y PR con qué cambia, por qué y cómo se probó.
- GitHub Actions corre todas las pruebas con PostgreSQL 16 en cada PR.
- Se fusiona con squash merge cuando Eduardo lo aprueba.
