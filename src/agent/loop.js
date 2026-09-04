import { runChat, WorkersAIError } from '../client/workersAI.js';
import { TOOL_DEFINITIONS, WRITE_TOOLS } from '../tools/definitions.js';

const SYSTEM_PROMPT =
  'Eres Forge-Qwen, un agente de terminal de Axon Studio. Ayudas con tareas de código: leer y editar ' +
  'archivos, correr comandos, y buscar texto en un proyecto. Usa las herramientas disponibles para completar ' +
  'la tarea del usuario paso a paso. Cuando termines, responde con un resumen claro de lo que hiciste. ' +
  'Sé directo, sin relleno. Responde en español.';

const MAX_TURNS = 20;

/**
 * Bucle del agente — la "lógica del agente" separada de la "capa de
 * ejecución" (sección 6 del brief). No sabe nada de terminal/filesystem
 * directamente: recibe `executeTool` y `confirmTool` inyectados, para poder
 * reutilizarse con otra capa de ejecución en el futuro (Fase 2: GitHub API)
 * sin reescribir esta lógica.
 */
async function runAgent({ task, accountId, apiToken, model, executeTool, confirmTool, onEvent = () => {} }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: task },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      response = await runChat({ accountId, apiToken, model, messages, tools: TOOL_DEFINITIONS });
    } catch (err) {
      if (err instanceof WorkersAIError) {
        onEvent({ type: 'error', message: err.message });
        return { ok: false, error: err.message, messages };
      }
      throw err;
    }

    const { message } = response;
    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      onEvent({ type: 'final', content: message.content });
      return { ok: true, content: message.content, messages };
    }

    for (const call of message.tool_calls) {
      const name = call.function.name;
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: `Error: argumentos inválidos (no es JSON) para ${name}.` });
        continue;
      }

      onEvent({ type: 'tool_call', name, args });

      if (WRITE_TOOLS.has(name)) {
        const approved = await confirmTool(name, args);
        if (!approved) {
          onEvent({ type: 'tool_denied', name, args });
          messages.push({ role: 'tool', tool_call_id: call.id, content: 'El usuario NO aprobó esta acción. No se ejecutó.' });
          continue;
        }
      }

      let result;
      try {
        result = await executeTool(name, args);
      } catch (err) {
        result = `Error ejecutando ${name}: ${err.message}`;
      }

      onEvent({ type: 'tool_result', name, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }
  }

  onEvent({ type: 'error', message: `Se alcanzó el límite de ${MAX_TURNS} turnos sin una respuesta final.` });
  return { ok: false, error: 'max_turns_reached', messages };
}

export { runAgent, SYSTEM_PROMPT, MAX_TURNS };
