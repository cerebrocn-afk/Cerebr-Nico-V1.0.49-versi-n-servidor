/**
 * src/matrizVerificacion.ts — EJE 3 · MATRIZ DE VERIFICACIÓN CRUZADA
 * ============================================================================
 * Valida de forma estática que la obra escrita no sólo «compile» sino que
 * declare exportaciones coherentes antes de dar por buena una modificación.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export interface ReporteExportaciones {
  exportsCount: number;
  tieneExportValido: boolean;
}

/**
 * Cuenta las exportaciones nombradas (`export function/class/const/interface/type`)
 * y acepta tambi\u00e9n `export default`. Un archivo sin ninguna exportaci\u00f3n se
 * marca como inv\u00e1lido para que el cierre de tarea no lo d\u00e9 por bueno.
 */
export function verificarConsistenciaExportaciones(
  codigoArchivo: string,
): ReporteExportaciones {
  const exportMatches =
    codigoArchivo.match(
      /export\s+(function|class|const|interface|type)\s+([a-zA-Z0-9_]+)/g,
    ) || [];
  return {
    exportsCount: exportMatches.length,
    tieneExportValido:
      exportMatches.length > 0 || codigoArchivo.includes("export default"),
  };
}
