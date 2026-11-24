/**
 * goteo.ts · EL CAUDAL DE LA PANTALLA (v1.99.3)
 * ==============================================
 * Queja de Mario del 1/11: «la pantalla cae de golpe a veces o va muy rápido, normalizá
 * siempre la misma velocidad; inyectar texto con velocidad nivel lectura media-rápida, así
 * queda todo uniforme, porque los pantallazos te hacen perder. Y aunque el entregable vaya
 * fuera de tiempo de ejecución, sincronizado y constante a la misma velocidad».
 *
 * El defecto de origen: el SSE entrega parches de tamaño arbitrario (un token de 4
 * caracteres, después 1.800 de golpe cuando el modelo zafa un bloque), y el composer los
 * pinta como llegan. La pantalla hereda el ritmo de la red, que no es el ritmo de nadie.
 *
 * Este módulo es el DUEÑO PURO del caudal: cuántos caracteres se sueltan en cada cuadro.
 * La bomba (el pump con rAF) vive en el componente; acá no hay reloj, ni DOM, ni estado
 * global — entra estado, sale un número, y por eso se puede probar que TRES patrones de
 * llegada distintos (un pantallazo de 3.000, 300 parches de 10, 30 de 100) dan la MISMA
 * velocidad en pantalla. Eso es exactamente lo que el usuario pidió y lo que hoy no se
 * puede afirmar sin este criterio.
 *
 * Reglas no negociables:
 *   · la velocidad NO cambia si el modelo se retrasó o se adelantó (palabra del usuario:
 *     «aunque el entregable vaya fuera de tiempo de ejecución»);
 *   · un cuadro no puede soltar más de `cuadroMax` caracteres — es el pantallazo;
 *   · si vinieron mil líneas de golpe, no se aceleran: se esperaban (cola), no se tiran;
 *   · nunca se parte una palabra por la mitad;
 *   · al terminar el stream la cola se DRENA al mismo caudal, y si queda poco, se cierra
 *     parejo (nunca deja las últimas 3 palabras colgando para siempre).
 */

/** Lectura media-rápida en pantalla: 45 caracteres por segundo (~700 ppm, cómodo y parejo). */
export const CPS_LECTURA_MEDIA_RAPIDA = 45;
/** Techo por cuadro. Con 60 fps y 45 cps el pedido real es ~0,75; 6 es un margen generoso. */
export const CUADRO_MAX_CARACTERES = 6;
/** Debajo de esto, convenimos cerrar: gotea demasiado lento para tan poco. */
export const CIERRE_LIMITE_CARACTERES = 3;

/**
 * Cuántos caracteres soltar en este cuadro.
 * `disponibles` = lo que ya llegó y todavía no se pintó; `soltados` = lo ya mostrado;
 * `ms` = tiempo desde el cuadro anterior; `streamEnCurso` = el modelo sigue hablando.
 */
export function calcularSoltar(d: {
  disponibles: number;
  soltados: number;
  /** Milisegundos desde que el mensaje **empezó a mostrarse** (reloj absoluto). */
  msTranscurrido: number;
  cps?: number;
  cuadroMax?: number;
  streamEnCurso?: boolean;
}): number {
  const cps = Math.max(1, Math.floor(d.cps ?? CPS_LECTURA_MEDIA_RAPIDA));
  const cuadroMax = Math.max(1, Math.floor(d.cuadroMax ?? CUADRO_MAX_CARACTERES));
  const disponibles = Math.max(0, Math.floor(d.disponibles || 0));
  if (disponibles <= 0) return 0;
  // RELOJ ABSOLUTO, no delta por cuadro. Es la cura del hambre entera: a 60 fps y 45 cps
  // el pedido por cuadro es 0,72 caracteres, y una cuenta entera devolvía 0 — el texto se
  // estancaba y la pantalla se prendía (medido por la suite: 1 cps). Con el objetivo
  // acumulado en el tiempo, la velocidad es del lector y el error no se arrastra.
  // El reloj NO se recorta (mi primer intento lo cortaba a 2 s y el objetivo quedaba
  // topeado en 90 caracteres: se moría ahí). El antídoto contra la ráfaga es el techo
  // por cuadro, que actúa cuadro a cuadro, no un tope en el tiempo acumulado.
  const t = Math.max(0, Number.isFinite(d.msTranscurrido) ? d.msTranscurrido : 0);
  let n = Math.floor((cps * t) / 1000) - Math.max(0, Math.floor(d.soltados || 0));
  if (n < 0) n = 0;
  if (n > cuadroMax) n = cuadroMax; // el techo es el pantallazo: tras una pausa se espera, no se vuelca
  if (n === 0 && disponibles >= cuadroMax) n = 1; // nunca trabarse con cola por delante
  if (n > disponibles) n = disponibles;
  if (!d.streamEnCurso && disponibles <= CIERRE_LIMITE_CARACTERES) n = disponibles; // cerrar parejo
  return n;
}

/**
 * Índice hasta donde pintar sin partir una palabra: busca el último blanco dentro del
 * tramo y, si no hay ninguno (una URL larguísima), avanza igual para no estancarse.
 */
export function cortarSinPartirPalabra(texto: string, desde: number, hasta: number): number {
  const t = String(texto || "");
  const a = Math.max(0, Math.min(desde, t.length));
  const b = Math.max(a, Math.min(hasta, t.length));
  if (b <= a) return a;
  const blanco = Math.max(t.lastIndexOf(" ", b), t.lastIndexOf("\n", b), t.lastIndexOf("\t", b));
  if (blanco > a) return blanco;
  return b; // token más largo que el cuadro: se entrega entero, no se traba
}

/** Decisión del cuadro, para el componente: soltar, esperar, o cerrar. */
export function decidirCuadro(d: {
  texto: string;
  soltados: number;
  /** ms desde que este mensaje empezó a mostrarse. */
  msTranscurrido: number;
  streamEnCurso: boolean;
  cps?: number;
}): { soltados: number; terminar: boolean } {
  const disponibles = d.texto.length - d.soltados;
  if (disponibles <= 0) return { soltados: d.texto.length, terminar: !d.streamEnCurso };
  const n = calcularSoltar({
    disponibles,
    soltados: d.soltados,
    msTranscurrido: d.msTranscurrido,
    cps: d.cps,
    streamEnCurso: d.streamEnCurso,
  });
  if (n <= 0) return { soltados: d.soltados, terminar: false };
  const hasta = cortarSinPartirPalabra(d.texto, d.soltados, d.soltados + n);
  const avance = hasta > d.soltados ? hasta : Math.min(d.soltados + n, d.texto.length);
  return { soltados: avance, terminar: !d.streamEnCurso && avance >= d.texto.length };
}
