/**
 * colaVoces.ts · CUANDO EL NAVEGADOR AÚN NO PUBLICÓ SUS VOCES (v1.99.9)
 * ====================================================================
 * La queja original de Mario fue «la función de TTS **no abre el cambiador de voces**». Se corrigió
 * el anclaje (v1.97.0/v1.98.0: la tarjeta se portaleaba y se recortaba al otro lado de la pantalla),
 * pero quedaba en pie la otra mitad del síntoma: la tarjeta abre y **la lista sale vacía**.
 *
 * Por qué sale vacía: `speechSynthesis.getVoices()` arranca devolviendo `[]` y las voces aparecen
 * después, avisadas por el evento `voiceschanged`. El código escuchaba ese evento — y nada más. Si
 * el navegador ya disparó el evento antes de que el componente montara (pasa en Chromium/Windows,
 * sobre todo cuando la página carga con el foco en otro lado) o si directamente no lo dispara en
 * esa sesión, la lista queda vacía **para siempre** y el usuario ve un cambiador sin cambiador.
 *
 * Este módulo decide el reintento, con techo y con retiro, que es la costumbre de la casa:
 *   · `arranqueVentanas.decidirReavivado` espera 15/30/60 s y **renuncia al tercer intento con
 *     motivo**; acá la forma es la misma pero a escala de tecla (120/300/700/1500 ms).
 *   · Nunca se sondea en segundo plano: mientras la tarjeta está cerrada el listener de
 *     `voiceschanged` alcanza, y estar preguntándole al navegador cada 200 ms "por si acaso" es
 *     exactamente la clase de ruido que en una máquina con poco aire mata el teclado.
 *   · Al agotar los intentos se **dice la verdad en la cara**: no hay voces del sistema, la
 *     automática habla igual. Un selector mudo y vacío es lo que hizo creer que el botón estaba
 *     roto.
 *
 * Puro: sin DOM, sin reloj, sin temporizadores. Quién programa los `setTimeout` es el cable.
 */

/** Cuánto espera cada sondeo extra. Cuatro oportunidades y se acabó la paciencia. */
export const ESPERAS_REINTENTO_MS = [120, 300, 700, 1500] as const;

export type AccionVoces = "nada" | "reintentar" | "desistir";

export interface EstadoVoces {
  /** Cuántas voces publicó el navegador hasta ahora. */
  voces: number;
  /** Sondeos extra ya hechos (0 = recién se abrió la tarjeta). */
  intentosHechos: number;
  /** La tarjeta está visible. Fuera de la vista no se sondea. */
  abierto: boolean;
  /** Existe `speechSynthesis.getVoices` en este navegador. */
  soporta: boolean;
}

export interface DecisiónVoces {
  accion: AccionVoces;
  /** Cuánto hay que esperar para el próximo sondeo (0 si no hay próximo). */
  esperaMs: number;
  /** En cuál estamos (1-based) — para poder decirlo. */
  intento: number;
  total: number;
  motivo: string;
}

/**
 * LA DECISIÓN. Orden: si ya hay voces no hay nada que hacer; si el navegador no soporta la API se
 * desiste de entrada (reintentar no va a cambiar eso); si la tarjeta está cerrada se espera a que
 * el usuario la abra; y con la lista vacía se sondea hasta el techo.
 */
export function decidirReintentoVoces(e: EstadoVoces): DecisiónVoces {
  const total = ESPERAS_REINTENTO_MS.length;
  const voces = Math.max(0, Number(e.voces) || 0);
  const intentos = Math.max(0, Number(e.intentosHechos) || 0);

  if (voces > 0) return { accion: "nada", esperaMs: 0, intento: intentos, total, motivo: `${voces} voz/ces publicadas` };
  if (!e.soporta) {
    return { accion: "desistir", esperaMs: 0, intento: intentos, total, motivo: "este navegador no expone síntesis de voz" };
  }
  if (!e.abierto) {
    return { accion: "nada", esperaMs: 0, intento: intentos, total, motivo: "la tarjeta está cerrada: alcanza con el aviso del navegador" };
  }
  if (intentos >= total) {
    return { accion: "desistir", esperaMs: 0, intento: intentos, total, motivo: `se agotaron los ${total} sondeos y el navegador sigue sin publicar voces` };
  }
  return {
    accion: "reintentar",
    esperaMs: ESPERAS_REINTENTO_MS[intentos],
    intento: intentos + 1,
    total,
    motivo: `sin voces publicadas todavía: sondeo ${intentos + 1}/${total} en ${ESPERAS_REINTENTO_MS[intentos]} ms`,
  };
}

/**
 * La línea que ve el usuario. Vacío cuando todo está bien — un cartel de advertencia con el sistema
 * funcionando también es ruido.
 */
export function rotuloEstadoVoces(d: DecisiónVoces, voces: number): string {
  if (voces > 0) return "";
  if (d.accion === "reintentar") return `buscando voces del sistema… (sondeo ${d.intento}/${d.total})`;
  if (!d.motivo.includes("síntesis de voz") && d.accion === "desistir") {
    return "el navegador no publicó voces del sistema · la automática habla igual";
  }
  return d.accion === "desistir" ? d.motivo : "";
}

/** La escalera es creciente: el último sondeo es el más espaciado (no se martilla al navegador). */
export function escaleraCreciente(): boolean {
  return ESPERAS_REINTENTO_MS.every((ms, i, v) => i === 0 || ms > v[i - 1]);
}
