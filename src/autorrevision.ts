/**
 * src/autorrevision.ts — EJE 4 · AUTO-CORRECCIÓN LIMITADA Y CIERRE ATÓMICO
 * ============================================================================
 * Doble validación post-escritura con TOPE ESTRICTO (MAX_AUTORREVISION = 2): si
 * el archivo escrito trae bloques truncados o comentarios de relleno, el motor
 * bloquea el cierre e inyecta una directiva quirúrgica — pero nunca deriva en un
 * bucle infinito de pruebas.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export const MAX_AUTORREVISION = 2;

// v1.59.1 — Deteccion menos fragil: anclada a LINEA y a marcadores reales de
// relleno/omision, en vez de un includes() global que daba falsos positivos
// cuando "// ..." aparecia dentro de una cadena o URL legitima.
const MARCADORES_RELLENO: RegExp[] = [
  /^\s*\/\/\s*\.\.\.\s*$/, // linea que es solo "// ..."
  /^\s*\/\/\s*\.\.\.\s*(resto|rest|etc|igual|sin cambios|unchanged)/i,
  /^\s*\/\*\s*\.\.\.\s*(resto|rest)/i,
  /\.\.\.\s*(resto del (codigo|archivo|c\u00f3digo)|rest of (the )?(code|file))/i,
  /\b(TODO|FIXME)\s*:?\s*(implementar|completar|rellenar|implement|complete)/i,
  /(mantener|conservar|dejar)\s+(el\s+)?(resto|c\u00f3digo|codigo)\s+(igual|intacto|como est[a\u00e1])/i,
  /^\s*\/\/\s*(resto|rest)\s+(sin cambios|igual|unchanged)\s*$/i,
];

/** True si alguna LINEA del contenido es un marcador de relleno/omision. */
export function detectarTruncamiento(contenido: string): boolean {
  const lineas = contenido.split("\n");
  for (const linea of lineas) {
    for (const re of MARCADORES_RELLENO) {
      if (re.test(linea)) return true;
    }
  }
  return false;
}

export interface VeredictoAutorrevision {
  aprobado: boolean;
  directivaCorreccion: string | null;
}

/**
 * Decide si el contenido escrito est\u00e1 completo. Detecta rellenos t\u00edpicos
 * (`// ...`, `/* ... resto`, `TODO: implementar`). Al llegar al tope devuelve
 * un error cr\u00edtico en vez de pedir otra iteraci\u00f3n.
 */
export function evaluarIntegridadPostEscritura(
  contenido: string,
  intentoActual: number,
): VeredictoAutorrevision {
  const tieneTruncamiento = detectarTruncamiento(contenido);

  if (!tieneTruncamiento) {
    return { aprobado: true, directivaCorreccion: null };
  }

  if (intentoActual >= MAX_AUTORREVISION) {
    return {
      aprobado: false,
      directivaCorreccion:
        `[ERROR CR\u00cdTICO]: Se alcanz\u00f3 el l\u00edmite de autorrevisi\u00f3n ` +
        `(${MAX_AUTORREVISION}). El archivo contiene bloques truncados o pendientes.`,
    };
  }

  return {
    aprobado: false,
    directivaCorreccion:
      `[AUTORREVISI\u00d3N INTENTO ${intentoActual}/${MAX_AUTORREVISION}]: Se detect\u00f3 ` +
      `c\u00f3digo incompleto o comentarios de relleno. Rellena el bloque completo sin omitir l\u00edneas.`,
  };
}
