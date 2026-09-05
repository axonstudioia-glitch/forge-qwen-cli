#!/usr/bin/env node
import readline from 'node:readline';
import { runAgent } from '../src/agent/loop.js';
import { EXECUTORS } from '../src/execution/local.js';
import { confirmAction } from '../src/security/confirm.js';
import { getCredentials, getModel, getDriveContextConfig, loadConfig, saveConfig, saveSessionEntry, CONFIG_FILE } from '../src/config/config.js';
import { loadAxonContext } from '../src/context/axonProtocol.js';

async function setupCommand() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log(`Configuración de Forge-Qwen — se guarda en ${CONFIG_FILE}`);
  const accountId = await ask('CLOUDFLARE_ACCOUNT_ID: ');
  const apiToken = await ask('CLOUDFLARE_API_TOKEN (permiso Workers AI:Edit): ');
  rl.close();

  const config = loadConfig();
  config.accountId = accountId.trim();
  config.apiToken = apiToken.trim();
  saveConfig(config);
  console.log('Listo. Configuración guardada.');
}

async function setupDriveCommand() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log(
    'Configuración del contexto de Axon Studio (Fase 1.5) — requiere rclone ya\n' +
      'configurado con un remote hacia el Drive de Axon (rclone config, una sola\n' +
      'vez, fuera de este comando). Deja en blanco para no configurar nada todavía.'
  );
  const driveRemote = await ask('Nombre del remote de rclone (ej. axon-drive): ');
  const protocolPath = await ask('Ruta dentro del remote al documento de contexto: ');
  rl.close();

  const config = loadConfig();
  config.driveRemote = driveRemote.trim() || undefined;
  config.protocolPath = protocolPath.trim() || undefined;
  saveConfig(config);
  console.log(
    config.driveRemote && config.protocolPath
      ? 'Listo. forge-qwen intentará leer ese documento al arrancar cada tarea.'
      : 'Sin configurar — forge-qwen seguirá avisando explícitamente que opera sin contexto de Axon.'
  );
}

async function executeTool(name, args) {
  const executor = EXECUTORS[name];
  if (!executor) throw new Error(`Herramienta desconocida: ${name}`);
  return executor(args);
}

async function taskCommand(task) {
  const { accountId, apiToken } = getCredentials();
  if (!accountId || !apiToken) {
    console.error('Faltan credenciales. Corre: forge-qwen setup');
    process.exitCode = 1;
    return;
  }
  const model = getModel();

  console.log(`\nForge-Qwen (${model})\nTarea: ${task}\n`);

  // Contexto de Axon Studio (Fase 1.5) — se intenta SIEMPRE al arrancar, y
  // si falla se avisa explícito, nunca en silencio (sección 1.4 del brief).
  const axonResult = await loadAxonContext(getDriveContextConfig());
  if (!axonResult.ok) {
    console.warn(`⚠️  ${axonResult.message}`);
  } else {
    console.log(`Contexto de Axon Studio cargado desde ${axonResult.source}.`);
  }

  const result = await runAgent({
    task,
    accountId,
    apiToken,
    model,
    executeTool,
    confirmTool: confirmAction,
    axonContext: axonResult.ok ? axonResult.content : null,
    onEvent: (event) => {
      if (event.type === 'tool_call') {
        console.log(`\n→ Herramienta: ${event.name}(${JSON.stringify(event.args)})`);
      } else if (event.type === 'tool_denied') {
        console.log('  ✗ Cancelado por el usuario.');
      } else if (event.type === 'tool_result') {
        const text = String(event.result);
        const preview = text.slice(0, 500);
        console.log(`  ✓ Resultado: ${preview}${text.length > 500 ? '…' : ''}`);
      } else if (event.type === 'final') {
        console.log(`\n${event.content}\n`);
      } else if (event.type === 'error') {
        console.error(`\nError: ${event.message}`);
      }
    },
  });

  saveSessionEntry({
    timestamp: new Date().toISOString(),
    task,
    ok: result.ok,
    error: result.error,
  });

  process.exitCode = result.ok ? 0 : 1;
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (command === 'setup') {
    await setupCommand();
    return;
  }

  if (command === 'setup-drive') {
    await setupDriveCommand();
    return;
  }

  if (!command || command === '--help' || command === '-h') {
    console.log(`Uso:
  forge-qwen setup              Configura credenciales de Cloudflare
  forge-qwen setup-drive        Configura el contexto de Axon Studio (Fase 1.5, opcional)
  forge-qwen "<tarea>"          Ejecuta una tarea de código
`);
    return;
  }

  const task = [command, ...rest].join(' ');
  await taskCommand(task);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exitCode = 1;
});
