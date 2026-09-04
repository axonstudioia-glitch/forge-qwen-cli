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
comando colgado o con salida enorme no cuelga el proceso indefinidamente,
pero **no hay sandboxing**: el comando corre con los mismos permisos que tu
usuario. No lo uses en tareas que no puedas revisar antes de aprobar.

## Manejo de errores de Cloudflare/API

`src/client/workersAI.js` reintenta con backoff exponencial (hasta 2
reintentos) en: errores de red, HTTP 5xx, y HTTP 429. **No** reintenta en
errores 4xx de configuración (credenciales inválidas, modelo no disponible
en tu plan, etc.) — esos no se arreglan reintentando, se reportan de
inmediato con el mensaje de error de Cloudflare.

## Limitaciones conocidas (v0.1.0)

- Sin memoria entre invocaciones — cada `forge-qwen "tarea"` es una sesión
  nueva desde cero.
- `edit_file` exige que el texto a reemplazar aparezca exactamente una vez
  en el archivo (evita ediciones ambiguas, pero puede requerir dar más
  contexto en textos repetidos).
- Sin sandboxing de `run_bash` — ver sección de Seguridad arriba.
- Límite de 20 turnos de herramienta por tarea (`MAX_TURNS` en
  `src/agent/loop.js`) — tareas muy largas se detienen con un error en vez
  de ciclar indefinidamente.
- Pensado para uso interactivo de una sola persona a la vez (no hay cola de
  tareas ni concurrencia).

## Estructura del proyecto

```
bin/forge-qwen.js         CLI: parseo de comandos, loop de impresión en consola
src/agent/loop.js         Lógica del agente (bucle de conversación con el modelo)
src/tools/definitions.js  Definiciones de herramientas expuestas al modelo
src/execution/local.js    Capa de ejecución: implementa cada herramienta contra fs/shell local
src/security/confirm.js   Confirmación sí/no antes de acciones que modifican el sistema
src/client/workersAI.js   Cliente REST de Cloudflare Workers AI (con reintentos)
src/config/config.js      Config y sesión en ~/.forge-qwen/
```

## Estándar Axon

Este repo sigue el Protocolo de Gestión Documental de Axon Studio desde el
primer commit — ver `CLAUDE.md`.
