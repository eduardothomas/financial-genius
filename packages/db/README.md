# @fg/db — base de datos

PostgreSQL 16, migraciones en SQL plano (`migrations/`). Ver `docs/DATA_MODEL.md`.

```bash
export DATABASE_URL=postgres://postgres@localhost:5432/fg
pnpm --filter @fg/db reset   # borra, migra y carga el catálogo de ejemplo
pnpm --filter @fg/db test    # 9 pruebas SQL + prueba de punta a punta con el motor
```

## Lo que garantiza el esquema

| Regla | Cómo |
| --- | --- |
| Versiones de producto inmutables | Trigger `product_version_guard`: solo permite cerrar (`valid_to`); bloquea UPDATE y DELETE |
| Una sola versión vigente | Índice único parcial `WHERE valid_to IS NULL` |
| Regla de oro | Comisiones y patrocinios en `product_commercial`; `current_products` y `engine_products()` no la tocan |
| Todo dato con fuente y fecha | `source_url`, `captured_at`, `verified_by`, `citations` obligatorios |
| Cambios auditados | `approve_proposal()` cierra la versión, crea la nueva y escribe en `audit_log` en una transacción |
| Versión del catálogo para auditoría | Vista `catalog_state`: hash de las versiones vigentes |

## Flujo del catálogo

1. Se crea una `version_proposal` (por la IA desde una URL, o a mano).
2. Una persona la revisa en el panel admin.
3. `select approve_proposal('<id>', 'eduardo');` publica la nueva versión.

`engine_products('auto_loan')` devuelve los productos vigentes en el formato exacto de `@fg/engine`.
