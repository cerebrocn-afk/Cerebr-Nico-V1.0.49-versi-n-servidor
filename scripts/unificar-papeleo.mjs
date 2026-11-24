#!/usr/bin/env node
/**
 * unificar-papeleo.mjs — UN ARCHIVO POR DOCUMENTO (v1.69.0, pedido de Mario 24/10)
 * ==============================================================================
 * «Actualiza todo el papeleo, unifica: que no haya varios CHANGELOG; centraliza
 * la información en un archivo por cada documento.»
 *
 *   · Los CHANGELOG-vX.md de la raíz se absorben dentro del CHANGELOG.md maestro
 *     (la sección existente se completa con su detalle; la que falta se crea en
 *     orden descendente de versión).
 *   · CORRECCIONES-v1.56.4 + v1.56.8 → UN solo CORRECCIONES.md.
 *   · Informes y análisis sueltos (ACTUALIZACION_v1.56.3, MEJORAS-RENDIMIENTO-
 *     v1.56.4, EVOLUCION-BUCLES-v1.56.5, REVISION-ORQUESTADOR-v1.56.5,
 *     INFORME-AUDITORIA-v1.60.20 —vivía desterrado en manual-motor/—,
 *     ANALISIS_COMPLETITUD_WEB_v1.66.0, PLAN_MITIGACION_TECHO_CONTEXTO_v1.66.0)
 *     → documentacion/audits/AUDITS_MAESTRO.md, el patrón maestro de la casa.
 *   · MANIFIESTO_SHA256_v1.53.1.txt (hay uno vigente) y el scratch sin dueño
 *     (_diag.mjs, _esp.mjs, si nadie los referencia) → archivados.
 *
 * Los originales NO se borran: van a documentacion/_archivo-consolidado/
 * UNIFICADO-v1.69.0/ — reversible, igual que las fusiones de AUDITS_MAESTRO.
 * Idempotente: la marca `<!-- UNIFICADO-v1.69.0 vX -->` evita duplicar.
 *
 * Uso:  node scripts/unificar-papeleo.mjs
 * Después de correr:  npm run manifiesto && npm run superficie (regenerar).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const ARCHIVO = path.join(RAIZ, "documentacion", "_archivo-consolidado");
const MARK = "UNIFICADO-v1.69.0";

const ver = (s) => s.split(".").map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => {
  const A = ver(a), B = ver(b);
  return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] || 0) - (B[2] || 0);
};

/** Baja los títulos dos niveles para que convivan dentro de una sección `## vX`. */
function degradar(texto) {
  return texto
    .split("\n")
    .map((l) => (/^#{1,4} /.test(l) ? "##" + l : l))
    .join("\n");
}

function archivar(origenAbs) {
  if (!fs.existsSync(origenAbs)) return false;
  const destino = path.join(ARCHIVO, MARK, path.basename(origenAbs));
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.renameSync(origenAbs, destino);
  console.log("  archivado → " + path.relative(RAIZ, destino));
  return true;
}

// ═══ 1 · CHANGELOG unificado ═══════════════════════════════════════════════
console.log("[1] CHANGELOG: absorbiendo los archivos por versión");
const masterPath = path.join(RAIZ, "CHANGELOG.md");
let masterTxt = fs.readFileSync(masterPath, "utf8");

const detalleFiles = fs
  .readdirSync(RAIZ)
  .filter((f) => /^CHANGELOG-v\d+\.\d+(\.\d+)?\.md$/.test(f))
  .map((f) => ({ f, v: f.replace(/^CHANGELOG-v/, "").replace(/\.md$/, "") }))
  .sort((a, b) => cmp(b.v, a.v));

const cortes = [...masterTxt.matchAll(/^## /gm)].map((m) => m.index);
let prologo = cortes.length ? masterTxt.slice(0, cortes[0]) : masterTxt;
let cuerpo = (cortes.length ? masterTxt.slice(cortes[0]).split(/(?=^## )/m) : []).filter(Boolean);

const FECHAS = {
  "1.60.20": "2026-10-22", "1.62.0": "2026-10-22", "1.63.0": "2026-10-22",
  "1.64.0": "2026-10-22", "1.65.0": "2026-10-22", "1.66.0": "2026-10-23",
  "1.66.1": "2026-10-23", "1.67.0": "2026-10-23", "1.68.0": "2026-10-24",
  "1.61.0": "2026-10-22",
};

for (const { f, v } of detalleFiles) {
  const ruta = path.join(RAIZ, f);
  const crudo = fs.readFileSync(ruta, "utf8").trim();
  const detalle = degradar(crudo);
  const marca = `<!-- ${MARK} ${v} -->`;
  const versionDe = (sec) => (sec.match(/^## v(\d+\.\d+(?:\.\d+)?)/) || [])[1] || null;
  const idx = cuerpo.findIndex((s) => versionDe(s) === v);
  if (idx >= 0) {
    if (!cuerpo[idx].includes(marca)) {
      cuerpo[idx] = cuerpo[idx].replace(/\s*$/, "") + `\n\n${marca}\n\n### Detalle unificado (absorbido de \`${f}\`)\n\n${detalle}\n\n`;
      console.log(`  ^ sección v${v} completada con su detalle`);
    } else {
      console.log(`  = v${v} ya estaba unificada`);
    }
  } else {
    const lineas = crudo.split("\n");
    const head = String(lineas[0] || "")
      .replace(/^#+\s*/, "")
      .replace(/^CHANGELOG\s*[·•]?\s*/i, "")
      .replace(new RegExp("^v?" + v.replace(/\./g, "\\.") + "\\s*[—–-]?\\s*", "i"), "")
      .trim();
    const resto = degradar(lineas.slice(1).join("\n").trim());
    const fecha = FECHAS[v] || "2026-10-23";
    const nueva =
      `## v${v} · ${fecha} · ${head || "detalle de la versión"}\n\n` +
      `> Sección creada por la unificación ${MARK}: el detalle completo vive acá y el ` +
      `archivo suelto fue archivado en \`documentacion/_archivo-consolidado/${MARK}/\`.\n\n` +
      `${marca}\n\n${resto}\n\n`;
    const antes = cuerpo.findIndex((s) => {
      const sv = versionDe(s);
      return sv && cmp(sv, v) < 0;
    });
    if (antes < 0) cuerpo.push(nueva);
    else cuerpo.splice(antes, 0, nueva);
    console.log(`  + sección v${v} creada en orden`);
  }
  archivar(ruta);
}

masterTxt = prologo + cuerpo.join("");
// Punteros VIVOS a archivos ya absorbidos: dicen la verdad nueva. (Los textos
// históricos del cuerpo NO se reescriben: son testimonio de su época.)
masterTxt = masterTxt
  .replace("Detalle en `CHANGELOG-v1.68.0.md`.", "Detalle unificado: sección v1.68.0 más abajo.")
  .replace("Detalle completo en `CHANGELOG-v1.67.0.md`.", "Detalle unificado: sección v1.67.0 más abajo.");
fs.writeFileSync(masterPath, masterTxt);

// ═══ 2 · CORRECCIONES → un archivo ═════════════════════════════════════════
console.log("[2] CORRECCIONES: unificando");
const corr = fs
  .readdirSync(RAIZ)
  .filter((f) => /^CORRECCIONES-v[\d.]+\.md$/.test(f))
  .map((f) => ({ f, v: (f.match(/v([\d.]+)/) || [])[1] }))
  .sort((a, b) => cmp(a.v, b.v));
if (corr.length === 0) {
  console.log("  = ya unificado (CORRECCIONES.md)");
} else {
  const partes = corr.map(({ f, v }) => {
    const txt = fs.readFileSync(path.join(RAIZ, f), "utf8").trim();
    return `\n\n---\n\n<a id="fuente-${v}"></a>\n## Fuente: ${f}\n\n> Registro v${v} — unificado el 2026-10-24 (Mario: «un archivo por cada documento»). Original en \`documentacion/_archivo-consolidado/${MARK}/\`.\n\n${degradar(txt)}\n`;
  });
  const cab =
    `# CORRECCIONES — registro unificado\n\n` +
    `Un solo archivo para todas las correcciones documentadas de CerebroNico IDE.\n` +
    `Generado por la unificación ${MARK}: absorbe ${corr.map((c) => "`" + c.f + "`").join(", ")}.\n\n` +
    `## Índice\n\n${corr.map((c, i) => `${i + 1}. [v${c.v}](#fuente-${c.v}) — \`${c.f}\``).join("\n")}\n`;
  fs.writeFileSync(path.join(RAIZ, "CORRECCIONES.md"), cab + partes.join(""));
  for (const { f } of corr) archivar(path.join(RAIZ, f));
  console.log("  ✓ CORRECCIONES.md creado");
}

// ═══ 3 · Informes y análisis → AUDITS_MAESTRO ══════════════════════════════
console.log("[3] Informes → documentacion/audits/AUDITS_MAESTRO.md");
const auditsPath = path.join(RAIZ, "documentacion", "audits", "AUDITS_MAESTRO.md");
let audits = fs.readFileSync(auditsPath, "utf8");
const aAbsorber = [
  "ACTUALIZACION_v1.56.3.md",
  "MEJORAS-RENDIMIENTO-v1.56.4.md",
  "EVOLUCION-BUCLES-v1.56.5.md",
  "REVISION-ORQUESTADOR-v1.56.5.md",
  path.join("manual-motor", "INFORME-AUDITORIA-v1.60.20.md"),
  "ANALISIS_COMPLETITUD_WEB_v1.66.0.md",
  "PLAN_MITIGACION_TECHO_CONTEXTO_v1.66.0.md",
];
let absorbidos = 0;
for (const f of aAbsorber) {
  const ruta = path.join(RAIZ, f);
  if (!fs.existsSync(ruta)) { console.log("  = " + f + " ya no está (absorbido antes)"); continue; }
  const txt = fs.readFileSync(ruta, "utf8").trim();
  const base = path.basename(f);
  audits +=
    `\n\n---\n\n<a id="${base.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}"></a>\n` +
    `## Fuente: ${base}\n\n` +
    `> Unificado v1.69.0 (Mario: un archivo por documento). Original en \`documentacion/_archivo-consolidado/${MARK}/\`.\n\n` +
    `${degradar(txt)}\n`;
  archivar(ruta);
  absorbidos++;
}
audits = audits.replace(
  "Unifica 4 documentos.",
  `Unifica 4 + ${absorbidos || 7} documentos (v1.69.0: la unificación de Mario absorbió los informes sueltos de la raíz; los originales quedaron en \`_archivo-consolidado/${MARK}/\`).`,
);
fs.writeFileSync(auditsPath, audits);
console.log("  ✓ AUDITS_MAESTRO.md actualizado");

// ═══ 4 · Manifiesto viejo + scratch ════════════════════════════════════════
console.log("[4] Manifiesto vigente vs viejo + scratch huérfano");
archivar(path.join(RAIZ, "MANIFIESTO_SHA256_v1.53.1.txt"));
for (const scratch of ["_diag.mjs", "_esp.mjs"]) {
  const r = path.join(RAIZ, scratch);
  if (!fs.existsSync(r)) continue;
  const buscadoEn = ["package.json", "scripts/validar.mjs", "scripts/superficie.mjs", "scripts/manifiesto.mjs"];
  const referenciado = buscadoEn.some((f) => {
    try { return fs.readFileSync(path.join(RAIZ, f), "utf8").includes(scratch); } catch { return false; }
  });
  if (referenciado) console.log("  ~ " + scratch + " está referenciado: se queda");
  else archivar(r);
}

console.log("\n[ok] Unificación terminada. Regenerar después:");
console.log("     npm run superficie && npm run manifiesto");
