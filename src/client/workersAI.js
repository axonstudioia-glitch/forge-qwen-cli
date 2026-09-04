const API_BASE = 'https://api.cloudflare.com/client/v4';

class WorkersAIError extends Error {
  constructor(message, { status, code, retryable = false } = {}) {
    super(message);
    this.name = 'WorkersAIError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function backoff(attempt) {
  const ms = Math.min(1000 * 2 ** attempt, 8000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Llama al endpoint de chat completions de Cloudflare Workers AI con
 * definiciones de herramientas (tool calling). Reintenta con backoff
 * exponencial en errores de red, 5xx y 429 — nunca en errores 4xx de
 * configuración (credenciales inválidas, modelo no disponible, etc.),
 * que no se arreglan reintentando.
 */
async function runChat({ accountId, apiToken, model, messages, tools, maxRetries = 2 }) {
  if (!accountId || !apiToken) {
    throw new WorkersAIError(
      'Faltan credenciales de Cloudflare. Corre "forge-qwen setup" o define CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN.',
      { retryable: false }
    );
  }

  const url = `${API_BASE}/accounts/${accountId}/ai/run/${model}`;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages, tools }),
      });
    } catch (networkErr) {
      lastError = new WorkersAIError(`No se pudo contactar a Cloudflare Workers AI: ${networkErr.message}`, {
        retryable: true,
      });
      if (attempt < maxRetries) await backoff(attempt);
      continue;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      lastError = new WorkersAIError(`Cloudflare devolvió una respuesta no válida (HTTP ${response.status}).`, {
        status: response.status,
        retryable: response.status >= 500,
      });
      if (!lastError.retryable || attempt >= maxRetries) throw lastError;
      await backoff(attempt);
      continue;
    }

    if (!response.ok || payload.success === false) {
      const apiError = payload.errors?.[0];
      const retryable = response.status >= 500 || response.status === 429;
      lastError = new WorkersAIError(
        apiError
          ? `Cloudflare Workers AI: ${apiError.message} (code ${apiError.code})`
          : `Cloudflare Workers AI respondió con error (HTTP ${response.status}).`,
        { status: response.status, code: apiError?.code, retryable }
      );
      if (!retryable || attempt >= maxRetries) throw lastError;
      await backoff(attempt);
      continue;
    }

    const message = payload.result?.choices?.[0]?.message;
    if (!message) {
      lastError = new WorkersAIError('Cloudflare Workers AI respondió sin un mensaje utilizable.', { retryable: true });
      if (attempt >= maxRetries) throw lastError;
      await backoff(attempt);
      continue;
    }

    return { message, usage: payload.result?.usage };
  }

  throw lastError || new WorkersAIError('Falló la llamada a Cloudflare Workers AI tras varios intentos.');
}

export { runChat, WorkersAIError };
