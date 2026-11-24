/**
 * vigilanteDeFallos.ts — v1.88.1 · EL ✗ CON MOTIVO Y EL BUCLE QUE SE PARA SOLO
 * ===========================================================================
 * DOS QUEJAS REALES (sesión 1793231473406 y capturas del 28/10):
 *
 * 1) «Cuando el modelo hace la tarea, ¿por qué pone una X en rojo? ¿Fue error de
 *    la tarea?» El panel marcaba la acción fallida con una ✗ sin decir NUNCA el
 *    motivo. La herramienta devolvía un JSON con `error`/`motivo` y ese texto se
 *    tiraba: la valla decía «la herramienta devolvió fallo», que es el síntoma,
 *    no la causa. Con `✗ write_file — Ruta no encontrada: /api/fs/list` el
 *    usuario entiende que falló UN intento de tool y puede corregirlo; con la X
 *    sola parece que la tarea entera salió mal. Un ✗ por intento fallido NO es
 *    un veredicto sobre la tarea: es información de un paso.
 *
 * 2) «A veces se queda trancado pensando sin hacer nada.» En la captura, seis
 *    ✗ de `write_file` seguidos sobre la misma ruta, seis minutos y CPU al 100%.
 *    El lazo ya tenía vigilancia para ARGUMENTOS MAL FORMADOS
 *    (`nuevoVigilanteArgs`, umbral 3 en `cicloHerramientasOpenAICompat.ts`) y
 *    corte por REESCRITURA IDÉNTICA (`TOPE_REESCRITURA_IDENTICA`), pero NINGUNA
 *    para la herramienta que responde BIEN y FALLA SIEMPRE: args válidos, ruta
 *    inexistente, y el modelo vuelve a intentar lo mismo. Ese es el bucle
 *    «pensando» que no produce nada.
 *
 * Acá vive el criterio, puro: sin reloj, sin red, sin estado global.
 */

/** Lo que el usuario ve como motivo cuando la herramienta no dijo por qué. */
export const SIN_MOTIVO = "sin motivo declarado";

/** Techo del motivo: lo que entra en el panel tiene que ser una línea. */
export const TOPE_MOTIVO = 140;

/**
 * El motivo real de un resultado de herramienta, en una línea.
 * Acepta JSON (con `ok:false`) o texto plano; nunca lanza.
 */
export function motivoDeResultado(crudo: unknown): string {
  const s = String(crudo ?? "").trim();
  if (!s) return SIN_MOTIVO;
  let texto = "";
  let eraObjeto = false;
  try {
    const j = JSON.parse(s);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      eraObjeto = true;
      const candidato = j.error ?? j.motivo ?? j.razon ?? j.reason ?? j.message ?? j.detail ?? j.stderr;
      if (typeof candidato === "string" && candidato.trim()) texto = candidato;
      else if (Array.isArray(j.errors) && j.errors.length) texto = String(j.errors[0]);
    }
  } catch {
    texto = s; // no es JSON: la salida cruda ES el motivo
  }
  // Un JSON de error sin campo de motivo NO se muestra crudo: `{"ok":false}`
  // no le dice nada a nadie y sí ensucia la línea.
  if (!texto) texto = eraObjeto ? "" : s;
  if (!texto) return SIN_MOTIVO;
  texto = String(texto).replace(/\s+/g, " ").trim();
  if (!texto) return SIN_MOTIVO;
  return texto.length > TOPE_MOTIVO ? texto.slice(0, TOPE_MOTIVO - 1) + "…" : texto;
}

// ── EL VIGILANTE DE FALLOS REPETIDOS ──────────────────────────────────────────

/** Tres fallos seguidos de la MISMA herramienta: se le avisa al modelo, una vez. */
export const UMBRAL_AVISO_FALLOS = 3;
/** Cinco: se corta el turno. Al quinto no hay información nueva, hay bucle. */
export const UMBRAL_CORTE_FALLOS = 5;

export interface VigilanteFallos {
  herramienta: string;
  seguidos: number;
  /** El último motivo visto: es el que se muestra, no el primero. */
  ultimoMotivo: string;
}

export const nuevoVigilanteFallos = (): VigilanteFallos => ({ herramienta: "", seguidos: 0, ultimoMotivo: "" });

export interface ResultadoVigilancia {
  herramienta: string;
  seguidos: number;
  /** TRUE solo en el EXACTO instante en que se cruza el umbral de aviso. */
  justoAviso: boolean;
  corto: boolean;
}

/**
 * Cuenta fallos consecutivos de la MISMA herramienta. Un éxito, o un fallo de
 * otra herramienta, reinicia la cuenta: el patrón que nos interesa es
 * «write_file, write_file, write_file…» sobre la misma vía muerta.
 */
export function vigilarFallo(v: VigilanteFallos, herramienta: string, ok: boolean, motivo = ""): ResultadoVigilancia {
  const h = String(herramienta || "").toLowerCase();
  if (ok || h !== v.herramienta) {
    v.herramienta = ok ? "" : h;
    v.seguidos = ok ? 0 : 1;
    if (!ok) v.ultimoMotivo = motivo || SIN_MOTIVO;
  } else {
    v.seguidos++;
    if (motivo) v.ultimoMotivo = motivo;
  }
  return {
    herramienta: h,
    seguidos: v.seguidos,
    justoAviso: !ok && v.seguidos === UMBRAL_AVISO_FALLOS,
    corto: !ok && v.seguidos >= UMBRAL_CORTE_FALLOS,
  };
}

/** La directiva que entra al historial en el paso 3: nombra el hecho, no sermonea. */
export function directivaPorFallos(nombre: string, seguidos: number, motivo: string): string {
  return (
    `SISTEMA: llevás ${seguidos} fallos seguidos de \`${nombre}\` sin cambiar de estrategia. ` +
    `Último motivo: ${motivo || SIN_MOTIVO}. ` +
    `No repitas la misma llamada: leé el motivo, corregí el argumento (ruta, permisos, nombre de herramienta) ` +
    `o probá con OTRA herramienta. Si no se puede, decilo en una línea y terminá el turno.`
  );
}

/** El corte honesto: lo que se hizo, lo que quedó abierto y el motivo exacto. */
export function cierrePorFallos(nombre: string, seguidos: number, motivo: string): string {
  return (
    `\n\n⏹ **Corté acá: la tarea quedó abierta, no hecha.**\n` +
    `» \`${nombre}\` falló ${seguidos} veces seguidas con el mismo motivo: ${motivo || SIN_MOTIVO}.\n` +
    `» Repetirlo ya no es progreso, es el bucle. Arriba está lo que sí quedó hecho.\n`
  );
}
