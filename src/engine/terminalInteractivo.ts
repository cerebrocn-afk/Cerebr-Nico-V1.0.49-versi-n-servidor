/**
 * terminalInteractivo.ts — TERMINAL PERSISTENTE CON SESIÓN (v1.0.0)
 * ==================================================================
 * QUÉ AÑADE Y POR QUÉ (honestidad técnica):
 *
 * CerebroNico YA tenía `run_command` y `pc_exec`, pero son DISPAROS DE UN SOLO
 * TIRO: cada llamada abre un shell nuevo, ejecuta, captura y muere. Eso NO sirve
 * para procesos que mantienen estado entre comandos ni para programas que piden
 * entrada por consola:
 *   - un REPL (python, node, psql, sqlite3, irb…)
 *   - un instalador o script que pregunta «Y/n?»
 *   - un `cd` que debe seguir vigente en el siguiente comando
 *   - ver la salida de un proceso largo mientras sigue vivo
 *
 * Este módulo mantiene VIVO un shell por sesión (stdin abierto), acumula su
 * salida en un búfer de anillo y la devuelve bajo demanda. Es el patrón de la
 * terminal integrada de un IDE, adaptado al contrato pedir→responder del agente.
 *
 * CONVENCIONES CerebroNico:
 *   - Módulo del motor (src/engine/), comentarios en español.
 *   - La LÓGICA PURA (búfer de anillo, cálculo de inactividad, troceado de
 *     salida) va separada y es testeable sin spawnear nada.
 *   - El trato con el SO (spawn) queda en una capa fina al final.
 *   - Nada de red: el shell hereda el entorno pero no se expone a ningún puerto.
 */

import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as os from "node:os";
import { basename } from "node:path";

// ───────────────────────────────────────────────────────────────
// LÍMITES (defensivos: una terminal zombi o un búfer sin tope son fugas)
// ───────────────────────────────────────────────────────────────
export const LIMITES = {
  /** Máximo de sesiones vivas a la vez. */
  MAX_SESIONES: 8,
  /** Tope del búfer de salida por sesión (caracteres). */
  MAX_BUFER: 200_000,
  /** Inactividad tras la cual una sesión se recicla (ms). */
  INACTIVIDAD_MS: 10 * 60 * 1000,
  /** Ventana de reposo tras escribir, para dejar que el shell responda (ms). */
  REPOSO_MS: 400,
  /**
   * v1.70.7 — Tope de la CALIBRACIÓN: la sonda `echo token` que abre una
   * terminal tiene que contestar dentro de este plazo. No es un lujo: en
   * Windows el primer envío chocaba contra el arranque en frío de cmd /
   * PowerShell (antivirus mediante) y la salida del eco llegaba DESPUÉS de la
   * ventana de reposo → la suite «ve la salida del eco» en verde unas pasadas
   * y en rojo otras. Con la sonda probada, el reposo se gasta en la orden del
   * modelo, no en esperar a que el shell despierte.
   */
  CALIBRACION_MS: 4000,
};

// ───────────────────────────────────────────────────────────────
// LÓGICA PURA — testeable sin SO
// ───────────────────────────────────────────────────────────────

/** Búfer de anillo: nunca crece sin límite; conserva la COLA (lo último). */
export function recortarAnillo(buffer: string, nuevo: string, tope = LIMITES.MAX_BUFER): string {
  const unido = buffer + nuevo;
  if (unido.length <= tope) return unido;
  // Conservamos la cola y marcamos el truncado para no mentir sobre la salida.
  const cola = unido.slice(unido.length - tope);
  return "…[salida anterior truncada]…\n" + cola;
}

/** ¿La sesión lleva demasiado tiempo inactiva? */
export function estaInactiva(ultimaActividad: number, ahora: number, limite = LIMITES.INACTIVIDAD_MS): boolean {
  return ahora - ultimaActividad >= limite;
}

/** Elige el shell por defecto según el SO (igual criterio que la terminal del IDE). */
export function shellPorDefecto(plataforma: string = os.platform()): string {
  if (plataforma === "win32") return process.env.COMSPEC || "powershell.exe";
  return process.env.SHELL || "bash";
}

/**
 * v1.60.16 — EL BUG QUE TUMBABA EL SERVIDOR ENTERO. En Windows, un modelo que
 * pide `terminal_abrir shell="bash"` hacía `spawn("bash")`; como no existe,
 * el ENOENT llega por el evento `error` ASÍNCRONO de spawn y, sin listener,
 * se vuelve excepción no atrapada → el guardián de estabilidad apaga el
 * servidor (de ahí el «no responde ni Gemma local»: el proceso ya murió).
 * Aquí no adivinamos si `bash` existe (eso es del SO), pero si en Windows se
 * pide un shell POSIX A SECAS (bash/sh/zsh/fish/dash, sin ruta ni .exe) que
 * casi nunca está, se cae al shell nativo en vez de reventar. Un shell con
 * ruta explícita (p. ej. Git Bash `C:\...\bash.exe`) se respeta tal cual; el
 * manejador `error` de `abrirTerminal` es la red de seguridad real. */
export function resolverShell(pedido: string | undefined, plataforma: string = os.platform()): string {
  const shell = (pedido || "").trim();
  if (!shell) return shellPorDefecto(plataforma);
  if (plataforma === "win32" && /^(bash|sh|zsh|fish|dash)$/i.test(shell)) {
    return shellPorDefecto(plataforma);
  }
  return shell;
}

/** Normaliza lo que llega del modelo para enviar al shell: asegura salto final. */
export function normalizarEntrada(data: string): string {
  if (typeof data !== "string") return "";
  return data.endsWith("\n") ? data : data + "\n";
}

// ───────────────────────────────────────────────────────────────────────────
// CAPA CON SO — gestión de sesiones vivas
// ───────────────────────────────────────────────────────────────────────────

interface Sesion {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  buffer: string;
  /** cursor de lectura: lo ya entregado al modelo. */
  leido: number;
  ultimaActividad: number;
  cwd: string;
  shell: string;
  cerrada: boolean;
  codigoSalida: number | null;
  /**
   * v1.70.7 — Se resuelve cuando la sonda de calibración contestó (o caducó).
   * `enviarTerminal` espera esto ANTES de escribir la orden del modelo: así la
   * ventana de reposo mide la respuesta real, no el arranque en frío del shell.
   */
  listo: Promise<void>;
  /** Despierta a quien espere `listo` (calibración terminada o abortada). */
  despertarProba: () => void;
}

const SESIONES = new Map<string, Sesion>();
let contador = 0;

function nuevoId(): string {
  contador += 1;
  return `term_${Date.now().toString(36)}_${contador}`;
}

/**
 * v1.70.7 — LA SONDA DE CALIBRACIÓN.
 *
 * QUÉ PASABA (rojo real de Mario en Windows, v1.70.6): `abrirTerminal` lanza
 * cmd/PowerShell y `enviarTerminal` espera un `reposoMs` a ojo (700 ms en la
 * suite). Con el disco frío y el antivirus mirando, PowerShell tardaba en
 * despertar MÁS que el reposo: la ventana se cerraba antes de que el eco
 * existiera y `terminal_leer` devolvía vacío. La suite «ve la salida del eco»
 * fallaba a veces sí a veces no — el peor tipo de rojo, el que no se puede
 * reproducir a demanda.
 *
 * QUÉ HACE: nada más nacer la sesión escribe `echo <token>` por stdin. El
 * arranque del shell NO se mide con sueño: se mide con evidencia — cuando el
 * token aparece en el búfer, el shell está despierto y sus tubos funcionando.
 * `enviarTerminal` espera esa prueba ANTES de escribir la orden del modelo, de
 * modo que el reposo se gasta entero en la respuesta real. Caducidad honesta
 * (`CALIBRACION_MS`): si el token no contesta, se sigue igual que antes, sin
 * mentir ni colgarse. El preámbulo y la propia sonda se consumen del búfer
 * (`leido`) para no devolver basura al modelo.
 *
 * Solo se sondea a los shells de verdad (los que entienden `echo` a secas).
 * Un `shell: "python"` u otro REPL personalizado NO recibe la sonda: meterle
 * `echo …` sería corromperle la sesión. Para esos, `listo` se resuelve ya.
 */
const SHELL_SONDEABLE = /^(cmd|command|powershell|pwsh|bash|sh|zsh|fish|dash|ksh)(\.exe|\.com)?$/i;

function calibrar(s: Sesion): void {
  const nombre = basename(s.shell).toLowerCase();
  if (!SHELL_SONDEABLE.test(nombre)) {
    s.despertarProba(); // REPL o shell exótico: no le tocamos el stdin
    return;
  }
  const token = `__CN_LISTO_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}__`;
  const t0 = Date.now();
  const vigilar = setInterval(() => {
    let i = s.buffer.indexOf(token, s.leido);
    if (i >= 0) {
      // El token puede aparecer dos veces (cmd por tubería hace eco de la
      // orden además de imprimir el resultado): se consume hasta el final de
      // la última línea vista.
      while (i >= 0) {
        const fin = s.buffer.indexOf("\n", i);
        s.leido = fin >= 0 ? fin + 1 : s.buffer.length;
        i = s.buffer.indexOf(token, s.leido);
      }
      clearInterval(vigilar);
      s.despertarProba();
      return;
    }
    if (s.cerrada) {
      // Murió (p. ej. ENOENT): NO se consume el búfer — el motivo del fallo
      // tiene que seguir legible para terminal_leer/terminal_enviar.
      clearInterval(vigilar);
      s.despertarProba();
      return;
    }
    if (Date.now() - t0 >= LIMITES.CALIBRACION_MS) {
      clearInterval(vigilar); // shell vivo pero mudo al echo: se sigue igual que antes
      s.despertarProba();
    }
  }, 25);
  vigilar.unref?.(); // la calibración no puede mantener vivo al proceso por sí sola
  try {
    s.proc.stdin.write(`echo ${token}\n`);
  } catch {
    clearInterval(vigilar);
    s.despertarProba();
  }
}

/** Recicla sesiones inactivas o muertas. Idempotente, barato, sin promesas. */
export function recolectar(ahora = Date.now()): number {
  let cerradas = 0;
  for (const [id, s] of SESIONES) {
    if (s.cerrada || estaInactiva(s.ultimaActividad, ahora)) {
      try { s.proc.kill(); } catch { /* ya estaba muerto */ }
      SESIONES.delete(id);
      cerradas += 1;
    }
  }
  return cerradas;
}

/** Abre una terminal persistente. Devuelve el id para enviar/leer/cerrar. */
export function abrirTerminal(opts: { cwd?: string; shell?: string } = {}): { ok: boolean; id?: string; error?: string } {
  recolectar();
  if (SESIONES.size >= LIMITES.MAX_SESIONES) {
    return { ok: false, error: `Límite de ${LIMITES.MAX_SESIONES} terminales vivas alcanzado. Cierra alguna con terminal_cerrar.` };
  }
  const shell = resolverShell(opts.shell);
  const cwd = opts.cwd || process.cwd();
  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(shell, [], { cwd, env: process.env, windowsHide: true }) as ChildProcessWithoutNullStreams;
  } catch (e: any) {
    return { ok: false, error: `No se pudo abrir el shell "${shell}": ${e?.message || e}` };
  }
  const id = nuevoId();
  // v1.70.7 — La promesa de calibración nace con la sesión: nadie espera a un
  // shell que todavía no tiene permiso para recibir la orden del modelo.
  let despertar: (() => void) | null = null;
  const listo = new Promise<void>((r) => { despertar = r; });
  const s: Sesion = {
    id, proc, buffer: "", leido: 0, ultimaActividad: Date.now(), cwd, shell, cerrada: false, codigoSalida: null,
    listo,
    despertarProba: () => { const d = despertar; despertar = null; if (d) d(); },
  };
  const absorber = (chunk: Buffer | string) => {
    s.buffer = recortarAnillo(s.buffer, chunk.toString());
    s.ultimaActividad = Date.now();
  };
  proc.stdout.on("data", absorber);
  proc.stderr.on("data", absorber);
  // v1.60.16 — RED DE SEGURIDAD: el ENOENT de un shell inexistente llega por
  // AQUÍ (evento `error` asíncrono), no por el try/catch de arriba. Sin este
  // listener, Node lo convierte en excepción no atrapada y TUMBA el servidor.
  // Lo capturamos, marcamos la sesión como cerrada y dejamos el motivo en el
  // búfer para que `terminal_leer`/`terminal_enviar` lo cuenten en cristiano.
  proc.on("error", (err: any) => {
    s.cerrada = true;
    s.codigoSalida = s.codigoSalida ?? -1;
    const esEnoent = err?.code === "ENOENT";
    const pista = esEnoent
      ? ` El shell "${shell}" no existe en este sistema` +
        (os.platform() === "win32" ? ` (en Windows usa "powershell.exe" o "cmd.exe").` : `.`)
      : "";
    s.buffer = recortarAnillo(s.buffer, `\n[terminal] No se pudo abrir el shell: ${err?.message || err}.${pista}\n`);
    s.ultimaActividad = Date.now();
  });
  proc.on("exit", (code) => { s.cerrada = true; s.codigoSalida = code ?? null; });
  SESIONES.set(id, s);
  calibrar(s); // v1.70.7 — dispara la sonda; resuelve `s.listo` cuando el shell contesta
  return { ok: true, id };
}

/**
 * Envía texto al stdin de una sesión y, tras una ventana de reposo, devuelve
 * TODO lo nuevo que haya salido desde la última lectura. No es tiempo real:
 * es "escribo, dejo respirar al shell, te traigo lo acumulado".
 */
export async function enviarTerminal(args: { id: string; data: string; reposoMs?: number }): Promise<{ ok: boolean; salida?: string; cerrada?: boolean; codigo?: number | null; error?: string }> {
  const s = SESIONES.get(args.id);
  if (!s) return { ok: false, error: `Terminal "${args.id}" no existe (¿caducó por inactividad?). Abre otra con terminal_abrir.` };
  if (s.cerrada) return { ok: false, error: `La terminal "${args.id}" ya se cerró (código ${s.codigoSalida}).`, cerrada: true, codigo: s.codigoSalida };
  // v1.70.7 — PRIMERO que el shell demuestre estar despierto (sonda de
  // calibración), DESPUÉS se escribe la orden del modelo. Al revés, el reposo
  // se gastaba en el arranque de Windows y la salida llegaba tarde: la suite
  // «ve la salida del eco» era un dado.
  await s.listo;
  if (s.cerrada) return { ok: false, error: `La terminal "${args.id}" ya se cerró (código ${s.codigoSalida}).`, cerrada: true, codigo: s.codigoSalida };
  try {
    s.proc.stdin.write(normalizarEntrada(args.data));
  } catch (e: any) {
    return { ok: false, error: `No se pudo escribir en la terminal: ${e?.message || e}` };
  }
  const reposo = typeof args.reposoMs === "number" ? Math.max(0, Math.min(args.reposoMs, 10_000)) : LIMITES.REPOSO_MS;
  await new Promise((r) => setTimeout(r, reposo));
  const nuevo = s.buffer.slice(s.leido);
  s.leido = s.buffer.length;
  return { ok: true, salida: nuevo, cerrada: s.cerrada, codigo: s.codigoSalida };
}

/** Lee lo acumulado sin escribir nada (útil para procesos largos). */
export function leerTerminal(id: string): { ok: boolean; salida?: string; cerrada?: boolean; codigo?: number | null; error?: string } {
  const s = SESIONES.get(id);
  if (!s) return { ok: false, error: `Terminal "${id}" no existe.` };
  const nuevo = s.buffer.slice(s.leido);
  s.leido = s.buffer.length;
  return { ok: true, salida: nuevo, cerrada: s.cerrada, codigo: s.codigoSalida };
}

/** Cierra una terminal y libera su proceso. Idempotente. */
export function cerrarTerminal(id: string): { ok: boolean; error?: string } {
  const s = SESIONES.get(id);
  if (!s) return { ok: true }; // ya no está: cerrar es idempotente
  try { s.proc.kill(); } catch { /* ya muerto */ }
  SESIONES.delete(id);
  return { ok: true };
}

/** Lista las terminales vivas (para la UI o para depurar). */
export function listarTerminales(): Array<{ id: string; cwd: string; shell: string; cerrada: boolean; bytes: number }> {
  recolectar();
  return [...SESIONES.values()].map((s) => ({ id: s.id, cwd: s.cwd, shell: s.shell, cerrada: s.cerrada, bytes: s.buffer.length }));
}

/** Para tests: cierra todo y resetea el contador. */
export function _resetTodo(): void {
  for (const s of SESIONES.values()) { try { s.proc.kill(); } catch { /* */ } }
  SESIONES.clear();
  contador = 0;
}
