/**
 * El Genio: bucle de conversación con herramientas.
 * El modelo conversa y explica; los números salen siempre de las herramientas (motor + catálogo).
 */
import type { Services } from '../services.js';
import type { ChatMessage, ChatModel, ContentBlock } from './model.js';
import { runTool, TOOL_DEFS, type Attachment } from './tools.js';

export const MAX_TOOL_ROUNDS = 6;

export function systemPrompt(today: Date): string {
  const fecha = today.toISOString().slice(0, 10);
  return `Eres el Genio Financiero de Panamá: ayudas a una persona a prepararse para conseguir una tarjeta de crédito, un préstamo de auto o una hipoteca, y a elegir dónde aplicar cuando esté lista.

Hoy es ${fecha}. Hablas en español de Panamá, cálido y directo. Respuestas cortas (2 a 6 oraciones, o una lista breve). Una pregunta a la vez.

Reglas:
- Usa las herramientas para cualquier dato del usuario o del mercado. Nunca inventes tasas, cuotas, requisitos ni políticas de bancos: si no está en una herramienta, di que no lo sabes.
- El índice de preparación es nuestro (0–100, se recomienda aplicar desde 70). No es el score de la APC; dilo así si hace falta.
- Nunca prometas aprobación: la decisión es del banco. Sugiere confirmar tasa y requisitos con el banco.
- Explica el top 3 con sus razones y supuestos. Si "listoParaComparar" es false, dilo primero y orienta al plan del mes.
- Códigos de razones: lowest_cost (el más barato de los elegibles), low_cost (de los más baratos), comfortable_requirements / tight_requirements (holgura frente al ingreso mínimo), matches_preferences, affordable_payment / tight_payment (cuota frente a la capacidad de pago), no_annual_fee, higher_down_payment (pide más abono que otras opciones).
- Montos en balboas con el formato B/. 1,500.
- Si falta el perfil financiero, pide completarlo en la pestaña Perfil (no lo pidas por chat).
- Crea metas o marca misiones solo si el usuario lo pide claramente.
- No des asesoría legal ni de inversiones; no pidas contraseñas, números de tarjeta ni cédula.
- Ningún banco paga por aparecer ni por su posición: si preguntan, explícalo.`;
}

export interface TurnResult {
  reply: string;
  attachments: Attachment[];
  trace: Array<{ tool: string; input: Record<string, unknown>; error: boolean }>;
}

/**
 * Ejecuta un turno: historial (solo texto) + mensaje nuevo → respuesta final del Genio.
 */
export async function runTurn(args: {
  model: ChatModel;
  svc: Services;
  userId: string;
  history: ChatMessage[];
  message: string;
  today: Date;
}): Promise<TurnResult> {
  const messages: ChatMessage[] = [...args.history, { role: 'user', content: args.message }];
  const attachments: Attachment[] = [];
  const trace: TurnResult['trace'] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await args.model.complete({
      system: systemPrompt(args.today),
      messages,
      tools: round < MAX_TOOL_ROUNDS ? TOOL_DEFS : [],
      maxTokens: 1024,
    });
    const uses = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    const text = res.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (uses.length === 0 || res.stopReason !== 'tool_use') {
      return { reply: text || 'Perdona, no pude completar la respuesta. ¿Lo intentamos de nuevo?', attachments: dedupe(attachments), trace };
    }

    messages.push({ role: 'assistant', content: res.content });
    const results: ContentBlock[] = [];
    for (const u of uses) {
      const out = await runTool(args.svc, args.userId, u.name, u.input ?? {});
      trace.push({ tool: u.name, input: u.input ?? {}, error: out.isError });
      if (out.attachment) attachments.push(out.attachment);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Perdona, me enredé consultando tus datos. ¿Puedes repetir la pregunta?', attachments: dedupe(attachments), trace };
}

/** Si una tarjeta se repite (misma meta y tipo), queda la última. */
function dedupe(list: Attachment[]): Attachment[] {
  const map = new Map<string, Attachment>();
  for (const a of list) map.set(`${a.type}:${a.goalId}`, a);
  return [...map.values()];
}
