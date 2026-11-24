/**
 * sondaUnica.ts — UN SOLO JUEGO DE SONDAS EN VUELO (v1.0.35)
 * ========================================================
 * QUÉ ES: el guardián de una medición cara (la de los puertos, que incluye un
 * `/api/tags` de Ollama con 35 s de plazo) para que N peticiones simultáneas
 * produzcan UN solo juego de sondas, no N.
 *
 * EL DEFECTO QUE VIENE A CURAR (log de Mario, 20/11)
 * --------------------------------------------------
 * `[estabilidad] /api sin respuesta en 45000 ms: GET /api/telemetry/ports`
 * con «colgadas ahora: 1/3» y la CPU al 100 %.
 *
 * La ruta no tenía vuelo único: cada petición que encontraba la caché vencida
 * arrancaba SU PROPIO juego de seis sondas. El panel pide cada 10 s y una
 * muestra puede tardar hasta 30 s (PRESUPUESTO_TELEMETRIA_MS) porque Ollama, a
 * 100 % de CPU, tarda en contestar `/api/tags`. Resultado: a los 30 s había
 * TRES juegos de sondas apilados, cada uno abriendo sockets contra un Ollama
 * ya saturado — el sondeo que venía a informar era la causa del atasco que
 * informaba. Y como todos tardaban más que el plazo del `/api`, el vigilante
 * de estabilidad anotaba «sin respuesta» y la cabecera pintaba «servidor local
 * caído» con el servidor contestando.
 *
 * LA REGLA, EN TRES LÍNEAS
 * ------------------------
 * 1. Si hay muestra vigente, se sirve y no se mide nada.
 * 2. Si NO hay medición en vuelo, el que llega la arranca y espera el
 *    presupuesto completo (es el único que puede refrescar de verdad).
 * 3. Si YA hay una en vuelo, el que llega NO abre otra: espera un rato corto
 *    (`esperaMaximaMs`) y, si no llegó, contesta con la última lectura conocida
 *    marcada como heredada. Nunca se queda colgado, nunca duplica el sondeo.
 *
 * POR QUÉ EL TIEMPO Y LA ESPERA SE INYECTAN
 * ------------------------------------------
 * Igual que en `server/estado/telemetria.ts`: para poder probar la carrera sin
 * dormir. Una prueba que duerme 30 s es una prueba que se quita en la primera
 * tanda que va lenta.
 */

export type OrigenMuestra = "cache" | "nueva" | "compartida" | "heredada" | "vacia";

export interface ResultadoSonda<T> {
  /** La muestra a servir. `null` solo si no hay nada, ni nuevo ni viejo. */
  muestra: T | null;
  /** De dónde salió: se dice, no se disimula. */
  origen: OrigenMuestra;
  /** Cuánto esperó este cliente (ms). */
  esperoMs: number;
  /** true si al contestar quedó una medición corriendo (la próxima la hereda). */
  enVuelo: boolean;
}

export interface OpcionesSondaUnica<T> {
  /** Cómo se toma una muestra nueva. Es lo caro: se llama de a una. */
  medir: () => Promise<T>;
  /** La muestra vigente, si la hay (caché con su TTL). */
  cache?: () => T | null;
  /** La última muestra conocida, aunque esté vencida: es lo que se hereda. */
  conocida?: () => T | null;
  /** Cuánto espera un cliente que NO es el dueño de la medición. */
  esperaMaximaMs?: number;
  /**
   * v1.0.38 · Cuánto espera el DUEÑO antes de heredar. Sin este techo el dueño
   * esperaba la medición entera y una sola petición acaparaba una conexión del
   * navegador durante 35 s (ver la nota de `TECHO_DUENIO_MS`).
   */
  techoDuenioMs?: number;
  /** Reloj inyectable (para las pruebas). */
  ahora?: () => number;
}

export interface SondaUnica<T> {
  /** Pide una muestra. Nunca lanza: un fallo de `medir` se devuelve como heredada/vacía. */
  pedir: () => Promise<ResultadoSonda<T>>;
  /** ¿Hay una medición en vuelo ahora mismo? */
  enVuelo: () => boolean;
  /** Cuántas veces se llamó a `medir` de verdad (para las pruebas y el log). */
  mediciones: () => number;
}

/**
 * v1.0.38 · EL DUEÑO TAMBIÉN TIENE TECHO.
 *
 * Medido en el arranque de Mario (20/11, v1.0.37): «/api sin respuesta en
 * 45000 ms: GET /api/telemetry/ports». El primero que llegaba era el dueño y
 * esperaba la medición ENTERA (Ollama con 19 modelos tarda 35 s). Esa única
 * petición ocupaba una de las seis conexiones que el navegador abre por
 * origen, y el panel pide cada 10 s: a los pocos segundos las seis estaban
 * tomadas por sondeos, y detrás de ellas quedaban el latido (2,8 s) y el
 * catálogo de modelos. De ahí el cartel «servidor local caído» con :3000
 * arriba, los puertos en OFF teniendo dueño, y los modelos que «no cargan».
 *
 * Regla nueva: nadie espera más de esta ventana. Si la medición no llegó, se
 * contesta con la última lectura y la medición sigue en segundo plano. Tiene
 * que ser MENOR que el plazo del latido, o el remedio repite la enfermedad.
 */

/** Lo que un cliente de los que llegan tarde espera antes de heredar. */
export const ESPERA_COMPARTIDA_MS = Number(process.env.CN_ESPERA_COMPARTIDA_MS || 2000);

/** Techo del que abrió la medición: si no llegó, hereda y la medición sigue. */
export const TECHO_DUENIO_MS = Number(process.env.CN_TECHO_DUENIO_MS || 2000);

export function crearSondaUnica<T>(o: OpcionesSondaUnica<T>): SondaUnica<T> {
  const esperaMaximaMs = Math.max(0, o.esperaMaximaMs ?? ESPERA_COMPARTIDA_MS);
  const techoDuenioMs = Math.max(0, o.techoDuenioMs ?? TECHO_DUENIO_MS);
  const ahora = o.ahora || (() => Date.now());
  let enCurso: Promise<T | null> | null = null;
  let mediciones = 0;

  const arrancar = (): Promise<T | null> => {
    mediciones++;
    const p = (async () => {
      try {
        return await o.medir();
      } catch {
        // Un sondeo que estalla no puede dejar la puerta cerrada para siempre:
        // la siguiente petición vuelve a intentar. Se devuelve null y se hereda.
        return null;
      }
    })().finally(() => {
      if (enCurso === p) enCurso = null;
    });
    enCurso = p;
    return p;
  };

  /** Espera `p` como mucho `ms`. Devuelve `undefined` si no llegó (sin lanzar). */
  const esperar = (p: Promise<T | null>, ms: number): Promise<T | null | undefined> =>
    new Promise((resuelve) => {
      let cerrado = false;
      const reloj = setTimeout(() => {
        if (cerrado) return;
        cerrado = true;
        resuelve(undefined);
      }, ms);
      // Sin `unref`: el reloj tiene que poder dispararse aunque el proceso esté
      // ocupado; el `finally` lo limpia y no queda nada colgado.
      p.then(
        (v) => { if (!cerrado) { cerrado = true; clearTimeout(reloj); resuelve(v); } },
        () => { if (!cerrado) { cerrado = true; clearTimeout(reloj); resuelve(null); } },
      );
    });

  const pedir = async (): Promise<ResultadoSonda<T>> => {
    const t0 = ahora();
    const enCache = o.cache ? o.cache() : null;
    if (enCache) return { muestra: enCache, origen: "cache", esperoMs: 0, enVuelo: enCurso !== null };

    const propia = enCurso === null;
    const p = enCurso || arrancar();
    // El dueño espera todo lo que tarde su medición (él es el presupuesto);
    // los que llegan después esperan poco y, si no llegó, heredan.
    // v1.0.38 · el dueño ya no espera la medición entera (35 s): espera su
    // techo y, si no llegó, hereda. La medición NO se cancela: sigue y deja la
    // muestra lista para el siguiente pedido.
    const llego = await esperar(p, propia ? techoDuenioMs : esperaMaximaMs);
    if (llego !== undefined && llego !== null) {
      return { muestra: llego, origen: propia ? "nueva" : "compartida", esperoMs: Math.max(0, ahora() - t0), enVuelo: enCurso !== null };
    }
    const vieja = o.conocida ? o.conocida() : null;
    return {
      muestra: vieja,
      origen: vieja ? "heredada" : "vacia",
      esperoMs: Math.max(0, ahora() - t0),
      enVuelo: enCurso !== null,
    };
  };

  return { pedir, enVuelo: () => enCurso !== null, mediciones: () => mediciones };
}
