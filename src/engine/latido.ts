/**
 * latido.ts — EL LATIDO: la salud del servidor local, MEDIDA
 * ===========================================================
 * POR QUÉ EXISTE ESTE MÓDULO (v1.86.4)
 * ------------------------------------
 * El 28/10/2026 la pantalla dijo tres cosas a la vez, y dos eran falsas:
 *
 *   · la cabecera: «motor listo»          ← literal fijo, solo dependía de isStreaming
 *   · el panel de puertos: «3000 ACTIVO»  ← literal fijo, nadie lo preguntaba nunca
 *   · la espina: «el motor no contesta»   ← el único sondeo honesto de la pantalla
 *
 * Los cuatro puertos verdes venían de `/api/telemetry/ports`, que CONTESTA EL
 * MISMO SERVIDOR DEL 3000. Cuando el 3000 deja de responder, React se queda con
 * la última muestra y pinta verdes congelados: la pantalla parece sana y no lo
 * está. Y el aviso que sí decía la verdad usaba la palabra «motor», que en esta
 * casa significa el modelo. Resultado: «NO FUNCIONA NINGÚN MODELO» cuando ningún
 * modelo había fallado todavía — el chat sale por `POST /api/ai/stream`
 * (src/utils/engine.ts:706), que es el proceso del 3000. Si el 3000 no contesta,
 * NINGÚN proveedor puede contestar, sea Gemini, OpenRouter u Ollama.
 *
 * LA REGLA QUE AQUÍ SE APLICA
 * ---------------------------
 * «Se declara, no se disfraza»: una interfaz no puede afirmar salud que no midió.
 * Por eso el estado arranca en `null` (= «sin medir») y solo dice «listo» después
 * de un 200 comprobado. Un módulo puro, con el texto dentro, para que el candado
 * esté en tests/coreo.test.ts y ningún literal suelto pueda volver a mentir.
 */

import { PORTS } from "../constants";

/** La ruta que hace de fonendo: la contesta el proceso del IDE, sin nube. */
export const RUTA_LATIDO = "/api/coreo";

/** El puerto del propio servidor del IDE — leído de `PORTS`, no copiado a mano. */
export const PUERTO_IDE: number = PORTS.IDE;

/** Cada cuánto se escucha. Es el 700 ms de siempre; ahora tiene nombre. */
export const INTERVALO_LATIDO_MS = 700;

/**
 * Cada cuántos intervalos caduca una lectura sin contestar (700 × 4 = 2,8 s).
 * Es la pieza que evita el ahogo: sin caducidad, un servidor colgado deja los
 * `fetch` abiertos y Chrome corta a 6 conexiones por origen, que es exactamente
 * como el sondeo de salud tumba el chat que intentaba vigilar.
 */
export const CADUCIA_LATIDO = 4;

/** El plazo de cortesía del fonendo, en ms. */
export const PLAZO_LATIDO_MS = INTERVALO_LATIDO_MS * CADUCIA_LATIDO;

export type LecturaLatido =
  | { vivo: true }
  | { vivo: false; motivo: string };

/**
 * Convierte lo que sea que tiró el `fetch` en una frase que sirva.
 *
 * «Failed to fetch» (Chrome) / «NetworkError» (Firefox) no son errores de
 * proveedor: son el navegador diciendo que NO LLEGÓ a la dirección. Se dice así,
 * con el nombre del fallo detrás, porque la distinción es la que evita perder
 * una tarde buscando una clave de API que estaba bien.
 */
export function clasificarFalloLatido(err: any): string {
  const status = Number(err?.status ?? err?.response?.status);
  if (Number.isFinite(status) && status > 0) return `HTTP ${status}`;
  // Un Error sin mensaje NO es un objeto inofensivo: `String(err)` daría «Error»
  // y el chip diría «Error» sin informar nada. Se distingue el caso a propósito.
  const esObjeto = err !== null && typeof err === "object";
  const nombre = String(esObjeto ? err?.name ?? "" : "").trim();
  const mensaje = String(esObjeto ? err?.message ?? "" : err ?? "").trim().slice(0, 90);
  if (!mensaje) return "sin respuesta";
  return nombre && !mensaje.startsWith(nombre) ? `${nombre}: ${mensaje}` : mensaje;
}

export interface EstadoLatido {
  vivo: boolean;
  /** Lo que pinta la espina. Dice QUÉ caiu, no «el motor». */
  chip: string;
  /** La consecuencia, para que nadie salga buscando la clave del proveedor. */
  consecuencia: string;
}

/**
 * Texto del latido a partir de la lectura. Puro: misma entrada, misma salida.
 */
export function estadoLatido(lect: LecturaLatido): EstadoLatido {
  if (lect.vivo) {
    return { vivo: true, chip: "", consecuencia: "" };
  }
  return {
    vivo: false,
    chip: `⛔ no contesta el SERVIDOR LOCAL (:${PUERTO_IDE} ${RUTA_LATIDO}) · ${lect.motivo}`,
    consecuencia: `no es un fallo del modelo: el chat sale por POST /api/ai/stream contra :${PUERTO_IDE}. Sin servidor local no puede responder NINGÚN proveedor (Gemini, OpenRouter, Ollama). Reintento cada ${INTERVALO_LATIDO_MS} ms.`,
  };
}

/**
 * Lo que dice la cabecera. `null` = todavía no se midió: se dice, no se supone.
 * El «motor listo» de antes se escribía sin preguntar nada.
 */
export function textoCabecera(vivo: boolean | null, streaming: boolean): string {
  if (streaming) return "🧠 pensando...";
  if (vivo === null) return "comprobando el servidor…";
  return vivo ? "motor listo" : "⚠ servidor local caído";
}

/** Etiqueta del puerto del IDE en el panel de telemetría. */
export function etiquetaPuertoLocal(vivo: boolean | null): string {
  if (vivo === null) return "SIN MEDIR";
  return vivo ? "ACTIVO" : "SIN RESPUESTA";
}

/**
 * Fallo de red del NAVEGADOR: la petición no llegó a su destino. Es distinto de
 * «el proveedor respondió mal», y la diferencia vale una tarde de trabajo.
 *
 * Ojo con «fetch failed»: ese es el texto de Node (undici) cuando el SERVIDOR
 * salió a la nube y no volvió. Aquí no entra, a propósito.
 */
export const PATRON_FALLO_DE_RED =
  /failed to fetch|networkerror|load failed|err_connection|err_empty_response|err_socket|econnrefused|econnreset|socket hang up/i;

/**
 * El consejo que faltaba el 28/10/2026. Con `Error de comunicación con
 * gemini-3.5-flash: Failed to fetch`, la pantalla mandaba a revisar la clave de
 * Google. La clave estaba bien: el navegador no había llegado al proceso del IDE.
 */
export function consejoFalloDeRed(): string {
  return (
    `no es la clave del modelo: «Failed to fetch» lo firma el navegador cuando no llega a ` +
    `POST /api/ai/stream, y eso lo contesta el proceso local del IDE (:${PUERTO_IDE}). Con el ` +
    `servidor caído no responde NINGÚN proveedor, ni Gemini ni OpenRouter ni Ollama. ` +
    `Comprobación de diez segundos: abre http://localhost:${PUERTO_IDE}${RUTA_LATIDO} en una ` +
    `pestaña nueva. Si sale JSON, el servidor vive y la ventana vieja quedó huérfana tras un ` +
    `reinicio → recarga con Ctrl+Shift+R. Si el navegador no logra conectar, el proceso se cayó ` +
    `→ arráncalo otra vez (npm run dev, o npm start con el build hecho). Y si en el navegador no ` +
    `conecta pero en la consola «curl.exe -s http://localhost:${PUERTO_IDE}${RUTA_LATIDO}» sí ` +
    `contesta, el que estorba es el proxy o el antivirus de Windows: añade localhost a sus ` +
    `excepciones (curl no usa el proxy del sistema, el navegador sí).`
  );
}

// ═══ El bus: el último latido conocido, para quien llegue tarde ══════════════
//
// La espina mide cada 700 ms; la pestaña de puertos se monta cuando el usuario la
// abre, y el Header cuando arranca la app. Si cada órgano dependiera solo del
// evento en vivo, el panel recién abierto diría «SIN MEDIR» teniendo la medida
// hecha. Se guarda el último latido leído y se ofrece a quien pregunte.
// Sin React aquí: este módulo lo consumen los tests en node.

export interface Latido {
  /** `null` = aún no se leyó nada. No es «caído»: es «no lo sé». */
  vivo: boolean | null;
  chip: string;
  ts: number;
}

let ultimoLatido: Latido = { vivo: null, chip: "", ts: 0 };

export function registrarLatido(vivo: boolean | null, chip = ""): Latido {
  ultimoLatido = { vivo, chip, ts: Date.now() };
  return ultimoLatido;
}

export function latidoConocido(): Latido {
  return ultimoLatido;
}

/** Se suscribe al bus. Devuelve la función de limpieza (nil en node, sin window). */
export function suscribirLatido(fn: (l: Latido) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const alEvento = (e: Event) => {
    const d = (e as CustomEvent<Partial<Latido> | null>).detail;
    if (!d) return;
    if (d.vivo !== true && d.vivo !== false && d.vivo !== null) return;
    fn({ vivo: d.vivo, chip: typeof d.chip === "string" ? d.chip : "", ts: typeof d.ts === "number" ? d.ts : Date.now() });
  };
  window.addEventListener("cn:latido", alEvento as EventListener);
  return () => window.removeEventListener("cn:latido", alEvento as EventListener);
}

