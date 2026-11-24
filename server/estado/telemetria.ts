/**
 * telemetria.ts — EL PRIMER ESTADO EXTRAÍDO (Fase 2, v1.12.0)
 * ==========================================================
 * QUÉ ES: la caché de telemetría del servidor (cuándo se miró por última vez si
 * Ollama y el puente responden, y qué se vio) con una API de tres funciones.
 * PARA QUÉ SIRVE: para que las rutas que informan del estado del sistema no
 * necesiten vivir dentro del monolito. Es la primera pieza de ESTADO que sale de
 * `server.ts`, y por eso importa más de lo que parece: es el ensayo de lo que hay
 * que hacer con las otras dieciocho variables globales.
 *
 * POR QUÉ EL ESTADO ES EL PASO DIFÍCIL (y por qué este es el bueno para empezar)
 * Mover una ruta es mover código. Mover estado es cambiar quién manda sobre él.
 * Una variable global suelta no dice nada: no se sabe quién la escribe, ni cuándo,
 * ni qué contratos hay detrás. Este módulo lo dice en tres funciones —leer, guardar
 * y invalidar— y con una regla: NADIE toca la caché por dentro, todos pasan por
 * aquí. Cuando se extraigan `sandboxProc` o los contadores de CPU se usará esta
 * misma receta, y ya estará probada.
 *
 * POR QUÉ EL TIEMPO SE INYECTA (`ahora`)
 * `muestraVigente()` recibe el instante en lugar de leer `Date.now()`. No es
 * purismo: es lo que permite **probar la caducidad sin esperar diez segundos**.
 * Un módulo que lee el reloj por dentro solo se puede probar durmiendo, y las
 * pruebas que duermen son las primeras que se quitan cuando van lentas.
 */

export interface MuestraTelemetria {
  /** Instante en que se tomó la muestra (ms desde epoch). */
  timestamp: number;
  /** Lo que se respondió: puertos vivos y número de modelos. */
  data: unknown;
}

/**
 * Los dos tiempos, y por qué son generosos (venían documentados en el monolito):
 * se subieron a 10 s de caché y 35 s de sondeo porque Ollama puede tardar 28 s o
 * más cuando está cargando un modelo, y con timeouts cortos el indicador parpadeaba
 * a «11434 OFF» durante cualquier conversación larga. Ese falso negativo es peor
 * que un dato viejo: hace que el usuario reinicie Ollama sin motivo.
 */
export const TELEMETRY_CACHE_MS = 10000; // 10 s de caché
export const TELEMETRY_PROBE_MS = 35000; // 35 s de sondeo

/**
 * v2.2.3 · EL PRESUPUESTO QUE FALTABA
 * -----------------------------------
 * Los 35 s de sondeo están bien y no se tocan (ver arriba: Ollama tarda 28 s con
 * un modelo cargando). El problema era de **presupuesto**, no de valor: la ruta
 * `plazoApi` corta cualquier `/api` a los 20 s y manda 504. Con un daemon trabado,
 * `/api/telemetry/ports` tardaba hasta 35 s, o sea **después** de que el middleware
 * ya había respondido — y el cliente (`src/App.tsx`, `checkTelemetry`) hace
 * `if (res.ok)` con un `catch {}` vacío. Resultado: los chips de la cabecera
 * seguían pintando la última muestra buena como si estuviera viva, mientras la
 * espina decía «servidor local caído» con razón. Medido en la pantalla de Mario
 * (03/11): hoja de ruta con marca 15:44 y reloj del sistema 17:05.
 *
 * La salida no es acortar el sondeo (eso reabre el falso «11434 OFF» que este
 * archivo documenta desde v1.16), es **contestar adentro del presupuesto con lo
 * que se sepa**, y decir qué falta. `sin_medir` no es `muerto`.
 */
export const PLAZO_SONDEO_LOCAL_MS = Number(process.env.CN_PLAZO_SONDEO_LOCAL_MS || 6000);
export const PRESUPUESTO_TELEMETRIA_MS = Number(process.env.CN_PRESUPUESTO_TELEMETRIA_MS || 30000);
/** El plazo del middleware (`server/middleware/plazoApi.ts`): presupuesto < plazo. */
export const PLAZO_API_MS = Number(process.env.CN_PLAZO_API_MS || 45000);

export type LecturaSonda = "vivo" | "muerto" | "sin_medir";

export interface PuertoResuelto {
  /** El booleano de siempre, para no romper a nadie. */
  vivo: boolean;
  /** Por qué. Vacío cuando la lectura es limpia. */
  motivo: string;
  /** true cuando el valor NO viene de esta muestra (se conservó el anterior). */
  heredado: boolean;
}

/**
 * La edad en texto vive en `src/engine/haceTexto.ts`: lo consumen el servidor (para
 * escribir el `motivo`) y los paneles (para decir hace cuánto se leyó). Re-exportarlo
 * acá es la forma de tener UNA sola implementación del texto.
 */
import { haceTexto } from "../../src/engine/haceTexto";

export { haceTexto, edadLectura } from "../../src/engine/haceTexto";

/**
 * Decide cómo se reporta un puerto a partir de la lectura actual, la anterior y
 * el instante. Puro: entra `ahora` por parámetro, como el resto del módulo.
 *
 * La regla que importa: **una lectura que no llegó no afirma que el servicio
 * esté caído.** Si antes estaba vivo, se conserva el valor y se marca `heredado`
 * con la edad; si estaba caído (o nunca se lo midió), se dice caído sin adornos.
 */
export function resolverPuerto(
  lectura: LecturaSonda,
  anterior: { vivo: boolean; timestamp: number } | undefined,
  ahora: number,
): PuertoResuelto {
  if (lectura === "vivo") return { vivo: true, motivo: "", heredado: false };
  if (lectura === "muerto") return { vivo: false, motivo: "", heredado: false };
  if (!anterior) {
    return { vivo: false, motivo: "sin respuesta y sin lectura anterior: no se lo midio nunca", heredado: false };
  }
  const haceMs = Math.max(0, ahora - anterior.timestamp);
  if (!anterior.vivo) return { vivo: false, motivo: `sin respuesta; la lectura anterior ya estaba caida (${haceTexto(haceMs)})`, heredado: false };
  return {
    vivo: true,
    motivo: `sin respuesta en esta muestra: se conserva la ultima lectura (${haceTexto(haceMs)})`,
    heredado: true,
  };
}

let cache: MuestraTelemetria | null = null;

/** La última muestra que hay, **aunque ya esté vencida** (para no inventar «caído»). */
export function ultimaMuestraConocida(): MuestraTelemetria | null {
  return cache;
}

/** Lo que hay en la caché SI sigue fresco; `null` si toca volver a sondear. */
export function muestraVigente(ahora: number = Date.now()): unknown | null {
  if (cache && ahora - cache.timestamp < TELEMETRY_CACHE_MS) return cache.data;
  return null;
}

/** Guarda una muestra recién tomada. */
export function guardarMuestra(data: unknown, ahora: number = Date.now()): void {
  cache = { timestamp: ahora, data };
}

/**
 * Tira la caché para forzar un sondeo nuevo (`POST /api/telemetry/refresh`).
 * Existe porque el usuario puede saber algo que el servidor no: acaba de arrancar
 * Ollama y no quiere esperar diez segundos a que la caché caduque sola.
 */
export function invalidarMuestra(): void {
  cache = null;
}

/** Solo para pruebas y diagnóstico: la muestra cruda, sin juicio de frescura. */
export function muestraCruda(): MuestraTelemetria | null {
  return cache;
}
