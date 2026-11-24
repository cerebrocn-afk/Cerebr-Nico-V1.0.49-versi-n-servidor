/**
 * tarjetaFlotante.ts — LA GEOMETRÍA DE LAS TARJETAS PORTALEADAS (v1.98.0)
 * =========================================================================
 * Hay tres paneles que se portalan a `body` con `position:fixed` anclado al rect
 * del gatillo: el cambiador de voz (TtsSelector), la tarjeta de Aspecto
 * (PanelAspecto) y el Consejo (ConsejoPanel). Los tres reimplementaban la misma
 * cuenta a mano, y la cuenta estaba mal. La captura del 31/10 lo probó dos veces
 * sobre el mismo panel:
 *
 *   · «a veces intenta abrir pero al otro lado de la pantalla, a la derecha»
 *     → se medía el gatillo en el frame en que el menú todavía no había pintado
 *       (rect 0×0). La fórmula era `right: innerWidth - r.right`, o sea
 *       `right = innerWidth`: la tarjeta pegada al borde DERECHO. Un guard `if (!r)`
 *       no alcanza: el rect degenerado no es `null`, es un objeto lleno de ceros,
 *       y los ceros son números perfectamente válidos para la aritmética.
 *   · la tarjeta aparecía cortada por el borde inferior de la ventana: nadie
 *     preguntaba si cabía abajo.
 *
 * Este archivo es el dueño único de esa cuenta. Es PURA (sin DOM, sin reloj, sin
 * red): recibe un rect, las medidas de la tarjeta y las de la ventana, y devuelve
 * dónde va. Así se puede probar el rect 0×0, la ventana angosta y el volteo sin
 * abrir un navegador — que es exactamente la clase de bug que en el navegador
 * depende de en qué frame se midió y, por lo tanto, no se reproduce a pedido.
 */

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface Medidas {
  ancho: number;
  alto: number;
}

export interface Ventana {
  ancho: number;
  alto: number;
}

/** La tarjeta no debe tocar el borde de la pantalla ni con el zoom puesto. */
export const MARGEN_VENTANA = 8;
/** Respiración entre el gatillo y la tarjeta. */
export const SEPARACION = 6;
/**
 * Alto con el que se razona cuando la tarjeta todavía no pintó (no se puede
 * medir `offsetHeight` de algo que no está en pantalla). Es el alto REAL medido
 * del cambiador de voz: voz + velocidad + tono + botón de prueba + la nota del
 * tono. Subestimar es el bug: la tarjeta se cree corta y se ancla abajo, y el
 * borde inferior de la ventana se come el botón.
 */
export const ALTO_TARJETA_POR_DEFECTO = 356;
export const ANCHO_TARJETA_POR_DEFECTO = 288; // `w-72`

export interface Ancla {
  top: number;
  left: number;
  /** true cuando la tarjeta se volcó por encima del gatillo porque abajo no cabía. */
  arriba: boolean;
}

/**
 * Un rect es VIVIBLE si describe algo dibujado. `getBoundingClientRect` sobre un
 * elemento dentro de un ancestro `display:none`, o medido en el frame previo al
 * paint, devuelve los ocho ceros: geométricamente un punto en el origen. Anclar
 * a eso produce la tarjeta en el borde de la pantalla (el bug reportado), así
 * que se trata como lo que es: todavía no hay datos.
 */
export function esRectVivible(r: Partial<Rect> | null | undefined): r is Rect {
  if (!r) return false;
  const n = [r.top, r.bottom, r.left, r.right, r.width, r.height];
  if (n.some((x) => typeof x !== "number" || !Number.isFinite(x))) return false;
  if ((r.width as number) <= 0 && (r.height as number) <= 0) return false; // el 0×0 del no-pintado
  if ((r.right as number) <= 0 || (r.bottom as number) <= 0) return false; // rect fuera del documento
  return true;
}

const limitar = (v: number, min: number, max: number): number => (max < min ? min : Math.min(Math.max(v, min), max));

/**
 * Dónde va la tarjeta. Devuelve `null` cuando NO se puede anclar (rect no
 * vivible, ventana sin medidas): el llamador debe conservar la última ancla
 * buena y reintentar en el frame siguiente, nunca pintar en un borde al azar.
 */
export function calcularAncla(
  r: Partial<Rect> | null | undefined,
  m: Medidas = { ancho: ANCHO_TARJETA_POR_DEFECTO, alto: ALTO_TARJETA_POR_DEFECTO },
  v: Ventana = { ancho: 1280, alto: 800 }
): Ancla | null {
  if (!esRectVivible(r)) return null;
  if (!Number.isFinite(v.ancho) || !Number.isFinite(v.alto) || v.ancho <= 0 || v.alto <= 0) return null;
  const ancho = Number.isFinite(m.ancho) && m.ancho > 0 ? m.ancho : ANCHO_TARJETA_POR_DEFECTO;
  const alto = Number.isFinite(m.alto) && m.alto > 0 ? m.alto : ALTO_TARJETA_POR_DEFECTO;

  // Horizontal: se alinea a la IZQUIERDA del gatillo (no al borde derecho: anclar
  // por `right` es lo que, con un rect roto, catapulta la tarjeta al otro lado).
  // Si no cabe, se pega al borde izquierdo; si la ventana es más angosta que la
  // tarjeta, se deja en el margen y el ancho hace el resto.
  const left = limitar(r.left, MARGEN_VENTANA, v.ancho - ancho - MARGEN_VENTANA);

  // Vertical: primero abajo del gatillo; si desborda el borde inferior, arriba.
  const abajo = r.bottom + SEPARACION;
  const cabeAbajo = abajo + alto <= v.alto - MARGEN_VENTANA;
  const arriba = !cabeAbajo && r.top - SEPARACION - alto >= MARGEN_VENTANA;
  const topCrudo = arriba ? r.top - SEPARACION - alto : abajo;
  // Última red: una tarjeta más alta que la ventana se centra en el espacio, no
  // se cuelga por arriba (el `limitar` con max<min devuelve min).
  const top = limitar(Math.round(topCrudo), MARGEN_VENTANA, Math.max(MARGEN_VENTANA, v.alto - alto - MARGEN_VENTANA));

  return { top, left: Math.round(left), arriba };
}

/**
 * El marca-paso de las tarjetas flotantes. El fuera-clic de un menú que contiene
 * al gatillo sólo conoce SU contenedor; como la tarjeta vive en `body`, todo clic
 * dentro de la tarjeta era «afuera» y el menú se cerraba llevándose el gatillo
 * puesto (así se moría el cambiador de voz al segundo clic). Los dueños de
 * menús consultan este atributo antes de cerrar.
 */
export const ATRIBUTO_TARJETA_FLOTANTE = "data-cn-tarjeta-flotante";
export const SELECTOR_TARJETA_FLOTANTE = `[${ATRIBUTO_TARJETA_FLOTANTE}]`;

/** ¿El destino del clic está dentro de una tarjeta flotante? (sin tocar `window`) */
export function esTarjetaFlotante(n: { closest?: (s: string) => unknown } | null | undefined): boolean {
  try {
    return !!(n && typeof n.closest === "function" && n.closest(SELECTOR_TARJETA_FLOTANTE));
  } catch {
    return false;
  }
}
