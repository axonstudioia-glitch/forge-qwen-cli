import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.forge-qwen');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HISTORY_DIR = path.join(CONFIG_DIR, 'history');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// Variables de entorno tienen prioridad sobre el archivo de config, para no
// obligar a nadie a guardar credenciales en disco si prefiere pasarlas por env.
function getCredentials() {
  const config = loadConfig();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.accountId;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || config.apiToken;
  return { accountId, apiToken };
}

function getModel() {
  const config = loadConfig();
  return config.model || '@cf/qwen/qwen3.8-27b';
}

// Config del remote de rclone que apunta al Drive de Axon, y la ruta dentro
// de ese remote al documento de contexto que se inyecta al arrancar (Fase
// 1.5, brief "ContextoDriveCloudflareGithub"). Ambos quedan sin valor por
// default a propósito — todavía no hay acuerdo de a qué documento apuntar
// (ver README, sección Contexto de Axon). Sin configurar, forge-qwen-cli
// simplemente avisa que corre sin contexto de Axon, nunca falla en silencio.
function getDriveContextConfig() {
  const config = loadConfig();
  return {
    driveRemote: config.driveRemote || null,
    protocolPath: config.protocolPath || null,
  };
}

function saveSessionEntry(entry) {
  ensureConfigDir();
  const file = path.join(HISTORY_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

export {
  CONFIG_DIR,
  CONFIG_FILE,
  HISTORY_DIR,
  loadConfig,
  saveConfig,
  getCredentials,
  getModel,
  getDriveContextConfig,
  saveSessionEntry,
};
