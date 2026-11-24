/**
 * autoevaluacion.ts — EL CIERRE QUE SE JUZGA A SÍ MISMO (v2.3.11)
 * ===============================================================
 * QUÉ ES: al terminar una tarea, este módulo mira lo que el turno HIZO y se
 * saca un veredicto propio: LIMPIO / CON_OBSERVACIONES / SUCIO. Y cuando algo
 * salió mal, GUARDA LA LECCIÓN en `memoria.md` §3 sin que nadie se lo pida.
 *
 * POR QUÉ EXISTE: el usuario lo pidió con estas palabras — «al finalizar las
 * tareas esto en md, se auto evalúa y se saca un veredicto y se guarda
 * automáticamente las lecciones aprendidas». Hasta aquí las lecciones se
 * escribían a mano y a veces se olvidaban (o peor: se afirmaba haberlas escrito
 * sin haberlo hecho). Este módulo convierte esa conducta en algo que el fiscal
 * EXIGE, no en una promesa del prompt.
 *
 * QUÉ NO HACE: no borra nada, no ejecuta comandos, no toca la red. Clasifica y
 * redacta. Las manos siguen siendo `fs_delete` / `fs_write`.
 *
 * GRAFO ACÍCLICO: importa SOLO tipos de `autovalido` (ninguna función), así que
 * `autovalido` puede importarlo a él sin ciclo. Es el fiscal el que lo corona
 * como casilla 14, no al revés.
 *
 * PUREZA: `evaluarCierre` y `redactarLeccion` son PURAS (misma entrada, misma
 * salida, sin disco). `guardarLeccion` es la única con efecto: escribe el .md.
 */

import type { ResultadoCasilla, DictamenFiscal } from "./autovalido";

// ══════════════════════════════════════════════════════════════
// LOS CINCO EJES DEL CIERRE
// ══════════════════════════════════════════════════════════════

/** Los cinco ejes que se miran al cerrar. Cada uno pesa lo mismo: no hay
 *  ejes de adorno. Si uno falla, el veredicto lo nombra. */
export type EjeCierre =
  | "verificacion"   // ¿se ejecutó algo, o sólo se afirmó?
  | "limpieza"       // ¿quedaron temporales del turno?
  | "documentacion"  // ¿lo nuevo está explicado en un .md?
  | "registro"       // ¿la suite nueva está en el catálogo del validador?
  | "honestidad";    // ¿el texto dice la verdad sobre lo que se hizo?

export const EJES_CIERRE: EjeCierre[] = [
  "verificacion",
  "limpieza",
  "documentacion",
  "registro",
  "honestidad",
];

/** Lo que el turno declara de sí mismo. Todo opcional: lo que no se declara
 *  queda `sinProbar`, nunca verde por defecto (cobertura honesta). */
export interface EntradaCierre {
  /** Rutas que el turno creó (temporales incluidos). */
  rutasCreadas?: string[] | null;
  /** Archivos nuevos que quedan como obra (no temporales). */
  archivosNuevos?: string[] | null;
  /** Documentos .md que el turno escribió o actualizó. */
  documentosTocados?: string[] | null;
  /** Suites nuevas que el turno agregó a `tests/`. */
  suitesNuevas?: string[] | null;
  /** Suites nuevas que quedaron registradas en `scripts/validar.mjs`. */
  suitesRegistradas?: string[] | null;
  /** ¿Se ejecutó al menos una verificación real (test/build/lectura)? */
  seEjecutoAlgo?: boolean | null;
  /** ¿El texto de cierre afirma «funciona/hecho»? */
  afirmaCierre?: boolean | null;
  /** ¿Hay evidencia que respalde esa afirmación? */
  hayEvidencia?: boolean | null;
  /** El dictamen del fiscal, si ya se corrió (para no repetir trabajo). */
  dictamen?: DictamenFiscal | null;
}

/** El veredicto del cierre. Tres estados, no dos: el medio existe y hay que
 *  poder decirlo sin mentir en ninguna dirección. */
export type VeredictoCierre = "LIMPIO" | "CON_OBSERVACIONES" | "SUCIO";

export interface ResultadoEje {
  eje: EjeCierre;
  estado: "verde" | "roja" | "sinProbar";
  motivo: string;
}

export interface Autoevaluacion {
  veredicto: VeredictoCierre;
  ejes: ResultadoEje[];
  verdes: number;
  rojos: number;
  sinProbar: number;
  /** Lecciones que hay que guardar (vacío si el cierre fue limpio). */
  lecciones: LeccionAprendida[];
  /** Una línea legible para el panel. */
  parte: string;
}

/** Una lección lista para `memoria.md` §3. */
export interface LeccionAprendida {
  /** Etiqueta entre corchetes: `[puente]`, `[sandbox]`, `[verificacion]`… */
  etiqueta: string;
  /** Qué pasó, en una frase. */
  sintoma: string;
  /** Qué se hace la próxima vez. */
  regla: string;
}

// ══════════════════════════════════════════════════════════════
// LOS EVALUADORES (puros)
// ══════════════════════════════════════════════════════════════

const E = (eje: EjeCierre, estado: ResultadoEje["estado"], motivo: string): ResultadoEje =>
  ({ eje, estado, motivo });

/** ¿Se ejecutó algo? Afirmar sin ejecutar es el peor error posible. */
export function evaluarVerificacion(e: EntradaCierre): ResultadoEje {
  if (e.seEjecutoAlgo === true) return E("verificacion", "verde", "el turno ejecutó al menos una verificación real");
  if (e.seEjecutoAlgo === false) return E("verificacion", "roja", "el turno no ejecutó nada: lo afirmado no está probado");
  return E("verificacion", "sinProbar", "no consta si se ejecutó algo");
}

/** ¿Quedaron temporales? Delega el criterio en lo que el turno declara. */
export function evaluarLimpiezaCierre(e: EntradaCierre): ResultadoEje {
  const rutas = Array.isArray(e.rutasCreadas) ? e.rutasCreadas : null;
  if (rutas === null) return E("limpieza", "sinProbar", "el turno no declaró rutas creadas");
  if (rutas.length === 0) return E("limpieza", "verde", "el turno no dejó rutas propias");
  // Si declaró rutas y ninguna es obra, son temporales vivos.
  const obra = new Set((e.archivosNuevos || []).map((r) => r.toLowerCase()));
  const temporales = rutas.filter((r) => !obra.has(r.toLowerCase()));
  if (temporales.length === 0) return E("limpieza", "verde", `las ${rutas.length} rutas creadas son obra declarada`);
  return E("limpieza", "roja", `quedan ${temporales.length} temporal(es): ${temporales.slice(0, 5).join(", ")}`);
}

/** ¿Lo nuevo está explicado? Un archivo sin .md que lo nombre es un fantasma. */
export function evaluarDocumentacion(e: EntradaCierre): ResultadoEje {
  const nuevos = Array.isArray(e.archivosNuevos) ? e.archivosNuevos : null;
  if (nuevos === null) return E("documentacion", "sinProbar", "el turno no declaró archivos nuevos");
  if (nuevos.length === 0) return E("documentacion", "verde", "el turno no creó archivos que documentar");
  const docs = Array.isArray(e.documentosTocados) ? e.documentosTocados : [];
  if (docs.length === 0) return E("documentacion", "roja", `${nuevos.length} archivo(s) nuevo(s) sin ningún .md que los explique`);
  return E("documentacion", "verde", `${nuevos.length} archivo(s) nuevo(s) con ${docs.length} documento(s) al día`);
}

/** ¿La suite nueva está registrada? Una suite fuera del catálogo no corre. */
export function evaluarRegistro(e: EntradaCierre): ResultadoEje {
  const nuevas = Array.isArray(e.suitesNuevas) ? e.suitesNuevas : null;
  if (nuevas === null) return E("registro", "sinProbar", "el turno no declaró suites nuevas");
  if (nuevas.length === 0) return E("registro", "verde", "el turno no agregó suites");
  const reg = new Set((e.suitesRegistradas || []).map((s) => s.toLowerCase()));
  const huerfanas = nuevas.filter((s) => !reg.has(s.toLowerCase()));
  if (huerfanas.length === 0) return E("registro", "verde", `las ${nuevas.length} suite(s) nuevas están en el catálogo`);
  return E("registro", "roja", `${huerfanas.length} suite(s) fuera del catálogo: ${huerfanas.slice(0, 4).join(", ")}`);
}

/** ¿El texto dice la verdad? Afirmar «funciona» sin evidencia es mentir. */
export function evaluarHonestidadCierre(e: EntradaCierre): ResultadoEje {
  if (e.afirmaCierre === null || e.afirmaCierre === undefined)
    return E("honestidad", "sinProbar", "no consta si el texto afirma un cierre");
  if (e.afirmaCierre === false) return E("honestidad", "verde", "el texto no afirma un cierre que no pueda sostener");
  if (e.hayEvidencia === true) return E("honestidad", "verde", "afirma el cierre y tiene evidencia que lo respalda");
  return E("honestidad", "roja", "afirma «funciona/hecho» sin evidencia que lo respalde");
}

// ══════════════════════════════════════════════════════════════
// EL VEREDICTO
// ══════════════════════════════════════════════════════════════

/**
 * Corre los cinco ejes y dictamina. Regla del veredicto, sin ambigüedad:
 *   · SUCIO            → hay 2 o más ejes rojos (el cierre no se sostiene).
 *   · CON_OBSERVACIONES → hay 1 eje rojo (se puede cerrar, pero se dice).
 *   · LIMPIO           → ningún eje rojo.
 * Los `sinProbar` NO cuentan como rojos ni como verdes: se reportan aparte.
 * Un cierre con todo `sinProbar` es CON_OBSERVACIONES, no LIMPIO: no se
 * premia la ausencia de datos.
 */
export function evaluarCierre(e: EntradaCierre): Autoevaluacion {
  const ejes: ResultadoEje[] = [
    evaluarVerificacion(e),
    evaluarLimpiezaCierre(e),
    evaluarDocumentacion(e),
    evaluarRegistro(e),
    evaluarHonestidadCierre(e),
  ];
  const verdes = ejes.filter((x) => x.estado === "verde").length;
  const rojos = ejes.filter((x) => x.estado === "roja").length;
  const sinProbar = ejes.filter((x) => x.estado === "sinProbar").length;

  let veredicto: VeredictoCierre;
  if (rojos >= 2) veredicto = "SUCIO";
  else if (rojos === 1) veredicto = "CON_OBSERVACIONES";
  else if (sinProbar === ejes.length) veredicto = "CON_OBSERVACIONES";
  else veredicto = "LIMPIO";

  const lecciones = rojos > 0 ? redactarLecciones(ejes) : [];
  const parte =
    `\u2696\ufe0f AUTOEVALUACI\u00d3N [${veredicto}] — ${verdes} verde(s) · ${rojos} roja(s) · ${sinProbar} sin probar` +
    (rojos ? ` · ${lecciones.length} lecci\u00f3n(es) a guardar` : "");

  return { veredicto, ejes, verdes, rojos, sinProbar, lecciones, parte };
}

// ══════════════════════════════════════════════════════════════
// LAS LECCIONES (puras)
// ══════════════════════════════════════════════════════════════

/** El saber que cada eje rojo deja para la próxima vez. */
const LECCION_POR_EJE: Record<EjeCierre, LeccionAprendida> = {
  verificacion: {
    etiqueta: "verificacion",
    sintoma: "se cerró una tarea sin ejecutar nada que la respalde",
    regla: "antes de decir «listo», correr la suite o el build y adjuntar la salida real; si no se pudo, decirlo con nombre y apellido",
  },
  limpieza: {
    etiqueta: "limpieza",
    sintoma: "quedaron temporales del turno vivos en el árbol",
    regla: "borrar con fs_delete (va a papelera) todo script o carpeta que se creó para trabajar; el respaldo del usuario NO se toca",
  },
  documentacion: {
    etiqueta: "documentacion",
    sintoma: "se creó código nuevo sin ningún documento que lo explique",
    regla: "todo módulo nuevo entra con su .md y su entrada en el índice; un archivo sin explicación es inaceptable",
  },
  registro: {
    etiqueta: "registro",
    sintoma: "una suite nueva quedó fuera del catálogo del validador",
    regla: "registrar la suite en scripts/validar.mjs en el mismo turno en que se escribe; una suite que no corre no protege nada",
  },
  honestidad: {
    etiqueta: "honestidad",
    sintoma: "el texto afirmó un cierre que la evidencia no sostenía",
    regla: "afirmar sólo lo ejecutado; lo no verificado se declara «aplicado, no verificado»",
  },
};

/** Convierte los ejes rojos en lecciones listas para `memoria.md`. Pura. */
export function redactarLecciones(ejes: ResultadoEje[]): LeccionAprendida[] {
  return ejes
    .filter((x) => x.estado === "roja")
    .map((x) => {
      const base = LECCION_POR_EJE[x.eje];
      return { etiqueta: base.etiqueta, sintoma: `${base.sintoma} (${x.motivo})`, regla: base.regla };
    });
}

/** Formatea una lección como la línea que `memoria.md` §3 espera. Pura. */
export function formatearLeccion(l: LeccionAprendida, fecha: string): string {
  return `- **[${l.etiqueta}]** ${fecha} — ${l.sintoma}. Regla: ${l.regla}.`;
}

// ══════════════════════════════════════════════════════════════
// EL GUARDADO (única función con efecto)
// ══════════════════════════════════════════════════════════════

/**
 * Guarda las lecciones al final de `memoria.md` §3. NO borra ni reescribe el
 * archivo: lee, añade y escribe. Si una lección con la misma etiqueta y el mismo
 * síntoma ya está, NO la duplica (idempotente: correr el cierre dos veces no
 * llena el archivo de repetidos).
 *
 * Devuelve cuántas se añadieron y cuántas se saltaron. El llamador decide qué
 * hacer con eso; aquí no se afirma nada que no se haya escrito.
 */
export function guardarLeccion(
  lecciones: LeccionAprendida[],
  rutaMemoria: string,
  fecha: string,
  io: {
    leer: (ruta: string) => string;
    escribir: (ruta: string, contenido: string) => void;
  },
): { añadidas: number; saltadas: number; lineas: string[] } {
  if (!lecciones.length) return { añadidas: 0, saltadas: 0, lineas: [] };
  let texto: string;
  try {
    texto = io.leer(rutaMemoria);
  } catch {
    return { añadidas: 0, saltadas: lecciones.length, lineas: [] };
  }
  const nuevas: string[] = [];
  let saltadas = 0;
  for (const l of lecciones) {
    const linea = formatearLeccion(l, fecha);
    // Idempotencia por etiqueta + síntoma: la misma lección no se repite.
    const marca = `**[${l.etiqueta}]**`;
    const sintomaCorto = l.sintoma.slice(0, 40);
    if (texto.includes(marca) && texto.includes(sintomaCorto)) {
      saltadas++;
      continue;
    }
    nuevas.push(linea);
  }
  if (!nuevas.length) return { añadidas: 0, saltadas, lineas: [] };
  const separador = texto.endsWith("\n") ? "" : "\n";
  io.escribir(rutaMemoria, `${texto}${separador}${nuevas.join("\n")}\n`);
  return { añadidas: nuevas.length, saltadas, lineas: nuevas };
}

// ══════════════════════════════════════════════════════════════
// LA CASILLA DEL FISCAL
// ══════════════════════════════════════════════════════════════

/**
 * La casilla 14 del fiscal: la autoevaluación de cierre. Verde si el veredicto
 * es LIMPIO; roja si es SUCIO; `sinProbar` si el turno no declaró nada que
 * evaluar (cero regresión: un turno de sólo lectura no tiene cierre que juzgar).
 *
 * CON_OBSERVACIONES deja la casilla en verde pero con el motivo escrito: se
 * puede cerrar, y el motivo queda a la vista. No se castiga con rojo lo que se
 * puede sostener, pero tampoco se esconde.
 */
export function evaluarAutoevaluacion(e: EntradaCierre | null | undefined): ResultadoCasilla {
  if (!e) {
    return {
      casilla: "autoevaluacion",
      estado: "sinProbar",
      motivo: "el turno no declaró datos de cierre: nada que autoevaluar",
      directiva: "",
    };
  }
  const r = evaluarCierre(e);
  if (r.veredicto === "SUCIO") {
    return {
      casilla: "autoevaluacion",
      estado: "roja",
      motivo: r.ejes.filter((x) => x.estado === "roja").map((x) => `${x.eje}: ${x.motivo}`).join(" · "),
      directiva: "repará los ejes rojos antes de cerrar; las lecciones ya están redactadas para memoria.md §3",
    };
  }
  if (r.veredicto === "CON_OBSERVACIONES") {
    return {
      casilla: "autoevaluacion",
      estado: "verde",
      motivo: `cierre con observaciones — ${r.ejes.filter((x) => x.estado === "roja").map((x) => x.eje).join(", ") || "sin datos suficientes"}`,
      directiva: "",
    };
  }
  return { casilla: "autoevaluacion", estado: "verde", motivo: "cierre limpio en los cinco ejes", directiva: "" };
}

/** El parte de una línea para el panel. */
export function parteAutoevaluacion(a: Autoevaluacion | null | undefined): string {
  return a ? a.parte : "";
}

/**
 * 2 entradas de KB con el saber del cierre autoevaluado, sembradas en la base
 * de conocimiento igual que `AUTOVALIDO_KB_ENTRIES`.
 */
export const AUTOEVALUACION_KB_ENTRIES = [
  {
    id: "ba-autoeval-cinco-ejes",
    table: "recetario-ui",
    title: "El cierre se juzga a sí mismo en cinco ejes",
    body:
      "Al terminar una tarea, el motor corre una autoevaluación de cinco ejes: verificación (¿se ejecutó algo?), limpieza (¿quedaron temporales?), documentación (¿lo nuevo está en un .md?), registro (¿la suite está en el catálogo?) y honestidad (¿el texto afirma lo que puede sostener?). Dos o más ejes rojos → SUCIO. Uno → CON_OBSERVACIONES. Ninguno → LIMPIO. Los ejes sin datos se reportan como sin probar, nunca como verdes: no se premia la ausencia de información.",
    keys: ["autoevaluacion", "cierre", "cinco ejes", "veredicto", "limpio", "sucio", "observaciones"],
    tags: ["buenas-practicas", "autoevaluacion", "cierre-honesto"],
    weight: 0.94,
    lang: "es",
  },
  {
    id: "ba-autoeval-lecciones",
    table: "recetario-ui",
    title: "Las lecciones se guardan solas, y no se duplican",
    body:
      "Cada eje rojo del cierre produce una lección con etiqueta, síntoma y regla, que se escribe al final de memoria.md §3 sin que nadie lo pida. El guardado es idempotente: si la misma etiqueta y el mismo síntoma ya están en el archivo, la lección se salta en vez de repetirse. Así el archivo de lecciones crece con saber nuevo, no con ruido.",
    keys: ["lecciones", "memoria.md", "idempotente", "guardado automatico", "aprendizaje"],
    tags: ["buenas-practicas", "autoevaluacion", "memoria"],
    weight: 0.92,
    lang: "es",
  },
];
