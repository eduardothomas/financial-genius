-- Financial Genius Panamá — esquema inicial (PostgreSQL 16)
-- Ver docs/DATA_MODEL.md y docs/BANKING_CATALOG.md
--
-- Principios aplicados en el esquema:
--   * product_version es inmutable: solo se puede cerrar (valid_to). Nunca se edita ni se borra.
--   * Los datos comerciales viven en product_commercial. Las vistas y funciones que
--     alimentan al motor (current_products, engine_products) NO la consultan.
--   * Los documentos del usuario no se guardan: solo los datos extraídos y confirmados.

BEGIN;

-- ============================================================
-- Tipos
-- ============================================================
CREATE TYPE goal_type        AS ENUM ('credit_card', 'auto_loan', 'mortgage');
CREATE TYPE employment_type  AS ENUM ('salaried', 'self_employed', 'informal', 'retired');
CREATE TYPE apc_self_reported AS ENUM ('good', 'fair', 'poor', 'none', 'unknown');
CREATE TYPE residency        AS ENUM ('national', 'resident', 'foreign');
CREATE TYPE debt_kind        AS ENUM ('credit_card', 'personal_loan', 'auto_loan', 'mortgage', 'other');
CREATE TYPE plan_tier        AS ENUM ('free', 'premium');
CREATE TYPE goal_status      AS ENUM ('active', 'paused', 'achieved', 'abandoned');
CREATE TYPE action_status    AS ENUM ('pending', 'done', 'skipped');
CREATE TYPE obstacle_status  AS ENUM ('open', 'resolved');
CREATE TYPE source_kind      AS ENUM ('page', 'pdf', 'terms');
CREATE TYPE proposal_status  AS ENUM ('pending', 'approved', 'rejected', 'superseded');
CREATE TYPE proposal_risk    AS ENUM ('low', 'high');
CREATE TYPE message_role     AS ENUM ('user', 'assistant', 'tool');

-- ============================================================
-- Catálogo
-- ============================================================
CREATE TABLE institution (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'bank',
  website     text,
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product (
  id             text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  institution_id text NOT NULL REFERENCES institution(id),
  type           goal_type NOT NULL,
  name           text NOT NULL,
  segment        text,
  official_url   text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_type_idx ON product(type) WHERE active;

CREATE TABLE product_version (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id             text NOT NULL REFERENCES product(id),
  version_no             int  NOT NULL CHECK (version_no > 0),
  rate_min               numeric(6,3) NOT NULL CHECK (rate_min >= 0 AND rate_min <= 100),
  rate_max               numeric(6,3) NOT NULL CHECK (rate_max >= 0 AND rate_max <= 100),
  annual_fee             numeric(12,2) NOT NULL DEFAULT 0 CHECK (annual_fee >= 0),
  one_time_fees          numeric(12,2) NOT NULL DEFAULT 0 CHECK (one_time_fees >= 0),
  min_income             numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_income >= 0),
  min_employment_months  int NOT NULL DEFAULT 0 CHECK (min_employment_months >= 0),
  min_age                int NOT NULL DEFAULT 18 CHECK (min_age BETWEEN 16 AND 100),
  max_age                int CHECK (max_age IS NULL OR max_age BETWEEN 16 AND 120),
  residency              residency[] NOT NULL,
  employment_types       employment_type[] NOT NULL,
  min_term_months        int CHECK (min_term_months > 0),
  max_term_months        int CHECK (max_term_months > 0 AND max_term_months <= 480),
  min_amount             numeric(14,2) CHECK (min_amount >= 0),
  max_amount             numeric(14,2) CHECK (max_amount >= 0),
  min_down_payment_pct   numeric(5,2) CHECK (min_down_payment_pct BETWEEN 0 AND 100),
  benefits               text[] NOT NULL DEFAULT '{}',
  -- Trazabilidad: todo dato lleva fuente y fecha
  source_url             text NOT NULL,
  captured_at            date NOT NULL,
  verified_by            text NOT NULL,
  verified_at            timestamptz NOT NULL DEFAULT now(),
  citations              jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from             timestamptz NOT NULL DEFAULT now(),
  valid_to               timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version_no),
  CHECK (rate_min <= rate_max),
  CHECK (max_age IS NULL OR max_age >= min_age),
  CHECK (min_term_months IS NULL OR max_term_months IS NULL OR min_term_months <= max_term_months),
  CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (cardinality(residency) > 0 AND cardinality(employment_types) > 0)
);
-- Solo una versión vigente por producto
CREATE UNIQUE INDEX product_version_current_uq ON product_version(product_id) WHERE valid_to IS NULL;

-- Inmutabilidad: solo se permite cerrar una versión (valid_to NULL → fecha). Nunca borrar.
CREATE FUNCTION product_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product_version es inmutable: no se puede borrar (cierra la versión con valid_to)';
  END IF;
  IF OLD.valid_to IS NOT NULL THEN
    RAISE EXCEPTION 'product_version % ya está cerrada', OLD.id;
  END IF;
  IF (to_jsonb(NEW) - 'valid_to') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to') THEN
    RAISE EXCEPTION 'product_version es inmutable: crea una nueva versión en lugar de editar';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_version_guard_trg
  BEFORE UPDATE OR DELETE ON product_version
  FOR EACH ROW EXECUTE FUNCTION product_version_guard();

-- Datos comerciales: SEPARADOS. Ninguna vista/función del motor los consulta.
CREATE TABLE product_commercial (
  product_id      text PRIMARY KEY REFERENCES product(id),
  sponsored       boolean NOT NULL DEFAULT false,
  commission_pct  numeric(5,2) CHECK (commission_pct BETWEEN 0 AND 100),
  agreement_ref   text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE product_commercial IS
  'Regla de oro: nunca unir esta tabla en consultas que alimentan el ranking.';

-- ============================================================
-- Ingesta automática del catálogo
-- ============================================================
CREATE TABLE product_source (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       text REFERENCES product(id),
  institution_id   text NOT NULL REFERENCES institution(id),
  url              text NOT NULL,
  kind             source_kind NOT NULL DEFAULT 'page',
  active           boolean NOT NULL DEFAULT true,
  last_checked_at  timestamptz,
  last_hash        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, url)
);

CREATE TABLE source_snapshot (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        uuid NOT NULL REFERENCES product_source(id),
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  http_status      int,
  content_hash     text NOT NULL,
  changed          boolean NOT NULL,
  normalized_text  text  -- texto público del banco, para mostrar citas
);
CREATE INDEX source_snapshot_source_idx ON source_snapshot(source_id, fetched_at DESC);

CREATE TABLE version_proposal (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            text REFERENCES product(id),     -- NULL = producto nuevo
  institution_id        text NOT NULL REFERENCES institution(id),
  source_snapshot_id    uuid REFERENCES source_snapshot(id),
  proposed              jsonb NOT NULL,                   -- ProductDraft
  citations             jsonb NOT NULL DEFAULT '{}'::jsonb,
  diff                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk                  proposal_risk NOT NULL DEFAULT 'high',
  issues                jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                proposal_status NOT NULL DEFAULT 'pending',
  created_by            text NOT NULL DEFAULT 'ai',
  reviewed_by           text,
  reviewed_at           timestamptz,
  review_note           text,
  resulting_version_id  uuid REFERENCES product_version(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX version_proposal_pending_idx ON version_proposal(created_at) WHERE status = 'pending';

-- ============================================================
-- Usuarios y datos financieros
-- ============================================================
CREATE TABLE app_user (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  phone       text,
  locale      text NOT NULL DEFAULT 'es-PA',
  plan        plan_tier NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX app_user_email_uq ON app_user(lower(email)) WHERE deleted_at IS NULL;

-- Registro de consentimientos: solo se agregan filas (historial completo)
CREATE TABLE consent (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purpose     text NOT NULL,
  granted     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE financial_snapshot (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  net_monthly_income       numeric(12,2) NOT NULL CHECK (net_monthly_income >= 0),
  employment_type          employment_type NOT NULL,
  employment_months        int NOT NULL CHECK (employment_months >= 0),
  fixed_monthly_expenses   numeric(12,2) NOT NULL DEFAULT 0 CHECK (fixed_monthly_expenses >= 0),
  dependents               int NOT NULL DEFAULT 0 CHECK (dependents >= 0),
  age                      int NOT NULL CHECK (age BETWEEN 16 AND 120),
  residency                residency NOT NULL,
  apc_self_reported        apc_self_reported NOT NULL DEFAULT 'unknown',
  savings_for_down_payment numeric(14,2) NOT NULL DEFAULT 0 CHECK (savings_for_down_payment >= 0),
  docs_income_proof        boolean NOT NULL DEFAULT false,
  docs_employment_letter   boolean NOT NULL DEFAULT false,
  docs_apc_report          boolean NOT NULL DEFAULT false,
  field_sources            jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"net_monthly_income":"document", ...}
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_snapshot_user_idx ON financial_snapshot(user_id, created_at DESC);

CREATE TABLE debt (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id         uuid NOT NULL REFERENCES financial_snapshot(id) ON DELETE CASCADE,
  kind                debt_kind NOT NULL,
  institution         text,
  balance             numeric(14,2) NOT NULL CHECK (balance >= 0),
  credit_limit        numeric(14,2) CHECK (credit_limit >= 0),
  monthly_payment     numeric(12,2) NOT NULL CHECK (monthly_payment >= 0),
  late_payments_12m   int NOT NULL DEFAULT 0 CHECK (late_payments_12m >= 0)
);

CREATE TABLE goal (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type                 goal_type NOT NULL,
  priority             int NOT NULL CHECK (priority > 0),
  target_amount        numeric(14,2) CHECK (target_amount > 0),
  desired_term_months  int CHECK (desired_term_months > 0),
  preferences          text[] NOT NULL DEFAULT '{}',
  status               goal_status NOT NULL DEFAULT 'active',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goal_user_idx ON goal(user_id) WHERE status = 'active';

CREATE TABLE readiness_score (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id          uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  snapshot_id      uuid NOT NULL REFERENCES financial_snapshot(id) ON DELETE CASCADE,
  score            numeric(5,1) NOT NULL CHECK (score BETWEEN 0 AND 100),
  ready            boolean NOT NULL,
  breakdown        jsonb NOT NULL,   -- FactorResult[]
  weights_version  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE obstacle (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id             uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  readiness_score_id  uuid NOT NULL REFERENCES readiness_score(id) ON DELETE CASCADE,
  factor              text NOT NULL,
  impact_points       numeric(5,1) NOT NULL,
  blocking            boolean NOT NULL,
  evidence            jsonb NOT NULL,
  status              obstacle_status NOT NULL DEFAULT 'open'
);

CREATE TABLE plan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  month       date NOT NULL CHECK (extract(day FROM month) = 1),
  objective   text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, month)
);

CREATE TABLE action (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  obstacle_id  uuid REFERENCES obstacle(id) ON DELETE SET NULL,
  title        text NOT NULL,
  week_start   date NOT NULL,
  status       action_status NOT NULL DEFAULT 'pending',
  result       text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recommendation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id             uuid NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  product_version_id  uuid NOT NULL REFERENCES product_version(id),
  position            int NOT NULL CHECK (position > 0),
  score               numeric(5,1) NOT NULL,
  components          jsonb NOT NULL,
  reasons             jsonb NOT NULL,
  assumptions         jsonb NOT NULL,
  catalog_version     text NOT NULL,
  weights_version     text NOT NULL,
  input_hash          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendation_goal_idx ON recommendation(goal_id, created_at DESC);

CREATE TABLE conversation (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  goal_id     uuid REFERENCES goal(id) ON DELETE SET NULL,
  product_id  text REFERENCES product(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role             message_role NOT NULL,
  content          text NOT NULL,
  tool_calls       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_conversation_idx ON message(conversation_id, created_at);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor      text NOT NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Vistas y funciones que alimentan al motor (sin datos comerciales)
-- ============================================================
CREATE VIEW current_products AS
SELECT p.id, p.type, p.name, p.institution_id, i.name AS institution_name,
       v.id AS version_id, v.version_no, v.rate_min, v.rate_max, v.annual_fee, v.one_time_fees,
       v.min_income, v.min_employment_months, v.min_age, v.max_age, v.residency, v.employment_types,
       v.min_term_months, v.max_term_months, v.min_amount, v.max_amount, v.min_down_payment_pct,
       v.benefits, v.source_url, v.captured_at, v.verified_at,
       (now() - v.verified_at) > interval '60 days' AS stale
FROM product p
JOIN institution i ON i.id = p.institution_id
JOIN product_version v ON v.product_id = p.id AND v.valid_to IS NULL
WHERE p.active;

-- Versión del catálogo = hash de las versiones vigentes. Cambia si cambia cualquier producto.
CREATE VIEW catalog_state AS
SELECT 'cat-' || left(md5(coalesce(string_agg(version_id::text, ',' ORDER BY version_id), '')), 12) AS version,
       count(*) AS product_count
FROM current_products;

-- Productos en el formato exacto de @fg/engine (tipo Product), como jsonb.
CREATE FUNCTION engine_products(p_type goal_type DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', c.id,
    'institutionId', c.institution_id,
    'institutionName', c.institution_name,
    'type', c.type,
    'name', c.name,
    'rate', jsonb_build_object('min', c.rate_min::float8, 'max', c.rate_max::float8),
    'annualFee', c.annual_fee::float8,
    'oneTimeFees', c.one_time_fees::float8,
    'requirements', jsonb_build_object(
      'minIncome', c.min_income::float8,
      'minEmploymentMonths', c.min_employment_months,
      'minAge', c.min_age,
      'maxAge', c.max_age,
      'residency', to_jsonb(c.residency),
      'employmentTypes', to_jsonb(c.employment_types)),
    'conditions', jsonb_build_object(
      'minTermMonths', c.min_term_months,
      'maxTermMonths', c.max_term_months,
      'minAmount', c.min_amount::float8,
      'maxAmount', c.max_amount::float8,
      'minDownPaymentPct', c.min_down_payment_pct::float8),
    'benefits', to_jsonb(c.benefits),
    'source', jsonb_build_object('url', c.source_url, 'capturedAt', c.captured_at::text)
  )) ORDER BY c.id), '[]'::jsonb)
  FROM current_products c
  WHERE p_type IS NULL OR c.type = p_type;
$$;

-- Aprobar una propuesta: cierra la versión vigente y crea la nueva, en una transacción.
CREATE FUNCTION approve_proposal(p_proposal uuid, p_reviewer text, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  pr       version_proposal%ROWTYPE;
  d        jsonb;
  pid      text;
  next_no  int;
  new_id   uuid;
  ts       timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO pr FROM version_proposal WHERE id = p_proposal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'propuesta % no existe', p_proposal; END IF;
  IF pr.status <> 'pending' THEN RAISE EXCEPTION 'propuesta % ya fue %', p_proposal, pr.status; END IF;
  IF jsonb_array_length(coalesce(pr.issues, '[]')) > 0
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(pr.issues) e WHERE e->>'severity' = 'error') THEN
    RAISE EXCEPTION 'propuesta % tiene errores de validación', p_proposal;
  END IF;

  d := pr.proposed;
  pid := coalesce(pr.product_id, d->>'id');

  -- Producto nuevo
  INSERT INTO product (id, institution_id, type, name, official_url)
  VALUES (pid, pr.institution_id, (d->>'type')::goal_type, d->>'name', d->'source'->>'url')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  SELECT coalesce(max(version_no), 0) + 1 INTO next_no FROM product_version WHERE product_id = pid;
  UPDATE product_version SET valid_to = ts WHERE product_id = pid AND valid_to IS NULL;

  INSERT INTO product_version (
    product_id, version_no, rate_min, rate_max, annual_fee, one_time_fees,
    min_income, min_employment_months, min_age, max_age, residency, employment_types,
    min_term_months, max_term_months, min_amount, max_amount, min_down_payment_pct,
    benefits, source_url, captured_at, verified_by, citations, valid_from)
  VALUES (
    pid, next_no,
    (d->'rate'->>'min')::numeric, (d->'rate'->>'max')::numeric,
    coalesce((d->>'annualFee')::numeric, 0), coalesce((d->>'oneTimeFees')::numeric, 0),
    coalesce((d->'requirements'->>'minIncome')::numeric, 0),
    coalesce((d->'requirements'->>'minEmploymentMonths')::int, 0),
    coalesce((d->'requirements'->>'minAge')::int, 18),
    (d->'requirements'->>'maxAge')::int,
    ARRAY(SELECT jsonb_array_elements_text(d->'requirements'->'residency'))::residency[],
    ARRAY(SELECT jsonb_array_elements_text(d->'requirements'->'employmentTypes'))::employment_type[],
    (d->'conditions'->>'minTermMonths')::int, (d->'conditions'->>'maxTermMonths')::int,
    (d->'conditions'->>'minAmount')::numeric, (d->'conditions'->>'maxAmount')::numeric,
    (d->'conditions'->>'minDownPaymentPct')::numeric,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(d->'benefits', '[]'))),
    d->'source'->>'url', (d->'source'->>'capturedAt')::date,
    p_reviewer, pr.citations, ts)
  RETURNING id INTO new_id;

  UPDATE version_proposal
     SET status = 'approved', reviewed_by = p_reviewer, reviewed_at = ts,
         review_note = p_note, resulting_version_id = new_id, product_id = pid
   WHERE id = p_proposal;

  -- La fuente de la que salió la propuesta queda ligada al producto (para el rastreo periódico)
  UPDATE product_source SET product_id = pid
   WHERE product_id IS NULL
     AND id = (SELECT source_id FROM source_snapshot WHERE id = pr.source_snapshot_id);

  -- Otras propuestas pendientes del mismo producto quedan reemplazadas
  UPDATE version_proposal SET status = 'superseded'
   WHERE product_id = pid AND status = 'pending' AND id <> p_proposal;

  INSERT INTO audit_log (actor, action, entity, entity_id, data)
  VALUES (p_reviewer, 'approve_proposal', 'product_version', new_id::text,
          jsonb_build_object('proposal', p_proposal, 'product', pid, 'version_no', next_no));
  RETURN new_id;
END $$;

COMMIT;
