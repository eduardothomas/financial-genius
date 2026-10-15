/**
 * Modelo conversacional intercambiable. En producción: Claude (Messages API con tool use).
 * En pruebas: un modelo guionado. Sin SDK, solo fetch.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ModelRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  maxTokens: number;
}

export interface ModelResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
}

export interface ChatModel {
  complete(req: ModelRequest): Promise<ModelResponse>;
}

export interface AnthropicChatOptions {
  apiKey: string;
  /** Configurable con ANTHROPIC_MODEL. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function anthropicChatModel(opts: AnthropicChatOptions): ChatModel {
  const f = opts.fetchImpl ?? fetch;
  const model = opts.model ?? 'claude-sonnet-5-5';
  return {
    async complete(req) {
      const res = await f(`${opts.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages,
          tools: req.tools,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as { content?: ContentBlock[]; stop_reason?: string };
      return { content: data.content ?? [], stopReason: data.stop_reason ?? 'end_turn' };
    },
  };
}
