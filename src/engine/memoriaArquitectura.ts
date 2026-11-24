/**
 * memoriaArquitectura.ts — EL PORQUÉ DE LAS DECISIONES (v1.40.0 · FASE 10)
 * =====================================================================================
 * QUÉ CURA: la hoja de ruta (§10 · Memory 3.0) pide que el sistema RECUERDE por
 * qué tomó una decisión de diseño, para no volver a debatir lo ya resuelto ni
 * contradecirse en el siguiente turno. El defecto a evitar: un agente que en la
 * tarea 3 elige Postgres y en la tarea 8 mete SQLite «porque sí», olvidando el
 * porqué. Aquí la mecánica es un libro de ADR (Architecture Decision Records):
 *   · cada decisión se registra con contexto, opción elegida, alternativas y
 *     consecuencias, con estado aceptada|reemplazada.
 *   · al proponer algo que CONTRADICE una decisión aceptada, el libro lo delata
 *     ANTES de escribir código (conflictoCon).
 *   · reemplazar una decisión es explícito (supersede): deja rastro, no borra.
 * PURO: recibe y devuelve datos; el estado vive en un objeto Libro pasado por
 * el llamador. Sin disco, sin red.
 */

export type EstadoADR = "aceptada" | "reemplazada";

export interface ADR {
  id: number;
  tema: string;              // p. ej. "base de datos", "framework frontend"
  decision: string;          // lo elegido: "PostgreSQL"
  contexto: string;          // por qué se decidió
  alternativas: string[];    // lo descartado
  consecuencias: string;
  estado: EstadoADR;
  reemplazaA?: number;       // id del ADR que deja obsoleto
  ts: number;
}

export interface LibroADR {
  registros: ADR[];
  siguienteId: number;
}

export function libroVacio(): LibroADR {
  return { registros: [], siguienteId: 1 };
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

/** Registra una decisión nueva. Devuelve el ADR creado (y muta el libro). */
export function registrarDecision(
  libro: LibroADR,
  d: { tema: string; decision: string; contexto?: string; alternativas?: string[]; consecuencias?: string; ts?: number },
): ADR {
  const adr: ADR = {
    id: libro.siguienteId++,
    tema: d.tema,
    decision: d.decision,
    contexto: d.contexto || "",
    alternativas: Array.isArray(d.alternativas) ? d.alternativas.slice() : [],
    consecuencias: d.consecuencias || "",
    estado: "aceptada",
    ts: typeof d.ts === "number" ? d.ts : 0,
  };
  libro.registros.push(adr);
  return adr;
}

/** La decisión ACEPTADA vigente sobre un tema (la última que sigue en pie). */
export function decisionVigente(libro: LibroADR, tema: string): ADR | null {
  const t = norm(tema);
  const vivas = libro.registros.filter((r) => norm(r.tema) === t && r.estado === "aceptada");
  return vivas.length ? vivas[vivas.length - 1] : null;
}

/**
 * ¿La propuesta CONTRADICE una decisión vigente? Hay conflicto si existe una
 * decisión aceptada sobre el MISMO tema cuya elección es distinta a la propuesta.
 */
export function conflictoCon(libro: LibroADR, tema: string, propuesta: string): ADR | null {
  const vig = decisionVigente(libro, tema);
  if (!vig) return null;
  return norm(vig.decision) === norm(propuesta) ? null : vig;
}

/**
 * Reemplaza una decisión vigente por una nueva (supersede). El viejo ADR pasa a
 * "reemplazada" y el nuevo apunta a él. Devuelve el ADR nuevo, o null si no
 * había nada que reemplazar.
 */
export function reemplazarDecision(
  libro: LibroADR,
  tema: string,
  d: { decision: string; contexto?: string; alternativas?: string[]; consecuencias?: string; ts?: number },
): ADR | null {
  const vig = decisionVigente(libro, tema);
  if (!vig) return null;
  vig.estado = "reemplazada";
  const nuevo = registrarDecision(libro, { tema, ...d });
  nuevo.reemplazaA = vig.id;
  return nuevo;
}

/** Parte legible del libro: qué está decidido hoy. */
export function parteADR(libro: LibroADR): string {
  const vivas = libro.registros.filter((r) => r.estado === "aceptada");
  if (!vivas.length) return "Sin decisiones de arquitectura registradas.";
  return "Decisiones vigentes:\n" + vivas.map((r) => `  · [${r.tema}] ${r.decision}${r.contexto ? ` — ${r.contexto}` : ""}`).join("\n");
}
