/**
 * focoPreview.ts — v1.87.1 · EL TECLADO LLEGA AL JUEGO DEL SANDBOX
 * ============================================================================
 * 🐞 DEFECTO MADRE (reportado por Mario, 29/10, captura del Pac-Man):
 * «tenemos un proyecto trancado en el sandbox, es de pacman». El preview (:3500)
 * muestra el juego en «PRESIONA ESPACIO PARA EMPEZAR» y la tecla ESPACIO no hace
 * NADA: el juego nunca arranca.
 *
 * CAUSA RAÍZ (no es el juego, es el marco): el preview vive en un <iframe> que
 * es OTRO documento. Para que un `window.addEventListener('keydown', …)` dentro
 * del juego reciba la tecla, el iframe tiene que TENER EL FOCO del teclado.
 * Hasta v1.87.0 el iframe del sandbox:
 *   1. no tenía `tabIndex` → no era enfocable de forma predecible;
 *   2. no se enfocaba al quedar vivo (`onLoad`) → la tecla ESPACIO caía en la
 *      ventana del IDE (:3000), no en el juego;
 *   3. peor: el botón «Recargar» llamaba a `rescatarFocoDeLaVentana()`, que hace
 *      `blur()` del iframe — así que aunque el usuario hubiera hecho clic dentro
 *      del juego, una recarga le robaba el teclado otra vez.
 * Por eso CUALQUIER juego/app de teclado (no solo Pac-Man) se quedaba trancado.
 *
 * LA TENSIÓN QUE HAY QUE RESPETAR: `rescatarFocoDeLaVentana` NO se puede borrar.
 * Arregla un bug real anterior (v1.43.0): al BORRAR/Forzar Limpieza el iframe se
 * destruye y Chromium/Electron deja el foco colgado del frame muerto → el chat
 * se queda «sin clics» hasta minimizar/reabrir. O sea: en el TEARDOWN hay que
 * rescatar el foco a la ventana; pero en una RECARGA o CARGA de un preview VIVO
 * hay que dárselo al iframe para que el juego sea jugable. Son casos opuestos y
 * antes se trataban igual (siempre rescate). Este módulo PURO decide cuál toca.
 *
 * REGLAS DE LA CASA:
 *   · Puro: sin DOM, sin red, sin fs. La parte que toca `.focus()/.blur()` vive
 *     en RightSidebar; aquí sólo la DECISIÓN, para poder probarla sin navegador.
 *   · Nada en silencio: cada decisión lleva un `motivo` legible.
 */

/** Qué le acaba de pasar al preview. */
export type EventoPreview =
  | "carga-viva"    // el iframe terminó de cargar y el puerto responde (onLoad, vivo)
  | "recarga"       // el usuario pidió «Recargar» (remonta el iframe del MISMO preview)
  | "teardown"      // Detener / Forzar Limpieza / destrucción del iframe
  | "click-usuario" // el usuario hizo clic dentro del preview
  | "raton-encima"; // el puntero entró en el área del preview

/** Qué hacer con el foco del teclado. */
export type AccionFoco =
  | "foco-iframe"     // dar el teclado al iframe: el juego recibirá ESPACIO/flechas
  | "rescate-ventana" // devolver el teclado a la ventana del IDE (evita el chat muerto)
  | "nada";           // no tocar el foco

export interface DecisionFoco {
  accion: AccionFoco;
  motivo: string;
}

/**
 * decidirAccionFoco — la pieza que faltaba.
 *
 * @param evento      qué acaba de pasar con el preview.
 * @param previewVivo si el puerto :3500 responde y el iframe tiene contenido.
 *
 * El TEARDOWN manda SIEMPRE rescate (no importa si estaba vivo): es justo cuando
 * el frame muere y hay que salvar el clic del chat. Con el preview VIVO, cargar,
 * recargar, clic o ratón encima → foco al iframe, para que el teclado llegue al
 * juego. Con el preview NO vivo no se enfoca algo que no existe.
 */
export function decidirAccionFoco(evento: EventoPreview, previewVivo: boolean): DecisionFoco {
  if (evento === "teardown") {
    return { accion: "rescate-ventana", motivo: "teardown: el iframe muere; rescato el foco para que el chat siga recibiendo clics" };
  }
  if (!previewVivo) {
    return { accion: "nada", motivo: "preview no vivo: no hay a qué dar el foco" };
  }
  switch (evento) {
    case "carga-viva":
      return { accion: "foco-iframe", motivo: "carga viva: enfoco el iframe para que el juego reciba ESPACIO/flechas sin un clic previo" };
    case "recarga":
      return { accion: "foco-iframe", motivo: "recarga de preview vivo: NO robo el teclado (bug del Pac-Man trancado); se lo devuelvo al juego" };
    case "click-usuario":
      return { accion: "foco-iframe", motivo: "clic del usuario en el preview: confirma intención de jugar; enfoco el iframe" };
    case "raton-encima":
      return { accion: "foco-iframe", motivo: "puntero sobre el preview: adelanto el foco para que la primera tecla ya entre" };
    default:
      return { accion: "nada", motivo: "evento sin política de foco" };
  }
}

// ─── Diagnóstico del lado del JUEGO (pitfall clásico de ESPACIO) ────────────

/**
 * esTeclaInicioJuego — ¿esta tecla debería ARRANCAR el juego (Espacio/Enter)?
 *
 * El bug de código más común en los Pac-Man/Space-Invaders que genera el chat:
 * escriben `if (e.key === 'Space')` — y eso NO casa NUNCA, porque para la barra
 * espaciadora `KeyboardEvent.key` es `' '` (un espacio), mientras que `'Space'`
 * es el valor de `KeyboardEvent.code`. Resultado: el juego jamás detecta el
 * ESPACIO y se queda en la pantalla de inicio — exactamente el síntoma de la
 * captura. Esta función reconoce la tecla por AMBAS vías (key Y code), que es
 * como debe comprobarse. Sirve de referencia para auditar/corregir el game.js.
 *
 * @param key   `KeyboardEvent.key`  (para Espacio es `' '`, para Enter `'Enter'`).
 * @param code  `KeyboardEvent.code` (para Espacio es `'Space'`), opcional.
 */
export function esTeclaInicioJuego(key: string, code = ""): boolean {
  const k = String(key || "");
  const c = String(code || "");
  const esEspacio = k === " " || k === "Spacebar" /* IE/legacy */ || c === "Space";
  const esEnter = k === "Enter" || c === "Enter" || c === "NumpadEnter";
  return esEspacio || esEnter;
}
