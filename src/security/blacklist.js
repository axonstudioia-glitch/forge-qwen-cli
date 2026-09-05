// Lista negra de comandos explícitamente peligrosos para run_bash — pedida por
// Vance (Vance-Nota-ForgeQwenCLI-CorreccionSandboxing-04Sep2026) como mínimo
// viable de aislamiento, dado que timeout/buffer no son sandboxing real.
//
// Deliberadamente simple y sobre-amplia: son patrones de texto sobre el
// comando completo, no un parser de shell. Prefiere bloquear de más
// (incluyendo usos legítimos) a intentar distinguir "rm -rf seguro" de
// "rm -rf peligroso" — esa distinción es fácil de burlar por accidente y
// esta capa existe justo para no depender solo del criterio humano en el
// momento de confirmar. Ver README, sección Seguridad, para qué SÍ y qué NO
// protege esto.

const DANGEROUS_PATTERNS = [
  {
    name: 'sudo',
    regex: /\bsudo\b/i,
    reason: 'Usa "sudo" — escalación de privilegios, fuera de lo que este agente debe poder hacer sin supervisión total.',
  },
  {
    name: 'rm_recursive_force',
    // Cubre -rf, -fr, -Rf, -fR, -r -f (separados) y --recursive/--force combinados.
    regex:
      /\brm\b(?:\s+\S+)*\s-[a-zA-Z]*(?:rf|fr)[a-zA-Z]*\b|\brm\b(?:\s+\S+)*\s-[a-zA-Z]*r[a-zA-Z]*\b(?:\s+\S+)*\s-[a-zA-Z]*f[a-zA-Z]*\b|--recursive\b(?:\s+\S+)*\s--force\b|--force\b(?:\s+\S+)*\s--recursive\b/i,
    reason: 'Borrado recursivo forzado (rm -rf o equivalente) — bloqueado siempre, sin importar la ruta destino.',
  },
  {
    name: 'fork_bomb',
    regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&?\s*\}\s*;\s*:/,
    reason: 'Patrón de fork bomb — puede agotar los recursos de la máquina.',
  },
  {
    name: 'disk_destructive',
    regex: /\bmkfs(\.\w+)?\b|\bdd\b[^\n]*\bof=\/dev\/\w+/i,
    reason: 'Formatea o escribe directo a un dispositivo de disco (mkfs, dd of=/dev/...).',
  },
  {
    name: 'pipe_to_shell',
    regex: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/i,
    reason: 'Descarga y ejecuta código remoto (curl/wget | shell) sin posibilidad de revisarlo antes de correrlo.',
  },
  {
    name: 'critical_system_files',
    regex: /(>{1,2}|\btee\b)[^\n]*\/etc\/(passwd|shadow|sudoers|environment)\b/i,
    reason: 'Escritura directa a un archivo crítico del sistema (/etc/passwd, /etc/shadow, /etc/sudoers, /etc/environment).',
  },

  // --- Fase 1.5 (05-sep-2026): gh/wrangler/rclone ahora son alcanzables vía
  // run_bash. Lista NO cerrada a propósito (así lo pide el brief) — Vance
  // revisa si falta algún patrón obvio antes de aprobar.

  {
    name: 'gh_repo_delete',
    regex: /\bgh\s+repo\s+delete\b/i,
    reason: 'Borra un repositorio completo de GitHub — irreversible.',
  },
  {
    name: 'gh_api_delete',
    regex: /\bgh\s+api\b[^\n]*(-X\s*DELETE|--method[=\s]+DELETE)/i,
    reason: 'Llamada a la API de GitHub con método DELETE — puede borrar cualquier recurso de producción según el endpoint.',
  },
  {
    name: 'wrangler_d1_destructive',
    regex: /\bwrangler\s+d1\s+execute\b[^\n]*\b(DROP|DELETE)\b/i,
    reason: 'wrangler d1 execute con DROP/DELETE — modifica datos de producción en D1 sin una segunda confirmación específica.',
  },
  {
    name: 'wrangler_delete_resource',
    regex: /\bwrangler\s+(r2\s+bucket\s+delete|kv:namespace\s+delete|pages\s+project\s+delete|d1\s+delete)\b/i,
    reason: 'Borra un recurso completo de Cloudflare (bucket R2, namespace KV, proyecto Pages, o base D1) — irreversible.',
  },
  {
    name: 'rclone_purge',
    regex: /\brclone\s+purge\b/i,
    reason: 'rclone purge borra una carpeta completa de Drive, incluso si no está vacía, sin posibilidad de recuperarla vía la papelera de rclone.',
  },
  {
    name: 'rclone_delete_root',
    // Bloquea "rclone delete remote:" o "rclone delete remote:/" — el
    // remote entero como destino, sin ninguna subcarpeta específica.
    regex: /\brclone\s+delete\s+[\w.-]+:\s*\/?\s*(--|$)/im,
    reason: 'rclone delete apuntando a la raíz del remote de Drive, sin una subcarpeta específica.',
  },
];

// Revisa un comando contra la lista negra. No ejecuta nada, solo evalúa texto.
function checkCommand(command) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.regex.test(command)) {
      return { blocked: true, name: pattern.name, reason: pattern.reason };
    }
  }
  return { blocked: false };
}

export { checkCommand, DANGEROUS_PATTERNS };
