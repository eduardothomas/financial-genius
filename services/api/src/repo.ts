/**
 * Acceso a datos de la API. Todas las consultas de un usuario filtran por user_id:
 * un recurso ajeno responde igual que uno inexistente (404).
 *
 * Los números se convierten a float8/int en SQL para que el driver `pg`
 * (que devuelve numeric como texto) y las pruebas den el mismo tipo.
 */
import type { Db } from '@fg/db';
import type { FinancialSnapshot, Goal, Product, RankingResult, ReadinessResult } from '@fg/engine';
import type { ActionPatch, ConsentInput, GoalInput, GoalPatch, SnapshotInput } from '@fg/contracts';

const one = <T>(rows: T[]): T | null => rows[0] ?? null;

// ---------- Usuarios ----------

export async function upsertUser(db: Db, subject: string, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO app_user (auth_subject, email) VALUES ($1, $2)
     ON CONFLICT (auth_subject) WHERE auth_subject IS NOT NULL DO UPDATE SET email = EXCLUDED.email
     RETURNING id::text`,
    [subject, email],
  );
  return rows[0]!.id;
}

export async function getUser(db: Db, userId: string) {
  return one(
    (
      await db.query<{ id: string; email: string; plan: string; locale: string; created_at: string; has_snapshot: boolean; goals: number }>(
        `SELECT u.id::text, u.email, u.plan::text, u.locale, u.created_at::text,
                EXISTS (SELECT 1 FROM financial_snapshot s WHERE s.user_id = u.id) AS has_snapshot,
                (SELECT count(*)::int FROM goal g WHERE g.user_id = u.id AND g.status = 'active') AS goals
           FROM app_user u WHERE u.id = $1::uuid`,
        [userId],
      )
    ).rows,
  );
}

/** Borra la cuenta y todos sus datos (cascada). Deja constancia sin datos personales. */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.query(`DELETE FROM app_user WHERE id = $1::uuid`, [userId]);
  await db.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id) VALUES ('user', 'account_deleted', 'app_user', md5($1))`,
    [userId],
  );
}

export async function addConsent(db: Db, userId: string, c: ConsentInput): Promise<void> {
  await db.query(`INSERT INTO consent (user_id, purpose, granted) VALUES ($1::uuid, $2, $3)`, [
    userId,
    c.purpose,
    c.granted,
  ]);
}

// ---------- Datos financieros ----------

export async function insertSnapshot(db: Db, userId: string, s: SnapshotInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `WITH snap AS (
       INSERT INTO financial_snapshot (
         user_id, net_monthly_income, employment_type, employment_months, fixed_monthly_expenses,
         dependents, age, residency, apc_self_reported, savings_for_down_payment,
         docs_income_proof, docs_employment_letter, docs_apc_report, field_sources)
       VALUES ($1::uuid, $2, $3::employment_type, $4, $5, $6, $7, $8::residency, $9::apc_self_reported, $10,
               $11, $12, $13, $14::jsonb)
       RETURNING id
     ), debts AS (
       INSERT INTO debt (snapshot_id, position, kind, institution, balance, credit_limit, monthly_payment, late_payments_12m)
       SELECT snap.id, e.n, (e.d->>'kind')::debt_kind, e.d->>'institution', (e.d->>'balance')::numeric,
              (e.d->>'limit')::numeric, (e.d->>'monthlyPayment')::numeric, coalesce((e.d->>'latePaymentsLast12m')::int, 0)
         FROM snap, jsonb_array_elements($15::jsonb) WITH ORDINALITY AS e(d, n)
       RETURNING 1
     )
     SELECT id::text FROM snap`,
    [
      userId, s.netMonthlyIncome, s.employmentType, s.employmentMonths, s.fixedMonthlyExpenses,
      s.dependents, s.age, s.residency, s.apcSelfReported, s.savingsForDownPayment,
      s.documents.incomeProof, s.documents.employmentLetter, s.documents.apcReport,
      JSON.stringify(s.fieldSources), JSON.stringify(s.debts),
    ],
  );
  return rows[0]!.id;
}

/** Último snapshot del usuario en el formato del motor. */
export async function latestSnapshot(db: Db, userId: string): Promise<{ id: string; createdAt: string; snapshot: FinancialSnapshot } | null> {
  const { rows } = await db.query<{ id: string; created_at: string; snapshot: FinancialSnapshot }>(
    `SELECT s.id::text, s.created_at::text, jsonb_build_object(
        'netMonthlyIncome', s.net_monthly_income::float8,
        'employmentType', s.employment_type,
        'employmentMonths', s.employment_months,
        'fixedMonthlyExpenses', s.fixed_monthly_expenses::float8,
        'dependents', s.dependents,
        'age', s.age,
        'residency', s.residency,
        'apcSelfReported', s.apc_self_reported,
        'savingsForDownPayment', s.savings_for_down_payment::float8,
        'documents', jsonb_build_object('incomeProof', s.docs_income_proof, 'employmentLetter', s.docs_employment_letter, 'apcReport', s.docs_apc_report),
        'debts', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'kind', d.kind, 'institution', d.institution, 'balance', d.balance::float8,
            'limit', d.credit_limit::float8, 'monthlyPayment', d.monthly_payment::float8,
            'latePaymentsLast12m', d.late_payments_12m)) ORDER BY d.position, d.id) FROM debt d WHERE d.snapshot_id = s.id), '[]'::jsonb)
      ) AS snapshot
       FROM financial_snapshot s
      WHERE s.user_id = $1::uuid
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 1`,
    [userId],
  );
  const r = one(rows);
  return r ? { id: r.id, createdAt: r.created_at, snapshot: r.snapshot } : null;
}

// ---------- Metas ----------

export interface GoalRow extends Goal {
  status: string;
  createdAt: string;
  readinessScore: number | null;
}

const GOAL_SELECT = `
  SELECT g.id::text, g.type::text, g.priority, g.target_amount::float8 AS "targetAmount",
         g.desired_term_months AS "desiredTermMonths", to_jsonb(g.preferences) AS preferences,
         g.status::text, g.created_at::text AS "createdAt",
         (SELECT r.score::float8 FROM readiness_score r WHERE r.goal_id = g.id ORDER BY r.created_at DESC LIMIT 1) AS "readinessScore"
    FROM goal g`;

const cleanGoal = (g: GoalRow): GoalRow => {
  const out = { ...g };
  if (out.targetAmount === null) delete out.targetAmount;
  if (out.desiredTermMonths === null) delete out.desiredTermMonths;
  return out;
};

export async function listGoals(db: Db, userId: string): Promise<GoalRow[]> {
  const { rows } = await db.query<GoalRow>(
    `${GOAL_SELECT} WHERE g.user_id = $1::uuid AND g.status <> 'abandoned' ORDER BY g.priority, g.created_at`,
    [userId],
  );
  return rows.map(cleanGoal);
}

export async function getGoal(db: Db, userId: string, goalId: string): Promise<GoalRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(goalId)) return null;
  const r = one((await db.query<GoalRow>(`${GOAL_SELECT} WHERE g.user_id = $1::uuid AND g.id = $2::uuid`, [userId, goalId])).rows);
  return r ? cleanGoal(r) : null;
}

export async function createGoal(db: Db, userId: string, g: GoalInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO goal (user_id, type, priority, target_amount, desired_term_months, preferences)
     VALUES ($1::uuid, $2::goal_type, $3, $4, $5, ARRAY(SELECT jsonb_array_elements_text($6::jsonb)))
     RETURNING id::text`,
    [userId, g.type, g.priority, g.targetAmount ?? null, g.desiredTermMonths ?? null, JSON.stringify(g.preferences)],
  );
  return rows[0]!.id;
}

export async function patchGoal(db: Db, userId: string, goalId: string, p: GoalPatch): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE goal SET
        priority            = coalesce($3, priority),
        status              = coalesce($4::goal_status, status),
        target_amount       = CASE WHEN $5 THEN $6::numeric ELSE target_amount END,
        desired_term_months = CASE WHEN $7 THEN $8::int ELSE desired_term_months END,
        preferences         = CASE WHEN $9::jsonb IS NULL THEN preferences ELSE ARRAY(SELECT jsonb_array_elements_text($9::jsonb)) END
      WHERE user_id = $1::uuid AND id = $2::uuid
      RETURNING id`,
    [
      userId, goalId, p.priority ?? null, p.status ?? null,
      'targetAmount' in p, p.targetAmount ?? null,
      'desiredTermMonths' in p, p.desiredTermMonths ?? null,
      p.preferences ? JSON.stringify(p.preferences) : null,
    ],
  );
  return rows.length > 0;
}

// ---------- Catálogo ----------

export async function catalog(db: Db, type?: string): Promise<{ version: string; products: Product[] }> {
  const { rows } = await db.query<{ version: string; products: Product[] }>(
    `SELECT (SELECT version FROM catalog_state) AS version, engine_products($1::goal_type) AS products`,
    [type ?? null],
  );
  return rows[0]!;
}

export async function catalogWithFreshness(db: Db, type?: string) {
  const { rows } = await db.query<{ id: string; stale: boolean; verified_at: string }>(
    `SELECT id, stale, verified_at::text FROM current_products WHERE $1::goal_type IS NULL OR type = $1::goal_type`,
    [type ?? null],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// ---------- Resultados del motor ----------

export async function saveReadiness(db: Db, goalId: string, snapshotId: string, r: ReadinessResult): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `WITH rs AS (
       INSERT INTO readiness_score (goal_id, snapshot_id, score, ready, breakdown, weights_version)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6) RETURNING id
     ), obs AS (
       INSERT INTO obstacle (goal_id, readiness_score_id, factor, impact_points, blocking, evidence)
       SELECT $1::uuid, rs.id, o.factor, o."impactPoints", o.blocking, o.evidence
         FROM rs, jsonb_to_recordset($7::jsonb) AS o(factor text, "impactPoints" numeric, blocking boolean, evidence jsonb)
       RETURNING 1
     )
     SELECT id::text FROM rs`,
    [goalId, snapshotId, r.score, r.readyToCompare, JSON.stringify(r.factors), r.weightsVersion, JSON.stringify(r.obstacles)],
  );
  return rows[0]!.id;
}

export async function saveRecommendations(db: Db, goalId: string, r: RankingResult): Promise<void> {
  if (r.top.length === 0) return;
  await db.query(
    `INSERT INTO recommendation (goal_id, product_version_id, position, score, components, reasons, assumptions,
                                 catalog_version, weights_version, input_hash)
     SELECT $1::uuid, c.version_id, t.position, t.score, t.components, t.reasons, t.assumptions, $3, $4, $5
       FROM jsonb_to_recordset($2::jsonb) AS t("productId" text, position int, score numeric, components jsonb, reasons jsonb, assumptions jsonb)
       JOIN current_products c ON c.id = t."productId"`,
    [goalId, JSON.stringify(r.top), r.audit.catalogVersion, r.audit.weightsVersion, r.audit.inputHash],
  );
}

// ---------- Plan y misiones ----------

export interface PlanRow {
  id: string;
  month: string;
  objective: string;
  actions: Array<{ id: string; title: string; weekStart: string; status: string; factor: string | null; result: string | null }>;
}

export async function getPlan(db: Db, userId: string, goalId: string, month: string): Promise<PlanRow | null> {
  const { rows } = await db.query<PlanRow>(
    `SELECT p.id::text, p.month::text, p.objective,
            coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', a.id::text, 'title', a.title, 'weekStart', a.week_start::text, 'status', a.status,
                'factor', o.factor, 'result', a.result) ORDER BY a.week_start, a.title)
               FROM action a LEFT JOIN obstacle o ON o.id = a.obstacle_id WHERE a.plan_id = p.id), '[]'::jsonb) AS actions
       FROM plan p JOIN goal g ON g.id = p.goal_id
      WHERE g.user_id = $1::uuid AND p.goal_id = $2::uuid AND p.month = $3::date`,
    [userId, goalId, month],
  );
  return one(rows);
}

export async function createPlan(
  db: Db,
  goalId: string,
  readinessId: string,
  plan: { month: string; objective: string; actions: Array<{ title: string; factor: string | null; weekStart: string }> },
): Promise<void> {
  await db.query(
    `WITH p AS (
       INSERT INTO plan (goal_id, month, objective) VALUES ($1::uuid, $2::date, $3) RETURNING id
     )
     INSERT INTO action (plan_id, obstacle_id, title, week_start)
     SELECT p.id,
            (SELECT o.id FROM obstacle o WHERE o.readiness_score_id = $4::uuid AND o.factor = a.factor LIMIT 1),
            a.title, a."weekStart"::date
       FROM p, jsonb_to_recordset($5::jsonb) AS a(title text, factor text, "weekStart" text)`,
    [goalId, plan.month, plan.objective, readinessId, JSON.stringify(plan.actions)],
  );
}

export async function patchAction(db: Db, userId: string, actionId: string, p: ActionPatch): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(actionId)) return false;
  const { rows } = await db.query(
    `UPDATE action a SET status = $3::action_status, result = coalesce($4, a.result), updated_at = now()
       FROM plan p JOIN goal g ON g.id = p.goal_id
      WHERE a.id = $2::uuid AND a.plan_id = p.id AND g.user_id = $1::uuid
      RETURNING a.id`,
    [userId, actionId, p.status, p.result ?? null],
  );
  return rows.length > 0;
}

// ---------- Chat ----------

export interface ChatMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: unknown[];
  createdAt: string;
}

export async function ownsConversation(db: Db, userId: string, conversationId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 AS x FROM conversation WHERE id = $1::uuid AND user_id = $2::uuid`, [conversationId, userId]);
  return rows.length > 0;
}

export async function createConversation(db: Db, userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`INSERT INTO conversation (user_id) VALUES ($1::uuid) RETURNING id::text`, [userId]);
  return rows[0]!.id;
}

/** Últimos `limit` mensajes de texto (usuario y Genio), en orden cronológico. */
export async function chatMessages(db: Db, userId: string, conversationId: string, limit = 50): Promise<ChatMessageRow[]> {
  const { rows } = await db.query<ChatMessageRow>(
    `SELECT * FROM (
       SELECT m.id::text, m.role::text, m.content, coalesce(m.tool_calls->'attachments', '[]'::jsonb) AS attachments,
              m.created_at::text AS "createdAt", m.created_at AS ts
         FROM message m JOIN conversation c ON c.id = m.conversation_id
        WHERE c.id = $1::uuid AND c.user_id = $2::uuid AND m.role IN ('user', 'assistant')
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $3) t
     ORDER BY ts, id`,
    [conversationId, userId, limit],
  );
  return rows.map(({ ts: _ts, ...r }: ChatMessageRow & { ts?: unknown }) => r);
}

export async function addChatTurn(
  db: Db,
  conversationId: string,
  userText: string,
  reply: string,
  meta: { attachments: unknown[]; trace: unknown[] },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `WITH u AS (
       INSERT INTO message (conversation_id, role, content, created_at) VALUES ($1::uuid, 'user', $2, clock_timestamp()) RETURNING 1
     )
     INSERT INTO message (conversation_id, role, content, tool_calls, created_at)
     SELECT $1::uuid, 'assistant', $3, $4::jsonb, clock_timestamp() + interval '1 millisecond' FROM u
     RETURNING id::text`,
    [conversationId, userText, reply, JSON.stringify(meta)],
  );
  return rows[0]!.id;
}

export async function listConversations(db: Db, userId: string) {
  const { rows } = await db.query<{ id: string; createdAt: string; lastMessageAt: string | null; preview: string | null }>(
    `SELECT c.id::text, c.created_at::text AS "createdAt",
            (SELECT max(m.created_at)::text FROM message m WHERE m.conversation_id = c.id) AS "lastMessageAt",
            (SELECT left(m.content, 120) FROM message m WHERE m.conversation_id = c.id AND m.role = 'user'
              ORDER BY m.created_at DESC LIMIT 1) AS preview
       FROM conversation c WHERE c.user_id = $1::uuid
      ORDER BY coalesce((SELECT max(m.created_at) FROM message m WHERE m.conversation_id = c.id), c.created_at) DESC
      LIMIT 20`,
    [userId],
  );
  return rows;
}
