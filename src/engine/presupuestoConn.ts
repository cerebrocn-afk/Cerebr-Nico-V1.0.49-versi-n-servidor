/**
 * presupuestoConn.ts — EL PRESUPUESTO DE CONEXIONES DEL NAVEGADOR
 * ================================================================
 * EL HECHO (Mario, 03/11, capturas 20:32 y 20:38 de v2.2.9)
 * ---------------------------------------------------------
 * La cabecera decía «servidor local caído» y el pie «no contesta el SERVIDOR
 * LOCAL», pero al mismo tiempo el selector de modelos mostraba el badge
 * «44 detectados en Ollama». Las dos cosas no conviven: si el 3000 estuviera
 * caído, esos 44 no habrían llegado nunca. El servidor estaba **sano**.
 *
 * LA MEDIDA (números del código, no hipótesis)
 * --------------------------------------------
 * · Chrome abre **6 conexiones por origen**. Todas las rutas que importan
 *   contestan en el MISMO origen (`localhost:3000`).
 * · `src/App.tsx:2930-2946` lanza en el arranque, sin esperar y **sin
 *   `AbortController`** (App.tsx tiene un solo AbortController en 9.700 líneas):
 *   `checkTelemetry` + `fetchInstalledModels` + zai + groq + cerebras + mistral
 *   + together + deepseek + fireworks + subagents = **10 requests simultáneos**.
 * · `/api/zai/models`, `/api/cerebras/models`, etc. rebotan contra el
 *   proveedor externo desde el servidor. Si el proveedor no contesta, lo que
 *   caduca es el plazo del servidor (`plazoApi`: 20 s por defecto,
 *   `server/middleware/plazoApi.ts:47`), no el del navegador: **el socket
 *   queda ocupado hasta 20 s en el navegador**.
 * · `src/components/EspinaActividad.tsx:75` corta el latido a los
 *   `PLAZO_LATIDO_MS` = **2800 ms** (`src/engine/latido.ts`, 700 × 4) y lo
 *   repite cada 700 ms.
 *
 * 10 requests contra 6 sockets = 4 haciendo cola. Con dos probes externos
 * colgados, los sockets disponibles no dan abasto y el latido —que el servidor
 * contesta en ~1 ms— pasa más de 2800 ms en la cola del navegador. El `abort`
 * del cliente se dispara, `clasificarFalloLatido` lo traduce a «no contesta»,
 * y la cabecera miente. Exacto el ahogo que `src/engine/latido.ts` describe en
 * su encabezado pero al revés: esta vez no fueron los fetch colgados los que
 * tumban el chat, fue el **sondeo de catálogo** tomando el chat por delante.
 *
 * LA REGLA
 * --------
 * Un navegador no tiene prioridades: el orden en que salen los fetch decide
 * quién come. Acá se las ponemos, con números del propio presupuesto:
 *
 *      6  conexiones por origen (límite duro de Chrome)
 *      3  techo de requests NO críticos en vuelo (la mitad justa)
 *      0  cola para lo crítico (latido, telemetría)
 *  12000  ms de plazo por request de catálogo. v1.0.37 · antes eran 8000 y el
 *         servidor también 8000: la interfaz se rendía en el mismo instante en
 *         que el backend, así que el catálogo estático con su motivo («la clave
 *         viajó y fue rechazada») llegaba a un socket ya cerrado y el usuario
 *         veía «no cargaron los modelos» sin explicación. El navegador espera
 *         SIEMPRE más que el servidor: primero contesta él, después se rinde la
 *         interfaz. Sigue muy por debajo de los 20 s de una generación.
 *
 * Módulo puro: `fetch` entra por parámetro, así la prueba puede simular un
 * proveedor colgado sin levantar servidor ni abrir sockets.
 */

/** Techo de requests no críticos simultáneos. La mitad del presupuesto de Chrome. */
export const TOPE_NO_CRITICOS = 3;

/** Plazo de un sondeo de catálogo. Corto a propósito: es información, no una orden. */
export const PLAZO_CATALOGO_MS = 12000;

/** Lo que el usuario ve cuando un proveedor tarda más de lo que vale la pena esperar. */
export const TEXTO_SIN_RESPUESTA = "no respondió a tiempo";

export type Prioridad = "critica" | "catalogo";

export interface PresupuestoOpciones {
  /** `critica` se salta el semáforo (latido, telemetría, chat). */
  prioridad?: Prioridad;
  /** 0 = sin plazo propio; manda solo el `signal` que traiga el llamador. */
  plazoMs?: number;
  /** Para abortar desde afuera (un `useEffect` que desmonta). */
  senal?: AbortSignalLike;
  /** Inyectable para probar sin red. */
  fetchImpl?: (url: string, init?: any) => Promise<any>;
  /**
   * Semáforo alternativo. Sin esto, una prueba que simula proveedores colgados
   * envenena al siguiente test con requests zombis en el semáforo compartido
   * (me pasó a la primera: «orden de cola» medía 2 en vuelo por culpa del test
   * de arriba, no por un defecto del módulo).
   */
  semaforo?: Semaphore;
}

/** El mínimo que necesitamos de un `AbortSignal` (así la prueba no construye uno real). */
export interface AbortSignalLike {
  aborted?: boolean;
  addEventListener?: (tipo: string, fn: () => void) => void;
  removeEventListener?: (tipo: string, fn: () => void) => void;
}

export class FalloDePresupuesto extends Error {
  readonly caducado: boolean;
  constructor(url: string, plazoMs: number) {
    super(`${TEXTO_SIN_RESPUESTA} después de ${Math.round(plazoMs / 1000)} s: ${url}`);
    this.name = "FalloDePresupuesto";
    this.caducado = true;
  }
}

/** Un contador de requests en vuelo, con su techo. Puro, para poder afirmarlo. */
export interface Semaphore {
  /** Se resuelve con la función que devuelve el turno. Siempre asincrónico. */
  adquirir(): Promise<() => void>;
  enVuelo(): number;
  esperando(): number;
}

/**
 * Semáforo de arranque **sincrónico**. Sincrónico es la palabra importante: si
 * el conteo diera asincrónico, dos llamadas simultáneas pasarían las dos por el
 * chequeo de tope antes de incrementarse y el techo sería decorativo.
 */
export function crearSemaphore(tope: number = TOPE_NO_CRITICOS): Semaphore {
  let enVuelo = 0;
  let esperando = 0;
  const cola: Array<{ pasar: () => void; cancelado: boolean }> = [];
  let repartiendo = false;

  /** Único despachador: saca de la cola de a un turno, en orden estricto. */
  const repartir = () => {
    if (repartiendo) return;
    repartiendo = true;
    try {
      for (;;) {
        while (cola.length > 0 && cola[0].cancelado) cola.shift();
        if (enVuelo >= tope || cola.length === 0) return;
        const turno = cola.shift() as { pasar: () => void; cancelado: boolean };
        esperando--;
        enVuelo++;
        // Si cancelaron el turno mientras esperaba, se le devuelve el puesto de
        // inmediato: si no, el semáforo contaría un vuelo fantasma.
        turno.pasar();
      }
    } finally {
      repartiendo = false;
    }
  };

  /** El reparto se programa, no se hace en el mismo tick: `adquirir` tiene que
   *  devolver la promesa antes de que alguien la resuelva. */
  const programar = () => setTimeout(repartir, 0);

  const liberar = () => {
    let hecha = false;
    return () => {
      if (hecha) return;
      hecha = true;
      enVuelo = Math.max(0, enVuelo - 1);
      programar();
    };
  };

  return {
    adquirir(): Promise<() => void> {
      esperando++;
      // v2.3.1 · el angostamiento del `resolve` lleva cast explícito. Quién lo
      // resuelve (`repartir`) no conoce `liberar`: el valor lo pone el `.then` de
      // abajo. Sin el cast, `tsc` rechazaba asignar el resolve de
      // `Promise<() => void>` —que pide un argumento— a un `() => void` (TS2322).
      const turno: { pasar: () => void; cancelado: boolean } = { pasar: () => {}, cancelado: false };
      const promesa = new Promise<() => void>((pasar) => { turno.pasar = pasar as unknown as () => void; });
      // Si el llamador tira la toalla (plazo vencido, desmontaje), el turno se
      // cancela: si no, quedaría contando y algún socket se perdería para siempre.
      // `finally`, no `catch`: con `catch` la promesa se vuelve feliz y el
      // llamador nunca se entera de que lo cancelaron. Acá solo se limpia la
      // contabilidad y el rechazo sigue su camino hacia arriba.
      promesa.finally(() => {
        if (!turno.cancelado) return;
        esperando--;
        programar();
      });
      cola.push(turno);
      programar();
      return promesa.then(() => liberar());
    },
    enVuelo: () => enVuelo,
    esperando: () => Math.max(0, esperando),
  };
}

/** El semáforo del módulo: compartido por todos los callers de `catalogo`. */
export const semaforoCatalogo: Semaphore = crearSemaphore(TOPE_NO_CRITICOS);

/**
 * `fetch` con plazo y con lugar en la mesa.
 *
 * - `prioridad: "critica"` NO pasa por el semáforo: el latido y la telemetría
 *   tienen que poder contestar aunque el catálogo entero esté colgado. Eso es
 *   justamente lo que la cabecera necesita para decir la verdad.
 * - El plazo se corta con `AbortController` propio. Si el llamador ya traía
 *   `senal`, se respetan las dos: gana la que se dispare primero.
 * - Al vencer se lanza `FalloDePresupuesto`, un texto que el llamador puede
 *   mostrar tal cual. Un proveedor que tarda debe decir «no respondió Z.ai»,
 *   no dejar la lista en blanco (captura 2: «No se encontraron modelos con el
 *   filtro seleccionado» con el chip diciendo «Z.ai (4+)» — contradicción).
 */
export async function fetchConPresupuesto(
  url: string,
  init: any = {},
  opciones: PresupuestoOpciones = {},
): Promise<any> {
  const prioridad: Prioridad = opciones.prioridad || "catalogo";
  const plazoMs = opciones.plazoMs === undefined ? PLAZO_CATALOGO_MS : opciones.plazoMs;
  const llamar = opciones.fetchImpl || (typeof fetch === "function" ? (fetch as any) : null);
  if (!llamar) throw new Error("este entorno no tiene fetch");

  const sem = opciones.semaforo || semaforoCatalogo;
  const soltar = prioridad === "critica" ? () => {} : await sem.adquirir();
  const controlador = new AbortController();
  let caduca: ReturnType<typeof setTimeout> | null = null;
  const alAbordar = () => controlador.abort();
  // Hay que saber QUIÉN abortó. Un `senal` del usuario (cambió de página,
  // cerró el modal) y un plazo vencido son dos cosas distintas, y la interfaz
  // tiene que decirlas distinto: «cancelado» vs «no respondió a tiempo».
  let vencioElPlazo = false;
  if (plazoMs > 0) caduca = setTimeout(() => { vencioElPlazo = true; controlador.abort(); }, plazoMs);
  if (opciones.senal) {
    if (opciones.senal.aborted) controlador.abort();
    else opciones.senal.addEventListener?.("abort", alAbordar);
  }
  // Con una señal ya abortada hay que cortar ACÁ: un `fetch` que no consulte
  // `signal.aborted` antes de colgarse se queda esperando para siempre.
  if (controlador.signal.aborted) {
    if (caduca) clearTimeout(caduca);
    soltar();
    throw new Error("abortado antes de salir: " + url);
  }
  try {
    return await llamar(url, { ...init, signal: controlador.signal });
  } catch (e: any) {
    if (vencioElPlazo) throw new FalloDePresupuesto(url, plazoMs);
    throw e;
  } finally {
    if (caduca) clearTimeout(caduca);
    if (opciones.senal) opciones.senal.removeEventListener?.("abort", alAbordar);
    soltar();
  }
}

/** Atajo para los diez sondeos de catálogo del arranque. */
export const fetchCatalogo = (url: string, init: any = {}, plazoMs?: number) =>
  fetchConPresupuesto(url, init, { prioridad: "catalogo", plazoMs });

/** Atajo para latido / telemetría: nunca hace cola detrás de un catálogo. */
export const fetchCritico = (url: string, init: any = {}, plazoMs = 0) =>
  fetchConPresupuesto(url, init, { prioridad: "critica", plazoMs });
