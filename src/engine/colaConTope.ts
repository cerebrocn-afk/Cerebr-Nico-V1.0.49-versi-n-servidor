/**
 * colaConTope.ts — v1.88.1 · LAS COLAS DE UI NO CRECEN SIN TECHO
 * ==============================================================
 * LA QUEJA (28/10, captura con CPU al 100 % y el IDE lento a los pocos
 * mensajes): «a esa altura de mensajes ya estaba el IDE lento».
 *
 * MEDIDO EN EL CÓDIGO: `actionLog` crecía con `setActionLog((prev) => [...prev, x])`
 * en cada evento de herramienta y `terminalLogs` con
 * `setTerminalLogs((l) => [...l, ...])` en ~90 puntos, NINGUNO con tope. Dos
 * consecuencias reales: React re-renderiza el array completo en cada push y el
 * panel de Tareas filtra/ordena esas dos listas en cada render; y cada push
 * copia de referencia toda la cola anterior (basura que el recolector tiene que
 * procesar mientras el agente gira).
 *
 * El tope no es un número mágico: la bitácora visible consume `slice(-40)` y el
 * panel muestra 3 fallas + un contador. Con 400/300 sobra pantalla de historial
 * y el coste por push pasa a ser constante.
 */

/** Bitácora de actividad: se muestran 40, se guardan 400. */
export const TOPE_BITACORA = 400;
/** Acciones del agente: se agrupan, se guardan 300. */
export const TOPE_ACCIONES = 300;

/** Agrega al final manteniendo como máximo `max` elementos (los más viejos salen). */
export function conTope<T>(cola: readonly T[], item: T, max: number): T[] {
  const salida = cola.length >= max ? cola.slice(cola.length - max + 1) : cola.slice();
  (salida as T[]).push(item);
  return salida as T[];
}

/** Recorta a los `max` más recientes; devuelve la MISMA referencia si no hace falta. */
export function podar<T>(cola: readonly T[], max: number): T[] {
  return cola.length > max ? cola.slice(cola.length - max) : (cola as T[]);
}
