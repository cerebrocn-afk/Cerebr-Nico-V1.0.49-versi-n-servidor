/**
 * capaTransaccion.ts — EXPERIMENTAR SIN DESTRUIR EL PROYECTO (v1.35.0 · FASE 5)
 * =====================================================================================
 * QUÉ ES: el Transaction Layer de la hoja de ruta (§23). Cada tanda de cambios
 * es una transacción: BEGIN → snapshot → modificaciones → tests → audit →
 * COMMIT; si algo falla, ROLLBACK. Así el agente puede probar un enfoque y, si
 * no cierra, volver al estado sano — el peldaño 2 de la escalera («recuperar
 * snapshot → deshacer → nuevo enfoque») tiene aquí su mecánica.
 *
 * PUREZA: la transacción trabaja sobre un MAPA de contenidos (ruta→texto) que
 * le entrega quien llama — no toca disco. Guarda el snapshot al abrir, aplica
 * parches en memoria, y en rollback restaura EXACTAMENTE lo capturado. El que
 * persiste a disco es el monolito (server.ts) usando el resultado; esta capa
 * decide QUÉ estado es el bueno. Se combina con quirofano/.revisiones que ya
 * hacen snapshots reales, pero no los reimplementa: modela la semántica.
 */

export type Instantanea = Map<string, string>;

export interface Parche {
  ruta: string;
  /** Nuevo contenido; `null` = borrar el archivo. */
  contenido: string | null;
}

export type EstadoTx = "abierta" | "confirmada" | "revertida";

export interface Transaccion {
  id: string;
  estado: EstadoTx;
  /** El estado sano capturado al BEGIN (solo de las rutas tocadas). */
  snapshot: Instantanea;
  /** Rutas que la transacción tocó (para saber qué restaurar). */
  tocadas: Set<string>;
  /** Evidencia de tests/audit acumulada (para el COMMIT informado). */
  evidencia: string[];
}

let secuencia = 0;

/**
 * BEGIN: abre una transacción sobre `mundo` (el mapa vivo de contenidos). No
 * copia todo el proyecto: captura bajo demanda al aplicar cada parche (lazy),
 * así el snapshot pesa lo que la tanda toca, no el repo entero.
 */
export function iniciar(): Transaccion {
  return { id: `tx${++secuencia}`, estado: "abierta", snapshot: new Map(), tocadas: new Set(), evidencia: [] };
}

/**
 * Aplica un parche sobre `mundo`, capturando ANTES el estado previo de esa ruta
 * (una sola vez) para poder revertir. Devuelve el `mundo` mutado (mismo objeto).
 */
export function aplicar(tx: Transaccion, mundo: Map<string, string>, parche: Parche): Map<string, string> {
  if (tx.estado !== "abierta") throw new Error(`transacción ${tx.id} ya ${tx.estado}: no admite parches`);
  const { ruta, contenido } = parche;
  if (!tx.snapshot.has(ruta)) {
    // Captura el estado sano una vez. Sentinela para «no existía».
    tx.snapshot.set(ruta, mundo.has(ruta) ? mundo.get(ruta)! : NO_EXISTIA);
  }
  tx.tocadas.add(ruta);
  if (contenido === null) mundo.delete(ruta);
  else mundo.set(ruta, contenido);
  return mundo;
}

/** Sentinela interno: la ruta no existía al abrir la transacción. */
const NO_EXISTIA = "\u0000__NO_EXISTIA__\u0000";

/** Adjunta evidencia (salida de tests/audit) para un COMMIT informado (§23). */
export function anotarEvidencia(tx: Transaccion, texto: string): void {
  if (texto && texto.trim()) tx.evidencia.push(texto.trim().slice(0, 300));
}

/**
 * COMMIT: confirma la tanda. Solo procede si `ok` es true (tests+audit verdes).
 * Devuelve si confirmó; si `ok` es false NO confirma (obliga a rollback o retry).
 */
export function confirmar(tx: Transaccion, ok: boolean): boolean {
  if (tx.estado !== "abierta") return false;
  if (!ok) return false;
  tx.estado = "confirmada";
  return true;
}

/**
 * ROLLBACK: restaura `mundo` al snapshot capturado. Deja el proyecto EXACTO como
 * estaba al BEGIN en las rutas tocadas (recrea, sobrescribe o borra según toque).
 */
export function revertir(tx: Transaccion, mundo: Map<string, string>): Map<string, string> {
  if (tx.estado === "confirmada") throw new Error(`transacción ${tx.id} ya confirmada: no se revierte`);
  for (const ruta of tx.tocadas) {
    const previo = tx.snapshot.get(ruta);
    if (previo === undefined || previo === NO_EXISTIA) mundo.delete(ruta);
    else mundo.set(ruta, previo);
  }
  tx.estado = "revertida";
  return mundo;
}

/** El parte de la transacción para el acta. */
export function transaccionAParte(tx: Transaccion): string {
  return `${tx.id} [${tx.estado}] ${tx.tocadas.size} rutas · ${tx.evidencia.length} evidencias`;
}
