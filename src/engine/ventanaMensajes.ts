/**
 * ventanaMensajes.ts — EL HISTORIAL NO SE PINTA ENTERO CADA VEZ QUE APRETÁS UNA TECLA
 * ====================================================================================
 * Queja del 31/10: «cuando hay muchos mensajes le cuesta para escribir el teclado,
 * queda muy lento». Medido en el árbol: no había NI UN `React.memo` en `src/components`,
 * ninguna virtualización, y el lazo de render (`ChatCenter.tsx:2202`) recorría
 * `messages.map(...)` entero — los 191 mensajes de la sesión del usuario estaban montados
 * en el DOM y se volvían a pasar por `prosaLegible` en CADA tecla.
 *
 * Este módulo es el dueño puro de la única decisión que hace falta: ¿cuántos mensajes
 * de cola se pintan de verdad? No es «esconder historial» — el resto sigue existiendo,
 * está un clic más arriba y el botón dice CUÁNTOS faltan. Un resumen silencioso sería
 * la mentira de siempre; esto es un acordeón honesto con número.
 *
 * Puro: sin DOM, sin fs, sin reloj. La suite congela la ventana y el botón.
 */

/** Cuántos mensajes de cola se pintan sin que el usuario pida más. */
export const VENTANA_DEFECTO = 40;
/** Conversaciones por debajo de este número se muestran completas: no hay nada que ganar. */
export const UMBRAL_CONVERSACION = 60;
/** Cuántos se suman por clic en «mostrar anteriores». */
export const PASO_REVELADO = 40;

export interface VentanaMensajes {
  /** Índice del primer mensaje que se renderiza (`slice(desde)`). */
  desde: number;
  /** Cuántos quedaron arriba, sin pintar (el número que tiene que decir el botón). */
  ocultos: number;
  /** Si conviene ofrecer el botón (con 2 escondidos ya molesta que no aparezca). */
  mostrarMas: boolean;
  /** Total recibido, devuelto para que el render no vuelva a preguntar por `messages.length`. */
  total: number;
}

/**
 * `revelados` es lo que el usuario ya pidió ver (0 = la ventana de siempre). La ventana
 * efectiva es `VENTANA_DEFECTO + revelados`, y NUNCA puede dejar un hueco en el medio:
 * siempre es la cola contigua, así que el hilo de la conversación se lee seguido.
 */
export function decidirVentanaMensajes(total: number, revelados = 0): VentanaMensajes {
  const n = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const extra = Number.isFinite(revelados) ? Math.max(0, Math.floor(revelados)) : 0;
  if (n <= UMBRAL_CONVERSACION) return { desde: 0, ocultos: 0, mostrarMas: false, total: n };
  const visibles = Math.min(n, VENTANA_DEFECTO + extra);
  const desde = n - visibles;
  return { desde, ocultos: desde, mostrarMas: desde > 0, total: n };
}

/** El siguiente `revelados` tras un clic (crece de a `PASO_REVELADO`, sin pasar del total). */
export function siguienteRevelado(revelados: number, total: number): number {
  const extra = Number.isFinite(revelados) ? Math.max(0, Math.floor(revelados)) : 0;
  return Math.max(0, Math.min(Math.max(0, Math.floor(total || 0)), extra + PASO_REVELADO));
}

/** Cómo se llama el botón. Con número, siempre: «mostrar más» a secas no dice nada. */
export function rotuloMostrarMas(ocultos: number): string {
  const n = Math.max(0, Math.floor(ocultos || 0));
  return n === 1 ? "\u25b4 1 mensaje anterior" : `\u25b4 ${n} mensajes anteriores`;
}
