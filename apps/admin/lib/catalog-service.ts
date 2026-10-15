/**
 * Lógica del panel admin del catálogo. Independiente de Next.js:
 * recibe un `Db` (pg Pool en producción) y las dependencias externas (IA, fetch).
 */
import {
  detectChange,
  fetchSourceText,
  proposeFromSource,
  slugify,
  type Extractor,
  type ProductDraft,
} from '@fg/catalog';

import type { Db } from '@fg/db';
export type { Db };

export interface Deps {
  extractor: Extractor;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface CatalogRow {
  id: string;
  type: string;
  name: string;
  institution_name: string;
  version_no: number;
  rate_min: string;
  rate_max: string;
  min_income: string;
  source_url: string;
  captured_at: string;
  verified_at: string;
  stale: boolean;
  pending_proposals: number;
}

export async function listCatalog(db: Db): Promise<CatalogRow[]> {
  const { rows } = await db.query<CatalogRow>(
    `SELECT c.id, c.type::text, c.name, c.institution_name, c.version_no,
            c.rate_min::text, c.rate_max::text, c.min_income::text,
            c.source_url, c.captured_at::text, c.verified_at::text, c.stale,
            (SELECT count(*)::int FROM version_proposal vp WHERE vp.product_id = c.id AND vp.status = 'pending') AS pending_proposals
       FROM current_products c
      ORDER BY c.type, c.institution_name, c.name`,
  );
  return rows;
}

export interface ProposalRow {
  id: string;
  product_id: string | null;
  institution_id: string;
  proposed: ProductDraft | Record<string, never>;
  citations: Record<string, string>;
  diff: Array<{ field: string; before: unknown; after: unknown; risk: 'low' | 'high' }>;
  risk: 'low' | 'high';
  issues: Array<{ field: string; severity: 'error' | 'warning'; message: string }>;
  status: string;
  created_at: string;
  source_url: string | null;
}

const PROPOSAL_SELECT = `
  SELECT vp.id, vp.product_id, vp.institution_id, vp.proposed, vp.citations, vp.diff, vp.risk::text,
         vp.issues, vp.status::text, vp.created_at::text, ps.url AS source_url
    FROM version_proposal vp
    LEFT JOIN source_snapshot ss ON ss.id = vp.source_snapshot_id
    LEFT JOIN product_source ps ON ps.id = ss.source_id`;

export async function listProposals(db: Db, status = 'pending'): Promise<ProposalRow[]> {
  const { rows } = await db.query<ProposalRow>(
    `${PROPOSAL_SELECT} WHERE vp.status = $1::proposal_status ORDER BY vp.risk DESC, vp.created_at`,
    [status],
  );
  return rows;
}

export async function getProposal(db: Db, id: string): Promise<ProposalRow | null> {
  const { rows } = await db.query<ProposalRow>(`${PROPOSAL_SELECT} WHERE vp.id = $1::uuid`, [id]);
  return rows[0] ?? null;
}

async function currentDraft(db: Db, productId: string): Promise<ProductDraft | null> {
  const { rows } = await db.query<{ p: ProductDraft | null }>(
    `SELECT (SELECT e FROM jsonb_array_elements(engine_products()) e WHERE e->>'id' = $1) AS p`,
    [productId],
  );
  return rows[0]?.p ?? null;
}

export interface ImportInput {
  institutionId: string;
  institutionName: string;
  url: string;
  type: 'credit_card' | 'auto_loan' | 'mortgage';
  productName?: string;
  /** Si no viene, se arma con banco + nombre. */
  productId?: string;
  /** Forzar propuesta aunque la fuente no haya cambiado. */
  force?: boolean;
}

export type ImportResult =
  | { status: 'unchanged'; sourceId: string }
  | { status: 'proposed'; proposalId: string; approvable: boolean; risk: 'low' | 'high'; issues: number }
  | { status: 'fetch_failed'; httpStatus: number };

/**
 * "Pega una URL": descarga la fuente, detecta cambios, pide a la IA la ficha,
 * valida, compara con la versión vigente y guarda una propuesta pendiente.
 */
export async function importFromUrl(db: Db, input: ImportInput, deps: Deps): Promise<ImportResult> {
  const now = deps.now?.() ?? new Date();
  const productId = input.productId ?? slugify(`${input.institutionId}-${input.productName ?? input.type}`);

  await db.query(`INSERT INTO institution (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [
    input.institutionId,
    input.institutionName,
  ]);
  const productExists =
    (await db.query(`SELECT 1 AS x FROM product WHERE id = $1`, [productId])).rows.length > 0;

  const { rows: src } = await db.query<{ id: string; last_hash: string | null }>(
    `INSERT INTO product_source (product_id, institution_id, url)
     VALUES ($1, $2, $3)
     ON CONFLICT (institution_id, url) DO UPDATE SET product_id = coalesce(product_source.product_id, EXCLUDED.product_id)
     RETURNING id::text, last_hash`,
    [productExists ? productId : null, input.institutionId, input.url],
  );
  const source = src[0]!;

  const fetched = await fetchSourceText(input.url, deps.fetchImpl);
  if (fetched.status >= 400 || !fetched.text) {
    await db.query(`UPDATE product_source SET last_checked_at = $2::timestamptz WHERE id = $1::uuid`, [
      source.id,
      now.toISOString(),
    ]);
    return { status: 'fetch_failed', httpStatus: fetched.status };
  }

  const change = detectChange(source.last_hash, fetched.text);
  const { rows: snap } = await db.query<{ id: string }>(
    `INSERT INTO source_snapshot (source_id, fetched_at, http_status, content_hash, changed, normalized_text)
     VALUES ($1::uuid, $2::timestamptz, $3, $4, $5, $6) RETURNING id::text`,
    [source.id, now.toISOString(), fetched.status, change.hash, change.changed, fetched.text],
  );
  await db.query(
    `UPDATE product_source SET last_hash = $2, last_checked_at = $3::timestamptz WHERE id = $1::uuid`,
    [source.id, change.hash, now.toISOString()],
  );

  const current = productExists ? await currentDraft(db, productId) : null;
  if (!change.changed && current && !input.force) return { status: 'unchanged', sourceId: source.id };

  const proposal = await proposeFromSource({
    extractor: deps.extractor,
    sourceText: fetched.text,
    current,
    context: {
      id: productId,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      sourceUrl: input.url,
      capturedAt: now.toISOString().slice(0, 10),
    },
    hint: { productName: input.productName, type: input.type },
  });

  const { rows: ins } = await db.query<{ id: string }>(
    `INSERT INTO version_proposal (product_id, institution_id, source_snapshot_id, proposed, citations, diff, risk, issues, created_by)
     VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, $6::jsonb, $7::proposal_risk, $8::jsonb, 'ai')
     RETURNING id::text`,
    [
      productExists ? productId : null,
      input.institutionId,
      snap[0]!.id,
      JSON.stringify(proposal.proposed ?? {}),
      JSON.stringify(proposal.citations),
      JSON.stringify(proposal.diff),
      proposal.risk,
      JSON.stringify(proposal.issues),
    ],
  );
  return {
    status: 'proposed',
    proposalId: ins[0]!.id,
    approvable: proposal.approvable,
    risk: proposal.risk,
    issues: proposal.issues.length,
  };
}

export async function approveProposal(db: Db, id: string, reviewer: string, note?: string): Promise<string> {
  const { rows } = await db.query<{ v: string }>(`SELECT approve_proposal($1::uuid, $2, $3)::text AS v`, [
    id,
    reviewer,
    note ?? null,
  ]);
  return rows[0]!.v;
}

export async function rejectProposal(db: Db, id: string, reviewer: string, note: string): Promise<void> {
  const { rows } = await db.query(
    `UPDATE version_proposal SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3
      WHERE id = $1::uuid AND status = 'pending' RETURNING id`,
    [id, reviewer, note],
  );
  if (rows.length === 0) throw new Error('La propuesta no existe o ya fue revisada');
}

/**
 * Job de V2: revisa todas las fuentes activas de productos existentes.
 * Solo crea propuestas cuando la página cambió.
 */
export async function recheckAllSources(db: Db, deps: Deps): Promise<ImportResult[]> {
  const { rows } = await db.query<{
    url: string; institution_id: string; institution_name: string; product_id: string; type: ImportInput['type']; name: string;
  }>(
    `SELECT ps.url, ps.institution_id, i.name AS institution_name, p.id AS product_id, p.type::text, p.name
       FROM product_source ps
       JOIN product p ON p.id = ps.product_id
       JOIN institution i ON i.id = ps.institution_id
      WHERE ps.active AND p.active
      ORDER BY ps.last_checked_at NULLS FIRST`,
  );
  const out: ImportResult[] = [];
  for (const r of rows) {
    out.push(
      await importFromUrl(
        db,
        { institutionId: r.institution_id, institutionName: r.institution_name, url: r.url, type: r.type, productId: r.product_id, productName: r.name },
        deps,
      ),
    );
  }
  return out;
}
