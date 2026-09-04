import readline from 'node:readline';

function describeAction(name, args) {
  switch (name) {
    case 'write_file':
      return `Escribir/crear el archivo: ${args.path}`;
    case 'edit_file':
      return `Editar el archivo: ${args.path}`;
    case 'run_bash':
      return `Ejecutar en terminal: ${args.command}`;
    default:
      return `Ejecutar la herramienta "${name}" con argumentos: ${JSON.stringify(args)}`;
  }
}

// Confirmación sí/no obligatoria antes de cualquier acción que escriba,
// borre o ejecute algo (sección 3 del brief). Sin modo auto-aprobar por
// default — cada llamada real le pregunta a un humano en stdin.
async function confirmAction(name, args) {
  const description = describeAction(name, args);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`\n⚠️  ${description}\n¿Confirmas? (s/n): `, resolve);
  });
  rl.close();
  const normalized = answer.trim().toLowerCase();
  return normalized === 's' || normalized === 'si' || normalized === 'sí' || normalized === 'y' || normalized === 'yes';
}

export { confirmAction, describeAction };
