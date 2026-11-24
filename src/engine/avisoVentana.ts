/**
 * avisoVentana.ts — v1.0.20 · «SE CORTA» DECÍA UNA COSA, PERO ERAN DOS
 * =====================================================================
 * En la sesión 1794621531453 el mismo hilo terminó dos veces con la misma frase
 * (mensajes 69 y 71) y ninguna decía la verdad completa:
 *
 *   69 → «HTTP 400: request (17929 tokens) exceeds the available context size
 *          (8192 tokens)». Diagnóstico del usuario: «no funciona».
 *   71 → «El modelo local cayó demasiado tiempo y se cortó», con el consejo de
 *          «mirá ollama ps». El modelo estaba cargado. Lo que pasaba es que en
 *          CPU un prompt de ~4,4K tokens tarda muchísimo en el prefill y el
 *          reloj de inactividad (180 s) lo leyó como caída.
 *
 * El defecto no es el mensaje: es que el motor tenía DOS causas distintas y UNA
 * frase genérica. Esta capa convierte la medida del propio Ollama
 * (`prompt_eval_count`, que viaja en el `done`) en el consejo exacto: si el
 * prompt ya ocupa más de la mitad de la ventana, el siguiente turno va a
 * volver a cortarse por la misma razón, y se dice qué hacer —subir la ventana,
 * acortar la historia o elegir un modelo con más contexto— en vez de «mirá
 * ollama ps».
 *
 * Es puro: no habla con nadie. Se prueba en `tests/avisoVentana.test.ts`.
 */

export interface MedidaDeTurno {
  /** Tokens del prompt que el motor procesó de verdad (`prompt_eval_count`). */
  tokensEntrada?: number;
  /** Titubeo del modelo al cargar (`load_duration` en ms), si lo reportó. */
  msCarga?: number;
}

export interface AvisoDeVentana {
  /** ¿Hay algo que decir? Si no, el chat no añade ruido. */
  avisa: boolean;
  /** Severidad: `ok` = todo cabe; `ajustado` = la próxima se corta; `desborda` = ya se cortó. */
  nivel: "ok" | "ajustado" | "desborda";
  /** La frase para el usuario, en español directo. Vacía si no hay aviso. */
  texto: string;
  /** % de la ventana ocupado por el prompt (redondeado). null si no se midió. */
  ocupacion: number | null;
}

/** Por encima de este tanto por ciento, el próximo turno ya no cabe con comodidad. */
export const UMBRAL_AJUSTADO = 60;

export function avisoDeVentana(
  medida: MedidaDeTurno | null | undefined,
  numCtx: number,
  modelo: string,
): AvisoDeVentana {
  const ctx = Number(numCtx) > 0 ? Math.floor(Number(numCtx)) : 0;
  const tok = Number(medida?.tokensEntrada);
  if (!ctx || !Number.isFinite(tok) || tok <= 0) {
    return { avisa: false, nivel: "ok", texto: "", ocupacion: null };
  }
  const pct = Math.round((tok / ctx) * 100);
  if (pct >= 100) {
    return {
      avisa: true,
      nivel: "desborda",
      ocupacion: pct,
      texto:
        `🪟 El prompt de este turno (${tok} tokens) ya pasó la ventana de «${modelo}» (${ctx}). ` +
        `No es que el modelo «se corte»: el pedido no entra. Subí «Ventana de contexto» en el panel Pro, ` +
        `acortá la historia del hilo, o elegí un modelo que declare más contexto.`,
    };
  }
  if (pct >= UMBRAL_AJUSTADO) {
    return {
      avisa: true,
      nivel: "ajustado",
      ocupacion: pct,
      texto:
        `🪟 «${modelo}» va al ${pct}% de su ventana (${tok}/${ctx} tokens): el próximo turno puede no entrar. ` +
        `Si querés aire, subí la ventana en el panel Pro o abrí un hilo nuevo.`,
    };
  }
  return { avisa: false, nivel: "ok", texto: "", ocupacion: pct };
}

/**
 * El aviso del TIEMPO, para cuando no hubo ni un token en 180 s. Separa CARGA de
 * PREFILL: son dos esperas distintas y solo una se cura subiendo la ventana.
 */
export function avisoDeEspera(medida: MedidaDeTurno | null | undefined, modelo: string): string {
  const carga = Number(medida?.msCarga);
  const tok = Number(medida?.tokensEntrada);
  if (Number.isFinite(carga) && carga > 60_000) {
    return `⏳ «${modelo}» tardó ${(carga / 1000).toFixed(0)} s en CARGAR los pesos: es RAM/disco, no el prompt. Probá «Expulsar» en Puertos y reintentá con la máquina libre.`;
  }
  if (Number.isFinite(tok) && tok > 2000) {
    return `⏳ «${modelo}» no llegó a la primera palabra y el prompt es GRANDE (${tok} tokens): en CPU el prefill se paga por token. Bajá la historia o usá modo liviano; no es que el modelo «se cayó».`;
  }
  return `⏳ «${modelo}» no llegó a la primera palabra. Mirá si la máquina está cargada (otro modelo residente) antes de culpar al modelo.`;
}
