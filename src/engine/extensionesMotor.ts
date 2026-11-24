/**
 * extensionesMotor.ts — REGISTRO DE EXTENSIONES DE DIRECTRIZ DEL MOTOR (v1.24.0)
 * ============================================================================
 * OJO: esto NO es lo mismo que `src/engine/extensions.ts`. Aquel registro es
 * para extensiones de TERCEROS al estilo VS Code (manifiesto + iframe + panel).
 * ESTE registro es interno del MOTOR: monta «capas de directriz» sobre los
 * botones de pensamiento del chat (Auto / Rápido / Ingeniero / Profundo).
 *
 * Motivo de existir: el botón «Ingeniero» inyecta una directriz al system
 * prompt (ver src/engine/thinkingMode.ts). Antes esa directriz era una única
 * cadena fija. Para poder AMPLIAR un botón sin reescribir su fuente —y sin
 * convertirlo en un segundo regulador mudo— aquí vive un punto de montaje:
 *
 *   - Una extensión declara a qué MODO se engancha y qué DIRECTRIZ aporta.
 *   - `montarExtension` la VALIDA antes de aceptarla (id único, modo válido,
 *     directriz no vacía). Si no pasa, devuelve {ok:false, motivo} — nunca
 *     lanza una excepción que tumbe el arranque del motor.
 *   - `directrizExtensiones(modo)` concatena, en orden de montaje, lo que
 *     aporten las extensiones de ese modo. El botón compone su directriz
 *     base + esto. Así la BASE sigue siendo una sola fuente y las capas se
 *     añaden encima, verificables por test.
 *
 * Filosofía del repo: honestidad y «medir/probar, no prometer». Una extensión
 * montada tiene que APARECER de verdad en la directriz del turno (lo prueba
 * tests/ingenieroSenior.test.ts); montarla sin efecto sería un regulador mudo.
 */

/** Los botones de pensamiento a los que una extensión puede engancharse. */
export type ModoObjetivo = "auto" | "rapido" | "ingeniero" | "profundo";
const MODOS_VALIDOS: ModoObjetivo[] = ["auto", "rapido", "ingeniero", "profundo"];

/**
 * Una extensión de directriz del motor. `directriz` es el texto que se inyecta
 * al system prompt cuando el botón `modo` está activo. `resumen` y `etiqueta`
 * son para que la UI o el log puedan nombrar la capa sin adivinar.
 */
export interface ExtensionMotor {
  /** Identificador único, ej: "cerebronico.ingeniero-senior". */
  id: string;
  /** Botón al que se engancha. */
  modo: ModoObjetivo;
  /** Nombre corto visible. */
  etiqueta: string;
  /** Una línea de qué aporta. */
  resumen: string;
  /** El texto REAL que viaja al system prompt. No puede quedar vacío. */
  directriz: string;
  /** Versión SemVer de la capa (opcional). Para auditar qué versión está viva. */
  version?: string;
}

/** Resultado honesto de un intento de montaje. */
export interface ResultadoMontaje {
  ok: boolean;
  id?: string;
  motivo?: string;
}

/**
 * El registro vivo. Se conserva el ORDEN de montaje (Map lo garantiza) para
 * que la directriz compuesta sea determinista: mismo orden de montaje → mismo
 * texto. Un Set no serviría: necesitamos orden y acceso por id.
 */
const REGISTRO = new Map<string, ExtensionMotor>();

/**
 * Monta una extensión en el motor. VALIDA antes de aceptar: sin id, con id
 * repetido, con modo desconocido o con directriz vacía NO se monta y se dice
 * por qué. Nunca lanza: el motor no se cae por una extensión mal formada.
 */
export function montarExtension(ext: unknown): ResultadoMontaje {
  if (!ext || typeof ext !== "object") {
    return { ok: false, motivo: "la extensión no es un objeto {id,modo,directriz,...}" };
  }
  const e = ext as Partial<ExtensionMotor>;
  const id = typeof e.id === "string" ? e.id.trim() : "";
  if (!id) return { ok: false, motivo: "falta el id de la extensión" };
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    return { ok: false, id, motivo: "el id tiene caracteres no permitidos (usa letras, números, . _ -)" };
  }
  if (REGISTRO.has(id)) {
    return { ok: false, id, motivo: "ya hay una extensión montada con ese id (no se pisa en silencio)" };
  }
  if (!MODOS_VALIDOS.includes(e.modo as ModoObjetivo)) {
    return { ok: false, id, motivo: `modo desconocido: ${String(e.modo)} (válidos: ${MODOS_VALIDOS.join(", ")})` };
  }
  const directriz = typeof e.directriz === "string" ? e.directriz.trim() : "";
  if (!directriz) {
    return { ok: false, id, motivo: "directriz vacía: una capa sin texto sería un regulador mudo" };
  }
  const version = typeof e.version === "string" && e.version.trim() ? e.version.trim() : undefined;
  const normal: ExtensionMotor = {
    id,
    modo: e.modo as ModoObjetivo,
    etiqueta: (typeof e.etiqueta === "string" && e.etiqueta.trim()) || id,
    resumen: (typeof e.resumen === "string" && e.resumen.trim()) || "(sin resumen)",
    directriz,
    ...(version ? { version } : {}),
  };
  REGISTRO.set(id, normal);
  return { ok: true, id };
}

/** Desmonta por id. Devuelve true si existía (honesto: no finge éxito). */
export function desmontarExtension(id: string): boolean {
  return REGISTRO.delete(id);
}

/** ¿Está montada? Útil para que el bootstrap sea idempotente. */
export function estaMontada(id: string): boolean {
  return REGISTRO.has(id);
}

/** Todas las extensiones montadas, en orden de montaje (copia, no el interno). */
export function extensionesMontadas(): ExtensionMotor[] {
  return [...REGISTRO.values()];
}

/** Las extensiones enganchadas a un modo concreto, en orden de montaje. */
export function extensionesDe(modo: ModoObjetivo | string): ExtensionMotor[] {
  return [...REGISTRO.values()].filter((e) => e.modo === modo);
}

/**
 * La directriz COMPUESTA de un modo: concatena las directrices de sus
 * extensiones (en orden de montaje) separadas por salto de línea. Vacía si
 * ese modo no tiene extensiones montadas — así el botón solo suma cuando hay
 * algo real que sumar.
 */
export function directrizExtensiones(modo: ModoObjetivo | string): string {
  return extensionesDe(modo)
    .map((e) => e.directriz)
    .filter(Boolean)
    .join("\n");
}

/**
 * Una FILA de auditoría por capa montada. `caracteres` mide la directriz real
 * que viaja al prompt: si es 0 la capa sería un regulador mudo (imposible, el
 * montaje lo impide) — se expone para que un test o la UI lo verifique en vez
 * de confiar. `version` es la de la capa o "(sin versión)" si no la declaró.
 */
export interface FilaAuditoria {
  id: string;
  modo: ModoObjetivo;
  etiqueta: string;
  version: string;
  caracteres: number;
}

/**
 * Parte AUDITABLE del registro vivo: qué capas están montadas, en qué botón,
 * con qué versión y cuánto texto real aportan. Pensado para que la UI o el log
 * puedan enseñar el estado sin adivinar, y para que un test compruebe que lo
 * montado APARECE de verdad (medir, no prometer).
 */
export function auditarExtensiones(): FilaAuditoria[] {
  return [...REGISTRO.values()].map((e) => ({
    id: e.id,
    modo: e.modo,
    etiqueta: e.etiqueta,
    version: e.version ?? "(sin versión)",
    caracteres: e.directriz.length,
  }));
}

/** Vaciar el registro. Pensado para tests aislados; no lo usa la app. */
export function _resetExtensionesMotor(): void {
  REGISTRO.clear();
}
