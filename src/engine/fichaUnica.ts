/**
 * fichaUnica.ts — UNA SOLA RESPUESTA POR PETICIÓN, AUNQUE EL PLAZO LLEGUE PRIMERO
 * ===============================================================================
 * 🐞 LO QUE ESCUPIÓ EL LOG DE MARIO (v1.0.23, arranque real del 16/11):
 *
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/subagents (plazo común de /api)
 *   [estabilidad] Promesa rechazada sin recoger — el motor SIGUE:
 *     Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent
 *       at … server.ts:6704:14            ← el res.json() del FALLBACK de /api/subagents
 *   …
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/telemetry/ports
 *       at … server/routers/telemetria.ts:215:9       ← el segundo armarMuestra()
 *   …
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/sandbox/status
 *       at … server.ts:8219                             ← el res.json() del estado del sandbox
 *   …
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/system/stats
 *       at … server/routers/telemetria.ts:294           ← el res.json() de los recursos
 *
 * Las CUATRO líneas comparten una sola forma: el middleware `plazoApi` contesta
 * 504 a los 20 s, la ruta termina su trabajo a los 21 s y vuelve a llamar
 * `res.json(...)`. Express no se queja: ya mandó el encabezado, así que el
 * segundo `json()` estalla con `ERR_HTTP_HEADERS_SENT`. La excepción ocurre
 * DENTRO de una promesa que nadie espera (el handler ya había sido cortado por
 * el reloj), así que emerge como `unhandledRejection`.
 *
 * POR QUÉ ESO ES PEOR QUE UN ERROR DE LOG
 * ----------------------------------------
 * `server.ts` captura `unhandledRejection` y sigue (el motor no se suicida, y
 * hace bien: no queremos que un log tumbe la sesión). Pero una vez que el
 * proceso consume el rechazo, Node no mata nada… y el daño real es otro: **el
 * navegador ya recibió un 504 sobre un socket que el servidor sigue usando**. La
 * respuesta buena, cuando llega, se descarta; y mientras tanto el socket
 * keep-alive transporta una respuesta que ya no le corresponde a nadie. Con
 * cuatro rutas de estado fallando así en cadena (subagentes → telemetría →
 * sandbox → recursos), el cliente acumula 504 encadenados, la cola de sondeos
 * se llena, y la pantalla declara «servidor local caído» con el proceso vivo.
 *
 * LA REGLA
 * --------
 * Ninguna ruta vuelve a escribir sobre una respuesta que ya se escribió. No se
 * arregla con un `try/catch` suelto por ruta (serían cuatro parches y una quinta
 * ruta que se olvide): se arregla con una ficha que se pide una vez y se devuelve
 * UNA vez. Es puro —entra un objeto `{ headersSent }`— así que se puede probar
 * sin levantar Express.
 */

/** Lo mínimo que necesita una respuesta de Express para saber si ya se escribió. */
export interface RespuestaViva {
  headersSent?: boolean;
}

/**
 * true si la respuesta TODAVÍA admite un cuerpo. `headersSent` es la verdad del
 * socket; `writableEnded` (no siempre presente) adelanta el caso de haber
 * cerrado sin encabezado. Cualquier cosa que no sea un `false` explícito cuenta
 * como «no disponible»: ante la duda, callarse.
 */
export function puedeContestar(res: RespuestaViva | null | undefined): boolean {
  if (!res) return false;
  if (res.headersSent === true) return false;
  const w = (res as { writableEnded?: boolean }).writableEnded;
  return w !== true;
}

/**
 * Cierra la petición SIN tocar el socket si la ruta llegó tarde: el motivo se
 * deja en el log para que la próxima vez se lea en vez de suponerse.
 *
 * Devuelve `true` si hubo que descartar la respuesta (o sea: el reloj llegó
 * primero). Quien llama puede usarlo para no seguir calculando.
 */
export function descartarSiTarde(
  res: RespuestaViva | null | undefined,
  ruta: string,
  aviso: (linea: string) => void = (l) => console.warn(l),
): boolean {
  if (puedeContestar(res)) return false;
  aviso(
    `[ficha] «${ruta}» terminó DESPUÉS de que el plazo contestara: la respuesta se ` +
    `descarta en vez de estallar con ERR_HTTP_HEADERS_SENT. Si esto se repite, ` +
    `subir el plazo de esa ruta (server/middleware/plazoApi.ts) o acortar su sondeo.`,
  );
  return true;
}

/**
 * La ficha: envuelve el `json` de una respuesta y garantiza UN solo uso.
 *
 *   const ficha = abrirFicha(res, "/api/subagents");
 *   … await algoLento() …
 *   ficha.json({ ok: true });        // primera y única escritura
 *   ficha.json({ ok: true });        // no hace nada, y lo dice en el log
 *
 * No reemplaza a `descartarSiTarde`: son el mismo criterio con dos formas de uso
 * (una por respuesta compartida, otra por ruta suelta).
 */
export function abrirFicha(
  res: RespuestaViva & { json: (cuerpo: any) => any },
  ruta: string,
  aviso: (linea: string) => void = (l) => console.warn(l),
): { json: (cuerpo: any) => boolean; usada: () => boolean } {
  let usada = false;
  return {
    usada: () => usada,
    json: (cuerpo: any) => {
      if (usada) {
        aviso(`[ficha] «${ruta}» quiso contestar DOS veces: la segunda se ignora.`);
        return false;
      }
      usada = true;
      if (descartarSiTarde(res, ruta, aviso)) return false;
      try {
        res.json(cuerpo);
        return true;
      } catch (e: any) {
        aviso(`[ficha] «${ruta}» no pudo contestar: ${e?.message || e}`);
        return false;
      }
    },
  };
}
