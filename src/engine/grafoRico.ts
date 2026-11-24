/**
 * grafoRico.ts — EL GRAFO QUE SABE MÁS QUE «IMPORTA» (v1.36.0 · FASE 6)
 * =====================================================================================
 * QUÉ ES: la promesa aplazada en v1.31. El grafo mínimo (grafoProyecto) registra
 * nodos=archivos y aristas «importa»/«usa_paquete». La hoja de ruta (§2) pide
 * más relaciones —llama, exporta, sirve, comparte contrato, comparte endpoint—
 * y dijo que eso era FASE 6: «prometerlo antes sería tinta, no mecánica». Aquí
 * está la mecánica.
 *
 * SOBRE EL GRAFO MÍNIMO (fuente única): reusa `construirGrafo` para nodos y
 * aristas de import; NO reimplementa la resolución. Agrega, por lectura de
 * contenido:
 *   · exporta        — símbolos públicos del archivo (function/const/class/{}).
 *   · llama          — A importa un símbolo de B Y lo invoca: A → B.
 *   · sirve          — el archivo monta un endpoint (app.get/router.post/@route…).
 *   · comparte_endpoint — A sirve «/x» y B lo consume (fetch/axios «x»).
 *   · comparte_contrato — dos archivos nombran el mismo tipo/interface exportado.
 *
 * Sirve al Regression Guardian (§9): comparar el grafo rico ANTES/DESPUÉS es lo
 * que delata «export que desapareció», «ruta que ya no se sirve», «API que
 * cambió de contrato». PURO: recibe {path, content}, devuelve datos.
 */

import { construirGrafo, type GrafoProyecto } from "./grafoProyecto";
import { normalizarRutaImport, resolverRutaImport, type CheckFile } from "./importChecker";

const RASTRABLES = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py)$/i;

// ═════════════════════════════════════════════════════════════════
// EXTRACTORES PUROS (probables por sí solos)
// ═════════════════════════════════════════════════════════════════

/** Símbolos exportados: function/const/let/class/{a,b}/default + Python def/class. */
export function exportsDe(contenido: string): string[] {
  const out = new Set<string>();
  const c = contenido || "";
  const re1 = /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  const re2 = /export\s*\{([^}]*)\}/g;
  const re3 = /export\s+default\s+(?:function|class)?\s*([A-Za-z_$][\w$]*)?/g;
  const rePy = /^\s*def\s+([A-Za-z_][\w]*)|^\s*class\s+([A-Za-z_][\w]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(c))) out.add(m[1]);
  while ((m = re2.exec(c))) m[1].split(",").forEach((s) => { const n = (s.split(/\s+as\s+/).pop() || "").trim(); if (n) out.add(n); });
  while ((m = re3.exec(c))) { if (m[1]) out.add(m[1]); else out.add("default"); }
  while ((m = rePy.exec(c))) { const n = m[1] || m[2]; if (n && !n.startsWith("_")) out.add(n); }
  return [...out].sort();
}

/** Endpoints SERVIDOS: express/koa/fastify (app|router).VERBO('/x') y decoradores Python. */
export function endpointsServidos(contenido: string): string[] {
  const out = new Set<string>();
  const c = contenido || "";
  const reJs = /\b(?:app|router|fastify|server|api)\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(\s*[`'\"]([^`'\"]+)[`'\"]/gi;
  const rePy = /@\w+\.(?:route|get|post|put|patch|delete)\s*\(\s*[`'\"]([^`'\"]+)[`'\"]/gi;
  let m: RegExpExecArray | null;
  while ((m = reJs.exec(c))) out.add(normalizarRuta(m[2]));
  while ((m = rePy.exec(c))) out.add(normalizarRuta(m[1]));
  return [...out].sort();
}

/** Endpoints CONSUMIDOS: fetch('/x') / axios.get('/x') / request('/x'). */
export function endpointsConsumidos(contenido: string): string[] {
  const out = new Set<string>();
  const c = contenido || "";
  const re = /\b(?:fetch|axios(?:\.\w+)?|request|got|ky(?:\.\w+)?)\s*\(\s*[`'\"]([^`'\"]+)[`'\"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(c))) {
    const u = m[1];
    if (/^https?:\/\//i.test(u)) { try { out.add(normalizarRuta(new URL(u).pathname)); } catch { /* ignora */ } }
    else if (u.startsWith("/")) out.add(normalizarRuta(u));
  }
  return [...out].sort();
}

/** Nombres importados desde módulos locales (para «llama»): {a,b}, default, * as ns. */
export function importsNombrados(contenido: string): Array<{ spec: string; nombres: string[] }> {
  const out: Array<{ spec: string; nombres: string[] }> = [];
  const re = /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s*as\s*([A-Za-z_$][\w$]*))?\s*from\s*[`'\"](\.[^`'\"]+)[`'\"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(contenido || ""))) {
    const nombres: string[] = [];
    if (m[1]) nombres.push(m[1]);
    if (m[2]) m[2].split(",").forEach((s) => { const n = (s.split(/\s+as\s+/).pop() || "").trim(); if (n) nombres.push(n); });
    if (m[3]) nombres.push(m[3]);
    out.push({ spec: m[4], nombres });
  }
  return out;
}

function normalizarRuta(p: string): string {
  const sinQuery = p.split(/[?#]/)[0];
  const conBarra = sinQuery.startsWith("/") ? sinQuery : "/" + sinQuery;
  return conBarra.length > 1 ? conBarra.replace(/\/+$/, "") : conBarra;
}

// ═════════════════════════════════════════════════════════════════
// EL GRAFO RICO
// ═════════════════════════════════════════════════════════════════

export type TipoAristaRica = "llama" | "sirve" | "comparte_endpoint" | "comparte_contrato";

export interface AristaRica {
  desde: string;
  hacia: string;
  tipo: TipoAristaRica;
  /** El símbolo/endpoint/contrato que sostiene la arista. */
  etiqueta: string;
}

export interface GrafoRico {
  base: GrafoProyecto;
  /** archivo → símbolos que exporta. */
  exports: Map<string, string[]>;
  /** archivo → endpoints que sirve. */
  sirve: Map<string, string[]>;
  /** Aristas ricas (dedup). */
  aristas: AristaRica[];
}

export function construirGrafoRico(ficheros: CheckFile[]): GrafoRico {
  const base = construirGrafo(ficheros);
  const existentes = new Set(ficheros.map((f) => normalizarRutaImport(f.path)));
  const exports = new Map<string, string[]>();
  const sirve = new Map<string, string[]>();
  const consume = new Map<string, string[]>();
  const aristas: AristaRica[] = [];
  const vistas = new Set<string>();
  const add = (desde: string, hacia: string, tipo: TipoAristaRica, etiqueta: string) => {
    if (desde === hacia && tipo !== "comparte_endpoint" && tipo !== "comparte_contrato") return;
    const clave = `${desde}|${tipo}|${hacia}|${etiqueta}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    aristas.push({ desde, hacia, tipo, etiqueta });
  };

  // Pase 1: exports, sirve, consume por archivo.
  for (const f of ficheros) {
    if (!RASTRABLES.test(f.path)) continue;
    const ruta = normalizarRutaImport(f.path);
    const c = f.content ?? "";
    const ex = exportsDe(c); if (ex.length) exports.set(ruta, ex);
    const sv = endpointsServidos(c); if (sv.length) sirve.set(ruta, sv);
    const cs = endpointsConsumidos(c); if (cs.length) consume.set(ruta, cs);
  }

  // Pase 2: «llama» — A importa un símbolo de B y lo invoca en su cuerpo.
  for (const f of ficheros) {
    if (!RASTRABLES.test(f.path)) continue;
    const desde = normalizarRutaImport(f.path);
    const c = f.content ?? "";
    for (const imp of importsNombrados(c)) {
      const destino = resolverRutaImport(f.path, imp.spec, existentes);
      if (!destino) continue;
      for (const nombre of imp.nombres) {
        // ¿se invoca? nombre( … )  o  nombre.algo(  o  <Nombre  (JSX)
        const invoca = new RegExp(`\\b${escapar(nombre)}\\s*[\\(.]|<${escapar(nombre)}[\\s/>]`);
        if (invoca.test(c)) add(desde, destino, "llama", nombre);
      }
    }
  }

  // Pase 3: «sirve» como arista archivo→endpoint (nodo virtual «endpoint:/x»).
  for (const [ruta, eps] of sirve) for (const ep of eps) add(ruta, `endpoint:${ep}`, "sirve", ep);

  // Pase 4: comparte_endpoint — quien sirve /x y quien consume /x.
  const servidoresPorEp = new Map<string, string[]>();
  for (const [ruta, eps] of sirve) for (const ep of eps) (servidoresPorEp.get(ep) ?? servidoresPorEp.set(ep, []).get(ep)!).push(ruta);
  for (const [ruta, eps] of consume) for (const ep of eps) {
    for (const servidor of servidoresPorEp.get(ep) ?? []) add(servidor, ruta, "comparte_endpoint", ep);
  }

  // Pase 5: comparte_contrato — dos archivos con el MISMO tipo/interface exportado.
  const contratosPorNombre = new Map<string, string[]>();
  for (const f of ficheros) {
    if (!RASTRABLES.test(f.path)) continue;
    const ruta = normalizarRutaImport(f.path);
    const re = /export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.content ?? ""))) (contratosPorNombre.get(m[1]) ?? contratosPorNombre.set(m[1], []).get(m[1])!).push(ruta);
  }
  for (const [nombre, rutas] of contratosPorNombre) {
    if (rutas.length < 2) continue;
    for (let i = 0; i < rutas.length; i++) for (let j = i + 1; j < rutas.length; j++) add(rutas[i], rutas[j], "comparte_contrato", nombre);
  }

  return { base, exports, sirve, aristas };
}

function escapar(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Consulta: quién llama a este archivo (aristas «llama» entrantes). */
export function llamadoresDe(g: GrafoRico, ruta: string): AristaRica[] {
  const r = normalizarRutaImport(ruta);
  return g.aristas.filter((a) => a.tipo === "llama" && a.hacia === r);
}

/** Una línea para el acta. */
export function grafoRicoAParte(g: GrafoRico): string {
  const cuenta = (t: TipoAristaRica) => g.aristas.filter((a) => a.tipo === t).length;
  return `grafo rico: ${cuenta("llama")} llama · ${cuenta("sirve")} sirve · ${cuenta("comparte_endpoint")} endpoint-compartido · ${cuenta("comparte_contrato")} contrato-compartido`;
}

