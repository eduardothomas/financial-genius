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
│   ├── app/                   ← Expo: Web + iOS + Android
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
- [x] `packages/engine`: cálculos, índice de preparación y ranking, 28 tests
- [ ] `packages/db` + `apps/admin`
- [ ] `services/api`
- [ ] `apps/app`
- [ ] Chat

## Primeros pasos

```bash
pnpm install
pnpm test
```

## Orden de trabajo sugerido con Claude Code

1. Crear el monorepo y el `CLAUDE.md`; copiar este documento partido en `docs/`.
2. `packages/engine`: cálculos, índice de preparación y ranking con tests, usando 3 perfiles de ejemplo y 10 productos ficticios.
3. `packages/db` + `apps/admin`: esquema, migraciones y panel para cargar el catálogo real.
4. `services/api`: auth, metas, motor y catálogo expuestos con contratos.
5. `apps/app`: tabs Metas, Plan y Productos primero (sin chat), conectadas a la API.
6. Orquestador de chat con tool calling sobre la API; tab Genio.
7. Lectura de documentos, notificaciones, analytics y build de beta.

Por qué el chat va al final: si el motor y las pantallas funcionan sin chat, el chat solo tiene que explicarlos, y es mucho más fácil de probar.
