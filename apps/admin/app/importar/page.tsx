'use client';

import { useActionState } from 'react';
import { importAction, type ImportState } from './actions';

export default function ImportPage() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, {});
  return (
    <>
      <h1>Importar desde URL</h1>
      <p className="sub">
        Pega la página oficial del producto. La IA propone la ficha con citas de la página; tú la revisas y apruebas.
      </p>
      <form action={action} className="card">
        <div className="grid2">
          <div>
            <label htmlFor="institutionName">Banco</label>
            <input id="institutionName" name="institutionName" placeholder="Banco Ejemplo" required />
          </div>
          <div>
            <label htmlFor="type">Tipo de producto</label>
            <select id="type" name="type" defaultValue="credit_card">
              <option value="credit_card">Tarjeta de crédito</option>
              <option value="auto_loan">Préstamo de auto</option>
              <option value="mortgage">Hipoteca</option>
            </select>
          </div>
        </div>
        <label htmlFor="url">URL oficial del producto</label>
        <input id="url" name="url" type="url" placeholder="https://..." required />
        <div className="grid2">
          <div>
            <label htmlFor="productName">Nombre del producto (opcional)</label>
            <input id="productName" name="productName" placeholder="Tarjeta Clásica" />
          </div>
          <div>
            <label htmlFor="productId">ID de un producto existente (para actualizarlo)</label>
            <input id="productId" name="productId" placeholder="banco-tarjeta-clasica" />
          </div>
        </div>
        <label>
          <input type="checkbox" name="force" style={{ width: 'auto', marginRight: 8 }} />
          Proponer aunque la página no haya cambiado
        </label>
        <button type="submit" disabled={pending}>{pending ? 'Leyendo la página…' : 'Proponer ficha'}</button>
        {state.message && <p className="issue warning">{state.message}</p>}
      </form>
    </>
  );
}
