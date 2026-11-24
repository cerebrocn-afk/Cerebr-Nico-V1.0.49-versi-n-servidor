/**
 * espejoVivo.ts — EL MOTOR CUENTA LO QUE ESTÁ HACIENDO (v1.22.0 «MOTOR VIVO»)
 * ============================================================================
 * EL RECLAMO DEL USUARIO, LITERAL: «el cuadro siempre dice 0, debería funcionar
 * solo en bucle». Tenía razón: el Panel de Tareas sólo mostraba los planes que
 * ALGUIEN creara a mano (o por API). El bucle autónomo del chat —el que usa
 * herramientas de verdad— trabajaba en silencio: abría archivos, ejecutaba
 * comandos, reparaba fallos, y el contador seguía en 0. Un panel que sólo se
 * llena cuando el usuario escribe un plan no es un panel del motor: es un
 * formulario.
 *
 * QUÉ HACE ESTO:
 *   Cada turno de `runOllamaAgentLoop` deja una HOJA VIVA en memoria: objetivo,
 *   tareas y CADA paso real de herramienta. `/api/brain/plans` inyecta esa hoja
 *   como un plan más (⚡ en vivo), así que los dos paneles se llenan solos, sin
 *   que nadie cree nada, con cronómetro y feed `>_ herramienta · detalle`.
 *
 *   · Si el modelo DECLARA un plan (`set_plan`), el plan declarado MANDA: los
 *     pasos pasan a ser traza, no hoja de ruta inventada.
 *   · Si nunca declara nada, los pasos SON la hoja de ruta: el trabajo real, en
 *     el orden en que se hizo. Es estrictamente mejor que un 0 eterno.
 *   · El cierre es HONESTO: con tareas sin cerrar la hoja dice `parcial` y
 *     enumera lo que falta. Nunca `hecho` con obra abierta.
 *   · Un turno de charla sin una sola herramienta NO publica hoja: un plan
 *     vacío en el panel sería otro adorno que miente.
 *
 * DÓNDE VIVE: en memoria, una sola hoja por motor (el IDE es de un usuario y
 * una ventana; dos turnos a la vez es un caso que este proyecto no finge
 * resolver — el turno nuevo cierra honestamente al anterior antes de abrirse).
 * El historial de hojas cerradas es v1.24.0; aquí sólo se conserva la última,
 * y se retira tras `CADUCIDAD_CERRADA_MS` para no dejar un fantasma colgado.
 *
 * Es PURA FUNCIÓN (el reloj entra como argumento) y vive fuera de `server.ts`
 * por las dos reglas de la casa: el monolito no crece y lo nuevo se prueba en
 * seco, sin modelo y sin red.
 */

import { normalizarEstado, type EstadoTarea as EstadoBucle } from "./bucleAutonomo";

import { registrarContratoDesdeTareas, actualizarEstadoContrato, registrarEvidenciaContrato } from "./planAdaptativo";
import { planDesdeProsa } from "./planDesdeProsa";
/** Estados de tarea en el idioma del panel (español, como `taskPlanner`). */
export type EstadoVivo =
  | "pendiente"
  | "lista"
  | "en_curso"
  | "hecha"
  | "fallida"
  | "cancelada"
  | "descartada";

/** Estados de la hoja completa. `parcial` = obra abierta, sin mentiras. */
export type EstadoHoja = "en_curso" | "hecho" | "parcial" | "fallido" | "cancelado";

export interface TareaViva {
  id: string;
  titulo: string;
  estado: EstadoVivo;
  /** true = la puso el espejo al ejecutar; false = la declaró el modelo. */
  desdePaso: boolean;
  /** Paso emparejado (para cerrar la tarea cuando cierra el paso). */
  paso: number | null;
  inicio: number | null;
  fin: number | null;
  error: string | null;
  /** true cuando `desdePaso` y la herramienta es de cálculo (cpu). */
  cpu: boolean;
}

export interface PasoVivo {
  n: number;
  herramienta: string;
  detalle: string;
  /** null = todavía corriendo (el turno se cortó antes de responder). */
  ok: boolean | null;
  inicio: number;
  fin: number | null;
  /**
   * v1.70.6 · LA TAREA DECLARADA QUE ESTE PASO ESTÁ CUMPLIENDO. Con plan
   * declarado, el paso ya no crea tarea: la BUSCA y la tacha al terminar.
   * Sin esto, `set_plan` colgaba para siempre (las tareas declaradas nacen
   * con `paso: null` y el cierre viejo solo buscaba por número de paso).
   */
  tareaCasada?: string | null;
}

export interface HojaViva {
  id: string;
  objetivo: string;
  creadoEn: number;
  fin: number | null;
  estado: EstadoHoja;
  /** ¿El modelo declaró plan? Si sí, manda y los pasos son sólo traza. */
  declaroPlan: boolean;
  tareas: TareaViva[];
  pasos: PasoVivo[];
  log: string[];
}

/** Cuánto sigue visible la última hoja cerrada (que el panel no se apague de golpe). */
let CADUCIDAD_CERRADA_MS = 90_000;
const LOG_TOPE = 120;
const OBJETIVO_TOPE = 120;

let viva: HojaViva | null = null;
let cerrada: HojaViva | null = null;

export function fijarCaducidadCerrada(ms: number): void {
  CADUCIDAD_CERRADA_MS = Math.max(0, Math.floor(ms));
}

export function caducidadCerrada(): number {
  return CADUCIDAD_CERRADA_MS;
}

/**
 * Las herramientas que calculan (no esperan): definen el peso de la tarea.
 * OJO con el snake_case: `\bcommand\b` NO casa con «run_command», porque el
 * guion bajo es carácter de palabra y no hay frontera después. Se normaliza el
 * nombre a espacios antes de mirar, o el panel pesaría todo como `io` y el
 * reparto de la máquina se leería mal.
 */
const RE_CPU = /\b(command|exec|build|test|compilar|indexar|convertir)\b/i;
const esCpu = (nombre: string) => RE_CPU.test(String(nombre || "").replace(/[_-]+/g, " "));

/** Truncia sin cortar por el medio de una palabra visible. */
const corto = (s: string, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * El objetivo del turno es lo último que pidió el usuario: se lee del mensaje,
 * no se inventa. Si no hay texto (solo imágenes, o un system largo), la hoja lo
 * dice con «turno del agente» en vez de disfrazar un objetivo imaginario.
 */
export function objetivoDesdeMensajes(mensajes: any[]): string {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i];
    if (m?.role === "user" && typeof m.content === "string" && m.content.trim()) return m.content;
  }
  return "";
}

/** El rótulo de un paso, tal como lo ve el usuario en el panel. */
export function tituloPaso(herramienta: string, detalle: string): string {
  const h = String(herramienta || "herramienta");
  const d = corto(detalle, 60);
  return d ? `>_ ${h} · ${d}` : `>_ ${h}`;
}

function hojaNueva(objetivo: string, ahora: number): HojaViva {
  return {
    id: "vivo",
    objetivo: corto(objetivo, OBJETIVO_TOPE) || "turno del agente",
    creadoEn: ahora,
    fin: null,
    estado: "en_curso",
    declaroPlan: false,
    tareas: [],
    pasos: [],
    log: [],
  };
}

/**
 * Abre la hoja de un turno. Si había otra abierta (turno anterior abortado o
 * colgado), se cierra ANTES con su veredicto real: solaparse dejaría en el
 * panel una tarea en curso que nadie va a cerrar nunca.
 */
export function abrirTurnoVivo(objetivo: string, ahora = Date.now()): HojaViva {
  if (viva) {
    viva.estado = "cancelado";
    cerrar(true, ahora, "el motor abrió un turno nuevo antes de cerrar este");
  }
  cerrada = null;
  viva = hojaNueva(objetivo, ahora);
  return viva;
}

/** La hoja que hay que enseñar ahora mismo: la viva, o la recién cerrada. */
export function hojaViva(ahora = Date.now()): HojaViva | null {
  if (viva) return viva;
  if (cerrada && ahora - (cerrada.fin ?? ahora) <= CADUCIDAD_CERRADA_MS) return cerrada;
  return null;
}

/** La hoja en curso, viva de verdad (sin la caducada): para el bucle. */
export function hojaEnCurso(): HojaViva | null {
  return viva;
}

function anotar(h: HojaViva, texto: string): void {
  h.log.push(corto(texto, 200));
  if (h.log.length > LOG_TOPE) h.log.splice(0, h.log.length - LOG_TOPE);
}

/** Traza del turno en el panel. Sin hoja, no hay nada que anotar. */
export function anotarVivo(texto: string, ahora = Date.now()): void {
  const h = viva ?? hojaViva(ahora);
  if (h) anotar(h, texto);
}

/** `pending` → `pendiente`, `done` → `hecha`… El mismo mapa del bucle. */
function aEstadoVivo(e: EstadoBucle | null): EstadoVivo | null {
  if (!e) return null;
  return e === "pending" ? "pendiente" : e === "running" ? "en_curso" : e === "done" ? "hecha" : "fallida";
}

/** Terminales: ya no cuentan como obra abierta. */
const ABIERTAS = new Set<EstadoVivo>(["pendiente", "lista", "en_curso"]);

/**
 * El modelo declaró su plan (`set_plan`): manda. Las tareas provisionales que
 * había puesto el espejo se retiran (eran la hoja de ruta *provisional*, y el
 * propio modelo acaba de decir cuál es la verdadera); los pasos ejecutados
 * quedan en la traza y en `pasos`, que es donde son historia honesta.
 */
export function declararPlanVivo(tareas: unknown, ahora = Date.now()): void {
  const h = viva;
  if (!h || !Array.isArray(tareas)) return;
  h.declaroPlan = true;
  h.tareas = [];
  tareas.forEach((raw, i) => {
    const t = raw as Record<string, unknown>;
    const estado = aEstadoVivo(normalizarEstado(t?.status)) ?? "pendiente";
    const titulo = corto(String(t?.description ?? t?.titulo ?? ""), 90) || `tarea ${i + 1}`;
    h.tareas.push({
      id: String(t?.id ?? `t${i + 1}`),
      titulo,
      estado,
      desdePaso: false,
      paso: null,
      inicio: estado === "en_curso" ? ahora : null,
      fin: estado === "hecha" || estado === "fallida" ? ahora : null,
      error: null,
      cpu: esCpu(titulo),
    });
  });
  // v1.32.0 · CONTRATO DE ACEPTACIÓN: el mismo array crudo alimenta a
  // planAdaptativo (criterios, presupuesto, tipo). Sin criterios, contrato vacío = v1.31.
  registrarContratoDesdeTareas(tareas);
  anotar(h, `⚡ el modelo declaró ${h.tareas.length} tarea(s): el plan declarado manda`);
}

/** `update_task` del modelo: mueve SU tarea, no la del espejo. */
export function marcarTareaVivo(taskId: string, estadoCrudo: unknown, ahora = Date.now(), evidencia?: unknown): void {
  const h = viva;
  if (!h) return;
  const id = String(taskId ?? "");
  const estado = aEstadoVivo(normalizarEstado(estadoCrudo));
  const t = h.tareas.find((x) => x.id === id) || h.tareas.find((x) => x.id === id.replace(/^t/i, ""));
  if (!t || !estado) {
    // Se dice, no se traga: una actualización que no aterriza es un bug del
    // modelo (o del espejo) y debe ser visible.
    anotar(h, `⚠ update_task #${id || "?"} (${String(estadoCrudo ?? "?")}) no coincide con ninguna tarea`);
    return;
  }
  if (estado === "en_curso" && !t.inicio) t.inicio = ahora;
  if (estado === "hecha" || estado === "fallida") t.fin = ahora;
  t.estado = estado;
  if (estado !== "fallida") t.error = null;
  actualizarEstadoContrato(t.id, estado);
  if (evidencia !== undefined && evidencia !== null && String(evidencia).trim()) registrarEvidenciaContrato(t.id, String(evidencia));
}

/** v1.70.6 — ¿El modelo declaró plan este turno? (para no pisarlo desde fuera). */
export function planDeclaradoEsteTurno(): boolean {
  return !!viva && viva.declaroPlan;
}

/**
 * v1.70.6 · PUBLICAR EL PLAN DE PALABRAS — LA LÓGICA VIVE ACÁ, NO EN EL MONOLITO.
 * La valla `el monolito no gana lógica` (tests/motorVivo.test.ts) cuenta las
 * llamadas de espejo dentro de server.ts y no perdona una de más. Este envoltorio
 * reúne la guarda (¿ya había plan?), el parser puro (planDesdeProsa) y la
 * declaración; quien llama —el bucle local de server.ts o el ciclo cloud— sólo
 * pregunta y reenvía el evento. Devuelve las tareas publicadas o `null`.
 */
export function publicarPlanDePalabras(
  texto: string,
  ahora = Date.now(),
): Array<{ id: string; description: string }> | null {
  if (planDeclaradoEsteTurno()) return null;
  const tareas = planDesdeProsa(texto || "");
  if (tareas.length < 2) return null;
  try {
    declararPlanVivo(tareas, ahora);
  } catch {
    return null;
  }
  return tareas;
}

const STOPWORD_CASA = new Set([
  "que", "los", "las", "del", "por", "con", "para", "una", "unos", "unas", "the", "and", "das", "und",
]);

/** Palabras significativas (≥3 letras, sin acentos) de un rótulo de tarea/paso. */
function fichas(texto: string): string[] {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORD_CASA.has(w));
}

/** Herramientas que ESCRIBEN obra: si no hay coincidencia léxica, adelantan la cola. */
const RE_ESCRITURA = /(write|crear_archivo|fs_write|edit|patch|reemplaz|fs_write)/i;

/**
 * v1.70.6 · TACHA LA TAREA DECLARADA QUE EL PASO ESTÁ CUMPLIENDO.
 * Orden de decisión: coincidencia léxica (títulos compartan ≥1 ficha, la de
 * mejor puntaje) → si el paso escribe y ninguna tarea está casada, la primera
 * pendiente de la cola. La cola es el orden del propio modelo: avanzar sin
 * evidencia sería mentir; avanzar con escritura real, no.
 */
function casarTareaConPaso(h: HojaViva, herramienta: string, detalle: string): TareaViva | null {
  const abiertas = h.tareas.filter((t) => ABIERTAS.has(t.estado));
  if (abiertas.length === 0) return null;
  const fichasPaso = new Set(fichas(`${herramienta} ${detalle}`));
  let mejor: { t: TareaViva; puntaje: number } | null = null;
  for (const t of abiertas) {
    const puntaje = fichas(t.titulo).filter((w) => fichasPaso.has(w)).length;
    if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) mejor = { t, puntaje };
  }
  if (mejor) return mejor.t;
  if (RE_ESCRITURA.test(String(herramienta).toLowerCase())) {
    return abiertas.find((t) => t.estado === "pendiente" || t.estado === "lista") || null;
  }
  return null;
}

/**
 * Empieza un paso real de herramienta. Con los dos casos:
 *   · plan declarado → sólo traza (no se inventa hoja de ruta encima de la suya);
 *   · sin declarar   → el paso ES la tarea, y se cierra con él.
 */
export function empezarPasoVivo(herramienta: string, detalle = "", ahora = Date.now()): PasoVivo | null {
  const h = viva;
  if (!h) return null;
  const paso: PasoVivo = {
    n: h.pasos.length + 1,
    herramienta: String(herramienta || "herramienta"),
    detalle: corto(detalle, 60),
    ok: null,
    inicio: ahora,
    fin: null,
  };
  h.pasos.push(paso);
  if (h.declaroPlan) {
    // v1.70.6 — la traza además TACHA: el paso se casa con su tarea declarada.
    const casada = casarTareaConPaso(h, paso.herramienta, paso.detalle);
    if (casada) {
      if (casada.estado !== "en_curso") {
        casada.estado = "en_curso";
        casada.inicio = ahora;
        try { actualizarEstadoContrato(casada.id, "running"); } catch { /* contrato auxiliar */ }
      }
      paso.tareaCasada = casada.id;
    }
    anotar(h, `${tituloPaso(paso.herramienta, paso.detalle)} ▶${casada ? ` (${casada.id})` : ""}`);
    return paso;
  }
  h.tareas.push({
    id: String(paso.n),
    titulo: tituloPaso(paso.herramienta, paso.detalle),
    estado: "en_curso",
    desdePaso: true,
    paso: paso.n,
    inicio: ahora,
    fin: null,
    error: null,
    cpu: esCpu(paso.herramienta),
  });
  return paso;
}

/** Cierra el paso en curso con su resultado real (lo que devolvió la herramienta). */
export function terminarPasoVivo(ok: boolean, error?: string | null, ahora = Date.now()): void {
  const h = viva;
  if (!h) return;
  const paso = [...h.pasos].reverse().find((p) => p.ok === null);
  if (!paso) return;
  paso.ok = ok;
  paso.fin = ahora;
  // v1.70.6 — primero la tarea DECLARADA con la que este paso casó; si no,
  // la tarea-espejo del paso (modelo sin plan). Así el plan declarado también se tacha.
  const t =
    (paso.tareaCasada ? h.tareas.find((x) => x.id === paso.tareaCasada) : undefined) ||
    h.tareas.find((x) => x.paso === paso.n);
  if (t) {
    t.estado = ok ? "hecha" : "fallida";
    t.fin = ahora;
    t.error = ok ? null : corto(error ?? "la herramienta respondió un error", 160);
    // El contrato de aceptación solo existe si hubo plan declarado; el try
    // cubre el camino sin plan (actualizar sería no-op de todos modos).
    if (h.declaroPlan) {
      try { actualizarEstadoContrato(t.id, ok ? "done" : "failed"); } catch { /* contrato auxiliar */ }
    }
  }
  if (!ok) anotar(h, `${tituloPaso(paso.herramienta, paso.detalle)} ✗ ${corto(error ?? "", 120)}`);
}

/**
 * CIERRA el turno y decide el veredicto. Nunca «hecho» con obra abierta.
 * Devuelve la hoja publicada, o null si el turno no publicó nada (sin pasos y
 * sin tareas: fue charla, no trabajo).
 */
export function cerrarTurnoVivo(ahora = Date.now()): HojaViva | null {
  return cerrar(false, ahora);
}

function cerrar(abandonado: boolean, ahora: number, motivo?: string): HojaViva | null {
  const h = viva;
  if (!h) return null;
  viva = null;

  // Un paso que quedó abierto es un hecho: la herramienta nunca respondió. NO se
  // cierra como `fallida` — eso convertiría el turno en «fallido» con trabajo
  // pendiente, que es la otra cara de la mentira que esta versión viene a matar.
  // Queda ABIERTO, con su motivo escrito y en la lista de lo que falta.
  for (const p of h.pasos) {
    if (p.ok === null) {
      p.ok = false;
      p.fin = ahora;
      const t = h.tareas.find((x) => x.paso === p.n);
      if (t && ABIERTAS.has(t.estado)) {
        t.estado = "pendiente";
        t.fin = null;
        t.error = "la herramienta no respondió";
      }
    }
  }

  const abiertas = h.tareas.filter((t) => ABIERTAS.has(t.estado));
  const fallidas = h.tareas.filter((t) => t.estado === "fallida");

  // Charla sin herramientas: no hay hoja que enseñar. Publicar un plan vacío
  // sería exactamente el cuadro en 0 que motivó esta versión.
  if (h.pasos.length === 0 && h.tareas.length === 0) return null;

  if (abandonado) {
    h.estado = "cancelado";
    anotar(h, `⚠ turno abandonado: ${motivo || "el motor abrió otro turno"}`);
  } else if (abiertas.length > 0) {
    h.estado = "parcial";
    anotar(h, `⚠ sin cerrar: ${abiertas.map((t) => `#${t.id} ${t.titulo}`).join(" · ")}`);
  } else if (fallidas.length > 0) {
    h.estado = "fallido";
    anotar(h, `✗ ${fallidas.length} paso(s) fallidos`);
  } else {
    h.estado = "hecho";
    anotar(h, `✓ turno cerrado: ${h.pasos.length} paso(s)`);
  }
  h.fin = ahora;
  cerrada = h;
  return h;
}

/** El reloj de la hoja: mientras corre, cuenta; cerrada, queda en su marca. */
export function msHoja(h: HojaViva, ahora = Date.now()): number {
  return Math.max(0, (h.fin ?? ahora) - h.creadoEn);
}

export interface TareaParaPanel {
  id: string;
  titulo: string;
  peso: "io" | "cpu";
  tipo: string;
  estado: string;
  dependeDe: string[];
  intentos: number;
  motivoEspera: string | null;
  ms: number | null;
  error: string | null;
  resultado: string | null;
  artefactos: string[];
  linea: string;
}

export interface PlanParaPanelVivo {
  id: string;
  objetivo: string;
  estado: string;
  creadoEn: number;
  enSegundoPlano: boolean;
  /** Marca del espejo: los paneles la usan para el cronómetro y el feed. */
  vivo: true;
  ms: number;
  pasos: Array<{ n: number; herramienta: string; detalle: string; ok: boolean | null; ms: number | null }>;
  tareas: TareaParaPanel[];
  resumen: { hechas: number; fallidas: number; descartadas: number; canceladas: number; bloqueadas: number; sinHacer: string[] };
  noTerminadas: Array<{ id: string; titulo: string; estado: string; motivo: string }>;
  log: string[];
}

/**
 * La traducción a lo que ya consumen los dos paneles. Está abierta a propósito:
 * `/api/brain/plans` y el panel tienen que verse EN EL MISMO ESPEJO (fuente
 * única de verdad), así que el formato lo fija aquí y no cada componente.
 */
export function hojaParaPanel(h: HojaViva, ahora = Date.now()): PlanParaPanelVivo {
  const enCurso = h.estado === "en_curso";
  const tareas = h.tareas.map<TareaParaPanel>((t) => {
    const ms = t.inicio != null ? (t.fin ?? (enCurso ? ahora : t.inicio)) - t.inicio : null;
    const marca = t.estado === "hecha" ? "✓" : t.estado === "en_curso" ? "▶" : t.estado === "fallida" ? "✗" : "·";
    return {
      id: t.id,
      titulo: t.titulo,
      peso: t.cpu ? "cpu" : "io",
      tipo: t.desdePaso ? "paso" : "modelo",
      estado: t.estado,
      dependeDe: [],
      intentos: 1,
      motivoEspera: t.estado === "en_curso" ? "la herramienta está respondiendo" : null,
      ms: t.inicio == null ? null : ms,
      error: t.error,
      resultado: null,
      artefactos: [],
      linea: `${marca} #${t.id} ${t.titulo} [${t.estado} · ${t.cpu ? "cpu" : "io"}]${ms != null ? ` ${(ms / 1000).toFixed(1)}s` : ""}`,
    };
  });
  const abiertas = h.tareas.filter((t) => ABIERTAS.has(t.estado));
  return {
    id: h.id,
    objetivo: `${enCurso ? "⚡ en vivo · " : "⚡ "}${h.objetivo}`,
    estado: h.estado,
    creadoEn: h.creadoEn,
    enSegundoPlano: false,
    vivo: true,
    ms: msHoja(h, ahora),
    pasos: h.pasos.map((p) => ({
      n: p.n,
      herramienta: p.herramienta,
      detalle: p.detalle,
      ok: p.ok,
      ms: p.inicio != null && p.fin != null ? p.fin - p.inicio : null,
    })),
    tareas,
    resumen: {
      hechas: h.tareas.filter((t) => t.estado === "hecha").length,
      fallidas: h.tareas.filter((t) => t.estado === "fallida").length,
      descartadas: 0,
      canceladas: h.estado === "cancelado" ? abiertas.length : 0,
      bloqueadas: 0,
      sinHacer: abiertas.map((t) => `#${t.id} ${t.titulo} (${t.estado})`),
    },
    noTerminadas: abiertas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      motivo: t.desdePaso ? "el turno cerró con este paso sin respuesta" : "el modelo no la marcó como hecha",
    })),
    log: h.log.slice(-60),
  };
}

/** Lo que inyecta `/api/brain/plans`: null si no hay nada que enseñar. */
export function hojaVivaParaPanel(ahora = Date.now()): PlanParaPanelVivo | null {
  const h = hojaViva(ahora);
  return h ? hojaParaPanel(h, ahora) : null;
}

/** Solo de pruebas: el espejo no debe arrastrar estado entre suites. */
export function reiniciarEspejo(): void {
  viva = null;
  cerrada = null;
}
