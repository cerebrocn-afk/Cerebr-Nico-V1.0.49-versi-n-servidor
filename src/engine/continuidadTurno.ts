/**
 * continuidadTurno.ts — v1.66.0 · EL MODELO QUE ANUNCIA Y NO HACE
 * ============================================================================
 * RAÍZ (reportado por el usuario y visible en el chat exportado): el modelo dice
 * «voy a revisar…», «ahora completo el archivo…», «dejame ver…» y CIERRA el
 * turno ahí — sin llamar a ninguna herramienta y sin entregar nada—. El usuario
 * tiene que escribir «sigue» / «ya está?» para que recién entonces actúe. Es un
 * CORTE PREMATURO: promete acción inminente y no la ejecuta.
 *
 * QUÉ HACE: mira el texto FINAL del turno y si el turno NO produjo obra ni
 * llamó herramientas. Si el texto es una PROMESA de acción inminente («voy a…»,
 * «ahora…», «procedo a…», «empiezo por…», termina en «…» tras anunciar), devuelve
 * una DIRECTIVA para inyectar que obliga al modelo a EJECUTAR ya, en el mismo
 * hilo, en vez de esperar un «sigue» del humano. El motor deja de «colgar»
 * esperando y continúa solo.
 *
 * CONTROL DE FALSO POSITIVO (triple):
 *   1. Si el turno HIZO obra o llamó herramientas → no es corte prematuro (ya
 *      actúó; narrar lo que hizo es legítimo).
 *   2. Si el texto es una PREGUNTA al usuario (pide un dato que falta) o una
 *      ENTREGA con conclusión → no es promesa vacía, es diálogo correcto.
 *   3. Si NO hay verbo de acción inminente → conversación normal, no se toca.
 *
 * PURO: sin red, sin fs, sin estado global. Se prueba en seco.
 */

export interface EntradaContinuidad {
  /** El último texto que el modelo mandó al chat este turno. */
  textoFinal: string;
  /** ¿Este turno ejecutó al menos una herramienta? */
  huboToolCalls: boolean;
  /** ¿Este turno dejó obra (escritura/edición/comando con efecto)? */
  huboObra: boolean;
}

export interface VeredictoContinuidad {
  /** true = el turno se cortó tras prometer y sin actuar. */
  prematuro: boolean;
  /** directiva para inyectar (solo si prematuro). */
  directiva?: string;
  /** la frase-promesa detectada, para el log. */
  promesa?: string;
}

/** Verbos/fórmulas que anuncian una acción INMINENTE («ya mismo lo hago»). */
const PROMESAS_ACCION: RegExp[] = [
  /\bvoy a\b/i,
  /\bahora\s+(voy|lo|te|los|las|mismo|proc|empiez|complet|reviso|arreglo|escribo|creo|genero)/i,
  /\b(proced|empiez|continúo|continuo|arranco|inicio)\w*\s+(a|con|por)\b/i,
  /\b(déjame|dejame|permíteme|permiteme|permitime)\b/i,
  /\b(un momento|enseguida|a continuación|acto seguido|en seguida)\b/i,
  /\b(voy|paso|me pongo)\s+a\b/i,
  /\b(reviso|reviso\s+ahora|lo reviso|lo completo|lo armo|lo genero|lo escribo|lo creo|lo corrijo)\b/i,
  /\b(empezaré|revisaré|completaré|crearé|generaré|escribiré|corregiré)\b/i,
];

/** Señales de que el texto es una PREGUNTA legítima o pide un dato al usuario. */
const PREGUNTA_AL_USUARIO: RegExp[] = [
  /\?\s*$/,
  /\b(necesito que me|me pods|me puedes|podés|puedes|confirmá|confirma|indicá|indica|decíme|dime|qué prefer|cuál de)\b/i,
  /\b(falta|me falta|hace falta)\b[^\n]*\b(que me|dato|información|aclarar|definir)\b/i,
];

/** Señales de ENTREGA/conclusión (el turno cerró bien, con resultado). */
const ENTREGA_CERRADA: RegExp[] = [
  /\b(listo|hecho|terminad|complet(ad|é)|quedó|ya está|finaliz)/i,
  /\b(resultado|resumen|conclusión|en resumen|en síntesis)\b/i,
];

/** ¿El texto TERMINA prometiendo? (promesa en la cola, el patrón típico del corte). */
function promesaEnLaCola(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  // últimas ~2 frases: donde vive el «voy a…» seguido de nada.
  const cola = limpio.split(/(?<=[.!?…])\s+/).slice(-2).join(" ");
  const terminaEnPuntosSuspensivos = /(…|\.\.\.)\s*$/.test(limpio);
  for (const re of PROMESAS_ACCION) {
    if (re.test(cola)) return (cola.match(re)?.[0] || cola.slice(0, 60)).trim();
  }
  // «Aquí está el código:» / «… a continuación:» y corta sin nada más.
  if (terminaEnPuntosSuspensivos && /\b(código|archivo|completo|secciones?|contin)/i.test(cola)) {
    return cola.slice(-60).trim();
  }
  return null;
}

/**
 * Evalúa si el turno se cortó prematuramente tras una promesa vacía.
 */
export function evaluarContinuidad(entrada: EntradaContinuidad): VeredictoContinuidad {
  // Falso positivo 1: actúó de verdad → no es promesa vacía.
  if (entrada.huboToolCalls || entrada.huboObra) return { prematuro: false };

  const texto = String(entrada.textoFinal ?? "");
  if (!texto.trim()) return { prematuro: false };

  // Falso positivo 2: pregunta legítima o entrega cerrada → diálogo correcto.
  if (PREGUNTA_AL_USUARIO.some((re) => re.test(texto))) return { prematuro: false };
  if (ENTREGA_CERRADA.some((re) => re.test(texto))) return { prematuro: false };

  const promesa = promesaEnLaCola(texto);
  if (!promesa) return { prematuro: false };

  return {
    prematuro: true,
    promesa,
    directiva: mensajeContinuidad(promesa),
  };
}

/** La directiva que se inyecta para que el modelo ACTÚE ya, sin esperar «sigue». */
export function mensajeContinuidad(promesa: string): string {
  return (
    `▶️ CONTINUIDAD — anunciaste una acción («${promesa}…») y cortaste sin ejecutarla. ` +
    `No esperes a que el usuario diga «sigue»: HAZLO AHORA, en este mismo hilo. ` +
    `Llama ya a la herramienta correspondiente (escribir/editar el archivo, correr el comando) ` +
    `y no vuelvas a narrar la intención sin acompañarla del acto. ` +
    `Si de verdad te falta un dato para actuar, pregunta ESE dato concreto — no anuncies y calles.`
  );
}
