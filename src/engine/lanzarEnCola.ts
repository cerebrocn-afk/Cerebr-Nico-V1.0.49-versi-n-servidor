/**
 * lanzarEnCola.ts — «LANZAR» NO PUEDE MATAR EL TURNO NI COMERSE EL MENSAJE (v1.0.20)
 * ============================================================================
 * Mario, 15/11, con la captura del «Lanzar este mensaje ahora» delante:
 *
 *   «el botón de lanzar ahora no anda, y que cuando ande no corte la tarea en
 *    curso, que se resuelva en segundo plano hasta juntarse con el proyecto
 *    central»
 *
 * Dice dos cosas y las dos eran ciertas:
 *
 *   1) EL BOTÓN NO HACE NADA. El manejador hacía `setMessageQueue(filter)`, y
 *      como `messageQueueRef.current = messageQueue` se re-asigna en CADA
 *      render, el `encolado` que había encontrado podía venir ya vacío o
 *      perdido entre dos actualizaciones: se quitaba de la lista y no salía
 *      nunca. Peor: con turno en vuelo lo re-insertaba al frente, y al
 *      quitarse primero del mismo arreglo podía quedar con la MISMA posición →
 *      cambio de estado nulo, cero re-render, cero aviso. Un gesto que no
 *      deja rastro.
 *
 *   2) NO PUEDE CORTAR LA TAREA. Y no sólo no debe: **no puede**. El turno
 *      vivo corre dentro de `HighPerformanceAIStreamer.stream()`, que empieza
 *      con `if (this.isProcessing) this.abort()`. Si el mensaje lanzado entra
 *      por el envío normal mientras el otro turno está vivo, el streamer aborta
 *      el turno EN CURSO. Lanzar «ya» y lanzar «después» eran lo mismo: matar
 *      el trabajo.
 *
 * La regla que queda, y es la que este módulo decide:
 *
 *   · Hay turno en vuelo  → el mensaje pasa al FRENTE de la cola, se le pone
 *     marca de lanzado (`lanzadoEn`) y la marca se ve. Se resuelve en segundo
 *     plano: el desencolador de fin de turno lo toma como PRÓXIMO, con el
 *     proyecto central ya actualizado por el turno que estaba en curso.
 *   · No hay turno      → sale en el acto. Y si la marca es de un lanzamiento
 *     reciente (< 10 min) se le dice al modelo que es un mensaje lanzado: así
 *     junta las dos cosas en vez de repetir la mitad.
 *
 * Lo que NO se hace: no se aborta nada, no se pierde nada y no se dice
 * «lanzado» cuando en realidad quedó en la cola. Un botón que miente es peor
 * que un botón roto.
 *
 * PURA: sin React, sin red, sin disco. Todo lo que se pinta y se decide acá se
 * prueba con tsx en `tests/lanzarEnCola.test.ts`.
 */

export interface MensajeEnCola {
  id: string;
  text: string;
  attachments?: unknown[];
  timestamp?: number;
  /** Cuándo pulsó «lanzar». Si falta, nunca se lanzó: llegó a la cola y espera su turno. */
  lanzadoEn?: number;
}

export type DestinoDelLanzado = "al-frente" | "en-el-acto" | "no-esta";

export interface PlanDeLanzado<M extends MensajeEnCola> {
  destino: DestinoDelLanzado;
  /** La cola que queda, ya sin el lanzado (cuando sale en el acto) o con él al frente. */
  cola: M[];
  /** El mensaje, con su marca puesta. null si no estaba. */
  mensaje: M | null;
  /** Qué se le cuenta al usuario. Una sola frase, la verdad. */
  aviso: string;
  /** true si hay que desencolarlo ahora (no hay turno en vuelo). */
  saleYa: boolean;
}

/**
 * La decisión del botón. `enVuelo` es la verdad viva (`isStreamingRef`), no el
 * estado de React: entre el clic y el render pasa un turno de JavaScript y ahí
 * es donde se perdía el mensaje.
 */
export function planDeLanzado<M extends MensajeEnCola>(
  cola: M[],
  id: string,
  enVuelo: boolean,
  ahora = Date.now(),
): PlanDeLanzado<M> {
  const lista = Array.isArray(cola) ? cola.filter(Boolean) : [];
  const i = lista.findIndex((m) => m && m.id === id);
  if (i < 0) {
    return { destino: "no-esta", cola: lista, mensaje: null, aviso: "Ese mensaje ya no está en la cola.", saleYa: false };
  }
  const original = lista[i];
  const marcado = { ...original, lanzadoEn: ahora, timestamp: original.timestamp ?? ahora } as M;
  const corto = String(original.text || "").slice(0, 30) || "(adjuntos)";

  if (enVuelo) {
    // Al frente, y el resto en su orden. Se reconstruye entero: no se muta ni se
    // reordena el arreglo original (el mutar era parte del porqué no se veía).
    const resto = lista.filter((_, j) => j !== i);
    return {
      destino: "al-frente",
      cola: [marcado, ...resto],
      mensaje: marcado,
      aviso: `«${corto}» queda al frente: sale en cuanto termine el turno en curso, sin cortarlo.`,
      saleYa: false,
    };
  }

  return {
    destino: "en-el-acto",
    cola: lista.filter((_, j) => j !== i),
    mensaje: marcado,
    aviso: `«${corto}» sale ahora.`,
    saleYa: true,
  };
}

/**
 * ¿El que sale ahora es un mensaje lanzado que tiene que juntarse con lo que el
 * turno anterior dejó? Si lo fue hace menos de `vigenciaMs`, sí: el proyecto
 * central ya tiene lo que el otro turno escribió y este mensaje se pide sobre
 * eso, no sobre la foto vieja.
 */
export const VIGENCIA_DEL_LANZADO_MS = 10 * 60 * 1000;

export function esLanzadoReciente(m: { lanzadoEn?: number } | null | undefined, ahora = Date.now()): boolean {
  if (!m || typeof m.lanzadoEn !== "number") return false;
  const edad = ahora - m.lanzadoEn;
  return edad >= 0 && edad <= VIGENCIA_DEL_LANZADO_MS;
}

/**
 * La nota que viaja al modelo cuando el mensaje fue lanzado desde la cola. Se
 * pide juntar y no repetir; y se dice explícitamente que el turno anterior pudo
 * haber escrito archivos, porque un modelo que no lo sabe vuelve a escribir lo
 * mismo desde cero.
 */
export function notaDelLanzado(m: { lanzadoEn?: number } | null | undefined, ahora = Date.now()): string | null {
  if (!esLanzadoReciente(m, ahora)) return null;
  return (
    "MENSAJE LANZADO DESDE LA COLA: el usuario lo adelantó mientras el turno anterior seguía trabajando. " +
    "Ese turno terminó por su cuenta y pudo haber escrito archivos en el proyecto central. " +
    "Antes de rehacer nada, mira lo que ya está hecho y continúa desde ahí; no repitas trabajo ya escrito."
  );
}

/**
 * Cómo se ve en la fila de la cola. `lanzado` es el `lanzadoEn` de la marca; si
 * hay turno en vuelo, el mensaje está «al frente»; si no, «saliendo».
 */
export function etiquetaDeLaFila(
  lanzadoEn: number | undefined,
  enVuelo: boolean,
  ahora = Date.now(),
): { texto: string; tono: "lanzado" | "esperando" } {
  if (typeof lanzadoEn !== "number") return { texto: "", tono: "esperando" };
  if (ahora - lanzadoEn > VIGENCIA_DEL_LANZADO_MS) return { texto: "", tono: "esperando" };
  return enVuelo
    ? { texto: "lanzado · sale al terminar", tono: "lanzado" }
    : { texto: "lanzado · saliendo", tono: "lanzado" };
}

/**
 * El recordatorio que se pinta en la cola (y sólo si hay alguno): el usuario
 * pulsó «lanzar», y si el turno se cae antes de desencolar, esto es lo único
 * que le dice que su mensaje no se perdió.
 */
export function hayLanzadoAlFrente(cola: MensajeEnCola[] | null | undefined): boolean {
  const lista = Array.isArray(cola) ? cola : [];
  return !!lista[0] && typeof lista[0].lanzadoEn === "number";
}
