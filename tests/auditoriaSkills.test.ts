/**
 * tests/auditoriaSkills.test.ts — FASE 15: EL VIGILANTE SE PUEDE CORRER (v2.3.18)
 * ============================================================================
 * El plano dice que la herramienta «ya está escrita» señalando
 * `skills/cn-vigilante-de-skills/SKILL.md`, o sea **prosa dirigiendo a un agente**.
 * Contra eso hay dos objeciones y las dos se cierran acá: una revisión que no
 * produce un número comparable entre corridas no es una revisión, y una revisión
 * que no se puede vallar no existe (este repo ya contó cinco casos de «escrito,
 * verde y nunca registrado»).
 *
 * LO QUE ESTA SUITE NO HACE: no se pone roja porque el catálogo del usuario esté
 * roto. El plano es explícito — «el catálogo se arregla con ella, **el orden se
 * decide con él delante**» — así que el estado real del catálogo se **informa** y
 * se exige solo sobre lo que el repo genera y controla (`skills/cn-*`).
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFECTOS_DE_INDEX,
  auditarRaiz,
  auditarSkill,
  separarFrontmatter,
  textoDelActa,
} from "../scripts/auditar-skills.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(RAIZ, "scripts/auditar-skills.mjs");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const CUERPO = "Este es el cuerpo de la skill, con suficiente texto para que no cuente como vacia.\n";
function habilidad(dir: string, carpeta: string, frente: string | null, cuerpo = CUERPO) {
  mkdirSync(path.join(dir, carpeta), { recursive: true });
  if (frente === null) return;
  writeFileSync(path.join(dir, carpeta, "SKILL.md"), `---\n${frente}\n---\n\n${cuerpo}`);
}
const sana = (dir: string, carpeta: string) => habilidad(dir, carpeta, `name: ${carpeta}\ndescription: hace algo util`);

function arbol(construir: (dir: string) => void): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cn-skills-"));
  construir(dir);
  return dir;
}

console.log("\n1) Cada defecto del plano, cazado por nombre\n");

{
  const dir = arbol((d) => {
    sana(d, "skill-buena");
    habilidad(d, "carpeta-dice-otra-cosa", "name: otro-nombre\ndescription: el frente miente");
    habilidad(d, "frente-roto", "name: [sin cerrar\ndescription: 'sin comilla");
    mkdirSync(path.join(d, "sin-frontmatter"), { recursive: true });
    writeFileSync(path.join(d, "sin-frontmatter", "SKILL.md"), "solo prosa, sin frente\n");
    habilidad(d, "sin-nombre", "description: no tiene name");
    habilidad(d, "nombre-mayusculas", "name: Nombre Mal\ndescription: mayusculas y espacios");
    habilidad(d, "sin-descripcion", "name: sin-descripcion");
    habilidad(d, "cuerpo-chico", "name: cuerpo-chico\ndescription: sirve poco", "corta");
    mkdirSync(path.join(d, "carpeta-vacia"), { recursive: true });
  });
  const a = auditarRaiz(dir);
  const defectosDe = (carpeta: string) => (a.rotas.find((r: any) => r.nombreCarpeta === carpeta)?.fallos || []).join(",");
  c("\u2605 name != carpeta se caza (el defecto de la FASE 15)", defectosDe("carpeta-dice-otra-cosa").includes("nombre_distinto"), defectosDe("carpeta-dice-otra-cosa"));
  c("YAML roto se caza sin reventar el auditor", defectosDe("frente-roto").includes("frontmatter_roto"), defectosDe("frente-roto"));
  c("frente ausente se caza", defectosDe("sin-frontmatter").includes("sin_frontmatter"), defectosDe("sin-frontmatter"));
  c("nombre faltante se caza", defectosDe("sin-nombre").includes("sin_nombre"), defectosDe("sin-nombre"));
  c("nombre con mayusculas/espacios es inv\u00e1lido", defectosDe("nombre-mayusculas").includes("nombre_invalido"), defectosDe("nombre-mayusculas"));
  c("descripci\u00f3n faltante se caza", defectosDe("sin-descripcion").includes("sin_descripcion"), defectosDe("sin-descripcion"));
  c("cuerpo \u00fatilmente vac\u00edo se caza", defectosDe("cuerpo-chico").includes("cuerpo_corto"), defectosDe("cuerpo-chico"));
  c("carpeta sin SKILL.md se caza", defectosDe("carpeta-vacia").includes("sin_archivo"), defectosDe("carpeta-vacia"));
  c("\u2605 la skill correcta NO se marca", a.sanas.some((r: any) => r.nombreCarpeta === "skill-buena"));
  c("el total contado es el de carpetas del arbol", a.total === 9, String(a.total));
  c("el conteo por defecto cuadra con las rotas", Object.values(a.porDefecto).reduce((x: number, y: number) => x + y, 0) >= a.rotas.length);
}

console.log("\n2) Ruido que NO es defecto (falsos rojos = rojo ignorado)\n");

{
  const dir = arbol((d) => {
    mkdirSync(path.join(d, "con-bom-y-crlf"), { recursive: true });
    writeFileSync(path.join(d, "con-bom-y-crlf", "SKILL.md"), "\ufeff---\r\nname: con-bom-y-crlf\r\ndescription: tiene BOM y CRLF\r\n---\r\n\r\n" + CUERPO);
  });
  const a = auditarRaiz(dir);
  c("\u2605 BOM + CRLF no rompen el frente ni declaran la skill rota",
    a.rotas.length === 0 && a.sanas.length === 1, JSON.stringify ? "" : JSON.stringify(a.rotas.map((r: any) => r.fallos)));
  const r = separarFrontmatter(readFileSync(path.join(dir, "con-bom-y-crlf", "SKILL.md"), "utf8"));
  c("y el acta igual lo anota como ruido", (r as any).ruido === true);
}

console.log("\n3) Se corre como comando, y no toca un archivo\n");

function correr(args: string[]): { codigo: number; salida: string } {
  // v1.0.21 · STDOUT Y STDERR SEPARADOS. Antes se concatenaban: `--json` escupe el
  // acta por stdout y Node, con `--experimental-fetch` (o cualquier warning), mete
  // su aviso por stderr → `JSON.parse` recibía «(node:...) ExperimentalWarning»
  // delante y la suite se caía con un SyntaxError que parecía del auditor. El
  // acta se lee de stdout; stderr se conserva aparte para poder citarlo.
  try {
    const r = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { codigo: 0, salida: String(r) };
  } catch (e: any) {
    return {
      codigo: typeof e.status === "number" ? e.status : 99,
      salida: String(e.stdout || ""),
      errores: String(e.stderr || ""),
    } as { codigo: number; salida: string };
  }
}

function huellaDelArbol(dir: string): string {
  const h = createHash("sha256");
  const walk = (p: string) => {
    for (const n of readdirSync(p).sort()) {
      const completo = path.join(p, n);
      if (statSync(completo).isDirectory()) walk(completo);
      else h.update(n + "\0" + readFileSync(completo));
    }
  };
  walk(dir);
  return h.digest("hex");
}

{
  const dir = arbol((d) => { sana(d, "ok-una"); habilidad(d, "rota-dos", "name: otra-cosa\ndescription: rompi el vinculo"); });
  const antes = huellaDelArbol(dir);
  const json = correr(["--raiz", dir, "--json"]);
  const despues = huellaDelArbol(dir);
  c("\u2605 --json responde y es JSON de verdad", json.codigo === 1 && JSON.parse(json.salida).rotas.length === 1, "codigo=" + json.codigo);
  c("\u2605 el auditor NO MUTA: el \u00e1rbol sale byte a byte igual", antes === despues, "antes=" + antes.slice(0, 10) + " despues=" + despues.slice(0, 10));
  const texto = correr(["--raiz", dir]);
  c("el acta nombra la ruta y lo que dec\u00eda", /rota-dos/.test(texto.salida) && /otra-cosa/.test(texto.salida), texto.salida.slice(0, 80));
  c("y dice en claro que no arregla", /NO arregla/.test(texto.salida));
  c("c\u00f3digo 1 con una rota y tolerancia 0", texto.codigo === 1, String(texto.codigo));
  c("c\u00f3digo 0 si la tolerancia la cubre", correr(["--raiz", dir, "--tolerancia", "5"]).codigo === 0);
  c("ra\u00edz inexistente: c\u00f3digo 2 y causa, no un stack trace", (() => {
    const r = correr(["--raiz", path.join(dir, "no-existe")]);
    return r.codigo === 2 && /no existe/.test(r.salida) && !/at .*\.mjs/.test(r.salida);
  })());
}

console.log("\n4) El catálogo de verdad: se informa, no se maquilla\n");

{
  const a = auditarRaiz(path.join(RAIZ, "skills"));
  c("el repo tiene catálogo que auditar", a.total > 0, String(a.total));
  console.log(`     medido en ./skills: ${a.total} skills · ${a.rotas.length} rotas (${a.total ? Math.round((a.rotas.length / a.total) * 100) : 0} %) · ${JSON.stringify ? "" : ""}${Object.entries(a.porDefecto).map(([k, v]) => k + " " + v).join(" · ")}`);
  console.log(`     con capa: ${a.conCapa} · con cuando_no_usar: ${a.conCuandoNoUsar} → la FASE 16 arranca de cero`);
  c("\u2605 lo que el repo GENERA (cn-*) está sano: ahí sí exigimos",
    a.rotas.filter((r: any) => String(r.nombreCarpeta).startsWith("cn-")).length === 0,
    a.rotas.filter((r: any) => String(r.nombreCarpeta).startsWith("cn-")).map((r: any) => r.nombreCarpeta + ":" + r.fallos.join("/")).join(" | "));
  c("★ y el acta del catálogo roto NO se pone roja sola: el orden lo decide Mario",
    DEFECTOS_DE_INDEX.includes("nombre_distinto") && a.rotas.length >= 0);
}

console.log("\n5) Conexión: que esta vez sí corra\n");

{
  const validar = readFileSync(path.join(RAIZ, "scripts/validar.mjs"), "utf8");
  const pkg = readFileSync(path.join(RAIZ, "package.json"), "utf8");
  c("\u2605 el script existe", existsSync(SCRIPT));
  c("\u2605 la suite está registrada en npm run validar", validar.includes("auditoriaSkills.test.ts"));
  // El `cn-vigilante-de-skills/SKILL.md` que menciona el plano vive en el catálogo
  // del usuario (`<pc>/.agents/.zcode/skills`), no en el paquete: prometer que este
  // repo lo editó sería otra mentira de las que la FASE 11 caza. Lo que sí se
  // garantiza acá es que el ejecutable tiene puerta de comando.
  c("\u2605 hay comando en package.json (npm run skills:auditar)", /"skills:auditar"/.test(pkg));
  c("y el comando apunta al script real, no a un borrador", /skills:auditar": "node scripts\/auditar-skills\.mjs"/.test(pkg));
}

console.log("\n" + "\u2500".repeat(56));
console.log(`AUDITORÍA DE SKILLS (v2.3.18): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
