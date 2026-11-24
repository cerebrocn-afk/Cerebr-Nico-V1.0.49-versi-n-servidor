#!/usr/bin/env node
// ============================================================
// EXPORTAR CONTEXTO — v1.57.19 · para discutir arquitectura con otra IA
// ============================================================
// Tres pedidos del usuario, hechos herramienta:
//  1. FILTRO DE COMENTARIOS conservador (--sin-comentarios): quita líneas que
//     EMPIEZAN con // o /* (y las de los bloques JSDoc), porque un filtro
//     agresivo rompería URLs («https://…») y strings con // adentro. Informa
//     cuántas líneas quitó: nada de magia silenciosa.
//  2. CAPAS PRIORIZADAS (--capa contratos|motor|ui|todo): por defecto contratos
//     + motor — la arquitectura del orquestador — y la UI queda afuera. El
//     MONOLITO server.ts (12k+ líneas) también queda afuera salvo --con-monolito:
//     exportarlo entero se come el contexto de cualquier IA.
//  3. MARCADOR DE ESTADO al principio, LEÍDO DEL DISCO (package.json +
//     contrato-rutas.json): // Version | Vallas | State. Con --estado corre el
//     ritual y lo declara; sin eso dice NO VERIFICADO, porque afirmar verde sin
//     medirlo es justo lo que esta casa prohíbe.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const tiene = (n) => args.includes(n);
const valor = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };

const CAPA = valor("--capa", "arquitectura");
const SIN_COMENTARIOS = tiene("--sin-comentarios");
const CON_MONOLITO = tiene("--con-monolito");
const CORRER_ESTADO = tiene("--estado");
const SOLO = valor("--solo", "");
const TOKENS_MAX = Number(valor("--tokens-max", "120000")) || 120000;
const SALIDA = valor("--salida", "EXPORT-CONTEXTO.md");

function leerJson(rel, def) {
  try { return JSON.parse(fs.readFileSync(path.join(RAIZ, rel), "utf8")); } catch { return def; }
}
const pkg = leerJson("package.json", {});
const contrato = leerJson("contrato-rutas.json", {});

/** El marcador del usuario, con los números del DISCO (nada hardcodeado). */
export function marcadorDeEstado({ version, serverLineas, presupuesto, techo, estado }) {
  return `// Version: ${version} | Vallas: ${serverLineas}/${presupuesto} (techo ${techo}) | State: ${estado}`;
}

/** Filtro conservador de comentarios: sólo líneas que EMPIEZAN con //, /*, * o *\/. */
export function filtrarComentarios(texto) {
  const salida = [];
  let quitadas = 0;
  let enBloque = false;
  for (const linea of String(texto).split("\n")) {
    const t = linea.trim();
    if (enBloque) {
      quitadas++;
      if (t.includes("*/")) enBloque = false;
      continue;
    }
    if (t.startsWith("/*")) {
      quitadas++;
      if (!t.includes("*/")) enBloque = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) { quitadas++; continue; }
    salida.push(linea);
  }
  return { texto: salida.join("\n"), quitadas };
}

const CAPAS = {
  contratos: ["src/types.ts", "src/types/**"],
  motor: ["src/engine/**", "server/**"],
  ui: ["src/components/**", "src/App.tsx", "src/main.tsx"],
};
const EXCLUIR_SIEMPRE = [/node_modules/, /\.test\.ts$/, /\.d\.ts$/];

function listarArchivos(globs, conMonolito) {
  const out = new Set();
  const agregarDir = (dir) => {
    const abs = path.join(RAIZ, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (EXCLUIR_SIEMPRE.some((r) => r.test(rel))) continue;
      if (e.isDirectory()) agregarDir(rel);
      else if (/\.(ts|tsx|mjs)$/.test(rel)) out.add(rel);
    }
  };
  for (const g of globs) {
    if (g.endsWith("/**")) agregarDir(g.slice(0, -3));
    else if (fs.existsSync(path.join(RAIZ, g))) out.add(g);
  }
  if (!conMonolito) out.delete("server.ts");
  return [...out].sort();
}

const capas = CAPA === "todo" ? ["contratos", "motor", "ui"] : CAPA === "arquitectura" ? ["contratos", "motor"] : [CAPA];
if (capas.some((c) => !CAPAS[c])) {
  console.error(`Capa desconocida: ${CAPA}. Usá contratos | motor | ui | arquitectura | todo`);
  process.exit(2);
}
let archivos = listarArchivos(capas.flatMap((c) => CAPAS[c]), CON_MONOLITO);
if (SOLO) archivos = archivos.filter((a) => a.includes(SOLO));

let estado = "NO VERIFICADO (pasá --estado para correr `npm run validar` antes de exportar)";
if (CORRER_ESTADO) {
  const r = spawnSync("npm", ["run", "validar"], { cwd: RAIZ, encoding: "utf8", shell: true });
  const salida = `${r.stdout || ""}${r.stderr || ""}`;
  estado = /VEREDICTO: TODO CORRECTO/.test(salida) ? "ALL_GREEN (verificado en este export)" : "HAY FALLOS (mirá el ritual antes de tocar nada)";
}

const cabecera = [
  marcadorDeEstado({ version: pkg.version, serverLineas: contrato.server_lineas, presupuesto: contrato.presupuesto_lineas, techo: contrato.techo_absoluto_lineas, estado }),
  `// Capas: ${capas.join(" + ")}${CON_MONOLITO ? " + monolito" : " (sin monolito server.ts y sin UI)"}${SIN_COMENTARIOS ? " | sin comentarios" : ""}`,
  `// El monolito está optimizado al límite del contrato: NO sugieras refactors que agreguen líneas; la lógica vive en src/engine y server/*.ts.`,
];
let totalLineas = 0, totalQuitadas = 0, totalChars = 0;
const bloques = [];
const afuera = [];
for (const rel of archivos) {
  // v1.57.19 · presupuesto de tokens: exportar 580k tokens no le sirve a ninguna IA.
  // Se corta, y se DICE qué quedó afuera (nada de magia silenciosa).
  if (totalChars / 4 > TOKENS_MAX) { afuera.push(rel); continue; }
  const crudo = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const { texto, quitadas } = SIN_COMENTARIOS ? filtrarComentarios(crudo) : { texto: crudo, quitadas: 0 };
  const lineas = texto.split("\n").length;
  totalLineas += lineas; totalQuitadas += quitadas; totalChars += texto.length;
  const lang = rel.endsWith(".json") ? "json" : "ts";
  bloques.push(`\n### ${rel} (${lineas} líneas${quitadas ? `, ${quitadas} de comentario menos` : ""})\n\n\`\`\`${lang}\n${texto}\n\`\`\``);
}
const resumen = `${bloques.length} archivo(s) · ${totalLineas} líneas · ~${Math.round(totalChars / 4 / 1000)}k tokens estimados${SIN_COMENTARIOS ? ` · ${totalQuitadas} líneas de comentario filtradas` : ""}${afuera.length ? `\n// PRESUPUESTO DE TOKENS (${TOKENS_MAX / 1000}k): quedaron afuera ${afuera.length} archivo(s) — pedí --capa, --solo <glob> o subí --tokens-max: ${afuera.slice(0, 12).join(", ")}${afuera.length > 12 ? " …" : ""}` : ""}`;
const informe = `${cabecera.join("\n")}\n\n${resumen}\n${bloques.join("\n")}\n`;
fs.writeFileSync(path.isAbsolute(SALIDA) ? SALIDA : path.join(RAIZ, SALIDA), informe);
console.log(`[exportar-contexto] ${SALIDA} · ${bloques.length} archivo(s) · ${totalLineas} líneas · ~${Math.round(totalChars / 4 / 1000)}k tokens${SIN_COMENTARIOS ? ` · ${totalQuitadas} comentarios fuera` : ""}${afuera.length ? ` · ${afuera.length} afuera por presupuesto` : ""}`);
console.log(cabecera[0]);
