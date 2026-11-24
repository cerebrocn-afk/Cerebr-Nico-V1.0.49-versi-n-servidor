/**
 * src/arranque/guionArranque.ts — CUÁNDO SE ABRE EL TELÓN (v2.1.3)
 * ==============================================================
 * POR QUÉ ESTO ES UN MÓDULO Y NO TRES `if` DENTRO DEL COMPONENTE
 * --------------------------------------------------------------
 * El splash prometía, en un comentario, «nunca se deja al usuario atrapado en
 * la pantalla». La promesa se cumplía **dentro** del `then` del `fetch`: si
 * `/api/health/deep` no contestaba nunca —el motor cargando un modelo, el
 * bucle de eventos ocupado, el puerto sordo—, el `catch` tampoco corría y la
 * pantalla se quedaba en «consultando el estado del motor…» para siempre.
 *
 * Un `finally` no arregla eso: cuando el problema es que la promesa no se
 * resuelve, la salida no puede depender de la promesa. Acá la decisión es una
 * **función pura del reloj**: se le pregunta cada 250 ms «¿ya es hora?», y con
 * eso el telón se abre aunque el servidor no diga una palabra.
 */

/**
 * Plazo de UNA pasada de sonda. Tiene que ser **mayor** que el plazo duro del
 * servidor (9,5 s): si el cliente corta antes, nunca llegan las filas y el
 * telón se abre a ciegas. 10 s deja que llegue una pasada completa y todavía
 * deja 2 s de margen antes del vigilante.
 */
export const PLAZO_SONDA_MS = 10000;

/** Plazo del telón: a los 12 s se entra sí o sí. La persona decide, no la pantalla. */
export const PLAZO_MAXIMO_MS = 12000;

/** Si la sonda falla de verdad (red caída), no se hacen esperar 12 s: 3 s. */
export const PLAZO_ERROR_MS = 3000;

export type MotivoEntrada = "completo" | "error" | "plazo" | "esperando";

export interface EstadoArranque {
  /** `Date.now()` del momento de la consulta. */
  ahora: number;
  /** `Date.now()` del montaje del splash. */
  inicio: number;
  /**
   * Filas de la última respuesta buena (vacío = nunca contestó).
   *
   * v2.3.12 · `bloqueante: false` es una fila que se MUESTRA pero no justifica
   * retardar la entrada. Nace del arreglo de los siete puertos: el telón pasó de
   * cinco filas a nueve y, sin esta distinción, un pack de Python apagado a
   * propósito (`:5100`, `:5102`) le tendría doce segundos de spinner al usuario
   * por algo que no le impide trabajar. Informar no es secuestrar.
   */
  checks: { ok: boolean; bloqueante?: boolean }[];
  /** Último error de transporte, si hubo. */
  ultimoError: string;
}

export interface DecisionArranque {
  entrar: boolean;
  motivo: MotivoEntrada;
  /** Milisegundos desde el montaje, para poder mostrarlos en el rojo. */
  transcurrido: number;
}

/**
 * La regla, entera y sin efectos:
 *   1. todas las piezas en verde      → se entra ya (no se hace esperar de más)
 *   2. error de transporte + 3 s      → se entra (no hay motor que esperar)
 *   3. 12 s desde el montaje          → se entra (watchdog: pase lo que pase)
 *   4. cualquier otra cosa            → se sigue sondeando
 *
 * El orden importa: el caso 3 gana sobre el 4 aunque no haya ni una respuesta,
 * que es exactamente el agujero que dejaba la versión anterior.
 */
export function debeEntrar(e: EstadoArranque): DecisionArranque {
  const transcurrido = Math.max(0, Math.round(e.ahora - e.inicio));

  // v2.3.12 · «todas las piezas en verde» dejó de significar «todas las filas sin
  // una tilde»: significa «todas las filas que BLOQUEAN la entrada están verdes».
  // Una fila con `bloqueante: false` es información con remedio escrito, no una
  // condición. Sin esta línea, arreglar el arranque para que muestre los siete
  // puertos habría cambiado el contrato del telón: de abrir en cuanto Ollama,
  // sandbox y puente respondían, a esperar también dos packs opcionales.
  const bloqueantes = e.checks.filter((c) => c.bloqueante !== false);
  if (e.checks.length > 0 && bloqueantes.every((c) => c.ok)) {
    return { entrar: true, motivo: "completo", transcurrido };
  }
  if (e.ultimoError && transcurrido >= PLAZO_ERROR_MS) {
    return { entrar: true, motivo: "error", transcurrido };
  }
  if (transcurrido >= PLAZO_MAXIMO_MS) {
    return { entrar: true, motivo: "plazo", transcurrido };
  }
  return { entrar: false, motivo: "esperando", transcurrido };
}

/** Texto que explica por qué se abrió el telón (para la consola y el informe). */
export function porQueSeAbrio(d: DecisionArranque): string {
  switch (d.motivo) {
    case "completo":
      return "todas las piezas respondieron";
    case "error":
      return `el motor no contestó (${d.transcurrido} ms); se entra para poder trabajar`;
    case "plazo":
      return `se agotó el plazo de ${PLAZO_MAXIMO_MS} ms sin respuesta completa`;
    default:
      return "sigue sondeando";
  }
}
