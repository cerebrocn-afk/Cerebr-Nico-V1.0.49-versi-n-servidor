/**
 * src/auditoriaBucle.ts — EJE 2 · CORTAFUEGOS DE ESTANCAMIENTO (Stuck-Tool Guard)
 * ============================================================================
 * Matriz de trazabilidad EFÍMERA de los últimos ciclos del bucle: qué
 * herramienta se invocó y con qué argumentos (hash). Si el agente repite la
 * MISMA herramienta de lectura/búsqueda N veces seguidas sin alterar el estado,
 * se detecta el estancamiento para forzar un cambio de estrategia.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

export interface InvocacionHerramienta {
  toolName: string;
  argsHash: string;
}

/**
 * `true` cuando las últimas `umbralMaximo` invocaciones son la misma herramienta
 * con el mismo hash de argumentos — el modelo no avanza, hay que romper el bucle.
 */
export function detectarEstancamiento(
  historialTurnos: InvocacionHerramienta[],
  umbralMaximo: number = 3,
): boolean {
  if (historialTurnos.length < umbralMaximo) return false;

  const ultimas = historialTurnos.slice(-umbralMaximo);
  const primeraTool = ultimas[0].toolName;
  const primerHash = ultimas[0].argsHash;

  return ultimas.every(
    (t) => t.toolName === primeraTool && t.argsHash === primerHash,
  );
}

/**
 * Pista correctiva que se inyecta al modelo cuando se detecta el bloqueo, para
 * obligarlo a cambiar de enfoque en vez de reintentar lo mismo.
 */
export function directivaRomperBucle(toolName: string): string {
  return (
    `[CORTAFUEGOS DE ESTANCAMIENTO]: Se repiti\u00f3 '${toolName}' con los mismos ` +
    `argumentos sin cambiar el estado del c\u00f3digo. Cambia de estrategia: revisa ` +
    `dependencias, reestructura el enfoque o pasa a escribir en vez de volver a leer.`
  );
}

// ---------------------------------------------------------------------------
// v1.59.1 — Detección menos frágil: además de la repetición EXACTA consecutiva,
// cubrimos dos patrones reales de no-progreso que la versión anterior no veía:
//  (a) CICLO alterno A-B-A-B (el modelo rebota entre dos lecturas sin escribir),
//  (b) SATURACIÓN: la misma lectura domina las últimas N invocaciones sin que
//      aparezca ninguna escritura intermedia.
// ---------------------------------------------------------------------------

export type MotivoBucle = "repeticion-exacta" | "ciclo-alterno" | "saturacion" | null;

export interface DiagnosticoBucle {
  estancado: boolean;
  motivo: MotivoBucle;
  toolName: string | null;
}

/** Herramientas que SOLO leen/consultan: repetirlas no cambia el estado. */
const HERRAMIENTAS_LECTURA = new Set([
  "read_file",
  "list_files",
  "list_dir",
  "search",
  "grep",
  "find",
  "get_diagnostics",
]);

function clave(i: InvocacionHerramienta): string {
  return `${i.toolName}\u2502${i.argsHash}`;
}

/**
 * Diagnóstico unificado del bucle. Combina los tres patrones y devuelve el
 * primero que dispare, con el motivo (telemetría) y la herramienta culpable.
 */
export function diagnosticarBucle(
  historialTurnos: InvocacionHerramienta[],
  umbralMaximo: number = 3,
): DiagnosticoBucle {
  // (0) Repetición exacta consecutiva — compat con detectarEstancamiento.
  if (detectarEstancamiento(historialTurnos, umbralMaximo)) {
    return {
      estancado: true,
      motivo: "repeticion-exacta",
      toolName: historialTurnos[historialTurnos.length - 1].toolName,
    };
  }

  // (a) Ciclo alterno A-B-A-B sobre las últimas 4 invocaciones.
  if (historialTurnos.length >= 4) {
    const [a, b, c, d] = historialTurnos.slice(-4);
    if (clave(a) === clave(c) && clave(b) === clave(d) && clave(a) !== clave(b)) {
      return { estancado: true, motivo: "ciclo-alterno", toolName: d.toolName };
    }
  }

  // (b) Saturación por lectura: en la ventana reciente NO hubo escritura y una
  //     herramienta de lectura ocupa >= umbralMaximo huecos.
  const ventana = historialTurnos.slice(-Math.max(umbralMaximo + 1, 4));
  if (ventana.length >= umbralMaximo + 1) {
    const huboEscritura = ventana.some((t) => !HERRAMIENTAS_LECTURA.has(t.toolName));
    if (!huboEscritura) {
      const cuenta = new Map<string, number>();
      for (const t of ventana) {
        if (HERRAMIENTAS_LECTURA.has(t.toolName)) {
          cuenta.set(t.toolName, (cuenta.get(t.toolName) || 0) + 1);
        }
      }
      for (const [tool, n] of cuenta) {
        if (n >= umbralMaximo) {
          return { estancado: true, motivo: "saturacion", toolName: tool };
        }
      }
    }
  }

  return { estancado: false, motivo: null, toolName: null };
}
