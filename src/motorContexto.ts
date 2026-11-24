/**
 * src/motorContexto.ts — EJE 1 · CONTEXTO QUIRÚRGICO Y PRESUPUESTO DINÁMICO
 * ============================================================================
 * Mide de forma DETERMINISTA el peso de los archivos que van a entrar a la
 * ventana del modelo ANTES de armar el payload. Si se supera el límite de
 * seguridad, emite un aviso de recorte preventivo para mantener la ventana
 * limpia de ruido irrelevante.
 *
 * PURO: sin red, sin fs, sin estado global. Verificable con `npx tsx`.
 *
 * NOTA: distinto del motor de contexto L0–L5 de src/engine/motorContexto.ts
 * (v1.31.0); este es el guardia de presupuesto por caracteres del bucle.
 */

export interface ArchivoContexto {
  path: string;
  contenido: string;
}

export interface ReportePresupuesto {
  superaLimite: boolean;
  caracteresTotales: number;
  resumenRecorteContexto: string | null;
}

/**
 * Suma el peso en caracteres de los archivos inyectados y decide si se pasa del
 * techo preventivo. No muta la entrada.
 */
export function calcularPresupuestoContexto(
  archivos: ArchivoContexto[],
  limiteMaxChars: number = 15000,
): ReportePresupuesto {
  let caracteresTotales = 0;
  for (const archivo of archivos) {
    caracteresTotales += archivo.contenido.length;
  }

  if (caracteresTotales <= limiteMaxChars) {
    return {
      superaLimite: false,
      caracteresTotales,
      resumenRecorteContexto: null,
    };
  }

  return {
    superaLimite: true,
    caracteresTotales,
    resumenRecorteContexto:
      `[AVISO: Presupuesto de contexto excedido (${caracteresTotales}/${limiteMaxChars} chars). ` +
      `Se recomienda aislar s\u00edmbolos (firmas de function/class/interface) o acotar archivos.]`,
  };
}
