/**
 * guardianRegresion.ts — MODIFICAR SIN ROMPER LO QUE FUNCIONABA (v1.36.0 · FASE 6)
 * =====================================================================================
 * QUÉ ES: el Regression Guardian de la hoja de ruta (§9). La auditoría de
 * preservación actual ya vigila el ARCHIVO individual (exports que se van,
 * funciones que faltan, reducción ≥35%, truncamientos, vaciado). La ruta pide
 * llevar eso al PROYECTO COMPLETO: comparar ANTES↔DESPUÉS y denunciar lo que
 * desapareció o cambió de contrato en TODO el árbol, no en un archivo.
 *
 * QUÉ DETECTA (la lista del §9):
 *   · exports desaparecidos      · archivos eliminados
 *   · rutas/endpoints que ya no se sirven   · componentes eliminados
 *   · APIs con contrato cambiado · tests que existían y se fueron
 *   · reducción anormal de código (≥35%) · archivos vaciados
 *   · dependencias nuevas (para avisar, no para prohibir)
 *
 * FUENTE ÚNICA: los exports y endpoints salen de grafoRico (no se reimplementan);
 * el 35% es el mismo umbral de la casa. PURO: recibe dos snapshots {path,content}
 * y devuelve un veredicto. Un cambio VOLUNTARIO no es un fallo: el guardián
 * REPORTA regresiones para que el motor decida (o el contrato de aceptación las
 * absuelva con evidencia); no revierte por su cuenta.
 */

import { normalizarRutaImport, type CheckFile } from "./importChecker";
import { exportsDe, endpointsServidos } from "./grafoRico";

/** Umbral de reducción que la casa considera sospechoso (auditoría de preservación). */
export const UMBRAL_REDUCCION = 0.35;

export type SeveridadRegresion = "alta" | "media" | "baja";

export interface Hallazgo {
  tipo:
    | "archivo_eliminado" | "archivo_vaciado" | "reduccion_anormal"
    | "export_desaparecido" | "endpoint_desaparecido" | "contrato_cambiado"
    | "test_desaparecido" | "componente_eliminado" | "dependencia_nueva";
  ruta: string;
  detalle: string;
  severidad: SeveridadRegresion;
}

export interface VeredictoRegresion {
  /** true si hay algo de severidad alta (rompió contrato público). */
  regresion: boolean;
  hallazgos: Hallazgo[];
  resumen: { alta: number; media: number; baja: number };
}

function indexar(files: CheckFile[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of files) m.set(normalizarRutaImport(f.path), f.content ?? "");
  return m;
}

const esTest = (r: string) => /\.(test|spec)\.[tj]sx?$|(^|\/)tests?\//i.test(r);
const esComponente = (r: string) => /\.(tsx|jsx|vue|svelte)$/i.test(r);
const noVacio = (s: string) => s.replace(/\s+/g, "").length;

/** Extrae dependencias declaradas de un package.json (tolerante a JSON roto). */
function depsDePackage(contenido: string): Set<string> {
  try {
    const j = JSON.parse(contenido || "{}");
    return new Set([...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})]);
  } catch { return new Set(); }
}

// ═════════════════════════════════════════════════════════════════
// LA COMPARACIÓN PROYECTO COMPLETO
// ═════════════════════════════════════════════════════════════════

/**
 * Compara dos snapshots del proyecto. `antes` es el estado que funcionaba;
 * `despues` es el resultado de la tanda. Devuelve los hallazgos ordenados por
 * severidad (alta primero).
 */
export function compararProyecto(antes: CheckFile[], despues: CheckFile[]): VeredictoRegresion {
  const A = indexar(antes);
  const D = indexar(despues);
  const hallazgos: Hallazgo[] = [];

  for (const [ruta, contenidoA] of A) {
    const contenidoD = D.get(ruta);

    // 1. Archivo eliminado (componente/test tienen su propio tipo, más legible).
    if (contenidoD === undefined) {
      if (esTest(ruta)) hallazgos.push({ tipo: "test_desaparecido", ruta, detalle: "un test que existía ya no está", severidad: "alta" });
      else if (esComponente(ruta)) hallazgos.push({ tipo: "componente_eliminado", ruta, detalle: "componente eliminado", severidad: "alta" });
      else hallazgos.push({ tipo: "archivo_eliminado", ruta, detalle: "archivo eliminado", severidad: "media" });
      continue;
    }

    // 2. Vaciado / reducción anormal (el umbral de la casa).
    const nA = noVacio(contenidoA);
    const nD = noVacio(contenidoD);
    if (nA > 0 && nD === 0) {
      hallazgos.push({ tipo: "archivo_vaciado", ruta, detalle: "el archivo quedó vacío", severidad: "alta" });
      continue;
    }
    if (nA >= 40 && nD < nA * (1 - UMBRAL_REDUCCION)) {
      const pct = Math.round((1 - nD / nA) * 100);
      hallazgos.push({ tipo: "reduccion_anormal", ruta, detalle: `reducción del ${pct}% (≥${Math.round(UMBRAL_REDUCCION * 100)}%)`, severidad: "media" });
    }

    // 3. Exports desaparecidos (contrato público del módulo).
    const exA = new Set(exportsDe(contenidoA));
    const exD = new Set(exportsDe(contenidoD));
    for (const e of exA) if (!exD.has(e)) hallazgos.push({ tipo: "export_desaparecido", ruta, detalle: `export «${e}» ya no se exporta`, severidad: "alta" });

    // 4. Endpoints que ya no se sirven.
    const epA = new Set(endpointsServidos(contenidoA));
    const epD = new Set(endpointsServidos(contenidoD));
    for (const ep of epA) if (!epD.has(ep)) hallazgos.push({ tipo: "endpoint_desaparecido", ruta, detalle: `ya no se sirve ${ep}`, severidad: "alta" });
  }

  // 5. Contrato cambiado: mismo interface/type exportado, cuerpo distinto.
  contratosCambiados(A, D, hallazgos);

  // 6. Dependencias nuevas (aviso, no prohibición): package.json antes vs después.
  for (const [ruta, cA] of A) {
    if (!/(^|\/)package\.json$/.test(ruta)) continue;
    const cD = D.get(ruta);
    if (cD === undefined) continue;
    const dA = depsDePackage(cA);
    for (const dep of depsDePackage(cD)) if (!dA.has(dep)) hallazgos.push({ tipo: "dependencia_nueva", ruta, detalle: `nueva dependencia «${dep}»`, severidad: "baja" });
  }

  hallazgos.sort((a, b) => peso(b.severidad) - peso(a.severidad));
  const resumen = { alta: 0, media: 0, baja: 0 };
  for (const h of hallazgos) resumen[h.severidad]++;
  return { regresion: resumen.alta > 0, hallazgos, resumen };
}

function peso(s: SeveridadRegresion): number { return s === "alta" ? 3 : s === "media" ? 2 : 1; }

/** Firma tosca del cuerpo de un tipo/interface (nombres de campos ordenados). */
function firmaContrato(contenido: string, nombre: string): string | null {
  const re = new RegExp(`(?:type|interface)\\s+${nombre}\\b[^{]*\\{([\\s\\S]*?)\\}`, "m");
  const m = re.exec(contenido);
  if (!m) return null;
  const campos = [...m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[?:]/g)].map((x) => x[1]).sort();
  return campos.join(",");
}

function contratosCambiados(A: Map<string, string>, D: Map<string, string>, out: Hallazgo[]): void {
  for (const [ruta, cA] of A) {
    const cD = D.get(ruta);
    if (cD === undefined) continue;
    const re = /export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    const vistos = new Set<string>();
    while ((m = re.exec(cA))) {
      const nombre = m[1];
      if (vistos.has(nombre)) continue;
      vistos.add(nombre);
      const fA = firmaContrato(cA, nombre);
      const fD = firmaContrato(cD, nombre);
      if (fA !== null && fD !== null && fA !== fD) {
        out.push({ tipo: "contrato_cambiado", ruta, detalle: `el contrato «${nombre}» cambió de campos`, severidad: "alta" });
      }
    }
  }
}

/** La directiva que el motor inyecta si hay regresión de severidad alta. */
export function directivaDeRegresion(v: VeredictoRegresion): string {
  if (!v.regresion) return "";
  const altas = v.hallazgos.filter((h) => h.severidad === "alta");
  const partes = [
    `REGRESSION GUARDIAN (v1.36.0 · §9): la tanda rompió ${altas.length} cosa(s) que funcionaban. "Terminado" no puede deshacer lo que ya andaba.`,
    ...altas.slice(0, 8).map((h) => `  · [${h.tipo}] ${h.ruta}: ${h.detalle}`),
    "Si el cambio fue INTENCIONAL, declarálo con evidencia (Evidence Engine); si no, rollback (§5 nivel 2) y otro enfoque.",
  ];
  return partes.join("\n");
}

/** El parte para el acta. */
export function regresionAParte(v: VeredictoRegresion): string {
  return `regresión: ${v.resumen.alta} alta · ${v.resumen.media} media · ${v.resumen.baja} baja`;
}

