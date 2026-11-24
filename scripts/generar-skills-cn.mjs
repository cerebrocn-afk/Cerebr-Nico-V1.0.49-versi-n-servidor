#!/usr/bin/env node
/**
 * generar-skills-cn.mjs — MATERIALIZA skills/cn-<slug>/SKILL.md (v1.96.0)
 * =======================================================================
 * Lee la tabla verificable de `habilidades-cn.mjs`, comprueba el contrato contra el
 * inventario REAL de herramientas y contra el disco, y recién entonces escribe las
 * carpetas. Si algo no existe, NO escribe y sale 1: una skill huérfana no entra al corpus.
 *
 *   node scripts/generar-skills-cn.mjs            # escribe
 *   node scripts/generar-skills-cn.mjs --verificar # solo compara contra lo que hay en disco
 *
 * Forma del SKILL.md: `name` y `description` van en UNA línea y arriba, porque
 * `skills_listado()` (hindsight_daemon) lee solo los primeros 2000 caracteres y parsea
 * `^(name|description):`. Con `description: >-` el catálogo mostraría ">-" y la skill
 * dejaría de disparar: el formato no es cosmético, es el cable.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HABILIDADES_CN } from "./habilidades-cn.mjs";
import { inventarioHerramientas } from "./inventario-herramientas.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOLO_VERIFICAR = process.argv.includes("--verificar");
const LARGO_MAX_DESCRIPCION = 320;

const { todas } = inventarioHerramientas(RAIZ);
const problemas = [];

for (const h of HABILIDADES_CN) {
  const id = h.s || "(sin slug)";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(h.s || "")) problemas.push(`${id}: el slug tiene que ser minúsculas con guiones`);
  for (const campo of ["t", "d", "dom", "r", "v"]) if (!h[campo]) problemas.push(`${id}: falta el campo ${campo}`);
  if (!h.h || !h.h.length) problemas.push(`${id}: sin herramientas no hay receta ejecutable`);
  if (!h.e || !h.e.length) problemas.push(`${id}: sin evidencia no se puede publicar como probada`);
  if ((h.d || "").length > LARGO_MAX_DESCRIPCION) problemas.push(`${id}: descripción de ${(h.d || "").length} caracteres (techo ${LARGO_MAX_DESCRIPCION})`);
  // La descripción va como escalar YAML PLANO en UNA línea (ni comillas ni `>-`,
  // porque el catálogo la lee con el regex naíf `^(name|description):\s*(.+)$`).
  // Un `: ` (dos puntos + espacio), un ` #` o un indicador al principio romperían
  // js-yaml (frontmatter_roto en auditar-skills.mjs). Se corta acá, no en la valla.
  {
    const d = String(h.d || "");
    if (d.includes(": ")) problemas.push(`${id}: la descripción tiene «: » (dos puntos + espacio) → rompe el YAML plano; usar « — » o reescribir`);
    if (d.includes(" #")) problemas.push(`${id}: la descripción tiene « #» → rompe el YAML plano`);
    if (/^[\s#&*!|>%@`"'\[\]{},]/.test(d) || /^[?:-]\s/.test(d)) problemas.push(`${id}: la descripción empieza con un indicador YAML → entrecomillarla la haría visible en el catálogo; reescribir el arranque`);
  }
  for (const t of h.h || []) if (!todas.has(t)) problemas.push(`${id}: herramienta inexistente en el inventario → ${t}`);
  for (const e of h.e || []) if (!existsSync(path.join(RAIZ, e))) problemas.push(`${id}: evidencia que no está en disco → ${e}`);
}

const firmas = new Set();
for (const h of HABILIDADES_CN) {
  if (firmas.has(h.s)) problemas.push(`slug duplicado: ${h.s}`);
  firmas.add(h.s);
}

if (problemas.length) {
  console.error("El contrato de las 100 skills NO cierra:");
  for (const p of problemas) console.error("  · " + p);
  console.error(`\n${problemas.length} problema(s). No se escribió ninguna skill.`);
  process.exit(1);
}

function frente(h) {
  return [
    "---",
    `name: cn-${h.s}`,
    `description: ${String(h.d).trim()}`,
    "version: 1.0.0",
    `dominio: ${h.dom}`,
    "estado: probada",
    `requiere: [${(h.h || []).join(", ")}]`,
    `evidencia: [${(h.e || []).join(", ")}]`,
    "---",
  ].join("\n");
}

function cuerpo(h) {
  const li = (arr) => (arr || []).map((x) => `- ${x}`).join("\n");
  const pasos = (h.r || []).map((p, i) => `${i + 1}. ${p}`).join("\n");
  return [
    "",
    `# ${h.t}`,
    "",
    `> ${String(h.d).trim()}`,
    "",
    "## Herramientas que usa (todas existen en este build)",
    "",
    (h.h || []).map((t) => `\`${t}\``).join(" · "),
    "",
    "## Receta",
    "",
    pasos,
    "",
    "## Cómo se verifica (con números, no con adverbios)",
    "",
    li(h.v),
    "",
    "## No hacer",
    "",
    li(h.x || ["No declarar terminada esta skill sin la comprobación de arriba."]),
    "",
    "## Evidencia en el repo",
    "",
    (h.e || []).map((e) => `- \`${e}\``).join("\n"),
    "",
    "<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->",
    "",
  ].join("\n");
}

let nuevas = 0, actualizadas = 0, intactas = 0;
const fueraDeContrato = [];
for (const h of HABILIDADES_CN) {
  const destino = path.join(RAIZ, "skills", `cn-${h.s}`, "SKILL.md");
  const contenido = frente(h) + cuerpo(h);
  const previo = existsSync(destino);
  const actual = previo ? readFileSync(destino, "utf8") : null;
  if (actual === contenido) { intactas++; continue; }
  fueraDeContrato.push(`cn-${h.s}`);
  if (SOLO_VERIFICAR) continue;
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, contenido, "utf8");
  if (previo) actualizadas++; else nuevas++;
}

console.log(`skills cn-*: ${HABILIDADES_CN.length} en el contrato · ${nuevas} nuevas · ${actualizadas} actualizadas · ${intactas} ya coincidían`);
if (SOLO_VERIFICAR && fueraDeContrato.length) {
  console.error(`fuera de contrato (${fueraDeContrato.length}): ${fueraDeContrato.slice(0, 12).join(", ")}`);
  process.exitCode = 1;
}

