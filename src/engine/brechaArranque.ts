export interface RetratoDeArranque {
  /** Puertos que responden ahora mismo. */
  vivos: number[];
  /** Cuándo se preguntó (ms, reloj inyectado). */
  en: number;
}

export type HechoDeBrecha = "caido-siempre" | "se-cayo" | "volvio" | "nunca-estuvo" | "sin-dato";

export interface Brecha {
  hecho: HechoDeBrecha;
  /** Texto para el log, en español y sin adornos. "" si no hay nada que contar. */
  dicho: string;
}

/**
 * v2.3.25 · QUÉ SIGNIFICA QUE UN PUERTO ESTÉ OFF (la diferencia que faltaba)
 * ==========================================================================
 * La cabecera decía «servidor local caído» y nada más. Con el mismo OFF había tres
 * situaciones distintas y la interfaz las pintaba igual:
 *
 *   · el puerto NUNCA estuvo arriba desde que la IDE abrió → «nunca-estuvo»:
 *     no se cayó nada, todavía no nació (o falta el intérprete, o falta el modelo).
 *   · estuvo arriba y ya no está → «se-cayo»: esto SÍ es una caída, y el supervisor
 *     tiene algo que reanimar.
 *   · estuvo abajo y volvió → «volvio»: se cuenta UNA vez, para que el usuario sepa
 *     que se recuperó solo (y no siga pensando que está caído).
 *
 * Y cuando el puerto que se cayó es el de la inferencia local (:11434), lo que se
 * pierde NO es «la nube»: se pierden los modelos de pago que se manejan DESDE la
 * casa (Z.ai/GLM, Mistral, DeepSeek). Ese aviso lo arma `avisoDeInferenciaLocal`.
 *
 * PURA: sin red, sin reloj propio, sin estado global.
 */
export function clasificarBrecha(puerto: number, historia: boolean[], vivos: number[]): Brecha {
  const ahora = vivos.includes(puerto);
  const algunaVez = (historia || []).some(Boolean);
  const antes = (historia || []).length ? Boolean(historia[historia.length - 1]) : false;
  if (!algunaVez && !ahora) {
    return { hecho: "nunca-estuvo", dicho: `:${puerto} nunca estuvo arriba desde que abrió la IDE` };
  }
  if (antes && !ahora) return { hecho: "se-cayo", dicho: `:${puerto} se cayó (estaba arriba)` };
  if (!antes && ahora && algunaVez) return { hecho: "volvio", dicho: `:${puerto} volvió a responder` };
  if (ahora) return { hecho: "caido-siempre", dicho: "" };
  return { hecho: "sin-dato", dicho: `:${puerto} sigue sin responder` };
}

/** El puerto de la inferencia local: si cae, los modelos de la casa se quedan sin motor. */
export const PUERTO_INFERENCIA_LOCAL = 11434;

/**
 * El aviso que faltaba, con las palabras de Mario: «si se cae el servidor local no
 * funcionan ni siendo de pago».
 *
 * Aclaración honesta que el texto tiene que dejar clara: un modelo de PAGO (Z.ai GLM,
 * Mistral, DeepSeek) corre EN LA NUBE, así que su facturación y su cuota no dependen de
 * esta máquina. Lo que sí se pierde sin :11434 son las dos cosas que la IDE hace en
 * local alrededor del turno (los índices de la memoria y el pre-chequeo del modelo);
 * por eso el usuario lo percibe como «no funcionan». El aviso no promete lo contrario.
 */
export function avisoDeInferenciaLocal(
  vivo: boolean,
  hecho: HechoDeBrecha,
  modeloDeGiro: string
): string {
  if (vivo) return "";
  const pago = String(modeloDeGiro || "").trim();
  const quien = pago ? `«${pago}»` : "el modelo de pago";
  const porque =
    hecho === "nunca-estuvo"
      ? ":11434 no llegó a abrir todavía (Ollama tarda; su log está en logs/arranque/ollama.log)."
      : ":11434 se cayó.";
  return (
    `Sin inferencia local ${porque} ${quien} sigue disponible porque corre en la nube, ` +
    `pero la memoria vectorial y el pre-chequeo del turno funcionan degradados. ` +
    `Reanimar: el supervisor lo reintenta solo (3 intentos); a mano, «ollama serve» o el chip de Puertos.`
  );
}
