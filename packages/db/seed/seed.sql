-- Carga el catálogo de ejemplo pasando por el flujo real: propuesta → aprobación.
-- Uso: psql "$DATABASE_URL" -v catalog="$(cat seed/catalog.sample.json)" -f seed/seed.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _seed AS SELECT :'catalog'::jsonb AS c;

INSERT INTO institution (id, name)
SELECT i->>'id', i->>'name' FROM _seed, jsonb_array_elements(c->'institutions') i
ON CONFLICT (id) DO NOTHING;

-- Una propuesta por producto (creada por "seed", sin errores) y su aprobación
WITH p AS (
  SELECT x AS d FROM _seed, jsonb_array_elements(c->'products') x
), ins AS (
  INSERT INTO version_proposal (institution_id, proposed, created_by, risk)
  SELECT d->>'institutionId', d - 'commercial', 'seed', 'low' FROM p
  RETURNING id
)
SELECT approve_proposal(id, 'seed') FROM ins;

-- Datos comerciales (si el JSON los trae) van a su tabla separada
INSERT INTO product_commercial (product_id, sponsored, commission_pct)
SELECT d->>'id', coalesce((d->'commercial'->>'sponsored')::boolean, false), (d->'commercial'->>'commissionPct')::numeric
FROM _seed, jsonb_array_elements(c->'products') d
WHERE d ? 'commercial'
ON CONFLICT (product_id) DO UPDATE SET sponsored = EXCLUDED.sponsored, commission_pct = EXCLUDED.commission_pct;
COMMIT;

SELECT version, product_count FROM catalog_state;
