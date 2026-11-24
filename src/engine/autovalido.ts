/**
 * autovalido.ts — EL FISCAL DEL ÚLTIMO METRO, YA CON CUERPO (v1.49.0)
 * ====================================================================
 * QUÉ ES: el confirmador FINAL del proceso. Antes de imprimir cualquier cierre
 * de tarea («listo», entrega, respuesta final), este módulo fiscaliza si el
 * trabajo está realmente correcto para declararse hecho. Si todas sus casillas
 * están en verde → CONFIRMADO y recién ahí se imprime. Si alguna está en rojo →
 * RECHAZADO con un log del error que vuelve al bucle para reparar. Nada se da
 * por «terminado» sin pasar por aquí.
 *
 * EL SALTO SOBRE v1.48: hasta aquí el fiscal era POLÍTICA (prosa) repartida en
 * `autovalido.md` §7 — una ley legible, pero sin un veredicto propio que
 * `decidirBucle` consultara. Un modelo podía cantar «listo, funciona» con el
 * acta vacía (lo que §5 prohíbe) porque no había un GUARDIÁN en el último
 * metro. Este módulo es ese guardián: su contrato es `autovalido.md` y su suite
 * vive en `tests/autovalido.test.ts`.
 *
 * NO REIMPLEMENTA NADA. Delega en las fuentes únicas ya existentes y sólo las
 * CORONA con un veredicto:
 *   · criterios de aceptación → `planAdaptativo` (EstadoContratoResumen).
 *   · evidencia tipada       → `motorEvidencia` (EstadoEvidencias) + `evidenciaTurno` (ActaTurno).
 *   · promesas vs disco      → `completitud` (VeredictoCompletitud).
 *   · honestidad del texto   → `conversacionPrimero` (pareceNoEspanol) + marca de cierre.
 *   · tarea pesada           → `conciencia` (pareceTareaPesada, decidido fuera y pasado aquí).
 *
 * GRAFO ACÍCLICO: importa funciones puras de `motorEvidencia` y
 * `conversacionPrimero`, y SOLO TIPOS de `planAdaptativo` / `evidenciaTurno` /
 * `completitud`. NUNCA importa `bucleAutonomo` (sería ciclo): es el bucle el que
 * importa a este módulo, no al revés.
 *
 * PUREZA: `evaluarCasillas`, `coberturaDe` y `componerLog` son puras. El conteo
 * de rechazos consecutivos vive en memoria de módulo — un turno, un fiscal —
 * igual que `motorEvidencia`/`planAdaptativo`; `reiniciarAutovalido()` lo limpia
 * al abrir el turno.
 */

import type { EstadoEvidencias } from "./motorEvidencia";
import { pareceNoEspanol } from "./conversacionPrimero";
import type { EstadoContratoResumen } from "./planAdaptativo";
import type { ActaTurno } from "./evidenciaTurno";
import type { VeredictoCompletitud } from "./completitud";
// v1.56.7 — CABLEADO de la SOFTWARE QA MATRIX al fiscal del último metro.
// El fiscal no reimplementa la matriz: importa sus funciones PURAS y la CORONA
// con una casilla más. Grafo acíclico intacto: matrizVerificacion no conoce al
// autovalido (la flecha va autovalido → matrizVerificacion → motorEvidencia).
import {
  evaluarMatriz,
  directivaDeMatriz,
  matrizAParte,
  type EvidenciasPorCapa,
  type DictamenMatriz,
  type PerfilQA,
  type CapaQA,
} from "./matrizVerificacion";
// v2.3.10 — LA CONDUCTA DE LIMPIAR DESPUÉS DE LA TAREA, CABLEADA AL FISCAL.
// El módulo existía desde v2.3.9 y NADIE lo importaba: un huérfano con su suite
// en verde, justo la plaga que `presupuestoHuerfanos` corta. Su punto de uso
// natural es el último metro: «no digas listo con temporales vivos» es una
// casilla más del dictamen, no una frase en un prompt. Criterio puro: el
// barrido CLASIFICA, no borra (las manos siguen siendo fs_delete).
import { barrerAlCerrar, type BarridoDeCierre } from "./limpiezaTarea";
// v2.3.11 — EL CIERRE QUE SE JUZGA A SÍ MISMO, CABLEADO AL FISCAL.
// El usuario lo pidió así: «al finalizar las tareas esto en md, se auto evalúa y
// se saca un veredicto y se guarda automáticamente las lecciones aprendidas».
// La autoevaluación de cinco ejes entra como casilla 14: el fiscal ya corre en
// cada turno, así que el cierre deja de ser una promesa del prompt y pasa a ser
// algo que el último metro EXIGE. Grafo acíclico: autoevaluacion importa SOLO
// tipos de este módulo, nunca funciones.
import { evaluarAutoevaluacion, type EntradaCierre } from "./autoevaluacion";

// ══════════════════════════════════════════════════════════════
// LAS CASILLAS — 6 del §2 + 5 del §8
// ══════════════════════════════════════════════════════════════

/** Las 11 casillas del fiscal. Las 6 primeras (§2) corren siempre; las 5
 *  últimas (§8) solo en tarea pesada. El token coincide con el `casilla=` del
 *  log del §4 para que el bucle lo trate como `ultimoFallo`. */
export type CasillaFiscal =
  | "criterios"
  | "evidencia"
  | "fallos"
  | "honestidad"
  | "promesas"
  | "reversibilidad"
  | "verifMatriz"
  | "idea"
  | "coherencia"
  | "contratos"
  | "estados_limite"
  | "seguridad"
  | "limpieza"
  | "autoevaluacion";

/** v1.56.7 — el token de la casilla que CORONA la SOFTWARE QA MATRIX (§2.7).
 *  Se exporta para que `server.ts` imprima su parte (`cas.matriz`) al panel. */
export const CASILLA_MATRIZ: CasillaFiscal = "verifMatriz";

/** Las casillas del §2 (siempre) y las del §8 (solo tarea pesada). */
export const CASILLAS_BASE: CasillaFiscal[] = [
  "criterios", "evidencia", "fallos", "honestidad", "promesas", "reversibilidad", "verifMatriz",
];
export const CASILLAS_PESADA: CasillaFiscal[] = [
  "idea", "coherencia", "contratos", "estados_limite", "seguridad",
];

/** Cobertura honesta (§6.5): no se promedia ni se redondea hacia arriba. */
export type EstadoCasilla = "verde" | "roja" | "sinProbar";

export interface ResultadoCasilla {
  casilla: CasillaFiscal;
  estado: EstadoCasilla;
  /** Qué faltó o qué estaba mal (va al `motivo=` del log). */
  motivo: string;
  /** El siguiente paso concreto para repararlo (va al `directiva=` del log). */
  directiva: string;
  /**
   * v1.56.7 — solo para la casilla `verifMatriz`: el dictamen tabular de la
   * SOFTWARE QA MATRIX, para que `server.ts` lo imprima al panel (`matrizAParte`).
   * El resto de casillas lo dejan `undefined` (aditivo, cero regresión).
   */
  matriz?: DictamenMatriz;
}

export type VeredictoFiscal = "CONFIRMADO" | "RECHAZADO";

/** Umbral del §5: la misma casilla roja que no cede tras N rechazos escala a
 *  BLOQUEO honesto (no se cuelga reintentando). */
export const UMBRAL_BLOQUEO_FISCAL = 3;

/** Marca de «cierre optimista» en el texto: afirma «hecho/funciona». */
const RE_CIERRE_FISCAL =
  /\b(listo|hecho|completad[oa]|terminad[oa]|finalizad[oa]|funciona|exitos[oa]|\u00e9xito|ya est\u00e1|resuelto|conseguido)\b/i;

/**
 * La ENTRADA del fiscal: todo lo que el motor ya sabe del turno, tomado de las
 * fuentes únicas. Todo opcional: un turno sin una fuente deja esa casilla en
 * `sinProbar` (cobertura honesta), nunca en verde por defecto.
 */
export interface EntradaFiscal {
  /** El texto de cierre que se quiere imprimir. */
  texto?: string | null;
  /** ¿Tarea pesada / de responsabilidad? Activa las casillas del §8. */
  tareaPesada?: boolean;
  /** §2.1 — criterios de aceptación (planAdaptativo.estadoContrato()). */
  contrato?: EstadoContratoResumen | null;
  /** §2.2 — tablero de claims tipados (motorEvidencia.estadoEvidencias()). */
  evidencias?: EstadoEvidencias | null;
  /** §2.2/§2.4 — acta de herramientas del turno (evidenciaTurno.actaDelTurno()). */
  acta?: ActaTurno | null;
  /** §2.3 — fallo abierto de la última herramienta. */
  ultimoFallo?: { herramienta: string; error: string } | null;
  /** §2.3 — veces que la misma firma de error volvió (para la escalera). */
  firmaRepetida?: number;
  /** §2.5 — contraste plan↔manifiesto↔disco (completitud.verificarCompletitud()). */
  completitud?: VeredictoCompletitud | null;
  /** §2.6 — se ejecutó algo irreversible sin confirmación humana previa. */
  irreversibleSinConfirmar?: boolean;
  /**
   * §2.8 (v2.3.10) — rutas que el agente CREÓ en este turno para trabajar.
   * Ausente o vacío → la casilla `limpieza` queda `sinProbar` (cero regresión).
   * Con rutas → el fiscal exige que no queden temporales vivos antes del «listo».
   */
  rutasCreadas?: string[] | null;
  /**
   * §2.9 (v2.3.11) — los datos del CIERRE para la autoevaluación de cinco ejes.
   * Ausente → la casilla `autoevaluacion` queda `sinProbar` (cero regresión).
   * Con datos → el fiscal exige que el turno se juzgue a sí mismo antes del «listo».
   */
  cierre?: EntradaCierre | null;
  /**
   * §2.7 (v1.56.7) — el PERFIL de QA con el que se exige la matriz
   * (web/servicio/libreria/cli/base). Ausente → "base" (solo las obligatorias
   * base: sintaxis, tipos, dependencias, unit, seguridad).
   */
  perfilQa?: PerfilQA | null;
  // ── §8 (solo tarea pesada) ───────────────────────────────────
  /** §8.7 — la idea se reformuló y confirmó (o se declaró un supuesto). */
  ideaConfirmada?: boolean | null;
  /** §8.8 — incoherencia arquitectónica detectada (texto) o null si no se miró. */
  incoherenciaArquitectonica?: string | null;
  /** §8.9 — contratos entre piezas rotos (de auditarPreservacion), [] si limpio, null si no se miró. */
  contratosRotos?: string[] | null;
  /** §8.10 — estados límite cubiertos (vacío/cargando/error/…). */
  estadosLimiteCubiertos?: boolean | null;
  /** §8.11 — señales de seguridad por defecto. */
  seguridad?: {
    secretos?: boolean;
    endpointSinControl?: boolean;
    entradasSinValidar?: boolean;
    escaneoLimpio?: boolean;
  } | null;
}

/** El dictamen completo del último metro. */
export interface DictamenFiscal {
  veredicto: VeredictoFiscal;
  casillas: ResultadoCasilla[];
  rojas: ResultadoCasilla[];
  /** Cobertura honesta (§6.5): cuántas verdes vs rojas vs sin probar. */
  cobertura: { verde: number; roja: number; sinProbar: number; total: number };
  /** Rechazos consecutivos de la peor casilla roja (escalera §5). */
  rechazosConsecutivos: number;
  /** Casilla que ya no cede (≥ UMBRAL) o null. */
  casillaBloqueada: CasillaFiscal | null;
  /** true si el veredicto es RECHAZADO y una casilla roja no cede. */
  bloqueo: boolean;
  /** El log del §4 (una línea por casilla roja) o "" si CONFIRMADO. */
  log: string;
}

// ══════════════════════════════════════════════════════════════
// LAS COMPROBACIONES POR CASILLA (puras)
// ══════════════════════════════════════════════════════════════

const R = (casilla: CasillaFiscal, estado: EstadoCasilla, motivo: string, directiva: string): ResultadoCasilla =>
  ({ casilla, estado, motivo, directiva });

/** §2.1 — criterios cumplidos. Sin contrato declarado NO bloquea (cero regresión). */
export function evaluarCriterios(contrato?: EstadoContratoResumen | null): ResultadoCasilla {
  if (!contrato || contrato.total === 0)
    return R("criterios", "verde", "sin criterios de aceptaci\u00f3n declarados: nada que fiscalizar", "");
  if (contrato.abierto) {
    const falta = contrato.pendientes
      .map((p) => `${p.id}: ${p.sinVerificar.map((c) => `\u00ab${c}\u00bb`).join(" ")}`)
      .join(" · ");
    const agot = contrato.agotados.length ? ` · presupuesto agotado: ${contrato.agotados.join(", ")}` : "";
    return R(
      "criterios",
      "roja",
      `criterios sin evidencia — ${falta || "(ver contrato)"}${agot}`,
      "verific\u00e1 cada criterio (build/test/lectura de disco) y cerr\u00e1 con update_task adjuntando la evidencia",
    );
  }
  return R("criterios", "verde", `los ${contrato.total} criterios tienen evidencia`, "");
}

/** §2.2 — evidencia del tipo correcto. Sin claims registrados = sinProbar. */
export function evaluarEvidencia(evidencias?: EstadoEvidencias | null): ResultadoCasilla {
  if (!evidencias || evidencias.total === 0)
    return R("evidencia", "sinProbar", "no se registraron claims tipados este turno", "registr\u00e1 las afirmaciones de «hecho» como claims y adjunt\u00e1 su prueba");
  if (evidencias.fallidos.length)
    return R("evidencia", "roja", `claims FALLIDOS: ${evidencias.fallidos.join(", ")}`, "repar\u00e1 el fallo y vuelve a adjuntar la evidencia real de la herramienta");
  if (evidencias.pendientes.length) {
    const p = evidencias.pendientes[0];
    return R(
      "evidencia",
      "roja",
      `${evidencias.pendientes.length} afirmaci\u00f3n(es) sin evidencia del tipo correcto — ${p.id} [${p.estado}] «${p.afirmacion.slice(0, 60)}»`,
      `produc\u00ed la prueba con: ${p.comando} (la prosa no es evidencia)`,
    );
  }
  return R("evidencia", "verde", `${evidencias.verificados}/${evidencias.total} claims VERIFICADOS`, "");
}

/** §2.3 — sin fallos abiertos. */
export function evaluarFallos(ultimoFallo?: { herramienta: string; error: string } | null, firmaRepetida = 0): ResultadoCasilla {
  if (ultimoFallo)
    return R(
      "fallos",
      "roja",
      `fallo abierto: «${ultimoFallo.herramienta}» — ${String(ultimoFallo.error).slice(0, 160)}${firmaRepetida >= 2 ? ` (firma repetida ${firmaRepetida}\u00d7)` : ""}`,
      "o se repara (cambiar de camino) o se declara BLOQUEO honesto; no se cierra como «hecho» sobre un fallo abierto",
    );
  return R("fallos", "verde", "no hay fallos abiertos ni firma repiti\u00e9ndose", "");
}

/** §2.4 — honestidad del texto: idioma + no afirmar «funciona» sin evidencia. */
export function evaluarHonestidad(texto?: string | null, acta?: ActaTurno | null): ResultadoCasilla {
  const t = String(texto || "").trim();
  if (!t) return R("honestidad", "sinProbar", "no hay texto de cierre que juzgar", "");
  if (pareceNoEspanol(t))
    return R("honestidad", "roja", "la prosa parece NO estar en espa\u00f1ol (el usuario escribe en espa\u00f1ol)", "reescrib\u00ed la explicaci\u00f3n en espa\u00f1ol antes de enviarla");
  const afirmaCierre = RE_CIERRE_FISCAL.test(t);
  if (afirmaCierre && acta && !acta.ejecutado && !acta.leido)
    return R(
      "honestidad",
      "roja",
      "el texto afirma «funciona/hecho» pero el acta del turno no registra ni ejecuci\u00f3n ni lectura",
      "ejecut\u00e1 o le\u00e9 lo que afirmas (run_command/run_tests/read_file) y adjunt\u00e1 la salida, o quit\u00e1 la afirmaci\u00f3n de «hecho»",
    );
  return R("honestidad", "verde", "idioma correcto y sin afirmaciones de «hecho» sin respaldo", "");
}

/** §2.5 — nada prometido sin entregar (plan↔manifiesto↔disco). */
export function evaluarPromesas(completitud?: VeredictoCompletitud | null): ResultadoCasilla {
  if (!completitud) return R("promesas", "sinProbar", "no se contrast\u00f3 plan↔manifiesto↔disco este turno", "");
  if (completitud.ok) return R("promesas", "verde", "lo prometido existe en disco, no vac\u00edo ni truncado", "");
  const partes: string[] = [];
  if (completitud.prometidoFalta.length) partes.push(`prometido sin escribir: ${completitud.prometidoFalta.slice(0, 6).join(", ")}`);
  if (completitud.enlacesRotos.length) partes.push(`enlaces al vac\u00edo: ${completitud.enlacesRotos.slice(0, 4).join(" | ")}`);
  if (completitud.vacios.length) partes.push(`0 bytes: ${completitud.vacios.slice(0, 6).join(", ")}`);
  if (completitud.truncados.length) partes.push(`truncados: ${completitud.truncados.slice(0, 6).join(", ")}`);
  if (completitud.arranque.length) partes.push(`hueco de arranque: ${completitud.arranque.join(" | ")}`);
  return R("promesas", "roja", partes.join(" · ") || "hay huecos entre promesa y disco", "escrib\u00ed/complet\u00e1 lo que falta y volv\u00e9 a verificar contra el disco");
}

/** §2.6 — reversibilidad respetada. */
export function evaluarReversibilidad(irreversibleSinConfirmar?: boolean): ResultadoCasilla {
  if (irreversibleSinConfirmar === true)
    return R("reversibilidad", "roja", "se ejecut\u00f3 una acci\u00f3n irreversible sin confirmaci\u00f3n humana previa", "nunca ejecutes lo irreversible sin confirmar; declar\u00e1 el riesgo y ped\u00ed permiso");
  return R("reversibilidad", "verde", "ninguna acci\u00f3n irreversible sin confirmar", "");
}

// ══════════════════════════════════════════════════════════════
// §2.7 (v1.56.7) — LA CASILLA QUE CORONA LA SOFTWARE QA MATRIX
// ══════════════════════════════════════════════════════════════
//
// El fiscal cierra el metro con una casilla más: cruza el acta del turno
// (`evidenciaTurno`) con la matriz de capas (`matrizVerificacion`). Si en el
// turno SE CORRIÓ alguna capa de QA (build, tipos, tests, deps, seguridad), el
// fiscal exige que las OBLIGATORIAS del perfil estén VERIFICADAS antes de cerrar.
// Si NO se corrió ninguna capa (un turno que solo escribió prosa o leyó código),
// la casilla queda `sinProbar` — no roja — para no castigar la escritura (cero
// regresión). Grafo acíclico: autovalido → matrizVerificacion → motorEvidencia.

/**
 * Patrones que mapean el COMANDO de una ejecución a la capa de QA que acredita.
 * Se leen del `comando` del acta (v1.56.7). Conservadores: un comando que no
 * casa con ninguno NO aporta capa (no inventa cobertura).
 */
export const PATRONES_CAPA_QA: Array<{ capa: CapaQA; re: RegExp }> = [
  { capa: "tipos",        re: /\btsc\b|--noemit|type-?check|tsgo/i },
  { capa: "sintaxis",     re: /\b(build|compile|compila|esbuild|vite\s+build|rollup|webpack|swc)\b/i },
  { capa: "dependencias", re: /\b(npm\s+(ci|install|i)|yarn(\s+(add|install))?|pnpm\s+(install|add|i)|node_modules)\b/i },
  { capa: "unit",         re: /\b(test|tests|jest|vitest|mocha|ava|run_tests|npm\s+run\s+validar|validar\.mjs)\b/i },
  { capa: "seguridad",    re: /\b(audit|cerradura|preflight|eslint|lint|snyk|semgrep)\b/i },
];

/**
 * Deriva la evidencia POR CAPA a partir del acta del turno. Toma solo las
 * EJECUCIONES con comando, casa el comando contra `PATRONES_CAPA_QA` y usa como
 * texto de evidencia la cabeza + la cola de la salida (los marcadores de cierre
 * —«0 failed», «build ok», «0 bloqueantes»— viven al PIE, de ahí `muestraFinal`,
 * v1.56.7). Pura: no toca disco ni red.
 */
export function derivarEvidenciaPorCapa(acta?: ActaTurno | null): EvidenciasPorCapa {
  const out: EvidenciasPorCapa = {};
  if (!acta || !Array.isArray(acta.herramientas)) return out;
  for (const h of acta.herramientas) {
    if (h.clase !== "ejecucion") continue;
    const cmd = String(h.comando || "").trim();
    if (!cmd) continue;
    const salida = `${String(h.muestra || "")}\n${String(h.muestraFinal || "")}`.trim();
    for (const { capa, re } of PATRONES_CAPA_QA) {
      if (re.test(cmd)) {
        out[capa] = out[capa] ? `${out[capa]}\n${salida}` : salida;
      }
    }
  }
  return out;
}

/**
 * §2.7 — corona la SOFTWARE QA MATRIX. Sin ninguna capa de QA corrida en el
 * turno → `sinProbar` (cero regresión sobre un turno de escritura). Con capas
 * corridas → delega el veredicto en `evaluarMatriz`: roja si alguna obligatoria
 * del perfil quedó sin VERIFICAR o alguna capa FALLÓ (con `directivaDeMatriz`),
 * verde si todas las obligatorias están VERIFICADAS. Perfil ausente → "base".
 */
export function evaluarVerifMatriz(acta?: ActaTurno | null, perfil?: PerfilQA | null): ResultadoCasilla {
  const p: PerfilQA = perfil || "base";
  const evid = derivarEvidenciaPorCapa(acta);
  if (Object.keys(evid).length === 0)
    return R("verifMatriz", "sinProbar", "no se corrió ninguna capa de QA (build/tipos/tests/deps/seguridad) este turno", "");
  const dict = evaluarMatriz(evid, p);
  if (dict.puedeDecirTerminado) {
    const res = R("verifMatriz", "verde", `las capas obligatorias (perfil ${p}) están VERIFICADAS`, "");
    res.matriz = dict;
    return res;
  }
  const partes: string[] = [];
  if (dict.fallidas.length) partes.push(`FALLARON: ${dict.fallidas.join(", ")}`);
  if (dict.obligatoriasPendientes.length) partes.push(`obligatorias sin VERIFICAR: ${dict.obligatoriasPendientes.join(", ")}`);
  const res = R(
    "verifMatriz",
    "roja",
    partes.join(" · ") || "la matriz de QA quedó incompleta",
    directivaDeMatriz(dict, p) || "corré las capas obligatorias que faltan y adjuntá su salida real",
  );
  res.matriz = dict;
  return res;
}

// ── §8 (solo tarea pesada): verde solo con prueba, rojo con problema, si no sinProbar ──

/** §8.7 — idea interpretada y confirmada. */
export function evaluarIdea(ideaConfirmada?: boolean | null): ResultadoCasilla {
  if (ideaConfirmada === true) return R("idea", "verde", "la idea se reformul\u00f3 y confirm\u00f3 (o se declar\u00f3 un supuesto)", "");
  if (ideaConfirmada === false) return R("idea", "roja", "se tecle\u00f3 sobre una interpretaci\u00f3n t\u00e1cita, sin reformular ni confirmar", "reformul\u00e1 qu\u00e9 pide DE VERDAD y confirm\u00e1 (o declar\u00e1 el supuesto por defecto)");
  return R("idea", "sinProbar", "no consta si la idea se reformul\u00f3 y confirm\u00f3", "");
}

/** §8.8 — coherencia arquitectónica. */
export function evaluarCoherencia(incoherencia?: string | null): ResultadoCasilla {
  const s = String(incoherencia || "").trim();
  if (s) return R("coherencia", "roja", `incoherencia estructural: ${s.slice(0, 160)}`, "respet\u00e1 las fronteras de las piezas y las convenciones; no metas l\u00f3gica donde no toca");
  return R("coherencia", "sinProbar", "no se audit\u00f3 la coherencia arquitect\u00f3nica", "");
}

/** §8.9 — contratos entre piezas respetados. */
export function evaluarContratos(contratosRotos?: string[] | null): ResultadoCasilla {
  if (!Array.isArray(contratosRotos)) return R("contratos", "sinProbar", "no se audit\u00f3 la preservaci\u00f3n de contratos entre piezas", "");
  if (contratosRotos.length) return R("contratos", "roja", `contrato(s) roto(s) en silencio: ${contratosRotos.slice(0, 6).join(", ")}`, "implement\u00e1 contra el contrato de la frontera, no contra la tripa del vecino");
  return R("contratos", "verde", "las interfaces en las fronteras tocadas siguen cumpli\u00e9ndose", "");
}

/** §8.10 — estados límite cubiertos. */
export function evaluarEstadosLimite(cubiertos?: boolean | null): ResultadoCasilla {
  if (cubiertos === true) return R("estados_limite", "verde", "hay respuesta para vac\u00edo/cargando/error/muchos/offline/sin permiso", "");
  if (cubiertos === false) return R("estados_limite", "roja", "solo el camino feliz: faltan estados l\u00edmite", "cubr\u00ed vac\u00edo, cargando, error, muchos, offline y sin permiso donde apliquen");
  return R("estados_limite", "sinProbar", "no consta la cobertura de estados l\u00edmite", "");
}

/**
 * §2.8 (v2.3.10) — LIMPIEZA DE CIERRE: no se dice «listo» con temporales vivos.
 *
 * Nació de un hecho medido: el agente fue a mirar dos ZIP en `Downloads` y para
 * hacerlo dejó OCHO scripts suyos y una carpeta con 18 archivos extraídos. La
 * suite `peluza` se puso roja con razón — el fallo no era del código, era del
 * agente. Esta casilla convierte esa conducta en algo que el fiscal EXIGE.
 *
 * Sin rutas declaradas → `sinProbar` (cero regresión: un turno que no creó
 * temporales no tiene nada que barrer). Con rutas → delega en `barrerAlCerrar`:
 * verde si no queda nada por borrar ni por preguntar, roja si queda, y el
 * motivo nombra QUÉ quedó. Los secretos y artefactos NO se tocan nunca: se
 * reportan como intactos, jamás como pendientes de borrado.
 */
export function evaluarLimpieza(rutasCreadas?: string[] | null): ResultadoCasilla {
  if (!Array.isArray(rutasCreadas) || rutasCreadas.length === 0)
    return R("limpieza", "sinProbar", "el turno no declaró rutas creadas: nada que barrer", "");
  const barrido: BarridoDeCierre = barrerAlCerrar(rutasCreadas);
  if (barrido.limpio)
    return R("limpieza", "verde", barrido.informe, "");
  const partes: string[] = [];
  if (barrido.borrar.length) partes.push(`temporales sin borrar: ${barrido.borrar.slice(0, 6).join(", ")}`);
  if (barrido.preguntar.length) partes.push(`rutas sin clasificar (preguntar antes de tocar): ${barrido.preguntar.slice(0, 6).join(", ")}`);
  return R(
    "limpieza",
    "roja",
    partes.join(" · ") || "quedan restos del turno",
    "borrá los temporales que creaste (fs_delete los manda a papelera) y preguntá por lo que no reconozcas; el respaldo del usuario NO se borra",
  );
}

/** §8.11 — seguridad por defecto. */
export function evaluarSeguridad(seg?: EntradaFiscal["seguridad"]): ResultadoCasilla {
  if (!seg) return R("seguridad", "sinProbar", "no se audit\u00f3 la seguridad por defecto", "");
  const malos: string[] = [];
  if (seg.secretos) malos.push("secretos incrustados");
  if (seg.endpointSinControl) malos.push("endpoint nuevo sin control de acceso declarado");
  if (seg.entradasSinValidar) malos.push("entradas externas sin validar");
  if (malos.length) return R("seguridad", "roja", malos.join(" · "), "valid\u00e1 entradas, no incrustes secretos y declar\u00e1 qui\u00e9n puede llamar a cada endpoint nuevo");
  if (seg.escaneoLimpio) return R("seguridad", "verde", "entradas validadas, sin secretos y endpoints con control", "");
  return R("seguridad", "sinProbar", "se\u00f1ales de seguridad incompletas", "");
}

/**
 * Corre las casillas del §2 (siempre) y, si la tarea es pesada, suma las del
 * §8. Función PURA: no toca memoria de módulo.
 */
export function evaluarCasillas(e: EntradaFiscal): ResultadoCasilla[] {
  const base: ResultadoCasilla[] = [
    evaluarCriterios(e.contrato),
    evaluarEvidencia(e.evidencias),
    evaluarFallos(e.ultimoFallo, e.firmaRepetida),
    evaluarHonestidad(e.texto, e.acta),
    evaluarPromesas(e.completitud),
    evaluarReversibilidad(e.irreversibleSinConfirmar),
    evaluarVerifMatriz(e.acta, e.perfilQa),
  ];
  if (!e.tareaPesada) return base;
  return base.concat([
    evaluarIdea(e.ideaConfirmada),
    evaluarCoherencia(e.incoherenciaArquitectonica),
    evaluarContratos(e.contratosRotos),
    evaluarEstadosLimite(e.estadosLimiteCubiertos),
    evaluarSeguridad(e.seguridad),
  ]);
}

/**
 * v2.3.11 — LAS CASILLAS DEL CIERRE, separadas del fiscal.
 *
 * `limpieza` y `autoevaluacion` NO son casillas del §2 ni del §8: son del
 * CIERRE del turno. Meterlas en `evaluarCasillas` rompía el contrato medido
 * por `tests/autovalido.test.ts` (7 base + 5 pesada = 12) y la suite lo cazó
 * con cuatro rojos. Se separan aquí, donde sí corren siempre y sin tocar el
 * conteo del fiscal.
 *
 * PURA: no toca memoria de módulo.
 */
export function evaluarCierre(e: EntradaFiscal): ResultadoCasilla[] {
  return [
    // Dejar basura no es un problema de tarea grande, es de cualquier turno.
    evaluarLimpieza(e.rutasCreadas),
    // Todo turno que declara datos de cierre se juzga a sí mismo.
    evaluarAutoevaluacion(e.cierre),
  ];
}

/** Cobertura honesta (§6.5): cuenta cada estado, no promedia. */
export function coberturaDe(casillas: ResultadoCasilla[]): DictamenFiscal["cobertura"] {
  let verde = 0, roja = 0, sinProbar = 0;
  for (const c of casillas) {
    if (c.estado === "verde") verde++;
    else if (c.estado === "roja") roja++;
    else sinProbar++;
  }
  return { verde, roja, sinProbar, total: casillas.length };
}

/** El log del §4: una línea por casilla roja, lista para el `ultimoFallo` del bucle. */
export function componerLog(rojas: ResultadoCasilla[]): string {
  return rojas
    .map((c) => `[AUTOVALIDO/RECHAZADO] casilla=${c.casilla}\n   motivo=${c.motivo}\n   directiva=${c.directiva}`)
    .join("\n");
}

// ══════════════════════════════════════════════════════════════
// EL VEREDICTO + LA ESCALERA (memoria de módulo: un turno, un fiscal)
// ══════════════════════════════════════════════════════════════

/** Cuántas veces consecutivas cada casilla volvió roja en este turno. */
let rechazos: Map<CasillaFiscal, number> = new Map();

/** Un turno, un fiscal: se llama al abrir el `StreamContext`. */
export function reiniciarAutovalido(): void {
  rechazos = new Map();
}

/** Solo lectura para tests y panel. */
export function verContadores(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of rechazos) o[k] = v;
  return o;
}

/**
 * EL FISCAL. Evalúa las casillas, actualiza la escalera de rechazos y dictamina.
 * CONFIRMADO si no hay rojas; RECHAZADO si hay al menos una. Una casilla que
 * vuelve roja sube su contador; una que se pone verde (o sinProbar) lo resetea:
 * la escalera solo cuenta la insistencia de LA MISMA casilla. Si una roja llega
 * al UMBRAL, el dictamen pide BLOQUEO (§5: nunca colgarse reintentando).
 */
export function fiscalizar(e: EntradaFiscal): DictamenFiscal {
  const casillas = evaluarCasillas(e);
  const rojas = casillas.filter((c) => c.estado === "roja");
  const veredicto: VeredictoFiscal = rojas.length ? "RECHAZADO" : "CONFIRMADO";

  const rojasSet = new Set(rojas.map((c) => c.casilla));
  // Actualiza la escalera: +1 a las rojas de ahora, 0 a las que ya no lo son.
  for (const c of casillas) {
    if (rojasSet.has(c.casilla)) rechazos.set(c.casilla, (rechazos.get(c.casilla) || 0) + 1);
    else rechazos.set(c.casilla, 0);
  }

  let rechazosConsecutivos = 0;
  let casillaBloqueada: CasillaFiscal | null = null;
  for (const c of rojas) {
    const n = rechazos.get(c.casilla) || 0;
    if (n > rechazosConsecutivos) {
      rechazosConsecutivos = n;
      if (n >= UMBRAL_BLOQUEO_FISCAL) casillaBloqueada = c.casilla;
    }
  }
  const bloqueo = veredicto === "RECHAZADO" && casillaBloqueada !== null;

  return {
    veredicto,
    casillas,
    rojas,
    cobertura: coberturaDe(casillas),
    rechazosConsecutivos,
    casillaBloqueada,
    bloqueo,
    log: veredicto === "RECHAZADO" ? componerLog(rojas) : "",
  };
}

// ══════════════════════════════════════════════════════════════
// LO QUE EL BUCLE Y EL PANEL CONSUMEN
// ══════════════════════════════════════════════════════════════

/** Cobertura en una línea legible, para el cierre CONFIRMADO. */
export function coberturaAParte(d: DictamenFiscal): string {
  const c = d.cobertura;
  return `\u2696\ufe0f FISCAL [${d.veredicto}] — ${c.verde} verde(s) · ${c.roja} roja(s) · ${c.sinProbar} sin probar (de ${c.total} casillas)`;
}

/**
 * v1.56.7 — el parte tabular de la SOFTWARE QA MATRIX para el panel, derivado
 * del dictamen del fiscal. Busca la casilla `verifMatriz`; si trae su matriz
 * devuelve la tabla de capas (✓/✗/~/·) con cabecera, si no, cadena vacía. Así
 * `server.ts` lo emite en UNA sola línea sin crecer (trinquete del contrato).
 */
export function parteMatrizPanel(d: DictamenFiscal | null | undefined): string {
  const c = d?.casillas?.find((x) => x.casilla === CASILLA_MATRIZ);
  return c?.matriz ? `\ud83e\uddea SOFTWARE QA MATRIX\n${matrizAParte(c.matriz)}` : "";
}

/** El acta de BLOQUEO del §5: alto honesto que pide decisión humana. */
export function actaBloqueoFiscal(d: DictamenFiscal): string {
  return [
    "\ud83d\uded1 FISCAL — BLOQUEADO en el \u00faltimo metro: no es un «listo», es un alto honesto.",
    `Casilla que no cede: «${d.casillaBloqueada}» (roja ${d.rechazosConsecutivos}\u00d7 seguidas).`,
    `Estrategias ya gastadas: reparar → cambiar de camino → re-auditar, y la casilla sigue roja.`,
    d.log,
    "Decisi\u00f3n requerida (humano): resolver esa casilla o aceptar el cierre como BLOQUEO declarado.",
  ].filter(Boolean).join("\n");
}

/**
 * LA LEY DEL FISCAL para el prompt (tarea pesada). Comprimida: le dice al modelo
 * que su cierre pasará por una auditoría y qué casillas la componen, para que no
 * cante «listo» sobre obra sin evidencia.
 */
export function contratoFiscalPrompt(): string {
  return [
    "[FISCAL DEL \u00daLTIMO METRO — tu cierre ser\u00e1 auditado antes de imprimirse]",
    "Ning\u00fan «listo» se imprime sin veredicto CONFIRMADO. El fiscal revisa, en orden:",
    "1) CRITERIOS cumplidos (cada criterio con evidencia); 2) EVIDENCIA del tipo correcto (leer concede «existe», solo ejecutar concede «funciona»; escribir NO prueba; «0 errores» no es \u00e9xito); 3) sin FALLOS abiertos; 4) HONESTIDAD del texto (en espa\u00f1ol, sin afirmar «funciona» sin corrida); 5) nada PROMETIDO sin entregar en disco; 6) REVERSIBILIDAD respetada; 7) SOFTWARE QA MATRIX: si corriste alguna capa (build/tipos/tests/deps/seguridad), las OBLIGATORIAS del perfil deben estar VERIFICADAS — no se cierra con una capa obligatoria sin correr o en fallo.",
    "En tarea pesada suma: idea interpretada y confirmada, coherencia arquitect\u00f3nica, contratos entre piezas, estados l\u00edmite y seguridad por defecto.",
    "Si una casilla queda roja, tu turno vuelve al bucle con el motivo; no insistas sobre la misma: cambi\u00e1 de camino o declar\u00e1 el BLOQUEO con honestidad.",
  ].join("\n");
}

/**
 * 3 entradas de KB con el saber del fiscal, sembradas en la base de conocimiento
 * (table recetario-ui, como CONCIENCIA_KB_ENTRIES). Tipadas laxas para no
 * acoplar KbEntry a este m\u00f3dulo puro.
 */
export const AUTOVALIDO_KB_ENTRIES = [
  {
    id: "ba-fiscal-contrato",
    table: "recetario-ui",
    title: "Fiscal del \u00faltimo metro: ning\u00fan «listo» sin CONFIRMADO",
    body:
      "Antes de imprimir un cierre («listo», entrega, respuesta final) el motor corre el autovalido: 7 casillas base (criterios, evidencia, fallos, honestidad, promesas, reversibilidad y verifMatriz — la SOFTWARE QA MATRIX) y, en tarea pesada, 5 m\u00e1s (idea, coherencia, contratos, estados l\u00edmite, seguridad). Si todas est\u00e1n en verde → CONFIRMADO y se imprime. Si una est\u00e1 roja → RECHAZADO: vuelve al bucle con un log por casilla y se repara. No se promedia: cada casilla sin probar se reporta como tal, no como verde.",
    keys: ["autovalido", "fiscal", "cierre", "confirmado", "rechazado", "ultimo metro", "veredicto"],
    tags: ["buenas-practicas", "autovalido", "cierre-honesto"],
    weight: 0.95,
    lang: "es",
  },
  {
    id: "ba-fiscal-evidencia",
    table: "recetario-ui",
    title: "Fiscal: la evidencia tiene tipo (leer ≠ ejecutar)",
    body:
      "Afirmar «hecho» exige evidencia tipada: leer concede «existe», solo ejecutar (run_command/run_tests/pc_exec) concede «funciona», y escribir (write_file/edit_file) NO concede certeza por s\u00ed solo. «0 errores» no prueba \u00e9xito: lo que acredita es la ausencia del marcador de fallo ([1-9] en failed/error), que manda sobre el ok. Una casilla sin evidencia del tipo correcto queda roja y nombrada en el log.",
    keys: ["evidencia", "tipada", "leido", "ejecutado", "escribir no prueba", "0 errores", "matriz"],
    tags: ["buenas-practicas", "autovalido", "evidencia"],
    weight: 0.93,
    lang: "es",
  },
  {
    id: "ba-fiscal-escalera",
    table: "recetario-ui",
    title: "Fiscal: la misma casilla roja que no cede → BLOQUEO",
    body:
      "El fiscal no se cuelga reintentando. Si la misma casilla vuelve roja turno tras turno (umbral 3), el dictamen escala a BLOQUEO honesto: un alto declarado que pide decisi\u00f3n humana, con la casilla, cu\u00e1ntas veces no cedi\u00f3 y las estrategias ya gastadas. BLOQUEADO tambi\u00e9n es un cierre v\u00e1lido — pero DECLARADO como bloqueo, nunca disfrazado de «hecho».",
    keys: ["escalera", "bloqueo", "rechazos", "umbral", "honesto", "decisi\u00f3n humana"],
    tags: ["buenas-practicas", "autovalido", "bloqueo"],
    weight: 0.9,
    lang: "es",
  },
];
