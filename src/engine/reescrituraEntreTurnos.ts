/**
 * src/engine/reescrituraEntreTurnos.ts — v1.61.0
 * ============================================================================
 * CONTADOR DE REESCRITURA IDÉNTICA ENTRE TURNOS (segunda línea de defensa)
 *
 * 🐞 El circuito de v1.60.17 corta al 3er rechazo PERO el contador se declara
 * DENTRO del handler del turno (server.ts:3349 y :10405), así que se reinicia
 * en cada turno. En el log real los 34 rechazos venían AGRUPADOS (líneas
 * 106-167, 182-239, 340-341): cada turno acumuló menos de 3, el corte nunca
 * llegó y el usuario encadenó turno tras turno sin avance.
 *
 * ESTO NO REEMPLAZA al circuito por turno: lo complementa. Ventana de
 * VENTANA_TURNOS turnos, INCLUYENDO el actual:
 *
 *   (a) TOTAL      → la suma de la ventana llega a TOPE_RECHAZOS_ENTRE_TURNOS.
 *   (b) PERSISTENCIA → VENTANA_TURNOS turnos seguidos con ≥1 rechazo cada uno.
 *
 * Un turno LIMPIO (0 rechazos) sale de la ventana al rotar y rompe la racha:
 * ese es el comportamiento que evita el falso positivo.
 *
 * MÓDULO PURO: sin red, sin fs, sin estado global. El estado lo pasa el
 * llamador. Tests: `tests/reescrituraEntreTurnos.test.ts`.
 */

/** Rechazos que se toleran en la ventana (incluido el turno actual). */
export const TOPE_RECHAZOS_ENTRE_TURNOS = 6;
/** Turnos seguidos con ≥1 rechazo que hacen corte. */
export const TOPE_TURNOS_PERSISTENTES = 3;
/** Tamaño de la ventana, INCLUYENDO el turno en curso. */
export const VENTANA_TURNOS = 3;

export interface VentanillaReescritura {
  /** Rechazos del turno EN CURSO. */
  enTurno: number;
  /** Rechazos por turno ya cerrado, el más nuevo al final. */
  historial: number[];
  /** Id del turno en curso. */
  turnoId: number;
  /** Total histórico de rechazos (telemetría, no decide). */
  total: number;
}

export function crearVentanilla(turnoId: number): VentanillaReescritura {
  return { enTurno: 0, historial: [], turnoId, total: 0 };
}

/**
 * Cierra el turno en curso y abre uno nuevo, AUNQUE no haya traído rechazos.
 * El handler debe llamarla AL ARRANCAR CADA TURNO: si solo se rotara al llegar
 * un rechazo, un turno limpio jamás entraría en el historial y los rechazos
 * viejos seguirían pesando.
 */
export function abrirTurno(v: VentanillaReescritura, turnoId: number): void {
  if (turnoId === v.turnoId) return;
  v.historial.push(v.enTurno);
  // La ventana incluye el turno actual, así que de cerrados se guardan los
  // últimos (VENTANA_TURNOS - 1).
  while (v.historial.length > VENTANA_TURNOS - 1) v.historial.shift();
  v.enTurno = 0;
  v.turnoId = turnoId;
}

export interface VeredictoVentanilla {
  cortar: boolean;
  motivo: string;
}

const SIN_CORTE: VeredictoVentanilla = { cortar: false, motivo: "" };

/** Evalúa la ventana SIN registrar nada (el handler puede llamarla al cerrar). */
export function evaluarVentanilla(v: VentanillaReescritura): VeredictoVentanilla {
  const cerrados = v.historial.slice(-(VENTANA_TURNOS - 1));
  const enVentana = cerrados.reduce((a, b) => a + b, 0) + v.enTurno;
  if (enVentana >= TOPE_RECHAZOS_ENTRE_TURNOS) {
    return { cortar: true, motivo: `lleva ${enVentana} reescrituras idénticas en ${cerrados.length + 1} turnos` };
  }
  if (v.enTurno > 0) {
    let racha = 1;
    for (let i = cerrados.length - 1; i >= 0; i--) {
      if (cerrados[i] > 0) racha++;
      else break;
    }
    if (racha >= TOPE_TURNOS_PERSISTENTES) {
      return { cortar: true, motivo: `reescribió lo mismo en ${racha} turnos seguidos` };
    }
  }
  return SIN_CORTE;
}

/** Registra un rechazo y evalúa la ventana. */
export function registrarRechazo(v: VentanillaReescritura, turnoId: number): VeredictoVentanilla {
  abrirTurno(v, turnoId);
  v.enTurno++;
  v.total++;
  return evaluarVentanilla(v);
}

/** Aviso honesto al usuario cuando corta por persistencia entre turnos. */
export function cierreEntreTurnos(motivo: string, rutas: string[]): string {
  const lista = Array.from(new Set((rutas || []).filter(Boolean))).slice(0, 5).join(", ");
  return (
    `\n\n⚠️ **Corté el turno: el modelo sigue reescribiendo lo mismo de un turno al otro** ` +
    `(${motivo}${lista ? `, archivos: ${lista}` : ""}). ` +
    `Repetir la misma escritura no arregla el error. Señalame EXACTO qué debe cambiar ` +
    `(el síntoma concreto) o cambiá a un modelo más capaz.`
  );
}

/* v1.70.0 — el eco de respuesta de chat entra por acá: la ventanilla es una sola. */
export { esEcoDeRespuesta, ultimoTextoAsistentePrevio, cierrePorEcoEntreTurnos, semejanzaDeRespuestas } from "./ecoRespuestas";
