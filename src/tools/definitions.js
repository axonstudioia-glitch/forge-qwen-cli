// Definiciones de herramientas expuestas al modelo (formato OpenAI-compatible
// que acepta Workers AI). Esto es parte de la "lógica del agente": no sabe
// nada de CÓMO se ejecuta cada herramienta, solo describe QUÉ herramientas
// existen. La capa de ejecución (src/execution/) es la que implementa el
// "cómo" y puede cambiar sin tocar este archivo.

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lee el contenido completo de un archivo de texto dado su path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta del archivo a leer (absoluta o relativa al directorio de trabajo actual).' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Crea un archivo nuevo o reemplaza su contenido completo. Requiere confirmación del usuario antes de ejecutarse.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta del archivo a crear o sobrescribir.' },
          content: { type: 'string', description: 'Contenido completo que tendrá el archivo.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Reemplaza una porción exacta de texto dentro de un archivo existente (debe aparecer una sola vez). Requiere confirmación del usuario antes de ejecutarse.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta del archivo a editar.' },
          old_text: { type: 'string', description: 'Texto exacto que se va a reemplazar (debe aparecer una sola vez en el archivo).' },
          new_text: { type: 'string', description: 'Texto nuevo que reemplaza a old_text.' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lista los archivos y carpetas dentro de una ruta dada.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta de la carpeta a listar. Por default, el directorio de trabajo actual.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_bash',
      description: 'Ejecuta un comando de terminal (bash) y regresa su salida. Requiere confirmación explícita del usuario antes de ejecutarse.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Comando de shell a ejecutar.' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Busca un texto o patrón dentro de los archivos de una carpeta (tipo grep).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Texto o expresión regular a buscar.' },
          path: { type: 'string', description: 'Carpeta donde buscar. Por default, el directorio de trabajo actual.' },
        },
        required: ['pattern'],
      },
    },
  },
];

// Herramientas que modifican el sistema (o corren comandos arbitrarios) y por
// lo tanto exigen confirmación explícita del usuario — sección 3 del brief.
// read_file, list_directory y search_files son de solo lectura y no la piden.
const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'run_bash']);

export { TOOL_DEFINITIONS, WRITE_TOOLS };
