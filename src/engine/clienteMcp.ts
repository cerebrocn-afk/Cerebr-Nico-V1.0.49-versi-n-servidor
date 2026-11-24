/**
 * clienteMcp.ts — EL CLIENTE MCP QUE FALTABA (v1.0.28)
 * ===================================================
 *
 * EL DEFECTO QUE CURA (verificado sobre v1.0.27, no supuesto):
 *   `mcp_servers.json` declaraba cuatro servidores (`web`, `context7`,
 *   `unblocked`, `webflow`) con comando y argumentos… y NADIE los lanzaba. No
 *   existía en todo el árbol un solo cliente JSON-RPC por stdio: el archivo era
 *   documentación disfrazada de configuración. El puente :5000 tampoco los
 *   lanza (`agent_bridge_5000.py` no los conoce). Consecuencia medida: las
 *   herramientas de red de la IDE nunca existieron; lo que sí funcionaba eran
 *   las `pc_*`, que van por otra puerta del mismo puente (`/api/fs/*`,
 *   `/api/exec`, `/api/pc/info`), no por MCP.
 *
 * QUÉ ES MCP, EN UNA FRASE: un servidor que el cliente ARRANCA como proceso
 * hijo y con el que habla por stdin/stdout, un mensaje JSON por línea, con el
 * sobre `jsonrpc: "2.0"`.
 *
 * DECISIONES QUE ESTE MÓDULO TOMA (y por qué):
 *   · `spawn` SIN shell. En Windows, `shell: true` con una ruta que tiene
 *     espacios («C:\Users\BirdBox\Downloads\…») parte el comando por la mitad y
 *     el error que aparece no se parece a la causa. Sin shell, los argumentos
 *     viajan como array y nada se reinterpreta.
 *   · Proceso PEREZOSO: se arranca en el primer `tools/list`, no al importar.
 *     Importar el módulo no puede tener efectos: si no, cualquier suite que lo
 *     importe dejaría procesos Python vivos en la máquina.
 *   · `initialize` + `notifications/initialized` ANTES de listar. Un servidor
 *     MCP que no recibe la notificación se queda esperando y la primera llamada
 *     vence por tiempo: el síntoma se lee como «servidor caído».
 *   · Tiempo de espera por petición (`timeout` del JSON, en segundos). Un
 *     servidor mudo no puede colgar el arranque de la IDE.
 *   · Cierre limpio: `kill` del árbol de procesos. En Windows, `npx` arranca
 *     node y node arranca el servidor; matar solo al padre deja zombis.
 *   · Los errores SE DICEN (stderr del servidor se propaga con su texto), porque
 *     un «no cargó» sin motivo obliga a adivinar.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Una entrada de `mcp_servers.json`, tal como está escrita. */
export interface EntradaMcp {
  id: string;
  label?: string;
  comando: string;
  args?: string[];
  enabled?: boolean;
  timeout?: number;
  /** Variables de entorno para el hijo (por ejemplo el token de un servicio). */
  env?: Record<string, string>;
}

/** Herramienta tal como la declara el servidor MCP (formato del protocolo). */
export interface HerramientaMcp {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface ResultadoLlamada {
  ok: boolean;
  /** Contenido ya en texto (se concatenan los bloques `text`). */
  texto: string;
  /** true si el servidor marcó `isError`. */
  errorDeHerramienta?: boolean;
  crudo?: unknown;
}

/**
 * El id de la herramienta que ve el modelo: `<id>_<herramienta>`, igual que ya
 * hacía el puente (así el prefijo dice de qué servidor viene, sin registro
 * aparte). Un guion en el id se vuelve guion bajo: el modelo no debe recibir
 * nombres con guiones si puede evitarlo.
 */
export function nombrePublico(idServidor: string, herramienta: string): string {
  return `${String(idServidor).trim().replace(/[^a-zA-Z0-9_]/g, "_")}_${String(herramienta).trim().replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * ¿Este servidor debe arrancarse? `enabled:false` apaga sin borrar la entrada
 * (las de Cloudflare entran así: apagadas hasta que Mario las encienda).
 */
export function estaActivo(e: EntradaMcp | null | undefined): boolean {
  if (!e || !e.comando || typeof e.comando !== "string") return false;
  return e.enabled !== false;
}

/**
 * Límites sanos del tiempo de espera: el JSON dice 5-120 s. Fuera de rango se
 * corrige en vez de fallar — una entrada escrita a mano no debe romper el
 * arranque por un número.
 */
export function timeoutDe(e: EntradaMcp): number {
  const s = Number(e?.timeout);
  if (!Number.isFinite(s) || s <= 0) return 30_000;
  return Math.min(Math.max(s, 5), 120) * 1000;
}

/**
 * Lee y valida `mcp_servers.json`. Devuelve SOLO las entradas utilizables y
 * dice las que descartó (con motivo), porque un servidor que desaparece sin
 * explicación es el bug que esta versión viene a cerrar.
 */
export function leerConfiguracion(bruto: unknown): { servidores: EntradaMcp[]; descartados: Array<{ id: string; motivo: string }> } {
  const servidores: EntradaMcp[] = [];
  const descartados: Array<{ id: string; motivo: string }> = [];
  const lista = Array.isArray((bruto as any)?.servidores) ? (bruto as any).servidores : [];
  const vistos = new Set<string>();
  for (const s of lista as any[]) {
    const id = String(s?.id ?? "").trim();
    if (!id) { descartados.push({ id: "(sin id)", motivo: "la entrada no tiene id" }); continue; }
    if (vistos.has(id)) { descartados.push({ id, motivo: "id repetido: se conserva el primero" }); continue; }
    vistos.add(id);
    if (typeof s?.comando !== "string" || !s.comando.trim()) {
      descartados.push({ id, motivo: "no declara comando" });
      continue;
    }
    servidores.push({
      id,
      label: typeof s.label === "string" ? s.label : id,
      comando: s.comando,
      args: Array.isArray(s.args) ? s.args.map(String) : [],
      enabled: s.enabled !== false,
      timeout: Number(s.timeout) || 30,
      env: s.env && typeof s.env === "object" ? s.env : undefined,
    });
  }
  return { servidores, descartados };
}

/**
 * Sustituye `${VAR}` y `$VAR` en los argumentos por variables de entorno.
 * Sirve para no escribir un token en el archivo: la entrada dice
 * `--header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"` y el valor vive en
 * el entorno. Si la variable no está, se deja el texto tal cual y se informa,
 * en vez de mandar la cadena vacía (que el servidor leería como token vacío y
 * respondería 401 sin decir por qué).
 */
export function resolverVariables(
  args: string[],
  entorno: Record<string, string | undefined> = process.env
): { args: string[]; faltantes: string[] } {
  const faltantes: string[] = [];
  const salida = args.map((a) =>
    String(a).replace(/\$\{([A-Z0-9_]+)\}|\$([A-Z0-9_]+)/g, (todo, a1, a2) => {
      const nombre = a1 || a2;
      const valor = entorno["CN_MCP_" + nombre] ?? entorno[nombre];
      if (valor === undefined || valor === "") { faltantes.push(nombre); return todo; }
      return valor;
    })
  );
  return { args: salida, faltantes: [...new Set(faltantes)] };
}

/**
 * Resuelve la ruta de un argumento relativo desde la carpeta de la app. Las
 * rutas absolutas y los flags (`-y`, `--header`) se dejan intactos.
 */
export function resolverRutaArg(arg: string, raiz: string): string {
  if (!arg || arg.startsWith("-")) return arg;
  if (/^[a-zA-Z]+:\/\//.test(arg) || /^https?:/i.test(arg)) return arg; // URL
  if (path.isAbsolute(arg)) return arg;
  const destino = path.join(raiz, arg);
  // Solo se reescribe si el archivo existe: así un argumento que casualmente
  // parece un nombre de archivo (un id de modelo) no se convierte en ruta.
  return fs.existsSync(destino) ? destino : arg;
}

/**
 * Un servidor MCP vivo. Se crea con `abrirServidorMcp` y se usa con
 * `listarHerramientas` / `llamarHerramienta`.
 */
export class ServidorMcp {
  private hijo: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private siguienteId = 1;
  private pendientes = new Map<number, { resolver: (v: any) => void; rechazar: (e: Error) => void; reloj: NodeJS.Timeout }>();
  private ultimoError = "";
  readonly nombre: string;
  readonly entrada: EntradaMcp;
  readonly raiz: string;

  constructor(entrada: EntradaMcp, raiz: string) {
    this.entrada = entrada;
    this.nombre = entrada.id;
    this.raiz = raiz;
  }

  get vivo(): boolean {
    return !!this.hijo && this.hijo.exitCode === null && !this.hijo.killed;
  }

  /** Arranca el proceso (una vez) y hace el saludo del protocolo. */
  async abrir(): Promise<void> {
    if (this.vivo) return;
    const { args, faltantes } = resolverVariables(this.entrada.args || []);
    if (faltantes.length) {
      // Se dice, pero se sigue: el servidor puede funcionar por OAuth aunque el
      // token no esté en el entorno.
      console.warn(`[mcp] ${this.nombre}: variables sin valor en el entorno: ${faltantes.join(", ")} (se usará el texto tal cual).`);
    }
    const argsFinales = args.map((a) => resolverRutaArg(a, this.raiz));
    const entorno: NodeJS.ProcessEnv = { ...process.env, ...(this.entrada.env || {}) };
    let hijo: ChildProcessWithoutNullStreams;
    try {
      hijo = spawn(this.entrada.comando, argsFinales, {
        cwd: this.raiz,
        env: entorno,
        shell: false, // ver cabecera: con shell se rompen las rutas con espacios
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err: any) {
      throw new Error(`no se pudo lanzar «${this.entrada.comando}»: ${err?.message || err}`);
    }
    this.hijo = hijo;
    hijo.stdout.setEncoding("utf8");
    hijo.stdout.on("data", (trozo: string) => this.consumir(trozo));
    hijo.stderr.setEncoding("utf8");
    hijo.stderr.on("data", (trozo: string) => {
      const t = String(trozo).trim();
      if (!t) return;
      this.ultimoError = t.slice(0, 400);
      // El stderr de un servidor MCP es diagnóstico, no protocolo: se guarda y
      // se muestra solo si algo falla (si no, un `npx` verboso llenaría el log).
      if (process.env.CN_MCP_DEBUG === "1") console.log(`[mcp:${this.nombre}] ${t}`);
    });
    hijo.on("error", (err: any) => {
      const msg = err?.code === "ENOENT" ? `comando no encontrado: «${this.entrada.comando}»` : String(err?.message || err);
      this.ultimoError = msg;
      this.rechazarTodos(new Error(msg));
    });
    hijo.on("exit", (codigo) => {
      if (codigo !== 0 && codigo !== null) {
        this.rechazarTodos(new Error(`el servidor terminó con código ${codigo}${this.ultimoError ? ` — ${this.ultimoError}` : ""}`));
      }
      this.hijo = null;
    });

    // Saludo del protocolo. Se pide `tools` en capabilities: sin declararlo, un
    // servidor estricto responde a `tools/list` con error de capability.
    await this.pedir("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "CerebroNico-IDE", version: "1.0.28" },
    });
    // Notificación (sin id): el protocolo la exige antes de cualquier otra cosa.
    this.notificar("notifications/initialized", {});
  }

  /** Herramientas del servidor, ya en el formato del registro. */
  async listarHerramientas(): Promise<HerramientaMcp[]> {
    await this.abrir();
    const r = await this.pedir("tools/list", {});
    const lista = Array.isArray(r?.tools) ? r.tools : [];
    return lista
      .filter((t: any) => t && typeof t.name === "string")
      .map((t: any) => ({ name: t.name, description: String(t.description || ""), inputSchema: t.inputSchema }));
  }

  /** Llamada a una herramienta. Devuelve el texto ya extraído de los bloques. */
  async llamarHerramienta(nombre: string, argumentos: Record<string, unknown> = {}): Promise<ResultadoLlamada> {
    await this.abrir();
    const r = await this.pedir("tools/call", { name: nombre, arguments: argumentos || {} });
    const bloques = Array.isArray(r?.content) ? r.content : [];
    const texto = bloques
      .map((b: any) => (b && b.type === "text" ? String(b.text ?? "") : b && b.type ? `[${b.type}]` : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    return { ok: !r?.isError, texto: texto || "(la herramienta no devolvió texto)", errorDeHerramienta: !!r?.isError, crudo: r };
  }

  /** Cierra el proceso: primero el árbol completo (Windows), después el hijo. */
  cerrar(): void {
    const hijo = this.hijo;
    this.hijo = null;
    this.rechazarTodos(new Error("servidor MCP cerrado"));
    if (!hijo) return;
    try {
      if (process.platform === "win32" && hijo.pid) {
        // taskkill /T mata el árbol: `npx` deja un node hijo que sobrevive.
        spawn("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { shell: false, windowsHide: true });
      } else {
        hijo.kill("SIGTERM");
      }
    } catch {
      /* cerrar nunca debe lanzar */
    }
  }

  // ── plomería JSON-RPC ──────────────────────────────────────────────
  private enviar(sobre: Record<string, unknown>): void {
    if (!this.hijo || !this.hijo.stdin.writable) throw new Error(`el servidor «${this.nombre}» no está vivo`);
    this.hijo.stdin.write(JSON.stringify(sobre) + "\n");
  }

  private notificar(metodo: string, params: unknown): void {
    this.enviar({ jsonrpc: "2.0", method: metodo, params });
  }

  private pedir(metodo: string, params: unknown): Promise<any> {
    return new Promise((resolver, rechazar) => {
      const id = this.siguienteId++;
      const reloj = setTimeout(() => {
        this.pendientes.delete(id);
        rechazar(new Error(`«${metodo}» sin respuesta en ${timeoutDe(this.entrada) / 1000} s${this.ultimoError ? ` — ${this.ultimoError}` : ""}`));
      }, timeoutDe(this.entrada));
      this.pendientes.set(id, { resolver, rechazar, reloj });
      try {
        this.enviar({ jsonrpc: "2.0", id, method: metodo, params });
      } catch (e: any) {
        clearTimeout(reloj);
        this.pendientes.delete(id);
        rechazar(e);
      }
    });
  }

  private consumir(trozo: string): void {
    this.buffer += trozo;
    let corte: number;
    // MCP por stdio: un objeto JSON por línea (no NDJSON con longitudes, como LSP).
    while ((corte = this.buffer.indexOf("\n")) >= 0) {
      const linea = this.buffer.slice(0, corte).trim();
      this.buffer = this.buffer.slice(corte + 1);
      if (!linea) continue;
      let msg: any;
      try {
        msg = JSON.parse(linea);
      } catch {
        // Línea que no es JSON en stdout: diagnóstico del servidor. No se pisa el
        // último error real para no tapar la causa con un log de arranque.
        continue;
      }
      if (msg && typeof msg.id === "number" && this.pendientes.has(msg.id)) {
        const p = this.pendientes.get(msg.id)!;
        this.pendientes.delete(msg.id);
        clearTimeout(p.reloj);
        if (msg.error) p.rechazar(new Error(String(msg.error?.message || JSON.stringify(msg.error))));
        else p.resolver(msg.result ?? {});
      }
      // Respuestas a notificaciones (sin id) y peticiones del servidor al
      // cliente (raras en herramientas) se ignoran: este cliente no expone
      // recursos/prompts, solo herramientas.
    }
  }

  private rechazarTodos(err: Error): void {
    for (const [, p] of this.pendientes) {
      clearTimeout(p.reloj);
      p.rechazar(err);
    }
    this.pendientes.clear();
  }
}

/**
 * Abre un servidor y devuelve sus herramientas YA convertidas al formato del
 * registro, con el prefijo `<id>_`. Si falla, lanza con el motivo legible: el
 * llamador decide cómo contarlo (y no se traga el error).
 */
export async function inventarioDeServidor(
  entrada: EntradaMcp,
  raiz: string
): Promise<{ servidor: ServidorMcp; herramientas: HerramientaMcp[] }> {
  const servidor = new ServidorMcp(entrada, raiz);
  try {
    const herramientas = await servidor.listarHerramientas();
    return { servidor, herramientas };
  } catch (err) {
    servidor.cerrar();
    throw err;
  }
}

/**
 * El esquema de parámetros que espera el registro. Los servidores MCP ya mandan
 * JSON Schema; solo se normaliza el caso vacío (herramientas sin argumentos),
 * porque un `parameters` ausente rompe el armado del tool-calling.
 */
export function esquemaDelRegistro(inputSchema: unknown): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const s: any = inputSchema;
  if (!s || typeof s !== "object" || s.type !== "object" || !s.properties || typeof s.properties !== "object") {
    return { type: "object", properties: {} };
  }
  const out: { type: "object"; properties: Record<string, unknown>; required?: string[] } = {
    type: "object",
    properties: s.properties,
  };
  if (Array.isArray(s.required) && s.required.length) out.required = s.required.map(String);
  return out;
}
