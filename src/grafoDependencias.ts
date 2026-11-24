/**
 * src/grafoDependencias.ts — GRAFO DE DEPENDENCIAS CRUZADAS
 * ============================================================================
 * Analiza imports/exports para detectar que una modificación de firma rompa
 * referencias ocultas en el resto del proyecto. Si se pierde una exportación
 * que otros consumen, emite una alerta de incompatibilidad y nombra a los
 * archivos consumidores afectados ANTES de permitir el cierre.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export interface ConsumidorModulo {
  path: string;
  imports: string[];
}

export interface NodoModulo {
  path: string;
  exportaciones: string[];
  importacionesConsumidores: ConsumidorModulo[];
}

export interface ReporteGrafo {
  cambiosRotos: boolean;
  reporteIncompatibilidad: string | null;
}

/**
 * Compara las exportaciones previas del nodo con la nueva firma. Si desaparece
 * alguna que un consumidor importaba por nombre, lo reporta.
 */
export function validarConsistenciaGrafo(
  nodoModificado: NodoModulo,
  nuevaFirmaExportada: string[],
): ReporteGrafo {
  const exportacionesPerdidas = nodoModificado.exportaciones.filter(
    (exp) => !nuevaFirmaExportada.includes(exp),
  );

  if (exportacionesPerdidas.length === 0) {
    return { cambiosRotos: false, reporteIncompatibilidad: null };
  }

  const consumidoresAfectados = nodoModificado.importacionesConsumidores
    .filter((c) => c.imports.some((imp) => exportacionesPerdidas.includes(imp)))
    .map((c) => c.path);

  return {
    cambiosRotos: true,
    reporteIncompatibilidad:
      `[ALERTA GRAFO DEPENDENCIAS]: Las exportaciones ${exportacionesPerdidas.join(", ")} ` +
      `fueron alteradas/eliminadas. Archivos consumidores afectados y pendientes de ` +
      `actualizaci\u00f3n: ${consumidoresAfectados.join(", ")}`,
  };
}

// ---------------------------------------------------------------------------
// v1.59.1 — CONSTRUCTOR: antes el NodoModulo habia que armarlo a mano, lo que
// hacia inusable el grafo en el bucle real. Aqui lo derivamos de las fuentes:
// las exportaciones salen del analizador de firmas y los consumidores de un
// barrido de imports por nombre. Sigue siendo PURO (recibe las fuentes ya
// leidas; no toca el fs).
// ---------------------------------------------------------------------------

import { extraerFirmas } from "./extraerFirmas";

export interface FuenteModulo {
  path: string;
  contenido: string;
}

/** Nombres exportados de un archivo (reusa el analizador de firmas del Eje 1). */
export function exportacionesDe(contenido: string): string[] {
  return extraerFirmas(contenido)
    .filter((f) => f.tipo !== "default")
    .map((f) => f.nombre);
}

/** Nombres importados por un archivo desde CUALQUIER modulo (import { a, b }). */
export function importacionesDe(contenido: string): string[] {
  const nombres: string[] = [];
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from/g;
  for (const m of contenido.matchAll(re)) {
    for (const parte of m[1].split(",")) {
      const limpio = parte.trim().split(/\s+as\s+/)[0].trim();
      if (limpio) nombres.push(limpio);
    }
  }
  return nombres;
}

/**
 * Arma el NodoModulo del archivo objetivo a partir del conjunto de fuentes del
 * proyecto: exportaciones propias + lista de consumidores (los que importan
 * algun simbolo). Listo para pasar a validarConsistenciaGrafo.
 */
export function construirNodoDesdeFuentes(
  pathObjetivo: string,
  fuentes: FuenteModulo[],
): NodoModulo {
  const objetivo = fuentes.find((f) => f.path === pathObjetivo);
  const exportaciones = objetivo ? exportacionesDe(objetivo.contenido) : [];

  const importacionesConsumidores: ConsumidorModulo[] = [];
  for (const f of fuentes) {
    if (f.path === pathObjetivo) continue;
    const imports = importacionesDe(f.contenido).filter((imp) =>
      exportaciones.includes(imp),
    );
    if (imports.length > 0) {
      importacionesConsumidores.push({ path: f.path, imports });
    }
  }

  return { path: pathObjetivo, exportaciones, importacionesConsumidores };
}
