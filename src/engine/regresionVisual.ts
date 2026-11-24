/**
 * regresionVisual.ts — EL DIFF VISUAL QUE NO NECESITA OJOS (v1.38.0 · FASE 8)
 * =====================================================================================
 * QUÉ CURA: la hoja de ruta (§8) pide detectar regresión VISUAL antes/después.
 * El error a evitar: pedirle a un modelo de visión "¿se ve bien?" — nunca
 * termina, siempre "ve algo". Aquí la comparación es una MÉTRICA COMPUTABLE
 * sobre una HUELLA visual determinista (dimensiones del lienzo, cajas de
 * regiones y su hash de contenido), no un juicio estético.
 *
 * La huella (VisualFingerprint) la produce quien capture la pantalla (server);
 * este módulo es PURO: compara dos huellas y dictamina si algo se rompió:
 *   · el lienzo cambió de tamaño de forma anormal (≥ UMBRAL_LIENZO).
 *   · una región antes visible desapareció (regresión alta: contenido perdido).
 *   · una región cambió de hash y encogió mucho (posible corte de contenido).
 *   · se salió del lienzo (overflow) donde antes cabía.
 * Devuelve severidad y directiva. Sin visión, sin red, sin no-terminación.
 */

export interface RegionVisual {
  id: string;
  x: number; y: number; w: number; h: number;
  hash: string;         // hash del contenido renderizado de la región
  visible: boolean;
}

export interface VisualFingerprint {
  ancho: number;
  alto: number;
  regiones: RegionVisual[];
}

export type SeveridadVisual = "alta" | "media" | "baja";

export interface HallazgoVisual {
  regionId: string;
  clase: "region_desaparecida" | "contenido_cortado" | "lienzo_anormal" | "overflow" | "cambio";
  severidad: SeveridadVisual;
  detalle: string;
}

export interface ParteVisual {
  hayRegresion: boolean;
  alta: number; media: number; baja: number;
  hallazgos: HallazgoVisual[];
  directiva: string;
}

export const UMBRAL_LIENZO = 0.2;      // ±20% de cambio de tamaño = anormal
export const UMBRAL_ENCOGE = 0.35;     // ≥35% menos área = posible corte

function area(r: RegionVisual): number { return Math.max(0, r.w) * Math.max(0, r.h); }
function cabe(r: RegionVisual, ancho: number, alto: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= ancho && r.y + r.h <= alto;
}

/** Compara dos huellas visuales y devuelve los hallazgos con severidad. */
export function compararVisual(antes: VisualFingerprint, despues: VisualFingerprint): HallazgoVisual[] {
  const hallazgos: HallazgoVisual[] = [];
  const A = antes || { ancho: 0, alto: 0, regiones: [] };
  const D = despues || { ancho: 0, alto: 0, regiones: [] };

  // Lienzo anormal
  if (A.ancho > 0 && A.alto > 0) {
    const dW = Math.abs(D.ancho - A.ancho) / A.ancho;
    const dH = Math.abs(D.alto - A.alto) / A.alto;
    if (dW >= UMBRAL_LIENZO || dH >= UMBRAL_LIENZO)
      hallazgos.push({ regionId: "(lienzo)", clase: "lienzo_anormal", severidad: "media",
        detalle: `lienzo ${A.ancho}×${A.alto} → ${D.ancho}×${D.alto} (≥${Math.round(UMBRAL_LIENZO * 100)}%)` });
  }

  const mapaD = new Map(D.regiones.map((r) => [r.id, r]));
  for (const a of A.regiones) {
    const d = mapaD.get(a.id);
    if (a.visible && (!d || !d.visible)) {
      hallazgos.push({ regionId: a.id, clase: "region_desaparecida", severidad: "alta",
        detalle: `la región «${a.id}» estaba visible y ahora no` });
      continue;
    }
    if (!d) continue;
    if (a.hash !== d.hash) {
      const areaA = area(a), areaD = area(d);
      const encogio = areaA > 0 && (areaA - areaD) / areaA >= UMBRAL_ENCOGE;
      if (encogio)
        hallazgos.push({ regionId: a.id, clase: "contenido_cortado", severidad: "alta",
          detalle: `«${a.id}» cambió y encogió ≥${Math.round(UMBRAL_ENCOGE * 100)}% (${areaA}→${areaD})` });
      else
        hallazgos.push({ regionId: a.id, clase: "cambio", severidad: "baja",
          detalle: `«${a.id}» cambió de contenido` });
    }
    if (cabe(a, A.ancho, A.alto) && !cabe(d, D.ancho, D.alto))
      hallazgos.push({ regionId: a.id, clase: "overflow", severidad: "media",
        detalle: `«${a.id}» antes cabía y ahora se sale del lienzo` });
  }
  return hallazgos;
}

/** Resume los hallazgos por severidad y compone la directiva. */
export function parteVisual(hallazgos: HallazgoVisual[]): ParteVisual {
  const h = Array.isArray(hallazgos) ? hallazgos : [];
  const alta = h.filter((x) => x.severidad === "alta").length;
  const media = h.filter((x) => x.severidad === "media").length;
  const baja = h.filter((x) => x.severidad === "baja").length;
  const hayRegresion = alta > 0;
  const directiva = hayRegresion
    ? "REGRESIÓN VISUAL: " + h.filter((x) => x.severidad === "alta").map((x) => x.detalle).join("; ")
    : (h.length ? "cambios visuales menores, sin regresión alta" : "sin cambios visuales");
  return { hayRegresion, alta, media, baja, hallazgos: h, directiva };
}
