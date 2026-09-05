import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Lee, en vivo y en cada arranque, el documento de contexto de Axon desde
// Google Drive vía rclone — pedido en Atlas-Brief-AxonInterno-ForgeQwen-
// Fase1_5-ContextoDriveCloudflareGithub-05Sep2026, sección 1. A propósito
// NUNCA se copia/pega ese contenido dentro del código de forge-qwen-cli: si
// el protocolo cambia en Drive, esta función lo recoge solo, sin tocar el
// repo.
//
// `driveRemote`/`protocolPath` se configuran en ~/.forge-qwen/config.json
// (ver src/config/config.js, getDriveContextConfig). Quedan sin valor por
// default: al 05-sep-2026 el documento que el brief original nombraba vivía
// en una carpeta marcada OBSOLETO, así que no se hardcodea ninguna ruta
// hasta que el equipo de Axon (Dewey/Atlas) confirme cuál es la fuente
// vigente — ver README, sección "Contexto de Axon".
//
// Devuelve SIEMPRE un resultado explícito, nunca lanza: quien llama decide
// qué avisar al usuario. No hay ruta de "fallar en silencio" — sección
// 1.4 del brief lo exige.
async function loadAxonContext({ driveRemote, protocolPath }) {
  if (!driveRemote || !protocolPath) {
    return {
      ok: false,
      reason: 'not_configured',
      message:
        'No hay driveRemote/protocolPath configurados en ~/.forge-qwen/config.json — ' +
        'operando SIN contexto de Axon Studio.',
    };
  }

  const target = `${driveRemote}:${protocolPath}`;

  try {
    const { stdout } = await execFileAsync('rclone', ['cat', target], {
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const content = stdout.trim();
    if (!content) {
      return {
        ok: false,
        reason: 'empty',
        message: `rclone leyó "${target}" pero vino vacío — operando SIN contexto de Axon Studio.`,
      };
    }
    return { ok: true, content, source: target };
  } catch (err) {
    const detail = err.code === 'ENOENT' ? 'rclone no está instalado o no está en el PATH' : err.stderr || err.message;
    return {
      ok: false,
      reason: 'read_failed',
      message: `No se pudo leer "${target}" con rclone (${detail}) — operando SIN contexto de Axon Studio.`,
    };
  }
}

export { loadAxonContext };
