/**
 * server/middleware/plazoApi.ts — NINGUNA RUTA /api SE QUEDA MUDA, PERO NINGUNA
 * RUTA LEGÍTIMAMENTE LENTA ES ASESINADA POR EL RELOJ (v2.1.5 · corregido v2.2.5)
 * =============================================================================
 * PARA QUÉ NACIÓ (v2.1.5)
 * -----------------------
 * Un manejador `async` que rechaza NO produce respuesta: no hay 500, no hay
 * cierre. El socket queda abierto y el navegador esperando. Es el mecanismo del
 * «CerebroNico arrancando motor · consultando el estado del motor…» que no abría
 * (captura del 02/11, 23:31): la ruta contestaba nunca, y nunca no es un rojo.
 *
 * LA REGLA DE ESTA VERSIÓN (v2.2.5)
 * --------------------------------
 * El reloj sigue en el camino común (una ruta olvidada no puede colgar el
 * navegador), pero **sabe qué rutas son lentas por naturaleza** y les da su
 * propio plazo. Y en cuanto la respuesta empieza a salir, el reloj se levanta:
 * un stream de tokens con pausas no es una ruta colgada.
 *
 * ── v1.0.24 · EL RELOJ HERIDO: MATABA LA RUTA Y LA RUTA SEGUÍA ESCRIBIENDO ───
 *
 * 🐞 El log de arranque real de Mario (16/11, v1.0.23) escupió CUATRO veces la
 * misma forma, y no era una: era la firma del diseño.
 *
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/subagents (plazo común de /api)
 *   [estabilidad] Promesa rechazada sin recoger — el motor SIGUE:
 *     Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent
 *       at … server.ts:6704:14        ← el `res.json()` del fallback de /api/subagents
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/telemetry/ports
 *       at … server/routers/telemetria.ts:215:9
 *   [estabilidad] /api sin respuesta en 45000 ms: GET /api/telemetry/ports (otra vez)
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/system/stats
 *       at … server/routers/telemetria.ts:294:30
 *
 * Lo que pasaba, en orden:
 *   1. El `res.setTimeout` vence. `headersSent` todavía es `false`.
 *   2. Este middleware contesta 504 y **se lava las manos**.
 *   3. Pero `res.setTimeout` NO cancela el trabajo del handler: la ruta sigue su
 *      camino —sondeando Ollama, esperando al puente, consultando el sandbox— y
 *      cuando termina llama a `res.json(...)` sobre un socket que ya declaró
 *      cerrado. Express lanza `ERR_HTTP_HEADERS_SENT`.
 *   4. La ruta es `async` y su promesa ya se había cortado del reloj: nadie la
 *      espera. El rechazo aparece como `unhandledRejection` — «el motor SIGUE»,
 *      pero el cliente ya recibió un 504 que no le corresponde y la respuesta
 *      buena se tira a la basura.
 *
 * Encadenado: /api/subagents y /api/telemetry/ports son exactamente los dos
 * sondeos que la cabecera y el panel de puertos piden cada 10 s. Con ellos en
 * 504, la pantalla declara «servidor local caído» mientras el :3000 está vivo.
 *
 * LAS TRES CURAS (todas acá, en el dueño del reloj):
 *
 *   a) **El reloj deja de ser anónimo.** Antes de contestar 504, se cuenta cuántas
 *      rutas están colgadas y cuáles. Si hay 3 o más —es el patrón de «todo el
 *      proceso está ocupado», no el de «una ruta lenta»— el middleware **no**
 *      contesta y se convierte en un aviso con nombre y número. Un 504 masivo es
 *      peor que una espera: afirma cosas falsas sobre todas las rutas a la vez.
 *   b) **La ruta que llega tarde no puede volver a escribir.** El 504 se manda a
 *      través de una ficha (`src/engine/fichaUnica.ts`) y el socket queda
 *      marcado: `puedeContestar(res)` es `false` para quien venga después. Eso
 *      convierte un `ERR_HTTP_HEADERS_SENT` en un no-op honesto que se anota.
 *   c) **El porqué queda escrito.** El aviso dice el plazo, la ruta y cuántas
 *      hermanas están colgadas; el descarte posterior lo repite con la palabra
 *      «ficha». Si esto vuelve a pasar, el log dice qué subir y por qué.
 */
import type { NextFunction, Request, Response } from "express";
import { puedeContestar } from "../../src/engine/fichaUnica";

/** Plazo común para todo `/api` que no esté en la lista de abajo. */
export const PLAZO_API_POR_DEFECTO_MS = Number(process.env.CN_PLAZO_API_MS || 20000);

export interface ExcepcionPlazo {
  /** Empieza a comparar desde el principio de la URL (sin query string). */
  prefijo: string;
  ms: number;
  /** Por qué esta ruta tiene permiso de tardar. Sin esto, la tabla se vuelve excusa. */
  porque: string;
}

/**
 * Las rutas que tardan más de 20 s **porque así funciona lo que hacen**. Cada una
 * con su evidencia; ninguna entró acá por «me dio error».
 */
export const RUTAS_LENTAS_POR_DISENO: ExcepcionPlazo[] = [
  { prefijo: "/api/ai/stream", ms: 300000, porque: "modelo local frío: Ollama lo carga desde disco y este proyecto midió 28 s; un chat largo con herramientas tarda minutos" },
  { prefijo: "/api/health/deep", ms: 60000, porque: "corre los cinco chequeos, incluido el sondeo de Ollama: cortarlo deja el splash en «consultando el estado del motor…»" },
  { prefijo: "/api/ollama/warmup", ms: 300000, porque: "precargar un modelo ES la carga desde disco, por definición lenta" },
  { prefijo: "/api/cerebro/embedder", ms: 90000, porque: "el estado pregunta al motor de embeddings que quedo residente: con el modelo frio eso es una carga desde disco, y cortarlo es lo que pinta «sin embedder»" },
  { prefijo: "/api/cerebro/embedder/calentar", ms: 300000, porque: "vectoriza el corpus: minutos en máquina chica" },
  { prefijo: "/api/brain/", ms: 180000, porque: "planifica con el proveedor; una tanda de planes no es una ruta colgada" },
  { prefijo: "/api/tts/", ms: 120000, porque: "síntesis de voz: el audio se pide entero" },
  { prefijo: "/api/sandbox/start", ms: 90000, porque: "levanta un proceso Node hijo y espera su salud" },
  { prefijo: "/api/bridge/", ms: 90000, porque: "reinicia el puente Python :5000, que tarda lo que tarda FastAPI" },
  { prefijo: "/api/arranque/interruptor", ms: 90000, porque: "enciende un pack por pedido del usuario y espera el health" },
  // v2.3.4 · con 40+ modelos en el almacén y NEMESIS:latest pesando 62,4 GB,
  // GET /api/tags tarda 21-37 s. La sonda tiene 35 s de plazo individual, pero
  // el presupuesto total (40 s) y el middleware (20 s) cortaban antes. El
  // presupuesto ya se subió a 40 s en telemetria.ts; esta excepción evita que
  // el middleware mande 504 antes de que la sonda de Ollama termine.
  { prefijo: "/api/telemetry/ports", ms: 45000, porque: "sondea Ollama /api/tags que con 40+ modelos tarda 21-37 s; cortarlo pinta 11434 OFF cuando está vivo" },
  // v1.0.24 · LAS TRES QUE EL LOG DEL 16/11 CORTÓ Y SÍ TIENEN PERMISO.
  // Medido en su arranque: el puente :5000 se reanimaba en bucle (3 intentos de 3)
  // mientras estas rutas lo esperaban dentro de su sondeo. No es una ruta colgada:
  // es un sondeo de 12 s esperando a un hijo que está naciendo.
  { prefijo: "/api/subagents", ms: 45000, porque: "pregunta al puente :5000 con 12 s de plazo interno; con el puente reanimándose, 20 s no alcanzan y el corte producía ERR_HTTP_HEADERS_SENT en el fallback" },
  { prefijo: "/api/sandbox/status", ms: 45000, porque: "mide el :3500 con las conexiones del proceso ocupadas; cortarlo declaraba caído un sandbox que estaba naciendo" },
  { prefijo: "/api/system/stats", ms: 45000, porque: "incluye el /api/ps de Ollama, que con 19 modelos cargados tarda más que el plazo común" },
];

/**
 * Decide el plazo de una URL. Puro y expuesto: es la única forma de probar la
 * aritmética que rompió el chat sin tener que levantar un servidor.
 */
export function plazoDeRuta(
  url: string,
  defectoMs: number = PLAZO_API_POR_DEFECTO_MS,
): { ms: number; porque: string; excepcion: boolean } {
  const ruta = String(url || "").split("?")[0];
  let mejor: ExcepcionPlazo | null = null;
  for (const e of RUTAS_LENTAS_POR_DISENO) {
    if (!ruta.startsWith(e.prefijo)) continue;
    // La coincidencia MÁS específica gana: `/api/ai/stream` sobre `/api/ai/`.
    if (!mejor || e.prefijo.length > mejor.prefijo.length) mejor = e;
  }
  if (mejor) return { ms: Math.max(mejor.ms, defectoMs), porque: mejor.porque, excepcion: true };
  return { ms: defectoMs, porque: "plazo común de /api", excepcion: false };
}

/**
 * v1.0.24 · CUÁNDO UN CORTE ES UNA CAÍDA Y CUÁNDO ES UN AHOGO.
 *
 * Con `enVuelo >= 3` el proceso no tiene una ruta lenta: tiene la garganta
 * tomada. En ese caso contestar 504 a las tres es exactamente lo que pinta
 * «servidor local caído» — se le informa al cliente que TODO está roto cuando
 * lo que hay es una espera. La regla por defecto es 3 y se puede mover con
 * `CN_CORTES_SIMULTANEOS` para máquinas chicas.
 *
 * Puro y exportado: la suite fija el número, no la prosa.
 */
export const CORTES_SIMULTANEOS = Math.max(2, Math.floor(Number(process.env.CN_CORTES_SIMULTANEOS || 3)));

export function decidirCorte(enVuelo: number): "contestar-504" | "solo-anotar" {
  return enVuelo >= CORTES_SIMULTANEOS ? "solo-anotar" : "contestar-504";
}

export function plazoApi() {
  const defectoMs = PLAZO_API_POR_DEFECTO_MS;
  /** Rutas que vencieron su reloj y todavía no soltaron el socket. */
  const colgadas = new Set<string>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ruta = req.originalUrl || req.url || "";
    const { ms, porque } = plazoDeRuta(ruta, defectoMs);
    let vencido = false;
    res.setTimeout(ms, () => {
      vencido = true;
      // Si ya estábamos mandando (un stream de tokens, un SSE), esto NO es una
      // ruta colgada: un stream con pausas sigue vivo. Se levanta el reloj.
      if (!puedeContestar(res)) return;
      // La clave se calcula AFUERA del `try` de la respuesta, no dentro: si la
      // primera línea del manejador del reloj estalla, ese socket queda sin
      // liberar y el contador de colgadas se queda alto para siempre.
      const clave = `${req.method} ${ruta.split("?")[0]}`;
      colgadas.add(clave);
      const cuantas = colgadas.size;
      const veredicto = decidirCorte(cuantas);
      console.error(
        `[estabilidad] /api sin respuesta en ${ms} ms: ${req.method} ${ruta} (${porque}) · ` +
        `colgadas ahora: ${cuantas}/${CORTES_SIMULTANEOS}` +
        (veredicto === "contestar-504"
          ? ""
          : " → NO se contesta 504: hay varias rutas esperando a la vez, el proceso está ocupado, no caído"),
      );
      if (veredicto === "solo-anotar") {
        // Se deja el socket vivo: la ruta contestará tarde, y contesta con razón.
        // Un 504 a medias es peor que una espera: afirma que NADA responde.
        return;
      }
      try {
        res.status(504).json({
          ok: false,
          motivo: `la ruta no respondió en ${Math.round(ms / 1000)} s`,
          ruta: req.originalUrl,
          plazoMs: ms,
          ocupadas: cuantas,
        });
      } catch {
        /* el socket ya se cayó solo */
      }
    });
    // Contestó (bien o mal): el reloj ya no tiene nada que vigilar. Sin esto, un
    // `res.setTimeout` queda montado sobre el socket keep-alive y le puede cortar
    // la SIGUIENTE respuesta al mismo navegador.
    const soltar = () => {
      try { res.setTimeout(0); } catch { /* socket muerto */ }
      colgadas.delete(`${req.method} ${ruta.split("?")[0]}`);
      if (vencido && puedeContestar(res)) {
        // El caso que producía ERR_HTTP_HEADERS_SENT: no se cortó (se dejó vivir
        // por ahogo) y ahora sí contesta. Es la conducta correcta.
        console.warn(`[estabilidad] «${ruta}» contestó TARDE, después de vencer su reloj: se respetó la respuesta.`);
      }
    };
    // v2.2.7 · DEFENSIVO: `res.once` existe en http.ServerResponse, pero el
    // middleware se prueba con objetos de respuesta livianos y estrellarse acá
    // dejaría MUDA cada ruta /api. Un middleware no tiene derecho a ese poder.
    if (typeof res.once === "function") {
      res.once("finish", soltar);
      res.once("close", soltar);
    }
    next();
  };
}
