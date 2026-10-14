'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { approveProposal, rejectProposal } from '../../../lib/catalog-service';
import { db } from '../../../lib/db';
import { reviewer } from '../../../lib/deps';

export async function approveAction(form: FormData) {
  const id = String(form.get('id'));
  await approveProposal(db, id, reviewer(), String(form.get('note') ?? '') || undefined);
  revalidatePath('/');
  redirect('/');
}

export async function rejectAction(form: FormData) {
  const id = String(form.get('id'));
  const note = String(form.get('note') ?? '').trim() || 'Rechazada sin nota';
  await rejectProposal(db, id, reviewer(), note);
  redirect('/propuestas');
}
