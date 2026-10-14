import { listCatalog } from '../lib/catalog-service';
import { db } from '../lib/db';
import { TYPE_LABEL } from '../lib/labels';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const rows = await listCatalog(db);
  const stale = rows.filter((r) => r.stale).length;
  return (
    <>
      <h1>Productos vigentes</h1>
      <p className="sub">
        {rows.length} productos · {stale} sin revisar en más de 60 días
      </p>
      <table>
        <thead>
          <tr>
            <th>Producto</th><th>Tipo</th><th className="num">Tasa</th><th className="num">Ingreso mín.</th>
            <th>Versión</th><th>Revisado</th><th>Fuente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                <br />
                <span className="sub">{r.institution_name}</span>
              </td>
              <td>{TYPE_LABEL[r.type] ?? r.type}</td>
              <td className="num">{Number(r.rate_min)}%–{Number(r.rate_max)}%</td>
              <td className="num">B/. {Number(r.min_income).toLocaleString('es-PA')}</td>
              <td>
                v{r.version_no}
                {r.pending_proposals > 0 && (
                  <>
                    {' '}
                    <a href="/propuestas" className="badge high">{r.pending_proposals} pendiente</a>
                  </>
                )}
              </td>
              <td>
                {r.verified_at.slice(0, 10)} {r.stale && <span className="badge stale">desactualizado</span>}
              </td>
              <td>
                <a href={r.source_url} target="_blank" rel="noreferrer">ver</a> · {r.captured_at}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
