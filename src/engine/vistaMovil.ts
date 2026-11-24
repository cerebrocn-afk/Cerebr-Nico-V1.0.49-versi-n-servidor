/**
 * vistaMovil.ts — LA MATEMÁTICA DE LA PREVISUALIZACIÓN MÓVIL (v1.27.0)
 * ====================================================================
 * QUÉ ES: las funciones puras que deciden a qué TAMAÑO y con qué ESCALA se
 * pinta el teléfono de la previsualización, y cómo gira a horizontal. Sin React,
 * sin DOM, sin red: sólo números — por eso se puede probar sola.
 *
 * POR QUÉ EXISTE: el bug reportado era «en móvil se ve estirado». La causa de
 * raíz de un preview móvil deformado casi siempre es la misma: se deja que el
 * navegador ENCOJA SÓLO EL ANCHO del iframe (con `max-width:100%` o un
 * `aspect-ratio` que el contenedor no respeta), así que la página se renderiza a
 * un ancho raro y se ve achatada o estirada. La cura correcta —la que usan las
 * DevTools de todos los navegadores— es:
 *
 *   1. Renderizar el iframe a un TAMAÑO DE DISPOSITIVO FIJO (p. ej. 390×844), para
 *      que el viewport interno sea el de un móvil de verdad y las media queries
 *      disparen igual que en un teléfono.
 *   2. Encajarlo en el hueco disponible con un `transform: scale(k)` UNIFORME
 *      (el MISMO factor para ancho y alto). Un solo `k` no puede deformar: o se
 *      ve más grande o más pequeño, pero nunca estirado.
 *
 * Girar a horizontal es, entonces, sólo intercambiar ancho y alto del
 * dispositivo y recalcular `k`. Nada más.
 */

export type OrientacionMovil = "vertical" | "horizontal";

export interface Dimensiones {
  ancho: number;
  alto: number;
}

/**
 * Dispositivo de referencia: iPhone 14 / Pixel 8 (390×844 px CSS). Es el mismo
 * que ya usaba el editor, para no cambiar lo que el usuario ya conocía.
 */
export const DISPOSITIVO_MOVIL: Dimensiones = { ancho: 390, alto: 844 };

/** Límites de la escala: ni invisible ni gigante. */
export const ESCALA_MIN = 0.1;
export const ESCALA_MAX = 2;

/**
 * Dimensiones del dispositivo según la orientación. Horizontal = intercambiar
 * ancho y alto (girar el teléfono 90°). Vertical = tal cual.
 */
export function dimsSegunOrientacion(
  orientacion: OrientacionMovil,
  base: Dimensiones = DISPOSITIVO_MOVIL,
): Dimensiones {
  return orientacion === "horizontal"
    ? { ancho: base.alto, alto: base.ancho }
    : { ancho: base.ancho, alto: base.alto };
}

/**
 * La escala UNIFORME que hace que el dispositivo `dims` quepa ENTERO dentro del
 * contenedor `contenedor`, sin deformar y sin recortar. Es el mínimo de las dos
 * razones (ancho y alto): el eje más apretado manda, y el otro sobra centrado.
 *
 * Devuelve un factor acotado a [ESCALA_MIN, ESCALA_MAX]. Si el contenedor aún no
 * tiene tamaño (0), devuelve ESCALA_MIN para no dividir por cero ni explotar.
 */
export function escalaUniforme(contenedor: Dimensiones, dims: Dimensiones): number {
  if (contenedor.ancho <= 0 || contenedor.alto <= 0 || dims.ancho <= 0 || dims.alto <= 0) {
    return ESCALA_MIN;
  }
  const razon = Math.min(contenedor.ancho / dims.ancho, contenedor.alto / dims.alto);
  // Redondeo a 3 decimales: evita `scale(0.7333333)` y reflows por micro-cambios.
  const acotada = Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, razon));
  return Math.round(acotada * 1000) / 1000;
}

/**
 * El tamaño que OCUPA en pantalla el teléfono ya escalado (para reservar el
 * hueco y centrarlo sin que empuje al resto del layout).
 */
export function tamanoRenderizado(dims: Dimensiones, escala: number): Dimensiones {
  return { ancho: Math.round(dims.ancho * escala), alto: Math.round(dims.alto * escala) };
}

/** La siguiente orientación al pulsar «girar». */
export function girar(orientacion: OrientacionMovil): OrientacionMovil {
  return orientacion === "vertical" ? "horizontal" : "vertical";
}
