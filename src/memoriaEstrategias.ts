/**
 * src/memoriaEstrategias.ts — MEMORIA DE ESTRATEGIAS (Strategy Memory)
 * ============================================================================
 * Registra los enfoques lógicos que ya fallaron para que el modelo no reintente
 * callejones sin salida. Ante un enfoque ya descartado, inyecta una directiva
 * de exclusión estricta.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export interface RegistroIntentoFallido {
  enfoqueLogico: string;
  errorGenerado: string;
}

export interface VeredictoEstrategia {
  permitido: boolean;
  directivaExclusion: string | null;
}

/**
 * Si el enfoque propuesto coincide (sin distinguir may\u00fasculas) con uno ya
 * fallido, lo proh\u00edbe y explica por qu\u00e9.
 */
export function evaluarYFiltrarEstrategias(
  historialFallos: RegistroIntentoFallido[],
  nuevoEnfoquePropuesto: string,
): VeredictoEstrategia {
  const falloCoincidente = historialFallos.find(
    (f) =>
      f.enfoqueLogico.toLowerCase() === nuevoEnfoquePropuesto.toLowerCase(),
  );

  if (!falloCoincidente) {
    return { permitido: true, directivaExclusion: null };
  }

  return {
    permitido: false,
    directivaExclusion:
      `[DIRECTIVA DE EXCLUSI\u00d3N ESTRICTA]: El enfoque '${nuevoEnfoquePropuesto}' ya ` +
      `fue descartado previamente por generar el error: "${falloCoincidente.errorGenerado}". ` +
      `Utiliza un enfoque alternativo o una estrategia desacoplada.`,
  };
}
