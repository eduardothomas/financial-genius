import { createHash } from 'node:crypto';

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ',
  '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&Ntilde;': 'Ñ',
};

/** HTML → texto plano legible (quita scripts, estilos, etiquetas y entidades). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, (e) => ENTITIES[e] ?? (e.startsWith('&#') ? String.fromCharCode(Number(e.slice(2, -1))) : ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Normaliza texto para comparar y buscar citas: minúsculas, sin espacios repetidos,
 * comillas y guiones unificados. NO quita acentos ni números.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Detección de cambios: hash del texto normalizado contra el último hash guardado. */
export function detectChange(previousHash: string | null, text: string): { hash: string; changed: boolean } {
  const hash = sha256(normalizeText(text));
  return { hash, changed: previousHash !== hash };
}

/** Un producto sin revisión en `days` días se marca como posiblemente desactualizado. */
export function isStale(verifiedAt: Date | string, now: Date, days = 60): boolean {
  const t = typeof verifiedAt === 'string' ? Date.parse(verifiedAt) : verifiedAt.getTime();
  return now.getTime() - t > days * 86_400_000;
}
