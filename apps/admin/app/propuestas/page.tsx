import { listProposals } from '../../lib/catalog-service';
import { db } from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const rows = await listProposals(db);
  return (
    <>
      <h1>Propuestas pendientes</h1>
      <p className="sub">{rows.length === 0 ? 'No hay nada por revisar.' : `${rows.length} por revisar · primero las de alto riesgo`}</p>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Producto</th><th>Riesgo</th><th>Cambios</th><th>Problemas</th><th>Creada</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const errors = p.issues.filter((i) => i.severity === 'error').length;
              return (
                <tr key={p.id}>
                  <td>
                    <a href={`/propuestas/${p.id}`}>
                      {'name' in p.proposed ? p.proposed.name : '(sin borrador)'}
                    </a>
                    <br />
                    <span className="sub">{p.product_id ? `Actualiza ${p.product_id}` : 'Producto nuevo'}</span>
                  </td>
                  <td><span className={`badge ${p.risk}`}>{p.risk === 'high' ? 'alto' : 'bajo'}</span></td>
                  <td className="num">{p.diff.length}</td>
                  <td>{errors > 0 ? <span className="badge high">{errors} error(es)</span> : `${p.issues.length} aviso(s)`}</td>
                  <td>{p.created_at.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
