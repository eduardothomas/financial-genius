'use server';

import { redirect } from 'next/navigation';
import { slugify } from '@fg/catalog';
import { importFromUrl, type ImportInput } from '../../lib/catalog-service';
import { db } from '../../lib/db';
import { deps } from '../../lib/deps';

export interface ImportState {
  message?: string;
}

export async function importAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const institutionName = String(form.get('institutionName') ?? '').trim();
  const url = String(form.get('url') ?? '').trim();
  const productName = String(form.get('productName') ?? '').trim() || undefined;
  const type = String(form.get('type')) as ImportInput['type'];
  const productId = String(form.get('productId') ?? '').trim() || undefined;
  if (!institutionName || !/^https?:\/\//.test(url)) return { message: 'Indica el banco y una URL válida.' };

  const result = await importFromUrl(
    db,
    {
      institutionId: slugify(institutionName.replace(/^banco\s+/i, '')),
      institutionName,
      url,
      type,
      productName,
      productId,
      force: form.get('force') === 'on',
    },
    deps(),
  );
  if (result.status === 'proposed') redirect(`/propuestas/${result.proposalId}`);
  if (result.status === 'unchanged') return { message: 'La página no cambió desde la última revisión. No hay nada que proponer.' };
  return { message: `No se pudo descargar la página (HTTP ${result.httpStatus}).` };
}
