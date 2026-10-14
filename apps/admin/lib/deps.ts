import { anthropicExtractor } from '@fg/catalog';
import type { Deps } from './catalog-service';

export function deps(): Deps {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY en .env.local');
  return { extractor: anthropicExtractor({ apiKey, model: process.env.ANTHROPIC_MODEL || undefined }) };
}

/** Quién revisa: por ahora el usuario de la autenticación básica. */
export const reviewer = () => process.env.ADMIN_USER ?? 'admin';
