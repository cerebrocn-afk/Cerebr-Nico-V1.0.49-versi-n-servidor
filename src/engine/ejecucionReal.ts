/**
 * ejecucionReal.ts — CICLO REAL DE UN PROYECTO: instalar → construir → probar → previsualizar (v1.53.7)
 * ========================================================================================
 * PASO 3 de la HOJA DE RUTA v1.54. QUÉ AÑADE Y POR QUÉ (honestidad técnica):
 *
 * CerebroNico PROMETE «corro tu proyecto», pero hasta aquí cada ejecución era un
 * disparo suelto (run_command / pc_exec): abre shell, ejecuta UN comando, muere.
 * Eso NO es un CICLO: no sabe que `build` depende de `install`, no corta cuando
 * `install` falla, no distingue un `test` que termina (exit 0/1) de un `preview`
 * que se queda VIVO sirviendo. Resultado: el modelo «canta» que todo pasó sin
 * que nadie encadenara las fases ni mirara los códigos de salida de verdad.
 *
 * Este módulo orquesta el ciclo REAL y HONESTO:
 *   1) deriva las órdenes de fase del `package.json` y del gestor detectado
 *      (npm/pnpm/yarn/bun) — sin inventar scripts que no existen;
 *   2) las ejecuta EN ORDEN, cortando en la primera fase bloqueante que falla
 *      (las siguientes quedan OMITIDAS, no fingidas);
 *   3) captura stdout+stderr (búfer de anillo con tope) y el código de salida
 *      REAL de cada fase, con su duración medida;
 *   4) trata `preview` como lo que es — un SERVIDOR de larga duración—: no espera
 *      exit 0, declara «VIVA» cuando el proceso anuncia que arrancó y lo deja
 *      corriendo (registrado para poder matarlo).
 *
 * CONVENCIONES CerebroNico (igual que terminalInteractivo.ts):
 *   - Módulo del motor (src/engine/), comentarios en español.
 *   - La LÓGICA PURA (derivar órdenes, decidir continuar/abortar, agregar el
 *     resultado, detectar silencio) va PRIMERO y es testeable SIN spawnear nada:
 *     el ejecutor de fase es un LANZADOR INYECTABLE. Por eso el harness .mjs
 *     prueba el ciclo entero con comandos SIMULADOS en Node v16.
 *   - El trato con el SO (spawn) queda en una capa fina al final (lanzadorReal).
 *   - Nada de red por sí mismo: hereda el entorno; no abre ningún puerto propio.
 *
 * CABLEADO MÍNIMO (NO toca server.ts — trinquete intacto). Para engancharlo, una
 * única herramienta/handler nuevo puede hacer, sin crecer el monolito:
 *     import { ejecutarCicloReal } from "./engine/ejecucionReal";
 *     const r = await ejecutarCicloReal(cwdDelProyecto, { incluirPreview: true });
 * y devolver `r.resumen` + `r.fases`. Mientras ese cable no exista, el módulo es
 * HUÉRFANO a propósito (probado, no cableado) — igual que declaró el PASO 1.
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import * as path from "node:path";

// ────────────────────────────────────────────────────────────
// LÍMITES (defensivos: un búfer sin tope o un servidor que nunca anuncia son fugas)
// ────────────────────────────────────────────────────────────
export const LIMITES = {
  /** Tope del búfer de salida por fase (caracteres). */
  MAX_SALIDA: 200_000,
  /** Silencio del proceso tras el cual se aborta la fase (ms). Mismo criterio que
   *  el detector de silencio de server/streamContext.ts: NO es un tope absoluto,
   *  se rearma con cada byte; solo salta si el proceso ENMUDECE este tiempo. */
  SILENCIO_MS: 3 * 60 * 1000,
  /** Margen para que un `preview` anuncie que arrancó antes de rendirse (ms). */
  ARRANQUE_SERVIDOR_MS: 90 * 1000,
};

/** Las cuatro fases del ciclo, en su orden natural de dependencia. */
export const ORDEN_FASES = ["instalar", "construir", "probar", "previsualizar"];

/** Patrón por defecto que declara «servidor arriba» en la fase de preview. */
export const LISTO_POR_DEFECTO =
  /(localhost:|127\.0\.0\.1:|https?:\/\/|ready in|listening on|server running|local:\s+http|dev server running|compiled successfully)/i;

// ────────────────────────────────────────────────────────────
// TIPOS
// ────────────────────────────────────────────────────────────
export type Fase = "instalar" | "construir" | "probar" | "previsualizar";
export type EstadoFase = "ok" | "fallo" | "omitida" | "viva";
export type Gestor = "npm" | "pnpm" | "yarn" | "bun";

export interface OrdenFase {
  fase: Fase;
  cmd: string;
  args: string[];
  /** si true, un código ≠0 NO corta el ciclo: se registra y se sigue (no bloqueante). */
  continuarSiFalla?: boolean;
  /** fase de larga duración (servidor): no espera exit 0, declara VIVA al anunciar. */
  servidor?: boolean;
  /** patrón que, al aparecer en la salida, declara el servidor LISTO. */
  listoCuando?: RegExp;
}

export interface ResultadoFase {
  fase: Fase;
  cmd: string;
  codigo: number | null;
  ok: boolean;
  estado: EstadoFase;
  salida: string;
  ms: number;
  motivo?: string;
}

export interface ResultadoCiclo {
  ok: boolean;
  fases: ResultadoFase[];
  abortadaEn?: Fase;
  resumen: string;
}

/** Lo que el ciclo pide a quien ejecute una fase. Inyectable ⇒ testeable sin SO. */
export type LanzadorFase = (orden: OrdenFase) => Promise<ResultadoFase>;

export interface OpcionesCiclo {
  gestor?: Gestor;
  /** fases a NO ejecutar. */
  saltar?: Fase[];
  /** fases cuyo fallo NO corta el ciclo (no bloqueantes). */
  continuarSiFalla?: Fase[];
  /** incluir la fase de preview (servidor). Por defecto true. */
  incluirPreview?: boolean;
  /** patrón que declara el servidor listo (sobre-escribe el de por defecto). */
  listoCuando?: RegExp;
}

// ────────────────────────────────────────────────────────────
// LÓGICA PURA — testeable sin SO
// ────────────────────────────────────────────────────────────

/** Búfer de anillo: conserva la COLA y marca el truncado para no mentir. */
export function recortarSalida(buffer: string, nuevo: string, tope: number = LIMITES.MAX_SALIDA): string {
  const unido = (buffer || "") + (nuevo || "");
  if (unido.length <= tope) return unido;
  return "…[salida anterior truncada]…\n" + unido.slice(unido.length - tope);
}

/** ¿El proceso lleva demasiado tiempo mudo? (mismo criterio que streamContext). */
export function debeAbortarPorSilencio(ultimaActividad: number, ahora: number, idleMs: number = LIMITES.SILENCIO_MS): boolean {
  return ahora - ultimaActividad >= idleMs;
}

/** ¿La salida ya anuncia que el servidor arrancó? */
export function debeDeclararListo(texto: string, listoCuando: RegExp = LISTO_POR_DEFECTO): boolean {
  return !!texto && listoCuando.test(texto);
}

/** Detecta el gestor por los lockfiles presentes (orden de preferencia explcito). */
export function detectarGestor(archivos: string[]): Gestor {
  const hay = (n: string) => Array.isArray(archivos) && archivos.includes(n);
  if (hay("pnpm-lock.yaml")) return "pnpm";
  if (hay("yarn.lock")) return "yarn";
  if (hay("bun.lockb")) return "bun";
  return "npm"; // por defecto, y también con package-lock.json
}

/** El comando concreto de un gestor para instalar o correr un script. */
export function comandoDeGestor(gestor: Gestor, accion: "instalar" | "script", script?: string): { cmd: string; args: string[] } {
  if (accion === "instalar") {
    if (gestor === "npm") return { cmd: "npm", args: ["install"] };
    if (gestor === "pnpm") return { cmd: "pnpm", args: ["install"] };
    if (gestor === "yarn") return { cmd: "yarn", args: ["install"] };
    return { cmd: "bun", args: ["install"] };
  }
  // accion === "script": en esta rama el script es OBLIGATORIO.
  // Guard de causa raíz: estrecha `script?: string` a `string` para el resto
  // de la función (los TS2322 de las líneas de abajo nacían de este `undefined`
  // sin descartar). No es un cast que tape el hueco: si falta el script, es un
  // error de contrato del llamador y se corta aquí con un mensaje claro.
  if (!script) {
    throw new Error("comandoDeGestor: se requiere 'script' cuando accion === 'script'");
  }
  if (script === "test") {
    if (gestor === "yarn") return { cmd: "yarn", args: ["test"] };
    if (gestor === "bun") return { cmd: "bun", args: ["test"] };
    return { cmd: gestor, args: ["test"] }; // npm test / pnpm test
  }
  if (gestor === "yarn") return { cmd: "yarn", args: [script] };      // yarn <script>
  return { cmd: gestor, args: ["run", script] };                      // npm/pnpm/bun run <script>
}

/** ¿El `test` del package.json es el placeholder vacío de `npm init`? */
export function esTestPlaceholder(valor: unknown): boolean {
  return typeof valor === "string" && /no test specified/i.test(valor);
}

/**
 * Deriva las órdenes del ciclo LEYENDO el package.json real — sin inventar
 * scripts. Honesto: lo que no exista se OMITE (no se finge). `preview` toma el
 * primer script de servidor disponible entre preview→start→dev.
 */
export function derivarOrdenes(pkgJson: any, opts: OpcionesCiclo = {}): OrdenFase[] {
  const scripts = (pkgJson && pkgJson.scripts) || {};
  const gestor = opts.gestor || "npm";
  const saltar = Array.isArray(opts.saltar) ? opts.saltar : [];
  const continuarEn = Array.isArray(opts.continuarSiFalla) ? opts.continuarSiFalla : [];
  const ordenes: OrdenFase[] = [];
  const marca = (fase: Fase, base: { cmd: string; args: string[] }): OrdenFase => ({ fase, cmd: base.cmd, args: base.args, continuarSiFalla: continuarEn.includes(fase) });

  if (!saltar.includes("instalar")) {
    ordenes.push(marca("instalar", comandoDeGestor(gestor, "instalar")));
  }
  if (!saltar.includes("construir") && typeof scripts.build === "string" && scripts.build.trim()) {
    ordenes.push(marca("construir", comandoDeGestor(gestor, "script", "build")));
  }
  if (!saltar.includes("probar") && typeof scripts.test === "string" && scripts.test.trim() && !esTestPlaceholder(scripts.test)) {
    ordenes.push(marca("probar", comandoDeGestor(gestor, "script", "test")));
  }
  if (opts.incluirPreview !== false && !saltar.includes("previsualizar")) {
    const cual = ["preview", "start", "dev"].find((s: string) => typeof scripts[s] === "string" && scripts[s].trim());
    if (cual) {
      const base = comandoDeGestor(gestor, "script", cual);
      ordenes.push({ fase: "previsualizar", cmd: base.cmd, args: base.args, servidor: true, listoCuando: opts.listoCuando || LISTO_POR_DEFECTO });
    }
  }
  return ordenes;
}

/**
 * ORQUESTA el ciclo: ejecuta las órdenes EN ORDEN con el `lanzador` inyectado.
 * Corta en la primera fase bloqueante que falla; las siguientes quedan OMITIDAS
 * (no se fingen). Un `servidor` que arranca (estado "viva") NO abre fases nuevas.
 * PURO respecto al SO: no spawnea — por eso el harness lo prueba con comandos
 * simulados. (Las fases ya ejecutadas cuando algo corta SÍ quedan registradas.)
 */
export async function ejecutarCiclo(ordenes: OrdenFase[], lanzador: LanzadorFase): Promise<ResultadoCiclo> {
  const fases: ResultadoFase[] = [];
  let abortadaEn: Fase | undefined;
  let ok = true;
  for (const orden of ordenes) {
    const etiqueta = `${orden.cmd} ${orden.args.join(" ")}`.trim();
    if (abortadaEn) {
      fases.push({ fase: orden.fase, cmd: etiqueta, codigo: null, ok: false, estado: "omitida", salida: "", ms: 0, motivo: `omitida: la fase «${abortadaEn}» cortó el ciclo` });
      continue;
    }
    const r = await lanzador(orden);
    fases.push(r);
    if (orden.servidor) {
      if (r.estado === "fallo") { ok = false; abortadaEn = orden.fase; }
      continue; // un servidor VIVO no abre fases nuevas
    }
    if (!r.ok && !orden.continuarSiFalla) { ok = false; abortadaEn = orden.fase; }
  }
  return { ok, fases, abortadaEn, resumen: resumenHonesto(fases, abortadaEn, ok) };
}

/** Un parte HONESTO del ciclo: estado real de cada fase + total medido. */
export function resumenHonesto(fases: ResultadoFase[], abortadaEn?: Fase, ok?: boolean): string {
  if (!fases.length) return "No había fases que ejecutar (ningún script derivable del package.json).";
  const icono: Record<string, string> = { ok: "\u2713", fallo: "\u2717", omitida: "\u2014", viva: "\u25b6" };
  const lineas = fases.map((f: ResultadoFase) =>
    `${icono[f.estado] || "?"} ${f.fase}: ${f.estado}` +
    `${f.codigo !== null ? ` (código ${f.codigo})` : ""}` +
    `${f.motivo ? ` — ${f.motivo}` : ""} [${f.ms} ms]`);
  const totalMs = fases.reduce((s: number, f: ResultadoFase) => s + (f.ms || 0), 0);
  const noBloq = fases.filter((f: ResultadoFase) => f.estado === "fallo" && abortadaEn !== f.fase).length;
  const cab = abortadaEn
    ? `CICLO CORTADO en «${abortadaEn}» (las fases siguientes quedaron omitidas).`
    : (ok === false ? "CICLO con fallos NO bloqueantes." : "CICLO COMPLETO sin fallos bloqueantes.");
  const extra = noBloq > 0 ? ` ${noBloq} fase(s) fallaron pero estaban marcadas como no bloqueantes.` : "";
  return `${cab}${extra}\n${lineas.join("\n")}\nTotal: ${totalMs} ms.`;
}

// ────────────────────────────────────────────────────────────
// CAPA CON SO — el único sitio que toca procesos del sistema (spawn)
// ────────────────────────────────────────────────────────────
// NOTA DE HONESTIDAD: esta capa NO se ejecuta en el entorno dev (sin red, sin
// node_modules, sin un proyecto real que instalar). Su lógica de orquestación
// SÍ está probada arriba con un lanzador SIMULADO; el ciclo REAL (install/build/
// test/preview sobre un proyecto de verdad) queda SIN VERIFICAR aquí y debe
// correrlo Mario en su máquina.

/** Servidores (fase preview) que quedaron VIVOS, para poder matarlos después. */
const SERVIDORES = new Map<Fase, ReturnType<typeof spawn>>();

/** Lanzador REAL: spawnea el comando, captura salida con búfer de anillo y
 *  detector de silencio rearmable (mismo criterio que streamContext). Para una
 *  fase `servidor` resuelve «VIVA» al anunciar que arrancó y DEJA el proceso
 *  corriendo; para el resto resuelve con el código de salida REAL. */
export function lanzadorReal(base: { cwd?: string; env?: NodeJS.ProcessEnv; idleMs?: number } = {}): LanzadorFase {
  const cwd = base.cwd || process.cwd();
  const env = base.env || process.env;
  const idleMs = typeof base.idleMs === "number" ? base.idleMs : LIMITES.SILENCIO_MS;

  return (orden: OrdenFase): Promise<ResultadoFase> => new Promise((resolve) => {
    const t0 = Date.now();
    const etiqueta = `${orden.cmd} ${orden.args.join(" ")}`.trim();
    let salida = "";
    let ultima = Date.now();
    let resuelto = false;
    let proc: ReturnType<typeof spawn>;
    try {
      // shell:true para que `npm`/`pnpm`/`yarn` resuelvan en Windows (.cmd) y *nix.
      proc = spawn(orden.cmd, orden.args, { cwd, env, shell: true, windowsHide: true });
    } catch (e: any) {
      resolve({ fase: orden.fase, cmd: etiqueta, codigo: null, ok: false, estado: "fallo", salida: String(e?.message || e), ms: Date.now() - t0, motivo: "no se pudo lanzar el proceso" });
      return;
    }
    const reloj = setInterval(() => {
      if (!resuelto && debeAbortarPorSilencio(ultima, Date.now(), idleMs)) {
        resuelto = true;
        clearInterval(reloj);
        try { proc.kill(); } catch { /* ya muerto */ }
        resolve({ fase: orden.fase, cmd: etiqueta, codigo: null, ok: false, estado: "fallo", salida, ms: Date.now() - t0, motivo: `el proceso enmudeció ${Math.round(idleMs / 1000)}s (detector de silencio)` });
      }
    }, 1000);
    const absorber = (chunk: Buffer | string) => {
      salida = recortarSalida(salida, chunk.toString());
      ultima = Date.now();
      if (orden.servidor && !resuelto && debeDeclararListo(salida, orden.listoCuando)) {
        resuelto = true;
        clearInterval(reloj);
        SERVIDORES.set(orden.fase, proc); // se deja VIVO a propósito
        resolve({ fase: orden.fase, cmd: etiqueta, codigo: null, ok: true, estado: "viva", salida, ms: Date.now() - t0, motivo: "servidor arriba (proceso vivo)" });
      }
    };
    if (proc.stdout) proc.stdout.on("data", absorber);
    if (proc.stderr) proc.stderr.on("data", absorber);
    proc.on("error", (e: any) => {
      if (resuelto) return;
      resuelto = true;
      clearInterval(reloj);
      resolve({ fase: orden.fase, cmd: etiqueta, codigo: null, ok: false, estado: "fallo", salida, ms: Date.now() - t0, motivo: String(e?.message || e) });
    });
    proc.on("exit", (code: number | null) => {
      if (resuelto) return;
      resuelto = true;
      clearInterval(reloj);
      const ok = code === 0;
      resolve({ fase: orden.fase, cmd: etiqueta, codigo: code, ok, estado: ok ? "ok" : "fallo", salida, ms: Date.now() - t0 });
    });
  });
}

/** Mata los servidores de preview que quedaron vivos. Idempotente. */
export function detenerServidores(): number {
  let n = 0;
  for (const [fase, proc] of SERVIDORES) {
    try { proc.kill(); } catch { /* ya muerto */ }
    SERVIDORES.delete(fase);
    n += 1;
  }
  return n;
}

/** Conveniencia (capa SO): lee el package.json y los lockfiles del `cwd`,
 *  deriva las órdenes y corre el ciclo REAL. Punto de enganche para el cable
 *  mínimo descrito en la cabecera. SIN VERIFICAR en el entorno dev. */
export async function ejecutarCicloReal(cwd: string, opts: OpcionesCiclo = {}): Promise<ResultadoCiclo> {
  let pkg: any = {};
  try {
    const ruta = path.join(cwd, "package.json");
    if (existsSync(ruta)) pkg = JSON.parse(readFileSync(ruta, "utf8"));
  } catch { /* package.json ilegible → sin scripts derivables */ }
  let archivos: string[] = [];
  try { archivos = readdirSync(cwd); } catch { /* cwd ilegible */ }
  const gestor = opts.gestor || detectarGestor(archivos);
  const ordenes = derivarOrdenes(pkg, { ...opts, gestor });
  if (!ordenes.length) {
    return { ok: false, fases: [], resumen: "No se derivaron órdenes: el package.json no tiene scripts ejecutables (build/test/preview) y no se pudo ni instalar." };
  }
  return ejecutarCiclo(ordenes, lanzadorReal({ cwd }));
}
