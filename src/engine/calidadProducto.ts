/**
 * calidadProducto.ts — ¿ESTO ES UN PRODUCTO O UNA DEMO? (v1.38.0 · FASE 8)
 * =====================================================================================
 * QUÉ CURA: la hoja de ruta (§8) pide una barrera de "calidad de producto"
 * ANTES de declarar algo terminado. El defecto a evitar: entregar una demo
 * (funciona el camino feliz, nada más) llamándola producto. Aquí la calidad se
 * mide en TRES DIMENSIONES declaradas por la hoja de ruta, con puntaje 0–10
 * PONDERADO y un veredicto determinista:
 *   1) ROBUSTEZ      — estados de error/vacío/carga y validación de entradas.
 *   2) TERMINACIÓN   — sin TODO/FIXME/placeholder/"[Personaliza…]" ni mocks.
 *   3) EXPERIENCIA   — accesibilidad, feedback de interacción y responsive.
 *
 * Reusa la idea del auditor x10 de concienciaArtista (peso×déficit) pero acota
 * a las 3 dimensiones de la hoja de ruta. PURO: recibe señales medidas por
 * quien inspeccione el código, devuelve puntaje y directiva. No juzga estética.
 */

export type Dimension = "robustez" | "terminacion" | "experiencia";

export interface SenalCalidad {
  dimension: Dimension;
  id: string;
  cumplido: boolean;
  critico?: boolean;   // un crítico incumplido BLOQUEA la entrega
  detalle?: string;
}

export interface PuntajeDimension {
  dimension: Dimension;
  puntaje: number;      // 0–10
  cumplidas: number;
  total: number;
  faltantes: string[];
}

export interface VeredictoCalidad {
  puntaje: number;              // 0–10 ponderado
  aprobado: boolean;
  bloqueado: boolean;           // por un crítico incumplido
  porDimension: PuntajeDimension[];
  directiva: string;
}

/** Pesos de cada dimensión (suman 1). Terminación pesa más: es lo que separa demo de producto. */
export const PESOS: Record<Dimension, number> = { robustez: 0.35, terminacion: 0.4, experiencia: 0.25 };
export const UMBRAL_APROBADO = 7;
const DIMENSIONES: Dimension[] = ["robustez", "terminacion", "experiencia"];

function puntuarDimension(dim: Dimension, senales: SenalCalidad[]): PuntajeDimension {
  const propias = senales.filter((s) => s.dimension === dim);
  const total = propias.length;
  const cumplidas = propias.filter((s) => s.cumplido).length;
  const puntaje = total === 0 ? 0 : (cumplidas / total) * 10;
  const faltantes = propias.filter((s) => !s.cumplido).map((s) => s.id + (s.detalle ? `: ${s.detalle}` : ""));
  return { dimension: dim, puntaje: Math.round(puntaje * 10) / 10, cumplidas, total, faltantes };
}

/** Audita las 3 dimensiones y da un veredicto determinista y ponderado. */
export function auditarCalidad(senales: SenalCalidad[]): VeredictoCalidad {
  const lista = Array.isArray(senales) ? senales : [];
  const porDimension = DIMENSIONES.map((d) => puntuarDimension(d, lista));

  // Un crítico incumplido bloquea, sin importar el puntaje.
  const criticoRoto = lista.find((s) => s.critico && !s.cumplido);
  const bloqueado = !!criticoRoto;

  let puntaje = 0;
  for (const pd of porDimension) puntaje += pd.puntaje * PESOS[pd.dimension];
  puntaje = Math.round(puntaje * 10) / 10;

  const aprobado = !bloqueado && puntaje >= UMBRAL_APROBADO;

  let directiva: string;
  if (bloqueado) {
    directiva = `BLOQUEO: crítico incumplido «${criticoRoto!.id}»${criticoRoto!.detalle ? ` (${criticoRoto!.detalle})` : ""} — no se entrega.`;
  } else if (aprobado) {
    directiva = `Calidad de producto ${puntaje}/10: aprobado.`;
  } else {
    // Prioriza la dimensión con más déficit ponderado.
    const peor = [...porDimension].sort((a, b) => (10 - a.puntaje) * PESOS[a.dimension] < (10 - b.puntaje) * PESOS[b.dimension] ? 1 : -1)[0];
    directiva = `Calidad ${puntaje}/10 (<${UMBRAL_APROBADO}): prioriza ${peor.dimension} — falta ${peor.faltantes.join("; ") || "cobertura"}.`;
  }
  return { puntaje, aprobado, bloqueado, porDimension, directiva };
}
