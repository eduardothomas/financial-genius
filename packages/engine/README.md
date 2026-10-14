# @fg/engine — motor financiero

TypeScript puro: sin I/O, sin UI, sin LLM. Ver `docs/ENGINE.md`.

## API

```ts
import { assessReadiness, rankProducts, defaultConfig } from '@fg/engine';

const readiness = assessReadiness(goal, snapshot, catalog.products, config); // índice 0–100 + frenos
const ranking   = rankProducts(goal, snapshot, catalog, config);             // top 3 + razones + auditoría
```

| Módulo | Qué hace |
| --- | --- |
| `finance.ts` | Cuota (amortización francesa), intereses, DTI, utilización, capacidad de pago, hash de auditoría |
| `market.ts` | Resumen del mercado por tipo de meta (ingreso mínimo, tasa mediana, abono) |
| `readiness.ts` | Índice de preparación por meta, factores con evidencia, frenos ordenados con misiones |
| `ranking.ts` | Filtro duro de requisitos, puntaje (costo, holgura, beneficios, cuota), top N, razones, auditoría |
| `config.ts` | Pesos, umbrales y plantillas de misiones. Es dato: en producción viene de la BD, versionado |

## Reglas

- **Regla de oro:** `ranking.ts` lee los productos a través de una lista blanca (`toRankingView`) que excluye `commercial`. El test `REGLA DE ORO` lo verifica con comisiones y patrocinios opuestos. No lo borres.
- Las razones del ranking son códigos estructurados (`lowest_cost`, `matches_preferences`, …). El LLM las pasa a texto; no agrega datos.
- Determinista: mismas entradas + misma versión de catálogo y pesos = mismo resultado.

## Tests

```bash
pnpm --filter @fg/engine test        # node:test vía tsx
pnpm --filter @fg/engine typecheck
```

Los datos de `test/fixtures.ts` son bancos y productos **ficticios** (Banco Alfa, Beta, Gamma, Delta).
