/**
 * evidenciaTurno.ts — EL ACTA DE LO QUE EL TURNO HIZO DE VERDAD (v1.46.0)
 * =======================================================================
 * QUÉ ES: el registro, por turno, de cada herramienta que el motor ejecutó y con
 * qué resultado. De aquí sale la EVIDENCIA que se le entrega al revisor de
 * certeza (`certezaModelo.revisarSalida`).
 *
 * POR QUÉ EXISTE (el agujero que cierra)
 * --------------------------------------
 * Hasta la v1.46.0 la cadena de certeza del chat estaba CORTADA en dos sitios, y
 * se verificó leyendo el código, no suponiendo:
 *
 *   1. `StreamContext.setEvidencia()` estaba definido y NO se llamaba desde
 *      ningún sitio. Sin llamada, `this.evidencia` se quedaba en `{}`, y
 *      `certezaDe({})` devuelve SIEMPRE `sin_verificar`. Es decir: el revisor no
 *      podía distinguir un turno donde se ejecutaron doce herramientas de uno
 *      donde el modelo solo charló. La certeza existía como vocabulario, no como
 *      medida.
 *   2. `motorEvidencia.ts` (Fase 4, con evidencia tipada y 29 comprobaciones)
 *      tampoco se importaba en `server.ts`: estaba construido y desconectado.
 *
 * Este módulo es el cable que faltaba. No inventa un motor nuevo: toma el ÚNICO
 * punto por el que pasan todas las herramientas (`executeToolCall`) y convierte
 * su resultado en evidencia con las reglas que el proyecto ya declaró.
 *
 * LA REGLA QUE NO SE NEGOCIA: ESCRIBIR NO ES PROBAR
 * -------------------------------------------------
 * `certeza.ts` lo dice con todas las letras —«`ejecutado` NO se deduce nunca de
 * una lectura»— y este módulo añade la mitad que faltaba:
 *
 *   · `write_file` / `edit_file` / `delete_file` NO conceden certeza.
 *     Que una herramienta diga «escrito» no prueba que el archivo esté bien: solo
 *     prueba que se intentó. Por eso `ordenDeObra` ya resuelve la certeza CONTRA
 *     EL DISCO al cerrar, y por eso aquí una escritura se anota (para el acta)
 *     pero no sube ningún escalón.
 *   · `list_files` / `read_file` conceden `leido`. Nada más.
 *   · Solo `run_command`, `run_tests` y `pc_exec` pueden conceder `ejecutado`,
 *     y solo si su salida dice `ok: true` Y no trae marcador de fallo.
 *
 * EL MARCADOR DE FALLO MANDA SOBRE EL «ok»
 * ----------------------------------------
 * Un runner puede devolver `ok: true` con salida que dice «3 tests failed». Si
 * se mirara solo el `ok`, el motor afirmaría «todo bien» con la prueba en contra
 * delante. Heredamos la regla del §8 de `motorEvidencia`: si hay marcador de
 * fallo, gana el fallo. Y se copia su criterio de conteo —`[1-9]\d*`— para que
 * «0 failed» / «0 errors» NO cuenten como fracaso pero tampoco como éxito: no
 * conceden nada por sí solos.
 *
 * PUREZA: `clasificarHerramienta` y `salidaTieneFallo` son puras y se prueban
 * solas. El registro vive en memoria de módulo, igual que `auditoriaBucle` y
 * `motorEvidencia`: un turno, un acta. No lee disco ni red.
 */

import type { EvidenciaModelo } from "./certezaModelo";

/** Clase de una herramienta: qué puede conceder cuando sale bien. */
export type ClaseHerramienta =
  | "lectura"
  | "ejecucion"
  | "escritura"
  | "planificacion"
  | "red"
  | "calculo";

/** Una herramienta ejecutada en el turno, con lo que de verdad devolvió. */
export interface HerramientaEjecutada {
  nombre: string;
  clase: ClaseHerramienta;
  /** `ok: true` leído de la salida de la herramienta. */
  ok: boolean;
  /** true si la salida trae marcador de fallo. Manda sobre `ok`. */
  fallo: boolean;
  /** Primeros caracteres de la salida, recortados para el acta. */
  muestra: string;
  /**
   * v1.56.7 — COLA de la salida (últimos caracteres), recortada para el acta.
   * Desviación justificada: los marcadores que CERTIFICAN una capa de QA
   * («130 correctas · 0 fallidas», «build failed», «0 bloqueantes») viven al
   * PIE de la salida, y `muestra` (cabeza, 180 chars) los corta. Sin la cola, la
   * matriz de verificación (`autovalido.verifMatriz`) leería PARCIAL siempre y
   * jamás podría cerrar en verde. Opcional y aditivo: cero regresión.
   */
  muestraFinal?: string;
  /**
   * v1.56.7 — EL COMANDO que originó la ejecución (de `run_command`/`pc_exec`),
   * cuando la clase es `ejecucion`. Lo pasa `server.ts` desde `args.command`.
   * Es la pista que la matriz de verificación usa para saber QUÉ capa de QA se
   * corrió (build/tsc → sintaxis/tipos; test/validar → unit; install → deps;
   * cerradura → seguridad). Opcional: una ejecución sin comando no concede capa.
   */
  comando?: string;
  /** ¿Subió algún escalón de certeza? Se guarda para poder auditarlo. */
  concedio: "ejecutado" | "leido" | null;
}

/** El acta completa del turno. */
export interface ActaTurno {
  leido: boolean;
  ejecutado: boolean;
  lectura: number;
  ejecucion: number;
  escritura: number;
  conFallo: number;
  herramientas: HerramientaEjecutada[];
}

/**
 * Las 32 herramientas de `executeToolCall`, clasificadas a mano y a la vista.
 * Deliberadamente explícita: una lista adivinada por prefijos («pc_*» = peligro)
 * clasificaría mal el día que se añada una herramienta, y ese día nadie lo
 * notaría. Aquí, una herramienta nueva cae en «desconocida» y NO concede nada.
 */
const CLASES: Record<string, ClaseHerramienta> = {
  // ── Lectura: mirar el código o el estado. Concede `leido`. ─────────────────
  read_file: "lectura",
  read_file_range: "lectura",
  list_files: "lectura",
  find_symbol: "lectura",
  search_in_files: "lectura",
  pc_read_file: "lectura",
  pc_list_dir: "lectura",
  pc_info: "lectura",
  git_status: "lectura",
  git_diff: "lectura",
  ollama_estado: "lectura",
  recursos_maquina: "lectura",
  revisar_cambios: "lectura",

  // ── Ejecución: un proceso real corrió. Único camino a `ejecutado`. ────────
  run_command: "ejecucion",
  run_tests: "ejecucion",
  pc_exec: "ejecucion",

  // ── Escritura: mutan. Se anotan, NO conceden certeza. ─────────────────────
  write_file: "escritura",
  edit_file: "escritura",
  append_file: "escritura",
  delete_file: "escritura",
  make_dir: "escritura",
  pc_write_file: "escritura",
  pc_delete: "escritura",
  git_commit: "escritura",
  deshacer_cambios: "escritura",
  forjar_complemento: "escritura",

  // ── Ni una cosa ni la otra. ───────────────────────────────────────────────
  set_plan: "planificacion",
  update_task: "planificacion",
  fetch_url: "red",
  consultar_espejo: "calculo",
  convertir_formato: "calculo",
};

/**
 * Marcadores que convierten una salida en FALLO, aunque la herramienta diga
 * `ok: true`. Copiados del criterio del §8: el conteo exige `[1-9]` para que
 * «0 failed» / «0 errors» no cuenten como fracaso. Y no se usan como ÉXITO
 * tampoco: ver «0 failed» no prueba que algo se haya ejecutado bien.
 */
const MARCADORES_DE_FALLO: RegExp[] = [
  /"ok"\s*:\s*false/i,
  /\bFailed\b/,
  /\bFAIL\b/,
  /✗/,
  /✘/,
  /\bError:/,
  /Traceback \(most recent call last\)/,
  /command not found/i,
  /is not recognized as an internal or external command/i,
  /No such file or directory/i,
  /exit code[:= ]+[1-9]/i,
  /\b[1-9]\d*\s+(?:tests?\s+)?failed\b/i,
  /\b[1-9]\d*\s+errors?\b/i,
];

/** ¿La salida trae un marcador de fallo? Pura y probada. */
export function salidaTieneFallo(salida: string): boolean {
  const s = String(salida ?? "");
  return MARCADORES_DE_FALLO.some((re) => re.test(s));
}

/** Clase de una herramienta. Desconocida si no está en la tabla (no concede). */
export function clasificarHerramienta(nombre: string): ClaseHerramienta | null {
  return CLASES[String(nombre ?? "")] ?? null;
}

/** Estado en memoria de módulo: un turno, un acta. */
let actaActual: HerramientaEjecutada[] = [];

/** Abre turno: se llama al crear el `StreamContext`, que es un turno. */
export function abrirTurnoEvidencia(): void {
  actaActual = [];
}

/**
 * Lee el `ok` de la salida de una herramienta. Los 32 handlers devuelven
 * `JSON.stringify({...})`, así que se parsea. Si NO parsea se devuelve `false`:
 * se prefiere no conceder certeza antes que concederla por un formato que no se
 * entiende. El proyecto entero se apoya en esa asimetría.
 */
export function okDeSalida(salida: string): boolean {
  try {
    const j = JSON.parse(String(salida ?? ""));
    return j?.ok === true;
  } catch {
    return false;
  }
}

/** La cola (últimos N caracteres) de la salida, para capturar los marcadores de
 *  cierre que viven al pie del log (ver `HerramientaEjecutada.muestraFinal`). */
function colaDeSalida(salida: string, n = 240): string {
  const s = String(salida ?? "");
  return s.length > n ? s.slice(-n) : s;
}

/**
 * Anota una herramienta ejecutada. Es el punto que faltaba: se llama desde
 * `executeToolCall`, que es el ÚNICO sitio por el que pasan todas.
 *
 * v1.56.7 — admite un tercer argumento OPCIONAL `comando`: el comando crudo que
 * originó la ejecución (`args.command` en `server.ts`). Solo se guarda cuando la
 * clase es `ejecucion` (una lectura o escritura no lleva «comando de QA»). La
 * firma anterior `anotarHerramienta(nombre, salida)` sigue siendo válida: el
 * tercer parámetro es opcional (cero regresión).
 */
export function anotarHerramienta(nombre: string, salida: string, comando?: string): HerramientaEjecutada {
  const clase = clasificarHerramienta(nombre);
  const ok = okDeSalida(salida);
  const fallo = salidaTieneFallo(salida);

  let concedio: HerramientaEjecutada["concedio"] = null;
  if (clase === "ejecucion" && ok && !fallo) concedio = "ejecutado";
  else if (clase === "lectura" && ok && !fallo) concedio = "leido";

  const entrada: HerramientaEjecutada = {
    nombre: String(nombre ?? ""),
    clase: clase ?? "calculo",
    ok,
    fallo,
    muestra: String(salida ?? "").slice(0, 180),
    muestraFinal: colaDeSalida(salida),
    concedio,
  };
  // El comando solo tiene sentido para una EJECUCIÓN (es la traza de QA).
  const cmd = String(comando ?? "").trim();
  if (cmd && clase === "ejecucion") entrada.comando = cmd.slice(0, 300);
  actaActual.push(entrada);
  return entrada;
}

/** El acta del turno en curso. */
export function actaDelTurno(): ActaTurno {
  const h = actaActual;
  return {
    leido: h.some((x) => x.concedio === "leido" || x.concedio === "ejecutado"),
    ejecutado: h.some((x) => x.concedio === "ejecutado"),
    lectura: h.filter((x) => x.clase === "lectura").length,
    ejecucion: h.filter((x) => x.clase === "ejecucion").length,
    escritura: h.filter((x) => x.clase === "escritura").length,
    conFallo: h.filter((x) => x.fallo).length,
    herramientas: [...h],
  };
}

/**
 * La evidencia, en la forma que ya espera `certezaModelo`. Un turno sin
 * herramientas devuelve `{}`, que es exactamente lo mismo que devolvía antes:
 * `sin_verificar`. La diferencia es que ahora, cuando SÍ hubo trabajo, se sabe.
 */
export function evidenciaDelTurno(): EvidenciaModelo {
  const a = actaDelTurno();
  return {
    ...(a.ejecutado ? { ejecutado: true } : {}),
    ...(a.leido ? { leido: true } : {}),
  };
}

/** Una línea legible para el registro, sin afirmar más de lo medido. */
export function resumenDelActa(a: ActaTurno = actaDelTurno()): string {
  if (a.herramientas.length === 0) return "sin herramientas ejecutadas en el turno";
  return (
    `${a.herramientas.length} herramienta(s): ` +
    `${a.lectura} lectura · ${a.ejecucion} ejecución · ${a.escritura} escritura` +
    (a.conFallo ? ` · ${a.conFallo} con marcador de fallo` : "")
  );
}
