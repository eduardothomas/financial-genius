import { htmlToText } from './text.js';

/**
 * Descarga una fuente pública (página del banco) y devuelve texto plano.
 * PDFs: devolver el texto con un extractor de PDF (pendiente; ver README).
 */
export async function fetchSourceText(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; text: string; contentType: string }> {
  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'FinancialGeniusBot/0.1 (+contacto: ver sitio)', accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    return { status: res.status, text: '', contentType };
  }
  const body = await res.text();
  return { status: res.status, text: contentType.includes('html') ? htmlToText(body) : body, contentType };
}
