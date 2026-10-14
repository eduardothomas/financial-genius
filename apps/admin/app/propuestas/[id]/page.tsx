import { notFound } from 'next/navigation';
import { getProposal } from '../../../lib/catalog-service';
import { db } from '../../../lib/db';
import { label, show } from '../../../lib/labels';
import { approveAction, rejectAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProposal(db, id);
  if (!p) notFound();
  const errors = p.issues.filter((i) => i.severity === 'error');
  const warnings = p.issues.filter((i) => i.severity === 'warning');
  const name = 'name' in p.proposed ? p.proposed.name : '(sin borrador)';
  const pending = p.status === 'pending';

  return (
    <>
      <h1>{name}</h1>
      <p className="sub">
        {p.product_id ? `Actualiza ${p.product_id}` : 'Producto nuevo'} · riesgo{' '}
        <span className={`badge ${p.risk}`}>{p.risk === 'high' ? 'alto' : 'bajo'}</span> · estado {p.status}
        {p.source_url && (
          <>
            {' · '}
            <a href={p.source_url} target="_blank" rel="noreferrer">abrir la fuente</a>
          </>
        )}
      </p>

      {errors.map((i, k) => (
        <div key={`e${k}`} className="issue error"><strong>{label(i.field)}:</strong> {i.message}</div>
      ))}
      {warnings.map((i, k) => (
        <div key={`w${k}`} className="issue warning"><strong>{label(i.field)}:</strong> {i.message}</div>
      ))}

      <h2>Cambios propuestos</h2>
      <table>
        <thead>
          <tr><th>Campo</th><th>Antes</th><th>Propuesto</th><th>Cita de la fuente</th></tr>
        </thead>
        <tbody>
          {p.diff.map((d) => (
            <tr key={d.field}>
              <td>
                {label(d.field)} {d.risk === 'high' && <span className="badge high">alto</span>}
              </td>
              <td className="num">{show(d.before)}</td>
              <td className="num"><strong>{show(d.after)}</strong></td>
              <td>{p.citations[d.field] ? <q>{p.citations[d.field]}</q> : <span className="sub">sin cita</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {pending && (
        <form className="card" style={{ marginTop: 20 }}>
          <input type="hidden" name="id" value={p.id} />
          <label htmlFor="note">Nota de revisión (opcional al aprobar, recomendada al rechazar)</label>
          <textarea id="note" name="note" rows={2} />
          <div className="row">
            <button formAction={approveAction} disabled={errors.length > 0}>Aprobar y publicar</button>
            <button formAction={rejectAction} className="secondary">Rechazar</button>
          </div>
          {errors.length > 0 && <p className="sub">Hay errores: no se puede aprobar. Corrige la fuente o recházala.</p>}
        </form>
      )}
    </>
  );
}
