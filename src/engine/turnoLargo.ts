export interface EstadoDelTurno {
  /** Cuándo empezó el turno (ms, reloj inyectado). */
  inicio: number;
  /** Último byte recibido del proveedor (texto o latido de stream). */
  ultimoAliento: number;
  /** El usuario apretó Detener. */
  cancelado?: boolean;
}

export interface VeredictoDeTurno {
  /** seguir = no se toca nada; mantener = emitir un comentario de vida al chat. */
  accion: "seguir" | "mantener";
  /** Texto para el chat, "" si no hay nada que decir. */
  dicho: string;
  /** Minutos que lleva el turno, redondeados hacia abajo. */
  minutos: number;
}

/**
 * v2.3.25 · UN TURNO DE 20 O 30 MINUTOS NO ES UN TURNO MUERTO.
 * =============================================================
 * Lo que pasa hoy (medido en la sesión de Mario del 15/11): el modelo de pago
 * trabaja bien veinte o treinta minutos y en algún punto deja de llegar texto.
 * La IDE lee ese silencio como muerte, tira el turno y **se pierde lo que estaba
 * haciendo**, porque lo que se descarta es el MENSAJE, no una conexión.
 *
 * Tres cosas hay que separar, y antes las tres eran la misma:
 *
 *   1. SILENCIO CORTO (< `SILENCIO_TOLERADO_MS`): el modelo está pensando o el
 *      proveedor está compactando el stream. No se toca nada.
 *   2. SILENCIO LARGO con el turno vivo: se emite UN comentario de vida («sigo
 *      trabajando, minuto 12») para que el usuario sepa que nadie se colgó. La
 *      cadena de razonamiento de un modelo de pago puede pasar minutos sin
 *      emitir tokens de respuesta: eso no autoriza a matarlo.
 *   3. SIN ALIENTO durante `MUERTO_MS`, o cancelación explícita: AHÍ sí se corta,
 *      y se corta DICIENDO cuánto duró y guardando lo hecho.
 *
 * Y la regla que protege el trabajo: un turno cortado es un turno con `resumen`
 * —qué se alcanzó a escribir—, no un turno vacío. Quien decide guardar es quien
 * llama; esta función solo dice qué pasó y qué contar.
 *
 * PURA: recibe tres números y devuelve una decisión.
 */
export const SILENCIO_TOLERADO_MS = 120_000;      // 2 min sin un byte: se avisa una vez
export const AVISO_CADA_MS = 5 * 60_000;         // luego, un comentario cada 5 min
export const MUERTO_MS = 20 * 60_000;            // 20 min sin nada: se da por caído

export function vigilarTurnoLargo(e: EstadoDelTurno, ahoraMs: number): VeredictoDeTurno {
  const inicio = Number(e.inicio) || 0;
  const aliento = Number(e.ultimoAliento) || inicio;
  const ahora = Number(ahoraMs) || 0;
  const minutos = Math.max(0, Math.floor((ahora - inicio) / 60_000));
  if (e.cancelado) {
    return { accion: "seguir", minutos, dicho: `turno detenido a mano en el minuto ${minutos}` };
  }
  const silencio = ahora - aliento;
  if (silencio >= MUERTO_MS) {
    return {
      accion: "seguir",
      minutos,
      dicho:
        `se corta el turno: ${Math.round(silencio / 60_000)} min sin un byte del proveedor ` +
        `(llevaba ${minutos} min). Lo escrito hasta acá queda guardado; reintentar continúa desde el resumen.`,
    };
  }
  if (silencio >= SILENCIO_TOLERADO_MS) {
    // Un aviso cada AVISO_CADA_MS, no uno por vuelta del reloj.
    const yaAvisado = silencio >= AVISO_CADA_MS;
    return {
      accion: "mantener",
      minutos,
      dicho: yaAvisado
        ? `sigo trabajando: minuto ${minutos}, el proveedor no manda texto desde hace ${Math.round(silencio / 60_000)} min. El turno NO se corta solo.`
        : `sigo trabajando: minuto ${minutos}. El proveedor está pensando; el turno NO se corta solo.`,
    };
  }
  return { accion: "seguir", minutos, dicho: "" };
}
