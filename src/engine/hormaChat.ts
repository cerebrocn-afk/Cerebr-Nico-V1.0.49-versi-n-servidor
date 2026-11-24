/**
 * hormaChat.ts · EL ANCHO DEL CHAT ES UN PASO, NO UN INTERRUPTOR (v1.99.9 · v2.3.10)
 * ===============================================================================
 * Mario pidió esto hace varias sesiones y venía a medias: «el chat más ancho y que se
 * redimensione a medida que se abren más cosas». Lo que había era binario: `amplio={!isRightOpen}`
 * — si el panel derecho estaba abierto, el chat volvía a 896 px **sin importar** si la pantalla
 * era de 1366 o de 2560, ni si la izquierda estaba cerrada. Abrir una sola cosa te dejaba con la
 * horma de siempre y un montón de aire desaprovechado al lado.
 *
 * Acá la horma se decide con la cuenta que App ya hace para los paneles (`PANEL_LIMITS`): el
 * espacio que queda libre es el ancho de la ventana menos lo que ocupan los paneles ABIERTOS (los
 * persistidos de un panel cerrado valen 0 px — el mismo agujero que se corrigió en el auto-fit de
 * la v2.3.1), menos los splitters y el colchón del scroll.
 *
 * EL CRITERIO (no se toca, y hay motivo): se elige el paso más ANGOSTO que CUBRE el espacio libre
 * (`h.px >= librePx`). `max-w-*` es un tope, así que un paso que desborda un poco lo recorta el
 * contenedor y el chat ocupa TODO el ancho disponible; un paso que no llega deja aire muerto a los
 * lados. Por eso «cubrir» es lo correcto y «caber» es lo que se ve más chico.
 *
 * v2.3.9 · EL TECHO SUBIÓ (pedido: «necesito que ensanches el chat»). La escala terminaba en
 * `despejada` = 1152 px, así que en un monitor de 1920 con los dos paneles abiertos el chat se
 * quedaba en 1024 y con la derecha cerrada en 1152 — siempre con aire muerto a los lados. Se
 * añaden dos pasos por arriba (`ancha` 1280 = max-w-7xl, `total` 1536 = max-w-[96rem]).
 *
 * v2.3.10 · EL HUECO DE 1024 A 1152 (pedido: «el mensaje tuyo no es del tamaño real de la barra
 * del chat, es más chico»). Con los dos paneles abiertos en 1920 el espacio libre es 1028 px: cae
 * justo por encima de `amplia` (1024) y por debajo de `despejada` (1152), así que el criterio
 * elegía `despejada` y el chat se recortaba a 1028 — correcto, pero el salto de la escala era de
 * 128 px y no había paso que cubriera ese hueco con holgura. Se añade `holgada` = 1088 px
 * (max-w-[68rem]) entre `amplia` y `despejada`: el caso más común de la interfaz (1920 con ambos
 * paneles) deja de depender de un recorte y pasa a tener su propio paso.
 *
 * v2.3.11 · LA ESCALA SE CIERRA POR ARRIBA (fallo real de la suite: 1920 con solo el derecho
 * abierto daba 1484 px libres y el criterio saltaba a `total` = 1536, un paso que DESBORDA 52 px
 * y que el contenedor recorta; y con los dos abiertos daba 1224 y saltaba a `ancha` = 1280, 56 px
 * de recorte). El criterio de «cubrir» es correcto cuando el paso siguiente está cerca, pero con
 * saltos de 256 px el chat se pasa de largo y el ancho real lo decide el recorte, no la escala.
 * Se añaden los dos pasos que faltaban para que cada franja real de la interfaz tenga su tope:
 *   · `holgada2` = 1216 px (max-w-[76rem]) → cubre 1152→1216 (1920 con los dos paneles: 1224).
 *   · `amplia2`  = 1472 px (max-w-[92rem]) → cubre 1280→1472 (1920 con solo el derecho: 1484).
 * La escala queda de 128 en 128 px salvo el primer tramo, y el techo sigue en 1536.
 *
 * Degrada honesto: sin lectura de ventana (SSR, primer tick, test) se devuelve `normal` — la horma
 * histórica, no un invento más ancho. Un número que no se midió no ensancha nada.
 *
 * Puro: sin DOM, sin reloj, sin fs. `window.innerWidth` y los anchos de los paneles los trae el
 * cable (App.tsx), que es donde viven.
 */

import { PANEL_LIMITS } from "../constants";

export type PasoHorma =
  | "angosta"
  | "normal"
  | "amplia"
  | "holgada"
  | "despejada"
  | "holgada2"
  | "ancha"
  | "amplia2"
  | "total";

export interface Horma {
  paso: PasoHorma;
  /** La clase Tailwind, que es la que se pinta. Único lugar donde se escribe. */
  clase: string;
  /** El tope en píxeles, para poder batear la cuenta en la suite. */
  px: number;
}

/** Los nueve pasos, de angosto a total. Ordinales: la graduación no es un capricho. */
export const HORMAS: readonly Horma[] = [
  { paso: "angosta", clase: "max-w-3xl", px: 768 },
  { paso: "normal", clase: "max-w-4xl", px: 896 },
  { paso: "amplia", clase: "max-w-5xl", px: 1024 },
  // v2.3.10 — el paso que faltaba: cubre el hueco 1024→1152 (el caso 1920 con ambos paneles).
  { paso: "holgada", clase: "max-w-[68rem]", px: 1088 },
  { paso: "despejada", clase: "max-w-6xl", px: 1152 },
  // v2.3.11 — cierra el hueco 1152→1280 (1920 con los dos paneles abiertos: 1224 px libres).
  { paso: "holgada2", clase: "max-w-[76rem]", px: 1216 },
  // v2.3.9 — los dos pasos que faltaban para pantallas grandes.
  { paso: "ancha", clase: "max-w-7xl", px: 1280 },
  // v2.3.11 — cierra el hueco 1280→1536 (1920 con solo el derecho abierto: 1484 px libres).
  { paso: "amplia2", clase: "max-w-[92rem]", px: 1472 },
  { paso: "total", clase: "max-w-[96rem]", px: 1536 },
] as const;

/** La horma de siempre: la que había antes de cualquier graduación. */
export const HORMA_DEFECTO: PasoHorma = "normal";

export function hormaDe(paso: PasoHorma | string | undefined | null): Horma {
  const encontrado = HORMAS.find((h) => h.paso === paso);
  return encontrado || HORMAS.find((h) => h.paso === HORMA_DEFECTO)!;
}

/** La clase que pinta el cable. Con paso desconocido o ausente: la horma histórica. */
export function claseHorma(paso: PasoHorma | string | undefined | null): string {
  return hormaDe(paso).clase;
}

export interface Panorámica {
  /** `window.innerWidth`. `undefined` = no se midió → no se inventa. */
  anchoPx?: number;
  izquierdaAbierta: boolean;
  derechaAbierta: boolean;
  /** Anchos persistidos de los paneles. Si no llegan, se usa el default de `PANEL_LIMITS`. */
  izquierdaPx?: number;
  derechaPx?: number;
}

export interface DecisiónHorma extends Horma {
  /** Píxeles reales disponibles para la columna central. */
  librePx: number;
  /** Qué se tuvo en cuenta, en una línea: para que la interfaz pueda explicar su propio ancho. */
  motivo: string;
}

/**
 * El espacio libre del centro. Un panel cerrado ocupa 0, no su ancho guardado (error histórico del
 * auto-fit, que por eso robaba reducción al panel que sí estaba visible).
 */
export function espacioLibre(p: Panorámica): number {
  const ancho = Number(p.anchoPx);
  if (!Number.isFinite(ancho) || ancho <= 0) return -1; // sin lectura: no se decide
  const lw = p.izquierdaAbierta ? Number(p.izquierdaPx ?? PANEL_LIMITS.LEFT_DEFAULT) || PANEL_LIMITS.LEFT_DEFAULT : 0;
  const rw = p.derechaAbierta ? Number(p.derechaPx ?? PANEL_LIMITS.RIGHT_DEFAULT) || PANEL_LIMITS.RIGHT_DEFAULT : 0;
  return Math.round(ancho - lw - rw - PANEL_LIMITS.SPLITTERS - PANEL_LIMITS.SAFETY);
}

/**
 * LA CUENTA. Del espacio libre sale el paso: el más angosto que lo CUBRE (porque `max-w-*` es un
 * tope, no una orden de estirarse: un paso que desborda lo recorta el contenedor y el chat ocupa
 * todo el ancho; uno que no llega deja aire muerto). Con lectura rara o sin lectura, `normal`.
 */
export function decidirHorma(p: Panorámica): DecisiónHorma {
  const librePx = espacioLibre(p);
  if (librePx < 0) {
    const base = hormaDe(HORMA_DEFECTO);
    return { ...base, librePx: -1, motivo: "sin lectura de la ventana: se usa la horma histórica" };
  }
  // Los paneles nunca se dejan aplastar: el centro tiene su mínimo (`CENTER_MIN`), pero la horma
  // no puede ser más angosta que el propio paso mínimo de la lista.
  const elegido = HORMAS.find((h) => h.px >= librePx) || HORMAS[HORMAS.length - 1];
  const abiertos = [p.izquierdaAbierta && "izquierda", p.derechaAbierta && "derecha"].filter(Boolean).join(" + ");
  return {
    ...elegido,
    librePx,
    motivo: `${librePx} px libres (ventana ${Math.round(Number(p.anchoPx))} − ${abiertos || "ningún panel"}) → tope ${elegido.px} px`,
  };
}

/** El siguiente paso, para poder probar la monotonicidad (y para un ajuste manual futuro). */
export function pasoSiguiente(paso: PasoHorma): PasoHorma {
  const i = HORMAS.findIndex((h) => h.paso === paso);
  return HORMAS[(i + 1) % HORMAS.length].paso;
}
