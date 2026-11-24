/**
 * techoDelPrompt.ts — v1.0.33 · EL SISTEMA TAMBIÉN OCUPA LUGAR
 * ===========================================================
 * 🐞 LO QUE ESCUPIÓ LA SESIÓN DE MARIO (v1.0.32, 19/11, glm-4.5-flash/Z.ai):
 *
 *   [CerebroNico] 📚 ABORDAJE "glm-4.5-flash" (zai): manual 111/111 · 9325 chars (presupuesto 9360)
 *   ⚠️ Error de comunicación con glm-4.5-flash: Z.ai no pudo responder para el
 *      modelo "glm-4.5-flash": Prompt exceeds max length (code 1261)
 *
 * El chat no se cayó: se quedó MUDO. El usuario escribió y no volvió nada.
 *
 * LA RAÍZ
 * -------
 * El recorte del historial se calculaba así:
 *
 *     presupuesto = contextCharBudget - resumen
 *
 * Es decir, el historial podía ocupar TODO el presupuesto del modelo **como si el
 * prompt de sistema no existiera**. Y el sistema no es pequeño: el contrato de
 * acción con el catálogo (111 herramientas nombradas), el bloque del cerebro, la
 * conciencia del turno, la directriz de ejecución real y el mapa de rutas suman
 * varios miles de caracteres; los esquemas de las 111 herramientas, otros tantos.
 * Con el sistema fuera de la cuenta, un turno normal llegaba al proveedor con el
 * prompt por encima de su tope y el proveedor contestaba «Prompt exceeds max
 * length».
 *
 * Y esto EMPEORA con cada mejora del prompt: v1.0.31 añadió 16 manuales y el
 * bloque creció; nadie volvió a mirar la cuenta. Por eso la cuenta tiene que ser
 * UNA FUNCIÓN, con suite, y no una resta escrita a mano en el monolito.
 *
 * LA REGLA
 * -------
 * El presupuesto del turno se reparte: primero el sistema (que ya está escrito y
 * medido), después la reserva de salida, después el resumen, y lo que sobre es del
 * historial — con un suelo para que la conversación no quede sin hilo. Si el
 * sistema solo ya no cabe, se dice con un número en vez de mandar un prompt que
 * el proveedor va a rechazar.
 *
 * Capa PURA: entra un número, sale un número. `npx tsx tests/techoDelPrompt.test.ts`
 */

/** Lo que se reserva para que el modelo pueda CONTESTAR (no solo leer). */
export const RESERVA_SALIDA_CHARS = 1500;

/** Suelo del historial: por debajo, el turno pierde el hilo de la tarea. */
export const SUELO_HISTORIAL_CHARS = 1500;

/**
 * Cuántos caracteres le quedan al historial, descontando lo que YA está escrito.
 *
 * Se descuenta el sistema MEDIDO (no una estimación por herramienta): el bloque
 * real es el que viaja, y una estimación que se queda corta es exactamente el
 * defecto que esto cura.
 */
export function techoDeHistorial(opts: {
  /** `contextCharBudget` del perfil del modelo. */
  presupuesto: number;
  /** Caracteres del prompt de sistema ya ensamblado para este turno. */
  sistema: number;
  /** Caracteres reservados al resumen del historial descartado. */
  resumen?: number;
  /** Reserva de salida (por defecto `RESERVA_SALIDA_CHARS`). */
  salida?: number;
  /** Suelo del historial (por defecto `SUELO_HISTORIAL_CHARS`). */
  suelo?: number;
}): number {
  const presupuesto = Math.max(0, Math.round(Number(opts.presupuesto) || 0));
  const sistema = Math.max(0, Math.round(Number(opts.sistema) || 0));
  const resumen = Math.max(0, Math.round(Number(opts.resumen) || 0));
  const salida = Math.max(0, Math.round(Number(opts.salida ?? RESERVA_SALIDA_CHARS) || 0));
  const suelo = Math.max(0, Math.round(Number(opts.suelo ?? SUELO_HISTORIAL_CHARS) || 0));
  if (presupuesto <= 0) return suelo;
  return Math.max(suelo, presupuesto - sistema - resumen - salida);
}

/**
 * El veredicto legible: si el turno cabe, cuánto ocupa cada parte y —cuando no
 * cabe— el aviso con NÚMEROS. Un turno que el proveedor va a rechazar no puede
 * salir en silencio: el usuario ve «no contesta» y no hay una línea que lo explique.
 */
export function veredictoTecho(opts: {
  presupuesto: number;
  sistema: number;
  historial: number;
  esquemas?: number;
}): { total: number; cabe: boolean; sobra: number; aviso: string | null } {
  const total = Math.max(0, opts.sistema) + Math.max(0, opts.historial) + Math.max(0, opts.esquemas || 0);
  const presupuesto = Math.max(0, opts.presupuesto);
  if (presupuesto <= 0 || total <= presupuesto) return { total, cabe: true, sobra: presupuesto - total, aviso: null };
  const sobra = total - presupuesto;
  return {
    total,
    cabe: false,
    sobra,
    aviso:
      `[prompt] EL TURNO NO CABE: sistema ${opts.sistema} + historial ${Math.max(0, opts.historial)}` +
      (opts.esquemas ? ` + esquemas ${opts.esquemas}` : "") +
      ` = ${total} chars contra un presupuesto de ${presupuesto} (sobran ${sobra})`,
  };
}
