/**
 * pantallaCompleta.ts — PANTALLA COMPLETA, en un solo sitio
 * =========================================================
 * 🐞 EL FALLO: «el botón de salir de pantalla completa no anda».
 *
 * En `DedicatedWebEditorView` el botón hacía esto:
 *
 *     if (!document.fullscreenElement) {
 *       (el.requestFullscreen?.() || (el as any).webkitRequestFullscreen?.())?.catch?.(() => {});
 *     } else {
 *       (document.exitFullscreen?.() || (document as any).webkitExitFullscreen?.())?.catch?.(() => {});
 *     }
 *
 * Fíjate en la asimetría: la LLAMADA contempla los dos nombres de la API
 * (`requestFullscreen` y `webkitRequestFullscreen`), pero la PREGUNTA solo
 * mira el moderno. En cualquier motor que exponga únicamente el prefijado,
 * `document.fullscreenElement` es `undefined` PARA SIEMPRE, así que la
 * condición siempre entra por la rama de «entrar»: pulsar «Salir» vuelve a
 * pedir pantalla completa y nunca sale. El botón no está roto — está tomando
 * la decisión contraria.
 *
 * Y había un segundo problema, más traicionero: el `.catch(() => {})`.
 * Cualquier rechazo —incluido el de intentar salir cuando ya no hay nada en
 * pantalla completa— se tragaba en silencio. El síntoma era «no hace nada», sin
 * una sola pista. Aquí los errores se devuelven para que el llamante pueda
 * contarlos en vez de esconderlos.
 *
 * Puro en la parte que decide (testeable en node con un documento falso) y
 * mínimo en la que toca el DOM.
 */

/* ============================================================
   TIPOS ESTRUCTURALES (para poder testear sin navegador)
   ============================================================ */

/** Lo que necesitamos de un `Document`, incluidos los nombres prefijados. */
export interface DocumentoPantalla {
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  mozFullScreenElement?: unknown;
  msFullscreenElement?: unknown;
  exitFullscreen?: () => unknown;
  webkitExitFullscreen?: () => unknown;
  mozCancelFullScreen?: () => unknown;
  msExitFullscreen?: () => unknown;
}

/** Lo que necesitamos de un `Element` que puede entrar en pantalla completa. */
export interface ElementoPantalla {
  requestFullscreen?: () => unknown;
  webkitRequestFullscreen?: () => unknown;
  mozRequestFullScreen?: () => unknown;
  msRequestFullscreen?: () => unknown;
}

export type AccionPantalla = "entrar" | "salir";

/* ============================================================
   DECISIÓN (pura)
   ============================================================ */

/**
 * ¿Qué elemento está en pantalla completa, si es que hay alguno?
 * Se pregunta por los CUATRO nombres. Antes solo se miraba uno, y ahí estaba
 * el fallo: preguntar por un nombre que el motor no usa equivale a preguntar
 * siempre «no hay nada» y decidir siempre lo contrario de lo que toca.
 */
export function elementoEnPantallaCompleta(doc: DocumentoPantalla | null | undefined): unknown | null {
  if (!doc) return null;
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

/**
 * Salir si hay algo en pantalla completa; entrar si no hay nada.
 *
 * Si lo que está en pantalla completa es OTRO elemento distinto del nuestro,
 * la respuesta sigue siendo `salir`: el usuario pidió salir de pantalla
 * completa, no salir de un elemento concreto.
 */
export function decidirAccion(doc: DocumentoPantalla | null | undefined): AccionPantalla {
  return elementoEnPantallaCompleta(doc) ? "salir" : "entrar";
}

/* ============================================================
   EJECUCIÓN (DOM)
   ============================================================ */

/**
 * Las variantes antiguas devuelven `undefined` en vez de una promesa; tratarlas
 * como promesa reventaría al llamar a `.catch`. Se normaliza aquí.
 */
function comoPromesa(resultado: unknown): Promise<void> {
  return resultado && typeof (resultado as Promise<void>).then === "function"
    ? (resultado as Promise<void>)
    : Promise.resolve();
}

/** Entra en pantalla completa con el primer nombre de la API que exista. */
export function entrarEnPantallaCompleta(el: ElementoPantalla | null | undefined): Promise<void> {
  const fn = el?.requestFullscreen ?? el?.webkitRequestFullscreen ?? el?.mozRequestFullScreen ?? el?.msRequestFullscreen;
  if (!fn) {
    return Promise.reject(new Error("Este motor no expone ninguna API de pantalla completa (ni la estándar ni las prefijadas)."));
  }
  try {
    // `.call(el)`: extraer el método y llamarlo sin receptor rompe la API.
    return comoPromesa(fn.call(el));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Sale de pantalla completa con el primer nombre de la API que exista. */
export function salirDePantallaCompleta(doc: DocumentoPantalla | null | undefined): Promise<void> {
  const fn = doc?.exitFullscreen ?? doc?.webkitExitFullscreen ?? doc?.mozCancelFullScreen ?? doc?.msExitFullscreen;
  if (!fn) {
    return Promise.reject(new Error("Este motor no expone ninguna API para salir de pantalla completa."));
  }
  try {
    return comoPromesa(fn.call(doc));
  } catch (e) {
    return Promise.reject(e);
  }
}

/**
 * Alterna según la REALIDAD, no según un estado guardado.
 *
 * Un `boolean` en React puede desincronizarse del navegador (una salida por Esc
 * cambia el navegador sin pasar por el estado). Si el botón decide con el
 * booleano, acaba pidiendo lo contrario de lo que el usuario quiere. Preguntar
 * al navegador cada vez cuesta una lectura de propiedad y no se desincroniza.
 *
 * Devuelve la acción ejecutada y el motivo del fallo, si lo hubo.
 */
export async function alternarPantallaCompleta(
  doc: DocumentoPantalla | null | undefined,
  elemento: ElementoPantalla | null | undefined
): Promise<{ accion: AccionPantalla; ok: boolean; motivo?: string }> {
  const accion = decidirAccion(doc);
  try {
    if (accion === "salir") await salirDePantallaCompleta(doc);
    else await entrarEnPantallaCompleta(elemento);
    return { accion, ok: true };
  } catch (e) {
    return { accion, ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

/* ============================================================
   v2.3.1 · LA VERSIÓN «INTELIGENTE» Y EL MINIMIZADO
   ============================================================
   `App.tsx` llama a estas dos desde el atajo de F11 y desde el botón de la barra.
   No existían: el módulo tenía `alternarPantallaCompleta` y nada más, así que
   `tsc` tiraba TS2552/TS2304 y —por arrastre— TS7006 en el `(r) =>` del `.then`,
   porque sin función no hay tipo que inferir para `r`. Cuatro errores, una causa.

   Se firma EXACTAMENTE como la llama el llamante:
     · `alternarPantallaCompletaInteligente(document, document.documentElement)`
     · `minimizarVentana()`
   y las dos devuelven promesa con `{ ok, ... }`, que es lo que el `.then` lee.

   Qué le añade "inteligente" a la versión de arriba (no es un cambio de nombre):
     1. si la pantalla completa NATIVA es rechazada, reintenta sobre la raíz del
        documento antes de rendirse — un `<div>` con `transform`, `contain` o un
        `<iframe>` sin `allowfullscreen` rechaza la API y la raíz no;
     2. traduce el rechazo a un motivo legible en vez de reponer el texto crudo
        del motor, que es lo que el usuario puede accionar;
     3. NUNCA finge éxito: si ninguna de las dos vías entró, `ok` es `false` y el
        llamante lo cuenta en el registro, como ya hace la casa.
   */

/** Por dónde se logró (o no) el cambio de pantalla. */
export type ViaPantalla = "nativa" | "raiz" | "ninguna";

/** Lo que devuelve el minimizado. `sin-camino` = el navegador no puede, y se dice. */
export type ViaMinimizado = "preload" | "sin-camino";

export interface ResultadoPantallaInteligente {
  accion: AccionPantalla;
  ok: boolean;
  via: ViaPantalla;
  motivo?: string;
}

export interface ResultadoMinimizado {
  ok: boolean;
  via: ViaMinimizado;
  motivo?: string;
}

/** Un `Document` algo más completo: la raíz es un elemento y puede carecer de ella. */
interface DocumentoConRaiz extends DocumentoPantalla {
  documentElement?: ElementoPantalla | null;
}

/** El texto crudo del motor, traducido a algo que el usuario puede hacer. */
function motivoLegible(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/no expone ninguna api/i.test(m)) return "el navegador no expone pantalla completa";
  if (/user (activation|gesture)|not allowed to start/i.test(m)) return "hay que hacer clic para entrar: el navegador exige un gesto del usuario";
  if (/sandboxed/i.test(m) || /allowfullscreen/i.test(m)) return "la ventana está embebida sin permiso de pantalla completa (falta allowfullscreen)";
  return m;
}

/**
 * Alterna pantalla completa probando la raíz si el elemento falla.
 * Ver el bloque de arriba: la firma es la que `App.tsx` ya usa.
 */
export async function alternarPantallaCompletaInteligente(
  doc: DocumentoConRaiz | null | undefined,
  elemento?: ElementoPantalla | null
): Promise<ResultadoPantallaInteligente> {
  const accion = decidirAccion(doc);

  if (accion === "salir") {
    try {
      await salirDePantallaCompleta(doc);
      return { accion, ok: true, via: "nativa" };
    } catch (e) {
      return { accion, ok: false, via: "ninguna", motivo: motivoLegible(e) };
    }
  }

  const raiz = doc?.documentElement ?? null;
  const intentos: Array<{ et: ElementoPantalla | null; via: ViaPantalla }> = [
    { et: elemento ?? null, via: "nativa" },
    // La raíz solo se prueba si es OTRO elemento: reintentar lo mismo dos veces
    // sería el bucle que la casa corta en cualquier otro lado.
    ...(raiz && raiz !== (elemento ?? null) ? [{ et: raiz, via: "raiz" as ViaPantalla }] : []),
  ];

  let ultimoMotivo = "";
  for (const i of intentos) {
    if (!i.et) { ultimoMotivo = "no hay elemento sobre el cual pedir pantalla completa"; continue; }
    try {
      await entrarEnPantallaCompleta(i.et);
      return { accion, ok: true, via: i.via };
    } catch (e) {
      ultimoMotivo = motivoLegible(e);
    }
  }
  return { accion, ok: false, via: "ninguna", motivo: ultimoMotivo };
}

/**
 * Minimizar la ventana. La verdad del navegador: **una pestaña no puede minimizar
 * su ventana** — no existe API para eso y ningún `window.blur()` la simula (lo que
 * hace es quitar el foco, que es otra cosa y además no siempre). Así que:
 *
 *   1. si corremos empaquetados, el `preload` de Electron expone el atajo real y
 *      se usa (`window.cnVentana.minimizar`);
 *   2. si no, se sale de pantalla completa — que es el único "achique" que el
 *      navegador sí puede hacer y el que el usuario estaba pidiendo la mayoría de
 *      las veces — y se devuelve `ok: false` con el motivo a la vista.
 *
 * Devolver `ok: true` sin hacer nada sería exactamente la mentira que esta casa
 * persigue desde `pantallaCompleta.ts`: un botón que "funciona" y no mueve nada.
 */
export async function minimizarVentana(
  ventana?: { cnVentana?: { minimizar?: () => unknown } } & DocumentoConRaiz | null
): Promise<ResultadoMinimizado> {
  const puente = (typeof window !== "undefined" ? (window as any) : null) ?? ventana ?? null;
  const atajo = puente?.cnVentana?.minimizar;
  if (typeof atajo === "function") {
    try {
      await atajo.call(puente.cnVentana);
      return { ok: true, via: "preload" };
    } catch (e) {
      return { ok: false, via: "preload", motivo: motivoLegible(e) };
    }
  }
  try {
    if (elementoEnPantallaCompleta(puente)) await salirDePantallaCompleta(puente);
  } catch {
    /* el achique es un consuelo, no la misión: si falla, el motivo de abajo manda */
  }
  return {
    ok: false,
    via: "sin-camino",
    motivo: "el navegador no puede minimizar su ventana desde la pestaña: minimizá con Win+D o desde la barra de la ventana",
  };
}
