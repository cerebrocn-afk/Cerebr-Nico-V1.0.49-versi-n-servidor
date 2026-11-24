/**
 * compositorChat.ts — EL COMPOSITOR SUBE CUANDO ESCRIBES
 * ======================================================
 * Pedido del usuario (4/11): «el renglón central donde tú estás escribiendo
 * súbelo más arriba; ahora estás por debajo de la mitad de la pantalla, debes
 * subirla arriba del medio de la pantalla, siempre terminas escribiendo debajo
 * de la barra del chat, porque no sube lo suficiente estable con la escritura
 * del texto».
 *
 * El defecto real, medido en `ChatCenter.tsx`:
 *   · El compositor vive en un `<div>` hermano del hilo, ambos dentro de un
 *     `flex flex-col`. El hilo es `flex-1` y el compositor `shrink-0`: el
 *     compositor SIEMPRE queda pegado al borde inferior del panel.
 *   · El `<textarea>` crece hasta 130 px (5 renglones) y, al crecer, EMPUJA el
 *     compositor hacia arriba… pero el hilo se encoge en la misma medida, así
 *     que el bloque nunca pasa de la mitad de la pantalla: el texto que estás
 *     escribiendo se queda en la franja de abajo.
 *   · Y como el alto se recalcula en cada tecla (`useLayoutEffect`), el bloque
 *     sube y baja un píxel por renglón: eso es el «no sube lo suficiente
 *     estable» que reporta el usuario.
 *
 * La cura, en dos piezas y sin tocar el layout del resto del chat:
 *   1. `decidirElevacion` — criterio PURO: cuánto hay que elevar el compositor
 *      para que su borde superior quede por encima de la mitad del panel.
 *      Depende del alto del panel y del alto del compositor, no de la ventana
 *      ni del scroll: por eso es estable mientras escribes.
 *   2. `claseElevacion` — la clase CSS que aplica esa elevación con una
 *      transición corta, para que el salto no sea un brinco.
 *
 * Regla de la casa: el criterio vive aquí, probado en seco
 * (`tests/compositorChat.test.ts`), y el componente solo pregunta. Nada de
 * números mágicos repartidos por el JSX.
 */

/** Cuánto puede elevarse el compositor como máximo, en fracción del alto del panel. */
export const ELEVACION_MAXIMA = 0.5;

/** Debajo de este alto de panel no se eleva nada: en una ventana baja, subir el
 *  compositor dejaría el hilo sin sitio para respirar. */
export const ALTO_MINIMO_PANEL = 420;

/** Aire que se deja entre el borde superior del compositor y la mitad del panel. */
export const MARGEN_SOBRE_MITAD = 12;

export interface MedidaCompositor {
  /** Alto visible del panel del chat (el `<main>`), en px. */
  altoPanel: number;
  /** Alto actual del compositor (formulario + tira de adjuntos), en px. */
  altoCompositor: number;
  /** ¿El usuario está escribiendo? Sin texto no hay nada que subir. */
  escribiendo: boolean;
}

export interface Elevacion {
  /** Píxeles que hay que subir el compositor. 0 = se queda abajo, como siempre. */
  px: number;
  /** Por qué se decidió eso, en una frase (para el registro y las pruebas). */
  motivo: string;
}

/**
 * Decide cuánto elevar el compositor.
 *
 * La cuenta: para que el borde SUPERIOR del compositor quede por encima de la
 * mitad del panel, hay que subirlo hasta que `altoPanel/2` caiga dentro de él.
 * Es decir: `px = altoPanel/2 - altoCompositor + margen`, nunca negativo y
 * nunca más de la mitad del panel (más que eso dejaría el hilo sin sitio).
 *
 * Estabilidad: `altoPanel` no cambia mientras escribes y `altoCompositor` solo
 * cambia cuando el textarea cruza un renglón. Por eso el bloque no baila: sube
 * una vez y se queda.
 */
export function decidirElevacion(m: MedidaCompositor): Elevacion {
  const altoPanel = Number.isFinite(m.altoPanel) ? Math.max(0, m.altoPanel) : 0;
  const altoCompositor = Number.isFinite(m.altoCompositor) ? Math.max(0, m.altoCompositor) : 0;

  if (!m.escribiendo) {
    return { px: 0, motivo: "sin texto: el compositor se queda abajo, como siempre" };
  }
  if (altoPanel < ALTO_MINIMO_PANEL) {
    return {
      px: 0,
      motivo: `panel de ${Math.round(altoPanel)} px (mínimo ${ALTO_MINIMO_PANEL}): elevar dejaría el hilo sin sitio`,
    };
  }
  if (altoCompositor <= 0) {
    return { px: 0, motivo: "compositor sin medir todavía" };
  }

  const mitad = altoPanel / 2;
  const bruto = mitad - altoCompositor + MARGEN_SOBRE_MITAD;
  const techo = altoPanel * ELEVACION_MAXIMA;
  const px = Math.round(Math.max(0, Math.min(bruto, techo)));

  if (px === 0) {
    return {
      px: 0,
      motivo: `el compositor (${Math.round(altoCompositor)} px) ya cruza la mitad del panel (${Math.round(mitad)} px)`,
    };
  }
  return {
    px,
    motivo: `sube ${px} px para que el borde superior quede sobre la mitad del panel (${Math.round(mitad)} px)`,
  };
}

/**
 * La clase CSS que aplica la elevación. Se devuelve una clase y no un `style`
 * inline porque el compositor ya lleva un `style` con el padding del panel de
 * Tareas, y dos escritores sobre el mismo atributo es la receta del «lo pongo y
 * no se ve». La clase la define `index.css` con su transición.
 */
export function claseElevacion(e: Elevacion): string {
  return e.px > 0 ? "cn-compositor-elevado" : "";
}

/** Variable CSS con los píxeles exactos, para que la clase no tenga que saberlos. */
export function variableElevacion(e: Elevacion): Record<string, string> {
  return { "--cn-compositor-alza": `${e.px}px` };
}
