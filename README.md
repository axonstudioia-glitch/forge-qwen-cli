# forge-qwen-cli

Agente de terminal de Axon Studio — CLI local, costo casi cero, para tareas de
código (leer/editar archivos, correr comandos, buscar texto) usando un modelo
open-source vía Cloudflare Workers AI.

## Por qué "Qwen" y no "Kimi"

El brief original de Atlas (26-ago-2026, "Forge-Kimi Opción 1") proponía usar
`@cf/moonshotai/kimi-k2.7-code`. En la validación obligatoria del paso 0 se
confirmó que ese modelo tiene `require_workers_paid: true` en el catálogo de
Workers AI — **no es gratis**, contradice la premisa de "costo cero" del
brief. El propio brief autorizaba explícitamente cambiar de modelo en ese
caso, así que este proyecto usa `@cf/qwen/qwen3.8-27b`, confirmado con
tool-calling limpio (respuesta estructurada `tool_calls`, tanto en la
primera llamada como en el turno posterior con el resultado de la
herramienta ya inyectado). Ver la Bitácora de Axon Studio (Google Drive,
carpeta Axon Studio – Interno) para el detalle de la prueba.

## Qué es

Un bucle de agente simple: recibe una tarea en lenguaje natural, la manda al
modelo con definiciones de herramientas, ejecuta localmente las llamadas de
herramienta que el modelo pide, le regresa el resultado, y repite hasta que
el modelo entrega una respuesta final.

## Contexto de Axon Studio (Fase 1.5)

`forge-qwen-cli` puede leer, en vivo y en cada arranque, un documento de
contexto de Axon Studio desde Google Drive (vía `rclone`) e inyectarlo como
mensaje de sistema adicional — el equivalente a que Claude Code lea un
`CLAUDE.md` al iniciar. Nunca se copia ese contenido de forma estática
dentro del código: si el documento cambia en Drive, la siguiente tarea ya
lo recoge solo, sin tocar el repo.

**Pendiente real, sin resolver todavía (05-sep-2026):** el brief original de
esta fase pedía apuntar a "PROTOCOLO-MAESTRO-Axon-Studio", pero ese
documento vive en una carpeta de Drive llamada
`OBSOLETO_00_PROTOCOLO_Axon_Studio_Interno_...` — marcada obsoleta desde el
26-ago-2026. Conectar el mecanismo a un documento que el propio equipo ya
señaló como no vigente sería construir la fuente de verdad de este agente
sobre una base rota desde el día uno. Por eso `driveRemote`/`protocolPath`
quedan **sin configurar por default** — el mecanismo está construido y
probado, pero deliberadamente no apunta a ningún documento real hasta que
Dewey/Atlas confirmen cuál es la fuente vigente (¿la Constitución General
v5.0? ¿el Protocolo Maestro se mueve fuera de esa carpeta?). Mientras tanto,
`forge-qwen-cli` simplemente avisa en cada arranque que opera sin contexto
de Axon — nunca fallará en silencio ni asumirá un documento por su cuenta.

Configuración (una vez resuelto lo anterior):

```bash
# Requiere rclone ya instalado y configurado con un remote hacia el Drive
# de Axon (rclone config — hecho una sola vez, fuera de forge-qwen-cli,
# con la cuenta de Google del usuario).
forge-qwen setup-drive
```

Si `rclone` no está instalado, no está configurado, el remote no
responde, o el documento viene vacío, `forge-qwen` imprime una advertencia
explícita (`⚠️ ...`) antes de correr la tarea y sigue sin ese contexto —
nunca se detiene ni finge que sí lo tiene.

Arquitectura separada a propósito en dos capas (ver `src/agent/loop.js` vs.
`src/execution/local.js`): la lógica del agente no sabe nada de cómo se
ejecuta cada herramienta. Hoy la ejecución es contra el filesystem/terminal
local; la Fase 2 (versión web, fuera de alcance de este repo) puede
reemplazar esa capa por operaciones sobre la API de GitHub sin tocar la
lógica del agente.

## Instalación

Requiere Node.js 18 o superior (usa `fetch` nativo, sin dependencias).

```bash
git clone https://github.com/axonstudioia-glitch/forge-qwen-cli
cd forge-qwen-cli
npm link   # opcional, para tener el comando "forge-qwen" disponible global
```

## Configuración

```bash
forge-qwen setup
```

Pide `CLOUDFLARE_ACCOUNT_ID` y un `CLOUDFLARE_API_TOKEN` con permiso
**Workers AI: Edit** sobre esa cuenta (créalo en
https://dash.cloudflare.com/profile/api-tokens → Create Token). Se guarda en
`~/.forge-qwen/config.json` con permisos `0600` (solo tu usuario puede
leerlo).

Alternativa sin guardar nada en disco: exporta `CLOUDFLARE_ACCOUNT_ID` y
`CLOUDFLARE_API_TOKEN` como variables de entorno — tienen prioridad sobre el
archivo de config.

## Uso

```bash
forge-qwen "lee el archivo package.json y dime qué versión tiene"
forge-qwen "crea un archivo hola.txt que diga 'hola mundo'"
forge-qwen "busca todos los usos de 'TODO' en este proyecto"
```

Cada tarea corre en un proceso nuevo (sin memoria entre invocaciones). El
historial de tareas ejecutadas (fecha, tarea, si terminó bien o con error) se
guarda en `~/.forge-qwen/history/AAAA-MM-DD.jsonl`, sin contenido de archivos
ni comandos completos — solo para auditoría básica de uso.

## Integraciones con GitHub, Cloudflare y Google Drive (Fase 1.5)

`forge-qwen-cli` NO tiene clientes de API propios para GitHub, Cloudflare ni
Google Drive — decisión de arquitectura deliberada (reutilizar en vez de
construir desde cero). En su lugar, el modelo invoca directamente, vía
`run_bash`, las mismas CLIs oficiales y gratuitas que cualquier desarrollador
usaría:

| Servicio | CLI | Autenticación (una sola vez, fuera de forge-qwen-cli) |
|---|---|---|
| GitHub | [`gh`](https://cli.github.com) | `gh auth login` |
| Cloudflare | [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) | `wrangler login` (o `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` como env vars) |
| Google Drive | [`rclone`](https://rclone.org) | `rclone config` |

**forge-qwen-cli nunca ve ni almacena las credenciales de estas 3
herramientas** — cada una gestiona su propia autenticación en su propio
archivo de config (`~/.config/gh`, `~/.wrangler`, `~/.config/rclone`,
respectivamente), fuera del alcance de este repo y de `~/.forge-qwen/`. Esto
reduce, no aumenta, la superficie de manejo de credenciales de este agente.

La confirmación sí/no de siempre sigue aplicando a cualquier `run_bash`
que invoque estas CLIs — y la lista negra (ver Seguridad, abajo) se amplió
con patrones destructivos específicos de cada una.

**Alcance realista de esta fase:** el agente tiene acceso técnico a las 3
herramientas si el usuario se las pide explícitamente ("haz commit y push
de este cambio", "lee el Estado Actual de tal cliente"). NO se espera
todavía que decida por su cuenta, sin que se le pida, cuándo consultar
Drive o cuándo actualizar un Documento Maestro — eso se evalúa después de
uso real acumulado, no viene prometido de entrada.

## Herramientas soportadas

| Herramienta | Qué hace | ¿Pide confirmación? |
|---|---|---|
| `read_file` | Lee un archivo | No (solo lectura) |
| `list_directory` | Lista una carpeta | No (solo lectura) |
| `search_files` | Busca texto en archivos (tipo grep) | No (solo lectura) |
| `write_file` | Crea o sobrescribe un archivo completo | **Sí** |
| `edit_file` | Reemplaza un texto exacto dentro de un archivo | **Sí** |
| `run_bash` | Ejecuta un comando de shell | **Sí** |

## Seguridad

Antes de escribir/sobrescribir un archivo, editar uno existente, o correr
cualquier comando de terminal, el CLI se detiene y pregunta `¿Confirmas?
(s/n)` en la terminal. No hay modo "auto-aprobar" en esta versión — cada
acción que modifica el sistema requiere una respuesta humana explícita. Si
respondes que no, el agente recibe el rechazo como resultado de la
herramienta y sigue razonando a partir de ahí (no se cae, no reintenta la
misma acción sin que el modelo decida hacerlo de nuevo).

`run_bash` corre con un timeout de 60s y buffer de salida de 5MB — un
comando colgado o con salida enorme no cuelga el proceso indefinidamente.

### Lista negra de `run_bash` (v0.2.0, ampliada en v0.3.0) — qué protege y qué NO

`src/security/blacklist.js` bloquea, con un `throw` antes de ejecutar
cualquier cosa, comandos que coincidan con estos patrones:

**Sistema de archivos/shell (v0.2.0):** `sudo`; `rm` con borrado recursivo
forzado (`-rf`/`-fr`/`-r -f`/`--recursive --force`, **sin importar la ruta
destino** — bloquea también `rm -rf ./node_modules`, no solo `rm -rf /`);
fork bombs; `mkfs`/`dd of=/dev/...` (formateo o escritura directa a un
dispositivo de disco); `curl`/`wget` seguido de `| bash`/`| sh` (descargar
y ejecutar código remoto sin poder revisarlo); y escrituras a
`/etc/passwd`, `/etc/shadow`, `/etc/sudoers` o `/etc/environment`.

**GitHub/Cloudflare/Drive (v0.3.0, Fase 1.5 — lista NO cerrada a
propósito):** `gh repo delete`; `gh api` con `-X DELETE`/`--method DELETE`;
`wrangler d1 execute` combinado con `DROP`/`DELETE`; `wrangler r2 bucket
delete`, `wrangler kv:namespace delete`, `wrangler pages project delete`,
`wrangler d1 delete`; `rclone purge`; y `rclone delete` apuntando a la raíz
de un remote sin subcarpeta específica.

Este bloqueo aplica **incluso si el usuario ya respondió "s"** a la
confirmación — es una segunda barrera independiente del criterio humano en
ese momento, no un reemplazo de la confirmación.

Qué **NO** protege esto, para ser honestos sobre el alcance real:

- **No es sandboxing real.** Es texto contra unos patrones (regex sobre el
  comando completo), no un parser de shell ni un aislamiento a nivel de
  sistema operativo. El comando sigue corriendo con los mismos permisos
  que tu usuario, en tu filesystem real, fuera de la lista negra.
- **Se puede evadir con ofuscación deliberada** (variables de shell,
  encoding, comandos armados dinámicamente, alias, etc.) — esto protege
  contra el caso común de "el modelo propuso o el humano aprobó por error
  un comando obviamente peligroso", no contra un ataque activo diseñado
  para esquivar los patrones.
- **La lista es corta a propósito** ("mínimo viable" pedido por Vance)
  — hay muchísimas formas de causar daño que no cubre (por ejemplo,
  borrar archivos uno por uno sin `-rf`, o modificar código fuente de
  forma destructiva). Sigue sin haber sandboxing de directorio de trabajo,
  usuario restringido, ni contenedor.
- El bloqueo de `rm -rf` es deliberadamente amplio (bloquea rutas
  legítimas de proyecto, no solo rutas peligrosas como `/` o `~`) porque
  distinguir "ruta segura" de "ruta peligrosa" por texto es fácil de
  burlar sin querer — se prefiere sobre-bloquear a razonar mal.

No uses `run_bash` en tareas que no puedas revisar antes de aprobar. Esta
lista negra reduce el peor de los casos por accidente, no reemplaza el
juicio del humano que confirma cada acción.

## Manejo de errores de Cloudflare/API

`src/client/workersAI.js` reintenta con backoff exponencial (hasta 2
reintentos) en: errores de red, HTTP 5xx, y HTTP 429. **No** reintenta en
errores 4xx de configuración (credenciales inválidas, modelo no disponible
en tu plan, etc.) — esos no se arreglan reintentando, se reportan de
inmediato con el mensaje de error de Cloudflare.

## Limitaciones conocidas (v0.3.0)

- Sin memoria entre invocaciones — cada `forge-qwen "tarea"` es una sesión
  nueva desde cero.
- `edit_file` exige que el texto a reemplazar aparezca exactamente una vez
  en el archivo (evita ediciones ambiguas, pero puede requerir dar más
  contexto en textos repetidos).
- Sin sandboxing real de `run_bash` (solo timeout/buffer + lista negra de
  patrones peligrosos) — ver sección de Seguridad arriba para el detalle
  exacto de qué protege y qué no.
- Límite de 20 turnos de herramienta por tarea (`MAX_TURNS` en
  `src/agent/loop.js`) — tareas muy largas se detienen con un error en vez
  de ciclar indefinidamente.
- Pensado para uso interactivo de una sola persona a la vez (no hay cola de
  tareas ni concurrencia).
- El contexto de Axon Studio (Fase 1.5) **no está conectado a ningún
  documento real todavía** — ver sección "Contexto de Axon Studio" arriba,
  pendiente de que Dewey/Atlas confirmen la fuente vigente.
- La integración con `gh`/`wrangler`/`rclone` no se probó end-to-end contra
  cuentas reales de producción desde el entorno de desarrollo de este
  repo (sandbox en la nube sin esas 3 CLIs autenticables de forma
  interactiva) — se probó el mecanismo completo con equivalentes reales
  donde fue posible (`rclone` con un remote local en vez de Drive real,
  `git` en vez de `gh` porque el sandbox de desarrollo bloquea llamadas
  generales de la API de GitHub vía `gh`). Ver el reporte de evidencia en
  Drive para el detalle exacto de qué se probó y qué queda pendiente de
  probar en la laptop real de Jesús.

## Estructura del proyecto

```
bin/forge-qwen.js           CLI: parseo de comandos, loop de impresión en consola
src/agent/loop.js           Lógica del agente (bucle de conversación con el modelo)
src/tools/definitions.js    Definiciones de herramientas expuestas al modelo
src/execution/local.js      Capa de ejecución: implementa cada herramienta contra fs/shell local
src/security/confirm.js     Confirmación sí/no antes de acciones que modifican el sistema
src/security/blacklist.js   Lista negra de comandos peligrosos para run_bash (segunda barrera, post-confirmación)
src/client/workersAI.js     Cliente REST de Cloudflare Workers AI (con reintentos)
src/config/config.js        Config y sesión en ~/.forge-qwen/
src/context/axonProtocol.js Lectura en vivo del contexto de Axon desde Drive vía rclone (Fase 1.5)
```

## Estándar Axon

Este repo sigue el Protocolo de Gestión Documental de Axon Studio desde el
primer commit — ver `CLAUDE.md`.
