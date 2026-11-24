/**
 * skillsPropias.test.ts — v1.96.0 · LAS 100 SKILLS NUEVAS NO PUEDEN SER HUMO
 * ==========================================================================
 * El pedido de Mario (30/10): «agregá 100 skills más aparte de las 100 que ya tiene… si
 * hace falta agregar herramientas para que esas skills sean funcionales, agregar, cablear
 * y chequear» y el remate del 30/10 a la noche: «terminá y que nada quede huérfano o solo
 * declarada y no funcional».
 *
 * Esta valla es lo que hace de eso una garantía y no una intención. Cruza tres fuentes:
 *   1. el contrato (scripts/habilidades-cn.mjs),
 *   2. el inventario REAL de herramientas llamables (toolRegistry + cases de server.ts +
 *      los MANIFIESTO de los dos daemon, vía scripts/inventario-herramientas.mjs),
 *   3. el disco (skills/cn-<slug>/SKILL.md y los archivos citados como evidencia).
 * Si una skill menciona una herramienta que no existe, o cita una evidencia que no está,
 * o la carpeta escrita se fue de lo que dice el contrato — falla la puerta. Punto.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};
const seccion = (t: string) => console.log("\n── " + t);

const { HABILIDADES_CN } = (await import("../scripts/habilidades-cn.mjs")) as any;
const { inventarioHerramientas } = (await import("../scripts/inventario-herramientas.mjs")) as any;
const { todas } = inventarioHerramientas(RAIZ);

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u3001-\u3003]/;

seccion("§1 · EL CONTRATO: 100, únicas y completas");
// v1.0.6 · 100 -> 101: se materializo `cn-web-escena-3d` (motor 3D offline). Se SUBE el
// conteo porque el corpus crecio de verdad (fila en scripts/habilidades-cn.mjs +
// SKILL.md generado + evidencia en disco); no se afloja ninguna comprobacion.
c("hay exactamente 101 skills propias declaradas (V1.0.6: +web-escena-3d)", HABILIDADES_CN.length === 101, `${HABILIDADES_CN.length}`);
c("los slugs son únicos y en minúscula-con-guiones",
  new Set(HABILIDADES_CN.map((h: any) => h.s)).size === HABILIDADES_CN.length &&
  HABILIDADES_CN.every((h: any) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(h.s)));
c("ninguna entra sin título, descripción, dominio, receta y verificación",
  HABILIDADES_CN.every((h: any) => h.t && h.d && h.dom && h.r?.length >= 3 && h.v?.length >= 2));
c("★ toda skill declara al menos una herramienta y al menos una evidencia",
  HABILIDADES_CN.every((h: any) => h.h?.length >= 1 && h.e?.length >= 1));
c("la descripción entra en una línea de a lo sumo 320 caracteres (la lee skills_listado)",
  HABILIDADES_CN.every((h: any) => !/[\r\n]/.test(h.d) && h.d.length <= 320),
  HABILIDADES_CN.map((h: any) => h.d.length).sort((a: number, b: number) => b - a).slice(0, 3).join(","));
c("los dominios cubren lo pedido: código, app, web, documentos, datos, pruebas, entrega, memoria",
  ["codigo", "app", "web", "documentos", "datos", "pruebas", "entrega", "memoria"].every((d) => HABILIDADES_CN.some((h: any) => h.dom === d)));
c("sin caracteres CJK en el contrato (fuga de plantillas)", !HABILIDADES_CN.some((h: any) => CJK.test(JSON.stringify(h))));

seccion("§2 · LAS HERRAMIENTAS PROMETIDAS EXISTEN EN ESTE BUILD");
c("el inventario real no está vacío y trae las máquinas de documentos",
  todas.size > 80 && ["crear_pdf", "crear_docx", "crear_zip"].every((n) => todas.has(n)), `inventario=${todas.size}`);
c("★ `crear_sitio` y `auditar_pagina` son llamadas reales (pack creador, 32 herramientas)",
  todas.has("crear_sitio") && todas.has("auditar_pagina"));
c("y `listar_skills` / `skill_buscar` también (hindsight)", todas.has("listar_skills") && todas.has("skill_buscar"));
const huerfanas: string[] = [];
for (const h of HABILIDADES_CN) for (const t of h.h) if (!todas.has(t)) huerfanas.push(`${h.s} → ${t}`);
c("★ NINGUNA skill pide una herramienta que no exista", huerfanas.length === 0, huerfanas.slice(0, 6).join(" | "));
const usadas = new Set<string>();
HABILIDADES_CN.forEach((h: any) => h.h.forEach((t: string) => usadas.add(t)));
c("las 100 skills reparten el arsenal (≥ 60 herramientas distintas usadas)", usadas.size >= 60, `${usadas.size}`);
c("cada una de las 8 familias de dominio tiene su herramienta típica usada",
  ["crear_docx", "crear_pdf", "crear_zip", "crear_sitio", "run_tests", "edit_file", "memory_recall", "exportar_apk"].every((t) => usadas.has(t)),
  ["crear_docx", "crear_pdf", "crear_zip", "crear_sitio", "run_tests", "edit_file", "memory_recall", "exportar_apk"].filter((t) => !usadas.has(t)).join(","));

seccion("§3 · LA EVIDENCIA ESTÁ EN DISCO");
const evidenciasRaras: string[] = [];
for (const h of HABILIDADES_CN) for (const e of h.e) if (!existsSync(path.join(RAIZ, e))) evidenciasRaras.push(`${h.s} → ${e}`);
c("★ toda evidencia citada por toda skill es un archivo que existe hoy", evidenciasRaras.length === 0, evidenciasRaras.slice(0, 6).join(" | "));
c("las máquinas nuevas tienen evidencia propia (docx, zip y su herramienta)",
  existsSync(path.join(RAIZ, "src/engine/docxMinimo.ts")) && existsSync(path.join(RAIZ, "src/engine/zipMinimo.ts")) && existsSync(path.join(RAIZ, "src/engine/herramientaZip.ts")));

seccion("§4 · LO ESCRITO COINCIDE CON LO PROMETIDO");
const carpetas = readdirSync(path.join(RAIZ, "skills")).filter((x) => x.startsWith("cn-"));
// v1.0.6 · el piso paso de 100 a 101 al materializar `cn-web-escena-3d` (motor 3D
// offline). Se SUBE el conteo, no se lo baja: la cuenta es lo que el generador
// escribe desde `scripts/habilidades-cn.mjs`, y cualquier fila nueva tiene que
// cerrar contra el inventario real de herramientas antes de existir.
c("★ hay 101 carpetas skills/cn-* materializadas (V1.0.6: +cn-web-escena-3d)", carpetas.length === 101, `${carpetas.length}`);
c("el corpus completo llegó a 201 skills (100 de terceros + 101 propias)",
  readdirSync(path.join(RAIZ, "skills")).length === 201, `${readdirSync(path.join(RAIZ, "skills")).length}`);
const malEscritas: string[] = [];
for (const h of HABILIDADES_CN) {
  const ruta = path.join(RAIZ, "skills", `cn-${h.s}`, "SKILL.md");
  if (!existsSync(ruta)) { malEscritas.push(`${h.s}: sin carpeta`); continue; }
  const md = readFileSync(ruta, "utf8");
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) { malEscritas.push(`${h.s}: sin frontmatter`); continue; }
  const fm = m[1];
  const nombre = (fm.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (fm.match(/^description:\s*(.+)$/m) || [])[1]?.trim() || "";
  const requiere = (fm.match(/^requiere:\s*\[(.*)\]$/m) || [])[1] || "";
  const evidencia = (fm.match(/^evidencia:\s*\[(.*)\]$/m) || [])[1] || "";
  const estado = (fm.match(/^estado:\s*(.+)$/m) || [])[1]?.trim();
  if (nombre !== `cn-${h.s}`) malEscritas.push(`${h.s}: name=${nombre}`);
  if (desc !== String(h.d).trim()) malEscritas.push(`${h.s}: descripción distinta de la del contrato`);
  if (estado !== "probada") malEscritas.push(`${h.s}: estado=${estado}`);
  if (requiere !== h.h.join(", ")) malEscritas.push(`${h.s}: requiere no cierra con el contrato`);
  if (evidencia !== h.e.join(", ")) malEscritas.push(`${h.s}: evidencia no cierra con el contrato`);
  if (CJK.test(md)) malEscritas.push(`${h.s}: CJK en el SKILL.md`);
  if (/\bTODO\b|\bFIXME\b|\{\{|\[Brand/.test(md)) malEscritas.push(`${h.s}: placeholder sin resolver`);
}
c("★ cada SKILL.md dice el mismo contrato que la tabla (sin deriva)", malEscritas.length === 0, malEscritas.slice(0, 6).join(" | "));
c("toda skill escrita nombra sus herramientas en el cuerpo",
  HABILIDADES_CN.every((h: any) => h.h.every((t: string) => readFileSync(path.join(RAIZ, "skills", `cn-${h.s}`, "SKILL.md"), "utf8").includes(`\`${t}\``))));

seccion("§5 · EL GENERADOR ES REPRODUCTIBLE Y NO MIENTE");
const ver = spawnSync("node", ["scripts/generar-skills-cn.mjs", "--verificar"], { cwd: RAIZ, encoding: "utf8" });
c("★ `generar-skills-cn.mjs --verificar` sale 0: lo escrito en disco es lo que produce el contrato",
  ver.status === 0, ((ver.stdout || "") + (ver.stderr || "")).slice(0, 220));
const sinClaves = spawnSync("node", ["scripts/sin-claves.mjs"], { cwd: RAIZ, encoding: "utf8" });
c("★ las 100 skills nuevas no meten una clave en el repo (sin-claves sigue limpio)",
  sinClaves.status === 0, ((sinClaves.stdout || "") + (sinClaves.stderr || "")).slice(-200));

seccion("§6 · LA PUERTA LA CONOCE");
const validar = leer("scripts/validar.mjs");
c("la suite está registrada en SUITES (si no está en la puerta, no existe)", /id:\s*"skillsPropias"/.test(validar));
c("el catálogo honesto sigue siendo computado en runtime (35/77 u otro número leído, nunca escrito a mano)",
  /resumenHonesto/.test(leer("src/engine/catalogoHonesto.ts")) && !/verificadas: 35/.test(leer("src/engine/catalogoHonesto.ts")));
c("listar_skills quedó paginado (200 skills no pueden entrar enteras en un turno)",
  /def h_listar_skills/.test(leer("scripts/hindsight_daemon.py")) && /"siguiente"/.test(leer("scripts/hindsight_daemon.py")));

console.log(`\n═══ skillsPropias: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
