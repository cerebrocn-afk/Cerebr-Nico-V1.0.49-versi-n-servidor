/**
 * packTerminal.ts — PACK ENCHUFABLE: TERMINAL PERSISTENTE
 * ========================================================
 * Registra en el ToolRegistry de CerebroNico 5 herramientas que exponen la
 * terminal con sesión al modelo. Encaja con la arquitectura v2.0 del registro:
 * un pack = un objeto; añadirlo NO toca el bucle del agente ni el prompt.
 *
 * Montaje (ver CÓMO-MONTAR.md):
 *   import { registrarPackTerminal } from "./engine/packTerminal";
 *   registrarPackTerminal();            // junto a los demás registerToolPack
 * y en executeToolCallInterno (server.ts), delega el switch:
 *   import { ejecutarHerramientaTerminal, ES_HERRAMIENTA_TERMINAL } from "./engine/packTerminal";
 *   if (ES_HERRAMIENTA_TERMINAL(name)) return ejecutarHerramientaTerminal(name, args);
 *
 * Idempotente: registrar dos veces reemplaza el mismo pack (mismo id) sin ruido.
 */
import { registerToolPack, type ToolSpec } from "./toolRegistry";
import { abrirTerminal, enviarTerminal, leerTerminal, cerrarTerminal, listarTerminales } from "./terminalInteractivo";

export const PACK_ID = "terminal";

const TOOLS: ToolSpec[] = [
  {
    name: "terminal_abrir",
    pack: PACK_ID,
    description:
      "Abre una TERMINAL PERSISTENTE (shell vivo) y devuelve su id. A diferencia de run_command (un solo tiro), esta sesión mantiene el estado: cd, variables de entorno, un REPL (python/node/psql) o un proceso que pide entrada por consola. Úsala cuando necesites varios comandos encadenados o responder a preguntas interactivas.",
    parameters: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "directorio de trabajo inicial (opcional)" },
        shell: { type: "string", description: "shell concreto (opcional: bash, powershell.exe, cmd.exe)" },
      },
    },
    requires: { sandbox: true },
    cheap: true,
  },
  {
    name: "terminal_enviar",
    pack: PACK_ID,
    description:
      "Envía una línea a una terminal abierta (su id) y devuelve la salida nueva tras una breve espera. Para responder a un prompt interactivo (p.ej. 'y' en una instalación) manda solo esa respuesta.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "id devuelto por terminal_abrir" },
        data: { type: "string", description: "texto/comando a enviar (se le añade el salto de línea)" },
        reposo_ms: { type: "number", description: "ms de espera antes de leer la salida (def. 400, máx 10000)" },
      },
      required: ["id", "data"],
    },
    requires: { sandbox: true },
  },
  {
    name: "terminal_cerrar",
    pack: PACK_ID,
    description: "Cierra una terminal persistente y libera su proceso. Idempotente. Cierra siempre que termines para no dejar shells vivos.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "id de la terminal a cerrar" } },
      required: ["id"],
    },
    requires: { sandbox: true },
    cheap: true,
  },
  // v1.71.0 — ESTABAN IMPLEMENTADAS Y NO DECLARADAS: el despachador conocía
  // terminal_leer y terminal_listar desde el primer día, pero sin spec en TOOLS
  // server.ts las rechazaba como «Herramienta desconocida» antes de llegar al
  // pack. Dos manos muertas; ahora existen de punta a punta (la suite
  // packDocumentos fija el contrato declarado == despachado para que no vuelva).
  {
    name: "terminal_leer",
    pack: PACK_ID,
    description:
      "Lee lo nuevo que salió por la terminal persistente SIN escribir nada (útil en procesos largos: devolvés lo acumulado desde la última lectura).",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "id de la terminal abierta" } },
      required: ["id"],
    },
    requires: { sandbox: true },
    cheap: true,
  },
  {
    name: "terminal_listar",
    pack: PACK_ID,
    description: "Lista las terminales persistentes vivas (id, cwd, shell, si murieron y bytes de salida acumulados).",
    parameters: { type: "object", properties: {} },
    requires: { sandbox: true },
    cheap: true,
  },
];

/** Registra el pack. Llámalo junto a los demás registerToolPack del arranque. */
export function registrarPackTerminal(): void {
  registerToolPack({
    id: PACK_ID,
    label: "Terminal persistente",
    description: "Shell vivo con sesión: estado entre comandos, REPL y prompts interactivos.",
    tools: TOOLS,
  });
}

const NOMBRES = new Set(TOOLS.map((t) => t.name));
export function ES_HERRAMIENTA_TERMINAL(name: string): boolean {
  return NOMBRES.has(name);
}

/** Despachador: lo llama executeToolCallInterno antes de su switch propio. */
export async function ejecutarHerramientaTerminal(name: string, args: any): Promise<string> {
  switch (name) {
    case "terminal_abrir":
      return JSON.stringify(abrirTerminal({ cwd: args?.cwd, shell: args?.shell }));
    case "terminal_enviar":
      return JSON.stringify(await enviarTerminal({ id: String(args?.id || ""), data: String(args?.data ?? ""), reposoMs: args?.reposo_ms }));
    case "terminal_leer":
      return JSON.stringify(leerTerminal(String(args?.id || "")));
    case "terminal_cerrar":
      return JSON.stringify(cerrarTerminal(String(args?.id || "")));
    case "terminal_listar":
      return JSON.stringify({ ok: true, terminales: listarTerminales() });
    default:
      return JSON.stringify({ ok: false, error: `Herramienta de terminal desconocida: ${name}` });
  }
}
