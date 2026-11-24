/**
 * src/resumidorContexto.ts — VENTANA DINÁMICA Y COMPRESIÓN SEMÁNTICA
 * ============================================================================
 * Pila de resúmenes efímeros: cuando los caracteres acumulados superan el 75%
 * del umbral crítico, reemplaza el código histórico redundante por tarjetas de
 * metadatos funcionales (ej. [Módulo auth: exporta validarToken, hashPassword]).
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export interface BloqueContextoHistorico {
  modulo: string;
  resumenFuncional: string;
  caracteresOriginales: number;
}

export interface ResultadoCompresion {
  optimizado: boolean;
  contextoComprimido: string;
}

/**
 * Comprime el contexto hist\u00f3rico a tarjetas de metadatos cuando el uso supera
 * el 75% del umbral cr\u00edtico. Por debajo, no toca nada.
 */
export function comprimirContextoHistorico(
  bloques: BloqueContextoHistorico[],
  umbralCritico: number = 11250,
  caracteresActuales: number = 15000,
): ResultadoCompresion {
  const porcentajeUso = (caracteresActuales / umbralCritico) * 100;

  if (porcentajeUso < 75) {
    return {
      optimizado: false,
      contextoComprimido:
        "Contexto dentro de par\u00e1metros seguros. Sin compresi\u00f3n necesaria.",
    };
  }

  const resumenTarjetas = bloques
    .map((b) => `[M\u00f3dulo ${b.modulo}: ${b.resumenFuncional}]`)
    .join("\n");

  return {
    optimizado: true,
    contextoComprimido:
      `[COMPRESI\u00d3N SEM\u00c1NTICA ACTIVA (${porcentajeUso.toFixed(1)}% umbral)]:\n${resumenTarjetas}`,
  };
}
