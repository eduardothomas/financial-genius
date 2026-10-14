-- Tests de la base de datos. Corre sobre una BD con la migración y la semilla aplicadas.
-- Cada bloque falla con RAISE EXCEPTION si algo no se cumple. Todo se revierte al final.
\set ON_ERROR_STOP on
BEGIN;

-- 1. La semilla cargó 10 productos con versión 1 vigente
DO $$ BEGIN
  IF (SELECT count(*) FROM current_products) <> 10 THEN RAISE EXCEPTION 'esperaba 10 productos vigentes'; END IF;
  IF EXISTS (SELECT 1 FROM current_products WHERE version_no <> 1) THEN RAISE EXCEPTION 'esperaba versión 1'; END IF;
  RAISE NOTICE 'ok 1 - semilla: 10 productos vigentes';
END $$;

-- 2. product_version no se puede editar
DO $$ BEGIN
  BEGIN
    UPDATE product_version SET rate_min = 1 WHERE product_id = 'alfa-auto';
    RAISE EXCEPTION 'FALLO: se pudo editar una versión';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok 2 - versiones inmutables (UPDATE bloqueado)';
END $$;

-- 3. product_version no se puede borrar
DO $$ BEGIN
  BEGIN
    DELETE FROM product_version WHERE product_id = 'alfa-auto';
    RAISE EXCEPTION 'FALLO: se pudo borrar una versión';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok 3 - versiones inmutables (DELETE bloqueado)';
END $$;

-- 4. Aprobar una propuesta crea la versión 2, cierra la 1 y cambia la versión del catálogo
DO $$
DECLARE before_v text; after_v text; pid uuid; vid uuid;
BEGIN
  SELECT version INTO before_v FROM catalog_state;
  INSERT INTO version_proposal (product_id, institution_id, proposed)
  SELECT 'alfa-auto', 'alfa',
         jsonb_set(e, '{rate}', '{"min": 6.0, "max": 8.0}')
  FROM jsonb_array_elements(engine_products('auto_loan')) e WHERE e->>'id' = 'alfa-auto'
  RETURNING id INTO pid;
  vid := approve_proposal(pid, 'tester', 'baja de tasa');
  IF (SELECT version_no FROM current_products WHERE id = 'alfa-auto') <> 2 THEN RAISE EXCEPTION 'esperaba versión 2'; END IF;
  IF (SELECT rate_min FROM current_products WHERE id = 'alfa-auto') <> 6.0 THEN RAISE EXCEPTION 'tasa no actualizada'; END IF;
  IF (SELECT count(*) FROM product_version WHERE product_id = 'alfa-auto' AND valid_to IS NULL) <> 1 THEN RAISE EXCEPTION 'más de una vigente'; END IF;
  IF (SELECT valid_to FROM product_version WHERE product_id = 'alfa-auto' AND version_no = 1) IS NULL THEN RAISE EXCEPTION 'v1 no se cerró'; END IF;
  SELECT version INTO after_v FROM catalog_state;
  IF before_v = after_v THEN RAISE EXCEPTION 'la versión del catálogo no cambió'; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE entity_id = vid::text) THEN RAISE EXCEPTION 'sin auditoría'; END IF;
  RAISE NOTICE 'ok 4 - aprobación: v2 vigente, v1 cerrada, catálogo % → %, auditado', before_v, after_v;
END $$;

-- 5. Una propuesta ya aprobada no se puede aprobar de nuevo
DO $$ DECLARE pid uuid; BEGIN
  SELECT id INTO pid FROM version_proposal WHERE status = 'approved' LIMIT 1;
  BEGIN
    PERFORM approve_proposal(pid, 'tester');
    RAISE EXCEPTION 'FALLO: aprobó dos veces';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok 5 - no se aprueba dos veces';
END $$;

-- 6. Una propuesta con errores de validación no se puede aprobar
DO $$ DECLARE pid uuid; BEGIN
  INSERT INTO version_proposal (product_id, institution_id, proposed, issues)
  SELECT 'beta-auto', 'beta', e, '[{"field":"rate.min","severity":"error","message":"fuera de rango"}]'
  FROM jsonb_array_elements(engine_products('auto_loan')) e WHERE e->>'id' = 'beta-auto'
  RETURNING id INTO pid;
  BEGIN
    PERFORM approve_proposal(pid, 'tester');
    RAISE EXCEPTION 'FALLO: aprobó con errores';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok 6 - propuestas con errores no se aprueban';
END $$;

-- 7. REGLA DE ORO en BD: cambiar datos comerciales no cambia engine_products ni la versión del catálogo
DO $$ DECLARE a jsonb; b jsonb; va text; vb text; BEGIN
  a := engine_products(); SELECT version INTO va FROM catalog_state;
  INSERT INTO product_commercial (product_id, sponsored, commission_pct)
  SELECT id, true, 50 FROM product
  ON CONFLICT (product_id) DO UPDATE SET sponsored = true, commission_pct = 50;
  b := engine_products(); SELECT version INTO vb FROM catalog_state;
  IF a IS DISTINCT FROM b OR va <> vb THEN RAISE EXCEPTION 'datos comerciales alteraron lo que ve el motor'; END IF;
  IF b::text LIKE '%commission%' OR b::text LIKE '%sponsored%' THEN RAISE EXCEPTION 'campo comercial expuesto'; END IF;
  RAISE NOTICE 'ok 7 - REGLA DE ORO: datos comerciales invisibles para el motor';
END $$;

-- 8. Restricciones: tasa mín > máx es rechazada
DO $$ BEGIN
  BEGIN
    INSERT INTO product_version (product_id, version_no, rate_min, rate_max, residency, employment_types, source_url, captured_at, verified_by)
    VALUES ('gamma-auto', 99, 10, 5, '{national}', '{salaried}', 'x', current_date, 't');
    RAISE EXCEPTION 'FALLO: aceptó tasa mín > máx';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 8 - restricciones de rango';
END $$;

-- 9. Solo una versión vigente por producto
DO $$ BEGIN
  BEGIN
    INSERT INTO product_version (product_id, version_no, rate_min, rate_max, residency, employment_types, source_url, captured_at, verified_by)
    VALUES ('gamma-auto', 50, 5, 6, '{national}', '{salaried}', 'x', current_date, 't');
    RAISE EXCEPTION 'FALLO: dos versiones vigentes';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 9 - una sola versión vigente por producto';
END $$;

ROLLBACK;
