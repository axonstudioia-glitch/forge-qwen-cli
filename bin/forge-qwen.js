#!/usr/bin/env node
import readline from 'node:readline';
import { runAgent } from '../src/agent/loop.js';
import { EXECUTORS } from '../src/execution/local.js';
import { confirmAction } from '../src/security/confirm.js';
import { getCredentials, getModel, loadConfig, saveConfig, saveSessionEntry, CONFIG_FILE } from '../src/config/config.js';

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

  const result = await runAgent({
    task,
    accountId,
    apiToken,
    model,
    executeTool,
    confirmTool: confirmAction,
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

  if (!command || command === '--help' || command === '-h') {
    console.log(`Uso:
  forge-qwen setup              Configura credenciales de Cloudflare
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
