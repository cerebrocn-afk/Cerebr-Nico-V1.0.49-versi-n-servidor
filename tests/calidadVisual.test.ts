/**
 * tests/calidadVisual.test.ts — REGRESIÓN VISUAL + CALIDAD DE PRODUCTO (v1.38.0 · FASE 8)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/calidadVisual.test.ts
 *
 * Hoja de ruta §8: diff visual por métrica computable (cero visión) y barrera
 * de calidad de producto en 3 dimensiones con veredicto ponderado y bloqueo.
 */
import {
  compararVisual, parteVisual, UMBRAL_LIENZO, UMBRAL_ENCOGE,
  type VisualFingerprint,
} from "../src/engine/regresionVisual";
import {
  auditarCalidad, PESOS, UMBRAL_APROBADO, type SenalCalidad,
} from "../src/engine/calidadProducto";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. Regresión visual: región desaparecida = alta");
{
  const antes: VisualFingerprint = { ancho: 1000, alto: 800, regiones: [
    { id: "header", x: 0, y: 0, w: 1000, h: 80, hash: "h1", visible: true },
    { id: "main", x: 0, y: 80, w: 1000, h: 600, hash: "m1", visible: true },
  ]};
  const despues: VisualFingerprint = { ancho: 1000, alto: 800, regiones: [
    { id: "header", x: 0, y: 0, w: 1000, h: 80, hash: "h1", visible: true },
    { id: "main", x: 0, y: 80, w: 1000, h: 600, hash: "m1", visible: false },
  ]};
  const hs = compararVisual(antes, despues);
  const p = parteVisual(hs);
  comprobar("detecta región desaparecida", hs.some((x) => x.clase === "region_desaparecida" && x.regionId === "main"));
  comprobar("hay regresión alta", p.hayRegresion && p.alta >= 1);
  comprobar("la directiva enumera lo roto", p.directiva.includes("main"));
}

seccion("2. Contenido cortado, lienzo anormal y overflow");
{
  const antes: VisualFingerprint = { ancho: 1000, alto: 800, regiones: [
    { id: "card", x: 10, y: 10, w: 400, h: 400, hash: "c1", visible: true },
  ]};
  const despues: VisualFingerprint = { ancho: 1400, alto: 800, regiones: [
    { id: "card", x: 10, y: 10, w: 400, h: 100, hash: "c2", visible: true },  // encogió mucho + cambió
  ]};
  const hs = compararVisual(antes, despues);
  comprobar("detecta contenido cortado (encoge ≥" + Math.round(UMBRAL_ENCOGE*100) + "%)", hs.some((x) => x.clase === "contenido_cortado"));
  comprobar("detecta lienzo anormal (≥" + Math.round(UMBRAL_LIENZO*100) + "%)", hs.some((x) => x.clase === "lienzo_anormal"));
}
{
  const antes: VisualFingerprint = { ancho: 1000, alto: 800, regiones: [
    { id: "box", x: 0, y: 0, w: 900, h: 700, hash: "b1", visible: true },
  ]};
  const despues: VisualFingerprint = { ancho: 1000, alto: 800, regiones: [
    { id: "box", x: 200, y: 200, w: 900, h: 700, hash: "b1", visible: true },  // se sale
  ]};
  const hs = compararVisual(antes, despues);
  comprobar("detecta overflow (antes cabía, ahora no)", hs.some((x) => x.clase === "overflow"));
}

seccion("3. Sin cambios dañinos: no hay regresión");
{
  const fp: VisualFingerprint = { ancho: 1000, alto: 800, regiones: [
    { id: "a", x: 0, y: 0, w: 100, h: 100, hash: "x", visible: true },
  ]};
  const p = parteVisual(compararVisual(fp, fp));
  comprobar("huella idéntica = sin regresión", !p.hayRegresion && p.alta === 0);
}

seccion("4. Calidad de producto: veredicto ponderado y bloqueo");
{
  comprobar("los pesos suman 1", Math.abs(PESOS.robustez + PESOS.terminacion + PESOS.experiencia - 1) < 1e-9);

  const buenas: SenalCalidad[] = [
    { dimension: "robustez", id: "errores", cumplido: true },
    { dimension: "robustez", id: "vacio", cumplido: true },
    { dimension: "terminacion", id: "sin_todo", cumplido: true },
    { dimension: "terminacion", id: "sin_placeholder", cumplido: true },
    { dimension: "experiencia", id: "a11y", cumplido: true },
    { dimension: "experiencia", id: "responsive", cumplido: true },
  ];
  const vb = auditarCalidad(buenas);
  comprobar("todo cumplido → 10/10 y aprobado", vb.puntaje === 10 && vb.aprobado && !vb.bloqueado);

  const flojas: SenalCalidad[] = [
    { dimension: "robustez", id: "errores", cumplido: false, detalle: "sin estado de error" },
    { dimension: "robustez", id: "vacio", cumplido: false },
    { dimension: "terminacion", id: "sin_todo", cumplido: false, detalle: "hay TODO" },
    { dimension: "terminacion", id: "sin_placeholder", cumplido: true },
    { dimension: "experiencia", id: "a11y", cumplido: true },
  ];
  const vf = auditarCalidad(flojas);
  comprobar("puntaje bajo → no aprobado", !vf.aprobado && vf.puntaje < UMBRAL_APROBADO);
  comprobar("la directiva prioriza una dimensión", /prioriza (robustez|terminacion|experiencia)/.test(vf.directiva));

  const conCritico: SenalCalidad[] = [
    { dimension: "terminacion", id: "secreto_hardcodeado", cumplido: false, critico: true, detalle: "API key en código" },
    { dimension: "robustez", id: "errores", cumplido: true },
    { dimension: "robustez", id: "vacio", cumplido: true },
    { dimension: "experiencia", id: "a11y", cumplido: true },
  ];
  const vc = auditarCalidad(conCritico);
  comprobar("un crítico incumplido BLOQUEA aunque el puntaje sea alto", vc.bloqueado && !vc.aprobado);
  comprobar("el bloqueo nombra el crítico", vc.directiva.includes("secreto_hardcodeado"));
}

console.log("\n" + "\u2500".repeat(58));
console.log(`\u2550\u2550\u2550 VISUAL + CALIDAD: ${correctas} correctas \u00b7 ${fallos.length} ${fallos.length === 1 ? "FALLIDA" : "fallidas"} \u2550\u2550\u2550`);
if (fallos.length) { fallos.forEach((f) => console.log("  \u2717 " + f)); process.exit(1); }
