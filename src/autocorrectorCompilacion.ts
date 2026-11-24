/**
 * src/autocorrectorCompilacion.ts — SELF-HEALING COMPILER LOOP
 * ============================================================================
 * Intercepta la salida del compilador (tsc / build), extrae de forma
 * DETERMINISTA archivo+línea+mensaje del primer error TypeScript y lo convierte
 * en un parche directivo prioritario para el próximo turno de escritura.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export interface ErrorCompilacion {
  archivo: string;
  linea: number;
  mensaje: string;
}

/**
 * Parsea un error tipo `src/main.ts(12,5): error TS2322: ...`. Devuelve null si
 * la salida no contiene un error reconocible.
 */
export function parsearYConstruirParcheCompiler(
  outputConsola: string,
): ErrorCompilacion | null {
  const match = outputConsola.match(
    /([a-zA-Z0-9_\/.-]+\.ts)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/,
  );

  if (!match) return null;

  return {
    archivo: match[1],
    linea: parseInt(match[2], 10),
    mensaje: `[ERROR ${match[3]}]: ${match[4].trim()}`,
  };
}

/** Redacta la directiva que vuelve al modelo como parche prioritario. */
export function generarDirectivaCorreccion(error: ErrorCompilacion): string {
  return (
    `[PARCHE DIRECTIVO PRIORITARIO DE COMPILACI\u00d3N]: Corregir en el archivo ` +
    `'${error.archivo}' (L\u00ednea ${error.linea}): ${error.mensaje}`
  );
}

// ---------------------------------------------------------------------------
// v1.59.1 — Multi-error: un build real escupe DECENAS de errores a la vez.
// Corregir s\u00f3lo el primero obliga a tantas vueltas como errores haya. Aqu\u00ed
// extraemos TODOS, deduplicamos por archivo+l\u00ednea+c\u00f3digo y los agrupamos
// por archivo para un \u00fanico parche directivo de alta se\u00f1al.
// ---------------------------------------------------------------------------

const RE_ERROR_GLOBAL =
  /([a-zA-Z0-9_\/.-]+\.tsx?)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/g;

/** Extrae todos los errores TS del output (dedup por archivo+l\u00ednea+c\u00f3digo). */
export function parsearTodosLosErrores(outputConsola: string): ErrorCompilacion[] {
  const vistos = new Set<string>();
  const errores: ErrorCompilacion[] = [];
  for (const m of outputConsola.matchAll(RE_ERROR_GLOBAL)) {
    const firma = `${m[1]}:${m[2]}:${m[3]}`;
    if (vistos.has(firma)) continue;
    vistos.add(firma);
    errores.push({
      archivo: m[1],
      linea: parseInt(m[2], 10),
      mensaje: `[ERROR ${m[3]}]: ${m[4].trim()}`,
    });
  }
  return errores;
}

/**
 * Directiva \u00fanica para MUCHOS errores, agrupados por archivo. Limita a `tope`
 * errores para no saturar el contexto; indica cu\u00e1ntos quedan fuera.
 */
export function generarDirectivaMultiError(
  errores: ErrorCompilacion[],
  tope: number = 12,
): string | null {
  if (errores.length === 0) return null;
  if (errores.length === 1) return generarDirectivaCorreccion(errores[0]);

  const mostrados = errores.slice(0, tope);
  const porArchivo = new Map<string, ErrorCompilacion[]>();
  for (const e of mostrados) {
    const arr = porArchivo.get(e.archivo) || [];
    arr.push(e);
    porArchivo.set(e.archivo, arr);
  }

  const bloques: string[] = [];
  for (const [archivo, lista] of porArchivo) {
    const detalle = lista
      .map((e) => `  - L\u00ednea ${e.linea}: ${e.mensaje}`)
      .join("\n");
    bloques.push(`\u2022 ${archivo}\n${detalle}`);
  }

  const restantes = errores.length - mostrados.length;
  const nota = restantes > 0 ? `\n(\u2026 y ${restantes} error(es) m\u00e1s)` : "";

  return (
    `[PARCHE DIRECTIVO PRIORITARIO DE COMPILACI\u00d3N \u2014 ${errores.length} errores]: ` +
    `corrige TODOS antes de cerrar:\n${bloques.join("\n")}${nota}`
  );
}
