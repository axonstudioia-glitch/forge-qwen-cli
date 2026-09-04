import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Capa de ejecución para la Opción 1 (terminal local). Implementa el "cómo"
// de cada herramienta contra el filesystem/shell reales de la máquina.
// En la Fase 2 (versión web) esta capa se reemplaza por operaciones sobre
// GitHub vía API (ramas, commits, PRs) sin tocar src/agent/loop.js.

async function readFileTool(args) {
  return fs.readFile(args.path, 'utf8');
}

async function writeFileTool(args) {
  await fs.mkdir(path.dirname(path.resolve(args.path)), { recursive: true });
  await fs.writeFile(args.path, args.content, 'utf8');
  return `Archivo escrito: ${args.path} (${args.content.length} caracteres)`;
}

async function editFileTool(args) {
  const original = await fs.readFile(args.path, 'utf8');
  const occurrences = original.split(args.old_text).length - 1;
  if (occurrences === 0) {
    throw new Error(`No se encontró el texto a reemplazar en ${args.path}.`);
  }
  if (occurrences > 1) {
    throw new Error(`El texto a reemplazar aparece ${occurrences} veces en ${args.path}; debe ser único. Da más contexto.`);
  }
  const updated = original.replace(args.old_text, args.new_text);
  await fs.writeFile(args.path, updated, 'utf8');
  return `Archivo editado: ${args.path}`;
}

async function listDirectoryTool(args) {
  const dir = args.path || '.';
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (
    entries
      .map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`)
      .sort()
      .join('\n') || '(carpeta vacía)'
  );
}

async function runBashTool(args) {
  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', args.command], {
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return [stdout, stderr].filter(Boolean).join('\n---stderr---\n') || '(sin salida)';
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || err.message;
    return `(el comando terminó con error, código ${err.code ?? '?'})\n${[stdout, stderr].filter(Boolean).join('\n---stderr---\n')}`;
  }
}

async function searchFilesTool(args) {
  const dir = args.path || '.';
  try {
    const { stdout } = await execFileAsync(
      'grep',
      ['-rn', '--exclude-dir=node_modules', '--exclude-dir=.git', args.pattern, dir],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
    );
    return stdout || '(sin resultados)';
  } catch (err) {
    if (err.code === 1) return '(sin resultados)';
    throw new Error(`Falló la búsqueda: ${err.stderr || err.message}`);
  }
}

const EXECUTORS = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  list_directory: listDirectoryTool,
  run_bash: runBashTool,
  search_files: searchFilesTool,
};

export { EXECUTORS };
