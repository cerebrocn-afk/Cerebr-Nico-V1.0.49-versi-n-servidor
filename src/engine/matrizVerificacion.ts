/**
 * matrizVerificacion.ts — SOFTWARE QA MATRIX: NO SE DICE «TERMINADO» CON CAPAS SIN CORRER (v1.34.0 · FASE 4)
 * =========================================================================================================
 * QUÉ ES: la matriz del §10 hecha estado de motor. Para software general hay
 * capas de verificación con su herramienta y su autoridad (§30). La regla es
 * dura: «el agente no debería poder decir "terminado" si existen verificaciones
 * OBLIGATORIAS sin ejecutar». Este módulo sabe qué capas son obligatorias según
 * el tipo de proyecto y traduce cada capa a un CLAIM del Evidence Engine — así
 * el veredicto de la matriz usa la MISMA autoridad que el resto (fuente única).
 *
 * NO REIMPLEMENTA EL VEREDICTO: cada capa delega en `veredictoDeEvidencia` de
 * motorEvidencia. Esta matriz solo decide QUÉ capas aplican y CUÁLES son
 * innegociables, y ensambla el estado global.
 */

import { veredictoPorTipo, type EstadoEvidencia, type TipoClaim } from "./motorEvidencia";
import { certezaConjunta, type Certeza } from "./certeza";

export type CapaQA =
  | "sintaxis" | "tipos" | "dependencias" | "unit" | "integracion"
  | "api" | "ui" | "seguridad" | "arquitectura" | "regresion"
  | "rendimiento" | "empaquetado" | "instalador" | "runtime";

export interface DefCapa {
  capa: CapaQA;
  herramienta: string;
  /** El tipo de claim con el que se prueba (ancla del Evidence Engine). */
  claim: TipoClaim;
  /** Si la capa es OBLIGATORIA para el perfil por defecto (web/app). */
  obligatoriaBase: boolean;
}

/** La tabla del §10, con la herramienta y la autoridad de cada capa. */
export const MATRIZ: DefCapa[] = [
  { capa: "sintaxis",     herramienta: "parser / tsc",         claim: "compila",               obligatoriaBase: true },
  { capa: "tipos",        herramienta: "tsc --noEmit",         claim: "compila",               obligatoriaBase: true },
  { capa: "dependencias", herramienta: "package/lock + fs",    claim: "dependencia_instalada", obligatoriaBase: true },
  { capa: "unit",         herramienta: "test runner",          claim: "test_pasa",             obligatoriaBase: true },
  { capa: "integracion",  herramienta: "test runner",          claim: "test_pasa",             obligatoriaBase: false },
  { capa: "api",          herramienta: "HTTP request",         claim: "endpoint_funciona",     obligatoriaBase: false },
  { capa: "ui",           herramienta: "browser",              claim: "publicable",            obligatoriaBase: false },
  { capa: "seguridad",    herramienta: "cerradura / auditor",  claim: "publicable",            obligatoriaBase: true },
  { capa: "arquitectura", herramienta: "project graph",        claim: "generico",              obligatoriaBase: false },
  { capa: "regresion",    herramienta: "comparación antes/después", claim: "generico",         obligatoriaBase: false },
  { capa: "rendimiento",  herramienta: "medición",             claim: "generico",              obligatoriaBase: false },
  { capa: "empaquetado",  herramienta: "build",                claim: "compila",               obligatoriaBase: false },
  { capa: "instalador",   herramienta: "smoke test",           claim: "generico",              obligatoriaBase: false },
  { capa: "runtime",      herramienta: "healthcheck",          claim: "endpoint_funciona",     obligatoriaBase: false },
];

const POR_CAPA = new Map<CapaQA, DefCapa>(MATRIZ.map((d) => [d.capa, d]));

/** Perfiles: qué capas exigimos según qué se está construyendo. */
export type PerfilQA = "web" | "servicio" | "libreria" | "cli" | "base";
const OBLIGATORIAS_EXTRA: Record<PerfilQA, CapaQA[]> = {
  web: ["ui"],
  servicio: ["api", "runtime", "integracion"],
  libreria: ["empaquetado"],
  cli: ["instalador"],
  base: [],
};

/** Las capas OBLIGATORIAS para un perfil (base + extra del perfil). */
export function capasObligatorias(perfil: PerfilQA = "base"): CapaQA[] {
  const base = MATRIZ.filter((d) => d.obligatoriaBase).map((d) => d.capa);
  return [...new Set([...base, ...OBLIGATORIAS_EXTRA[perfil]])];
}

// ═════════════════════════════════════════════════════════════════
// EL DICTAMEN DE LA MATRIZ
// ═════════════════════════════════════════════════════════════════

/** La evidencia recolectada por capa: texto crudo de la salida de cada herramienta. */
export type EvidenciasPorCapa = Partial<Record<CapaQA, string>>;

export interface FilaMatriz {
  capa: CapaQA;
  herramienta: string;
  obligatoria: boolean;
  estado: EstadoEvidencia;
}

export interface DictamenMatriz {
  /** true si TODAS las obligatorias están VERIFICADO. */
  puedeDecirTerminado: boolean;
  filas: FilaMatriz[];
  /** Obligatorias que aún no están VERIFICADO. */
  obligatoriasPendientes: CapaQA[];
  /** Cualquier capa (obligatoria o no) que FALLÓ. */
  fallidas: CapaQA[];
}

/**
 * Evalúa la matriz para un perfil dado con las evidencias que hay. Una capa
 * sin evidencia queda SIN_VERIFICAR; si es obligatoria, bloquea el «terminado».
 */
export function evaluarMatriz(evidencias: EvidenciasPorCapa, perfil: PerfilQA = "base"): DictamenMatriz {
  const oblig = new Set(capasObligatorias(perfil));
  const filas: FilaMatriz[] = [];
  const obligatoriasPendientes: CapaQA[] = [];
  const fallidas: CapaQA[] = [];
  for (const def of MATRIZ) {
    const obligatoria = oblig.has(def.capa);
    const ev = evidencias[def.capa];
    // La afirmación de la capa se prueba con el ancla de su claim (tipo conocido).
    const v = veredictoPorTipo(def.claim, ev ?? null);
    filas.push({ capa: def.capa, herramienta: def.herramienta, obligatoria, estado: v.estado });
    if (v.estado === "FALLO") fallidas.push(def.capa);
    if (obligatoria && v.estado !== "VERIFICADO") obligatoriasPendientes.push(def.capa);
  }
  return {
    puedeDecirTerminado: obligatoriasPendientes.length === 0 && fallidas.length === 0,
    filas,
    obligatoriasPendientes,
    fallidas,
  };
}

/** La directiva que impide el «terminado» prematuro. */
export function directivaDeMatriz(d: DictamenMatriz, perfil: PerfilQA = "base"): string {
  if (d.puedeDecirTerminado) return "";
  const partes = [`SOFTWARE QA MATRIX (v1.34.0 · §10 · perfil ${perfil}): no se declara "terminado" con verificaciones obligatorias sin correr.`];
  if (d.obligatoriasPendientes.length) {
    partes.push("  Obligatorias sin VERIFICAR: " + d.obligatoriasPendientes.map((c) => `${c} (${POR_CAPA.get(c)!.herramienta})`).join(" · "));
  }
  if (d.fallidas.length) partes.push("  FALLARON: " + d.fallidas.join(", ") + " — repará antes de cerrar.");
  return partes.join("\n");
}

/** El parte tabular para el acta/panel (§26: el bloque VERIFICACIÓN). */
export function matrizAParte(d: DictamenMatriz): string {
  const marca = (e: EstadoEvidencia) => (e === "VERIFICADO" ? "✓" : e === "FALLO" ? "✗" : e === "PARCIAL" ? "~" : "·");
  return d.filas.map((f) => `${marca(f.estado)} ${f.capa}${f.obligatoria ? "*" : ""} [${f.estado}]`).join("\n");
}

/**
 * QUÉ CAPAS FALTA CORRER, CON SU HERRAMIENTA (v1.58.5 · C2).
 * `obligatoriasPendientes` dice QUÉ capas bloquean el «terminado», pero el
 * mapeo capa→herramienta («tsc --noEmit», «test runner»…) vivía inline dentro
 * de `directivaDeMatriz`. Esto lo expone como dato estructurado para que el
 * panel/acta pueda decir SIN texto parseado qué comando queda pendiente.
 * Puro: deriva de `d` y de `POR_CAPA`, no mide nada.
 */
export function herramientasPendientes(d: DictamenMatriz): Array<{ capa: CapaQA; herramienta: string }> {
  return d.obligatoriasPendientes.map((capa) => ({
    capa,
    herramienta: POR_CAPA.get(capa)?.herramienta ?? "(sin herramienta)",
  }));
}

/**
 * EL VEREDICTO DE LA MATRIZ, EN LA MONEDA DE LA CERTEZA (v1.58.5 · C5).
 * Puente certeza↔validación: una capa obligatoria VERIFICADO vale `ejecutado`;
 * cualquier otra (SIN_VERIFICAR / PARCIAL / FALLO) baja a `sin_verificar`. El
 * conjunto se pliega con `certezaConjunta` (la pieza más débil manda), así que
 * mientras falte UNA obligatoria por correr la matriz NO puede teñir el texto
 * de «ejecutado». Sin obligatorias en el perfil, se decide por
 * `puedeDecirTerminado`. Así el motor de certeza y la matriz de QA hablan el
 * mismo idioma y no se contradicen.
 */
export function certezaDeMatriz(d: DictamenMatriz): Certeza {
  const obligatorias = d.filas.filter((f) => f.obligatoria);
  if (obligatorias.length === 0) return d.puedeDecirTerminado ? "ejecutado" : "sin_verificar";
  const niveles: Certeza[] = obligatorias.map((f) => (f.estado === "VERIFICADO" ? "ejecutado" : "sin_verificar"));
  return certezaConjunta(niveles);
}

