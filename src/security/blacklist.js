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
