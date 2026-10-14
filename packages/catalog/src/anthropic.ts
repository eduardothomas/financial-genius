import type { Extractor, ExtractionInput } from './extraction.js';

/**
 * Extractor con la API de Claude (Messages API + tool use forzado para salida estructurada).
 * Sin SDK: solo fetch, para no agregar dependencias. `fetchImpl` permite probar sin red.
 */
export interface AnthropicExtractorOptions {
  apiKey: string;
  /** Configurable por variable de entorno ANTHROPIC_MODEL. */
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export const TOOL_NAME = 'record_product';

export function anthropicExtractor(opts: AnthropicExtractorOptions): Extractor {
  const f = opts.fetchImpl ?? fetch;
  const model = opts.model ?? 'claude-sonnet-5-5';
  return {
    async extract(input: ExtractionInput): Promise<unknown> {
      const res = await f(`${opts.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 2048,
          system: input.system,
          messages: [{ role: 'user', content: input.user }],
          tools: [
            {
              name: TOOL_NAME,
              description: 'Registra las condiciones del producto tal como aparecen en la fuente.',
              input_schema: input.schema,
            },
          ],
          tool_choice: { type: 'tool', name: TOOL_NAME },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
      const block = data.content?.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
      if (!block) throw new Error('La respuesta no trae la herramienta record_product');
      return block.input;
    },
  };
}
