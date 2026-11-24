#!/usr/bin/env node
// audita-reguladores.mjs — v1.57.15 · CERO REGULADORES MUDOS
// ==========================================================
// POR QUÉ EXISTE
// --------------
// El panel Pro tenía CINCO diales (contextSize / keepAlive / topP / topK /
// maxTokens) que se guardaban en `proSettings` y NO leía nadie: la UI prometía
// «num_ctx de Ollama. Más contexto = más RAM.» y el valor se quedaba en
// localStorage. Con 144 suites verdes y `verificar-cableado.mjs` en el repo.
// Ese script clasifica MÓDULOS (¿se importa? ¿se usa?), así que no puede ver una
// propiedad que muere en el camino UI → store → motor. Esta valla mira justo ese
// camino: toda clave que el usuario puede tocar tiene que tener un lector fuera
// del panel y del propio store.
//
// Un dial mudo es peor que un dial que no existe: enseña al usuario a desconfiar
// de la interfaz. Es la misma enfermedad que `guard.test.ts` documenta en su
// encabezado — «la protección se ejecutaba y no protegía» — pero del revés: acá
// la INTERFAZ se ejecuta y no manda.
//
// Uso:
//   node scripts/audita-reguladores.mjs          → informe + exit 1 si hay mudos
//   node scripts/audita-reguladores.mjs --json   → máquina-legible
//   node scripts/audita-reguladores.mjs --clave topP   → una clave (para pruebas)
//
// Node v16: sin dependencias, sin red, sin tocar disco ajeno a la repo.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = "src/components/ProConfigPanel.tsx";
const STORE = "src/utils/proSettings.ts";

/** Palabras que no prueban lectura: son el propio panel o ruido de comentario. */
function leerArchivo(rel) {
  const p = path.join(RAIZ, rel);
  try { return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null; }
  catch { return null; }
}

function fuentesDeCodigo(dir, out = []) {
  let nombres;
  try { nombres = readdirSync(dir); } catch { return out; }
  for (const n of nombres) {
    if (["node_modules", "dist", ".git", "__pycache__", ".cerebro-db"].includes(n)) continue;
    const full = path.join(dir, n);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) fuentesDeCodigo(full, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(path.relative(RAIZ, full).replace(/\\/g, "/"));
  }
  return out;
}

/**
 * Extrae las claves que el panel puede escribir: `up("grupo", { clave: ... })`.
 * Se apoya en la forma real del fuente (65 ocurrencias en 1.57.14), no en una
 * lista a mano: si alguien agrega una fila al panel, entra en la valla sola.
 */
export function clavesDelPanel(textoPanel) {
  const out = [];
  const re = /up\(\s*"([a-zA-Z]+)"\s*,\s*\{\s*([a-zA-Z][a-zA-Z0-9]*)/g;
  let m;
  const vistas = new Set();
  while ((m = re.exec(textoPanel))) {
    const ruta = `settings.${m[1]}.${m[2]}`;
    if (vistas.has(ruta)) continue; // la misma clave puede tener dos controles (toggle + slider)
    vistas.add(ruta);
    out.push({ grupo: m[1], clave: m[2], ruta });
  }
  return out;
}

/**
 * ¿La clave tiene un lector fuera del panel y del store? Se aceptan tres formas
 * reales del repo: `settings.grupo.clave`, destructuring (`const { clave }`) y
 * acceso al objeto ya armado (`grupo: { ...clave }` en un payload / `c.clave`).
 */
export function tieneLector(clave, grupo, archivos, textoStore) {
  const patrones = [
    // `settings.ai.topP` y `proSettings?.wallpaper?.moduleOpacity` son la MISMA
    // lectura: sin admitir el encadenado opcional la valla da falso positivo, y
    // un falso positivo enseñaría a ignorar esta auditoría.
    new RegExp(`\\b${grupo}\\s*\\??\\.\\s*${clave}\\b`),
    new RegExp(`\\{\\s*[^{}]*\\b${clave}\\b[^{}]*\\}\\s*=\\s*[A-Za-z_$][\\w$]*\\.${grupo}\\b`),
    new RegExp(`\\b${clave}\\s*:`),
  ];
  const hits = [];
  for (const rel of archivos) {
    if (rel === PANEL || rel === STORE) continue;
    const t = archivos._txt ? archivos._txt[rel] : leerArchivo(rel);
    if (!t) continue;
    for (const re of patrones) {
      if (re.test(t)) { hits.push({ rel, patron: String(re) }); break; }
    }
  }
  // El store puede ser el único lector si él mismo despacha (applyProSettings).
  const storeLoDespacha = textoStore && new RegExp(`${clave}\\b`).test(textoStore) &&
    /applyProSettings|function apply/.test(textoStore);
  return { mudo: hits.length === 0 && !storeLoDespacha, hits };
}

export function auditar(opts = {}) {
  const panel = opts.panelTexto ?? leerArchivo(PANEL);
  const store = opts.storeTexto ?? leerArchivo(STORE);
  if (!panel) return { error: "no se leyó el panel", filas: [], mudos: [] };
  const archivos = opts.archivos ?? fuentesDeCodigo(path.join(RAIZ, "src")).concat(["server.ts"]);
  const textos = {};
  for (const a of archivos) textos[a] = opts.textos ? (opts.textos[a] ?? null) : leerArchivo(a);
  const indexados = archivos.slice();
  indexados._txt = textos;

  const filas = [];
  for (const k of clavesDelPanel(panel)) {
    if (opts.clave && k.clave !== opts.clave) continue;
    const r = tieneLector(k.clave, k.grupo, indexados, store);
    filas.push({ ...k, mudo: r.mudo, lectores: r.hits.map((h) => h.rel).slice(0, 3) });
  }
  const mudos = filas.filter((f) => f.mudo);
  return { filas, mudos, revisadas: filas.length };
}

const esDirecto = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*(?=\/)/, ""));
if (esDirecto || process.argv[1]?.endsWith("audita-reguladores.mjs")) {
  const json = process.argv.includes("--json");
  const ci = process.argv.indexOf("--clave");
  const { filas, mudos, revisadas, error } = auditar({ clave: ci > 0 ? process.argv[ci + 1] : null });
  if (error) { console.log("ERROR:", error); process.exit(2); }
  if (json) { console.log(JSON.stringify({ revisadas, mudos }, null, 1)); }
  else {
    console.log(`\nAUDITORÍA DE REGULADORES — ${revisadas} claves expuestas en el panel`);
    if (!mudos.length) console.log("  cero diales mudos: toda clave tiene lector fuera del panel.\n");
    for (const m of mudos) console.log(`  MUDO: ${m.ruta}  (nadie la lee más que el store/panel)`);
    if (mudos.length) console.log(`\n  ${mudos.length} regulador(es) mudo(s). Un dial que no llega al motor enseña a desconfiar de la UI.\n`);
  }
  process.exitCode = mudos.length ? 1 : 0;
}
