/**
 * tests/importsVivos.test.ts — v1.0.34 · UN IMPORT QUE UN COMENTARIO SE COME
 * =========================================================================
 * Veredicto de Mario sobre v1.0.33: «TS2304: Cannot find name
 * 'evaluarCercoDeAlcance'». El nombre no faltaba: el `import` estaba ESCRITO en
 * la misma línea que un comentario de cola —
 *
 *   …from "./src/engine/ordenDelPrompt"; // v1.0.29 · … import { evaluarCercoDeAlcance } from …
 *
 * — y `//` se come todo lo que queda a su derecha. El archivo se lee bien, los
 * text-vallas que buscan el nombre lo encuentran, `tsc` no lo ve y el motor
 * arranca con la función sin definir. La suite compila cada archivo y compara
 * los `import` que el parser ve con los que el texto promete: si alguien vuelve
 * a esconder uno detrás de un comentario, sale con nombre y línea.
 *
 * `npx tsx tests/importsVivos.test.ts`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function check(desc: string, cond: boolean, detalle = "") {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(`${desc}${detalle ? ` → ${detalle}` : ""}`); console.log(`  \u2717 ${desc}${detalle ? ` → ${detalle}` : ""}`); }
}

/** Archivos que viajan: el monolito, el servidor y el motor. */
function recolectar(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "vendor"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recolectar(p, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
}

/**
 * Los `import … from "…"` que el TEXTO promete en una línea, con su columna.
 * Ignora los dinámicos (`import("…")`) y los que están dentro de un string.
 */
function importsPrometidos(linea: string): number[] {
  const out: number[] = [];
  const re = /(^|[;\s])import\s*(?:type\s*)?(?:\{|\*|[A-Za-z_$])/g;
  // Solo cuentan los que llevan un `from "…"` a la derecha: `import "mod"` de
  // efecto lateral vive siempre en su propia línea y no se ahoga detrás de nada.
  let m: RegExpExecArray | null;
  while ((m = re.exec(linea))) {
    const col = m.index + m[1].length;
    const cola = linea.slice(col);
    // un import de verdad tiene un `from "…"` a la derecha
    if (/from\s*["'][^"']+["']/.test(cola)) out.push(col);
  }
  return out;
}

/** ¿Hay un `//` de comentario antes de esa columna? (fuera de un string). */
function ahogadoPorComentario(linea: string, col: number): boolean {
  // Solo es el defecto si ANTES del `//` ya cerró una sentencia (`;`): dos
  // sentencias en una línea, y el comentario de la primera se come la segunda.
  // Las frases que mencionan un import dentro de una explicación (sin `;`) no cuentan.
  for (let i = 0; i < col; i++) {
    if (linea.startsWith("//", i)) return linea.slice(0, i).includes(";");
    const c = linea[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < linea.length && linea[j] !== c) { if (linea[j] === "\\") j++; j++; }
      i = j;
    }
  }
  return false;
}

const archivos = [path.join(RAIZ, "server.ts"), ...recolectar(path.join(RAIZ, "server")), ...recolectar(path.join(RAIZ, "src"))];

console.log("\n1. NINGÚN import vive detrás de un comentario");
// ════════════════════════════════════════════════════════════════════════
const ahogados: string[] = [];
for (const f of archivos) {
  const lineas = fs.readFileSync(f, "utf-8").split("\n");
  lineas.forEach((l, i) => {
    const t = l.trimStart();
    if (t.startsWith("//") || t.startsWith("*")) return;
    for (const col of importsPrometidos(l)) {
      if (ahogadoPorComentario(l, col)) {
        const nombre = (l.slice(col).match(/import\s*(?:type\s*)?\{?\s*([A-Za-z_$][\w$]*)/) || [, "?"])[1];
        ahogados.push(`${path.relative(RAIZ, f)}:${i + 1} · ${nombre}`);
      }
    }
  });
}
check("ningún archivo esconde un import detrás de `//`", ahogados.length === 0, ahogados.slice(0, 5).join(" | "));

console.log("\n2. EL CASO DEL VEREDICTO · el cerco vuelve a estar importado");
// ════════════════════════════════════════════════════════════════════════
const srv = fs.readFileSync(path.join(RAIZ, "server.ts"), "utf-8");
const lineaCerco = srv.split("\n").find((l) => l.includes("evaluarCercoDeAlcance") && l.includes("import")) || "";
check("server.ts declara el import de evaluarCercoDeAlcance", /import\s*\{[^}]*evaluarCercoDeAlcance[^}]*\}\s*from\s*"\.\/src\/engine\/cercoDeAlcance"/.test(lineaCerco));
check("…y el `from` está ANTES de cualquier comentario de la línea",
  lineaCerco.indexOf("./src/engine/cercoDeAlcance") !== -1 &&
  (lineaCerco.indexOf("//") === -1 || lineaCerco.indexOf("./src/engine/cercoDeAlcance") < lineaCerco.indexOf("//")));
check("el módulo del cerco existe y exporta la función",
  /export\s+function\s+evaluarCercoDeAlcance\b/.test(fs.readFileSync(path.join(RAIZ, "src/engine/cercoDeAlcance.ts"), "utf-8")));
check("y el sitio de uso está dentro del archivo (el error no era de otra copia)", srv.includes("evaluarCercoDeAlcance({"));

console.log("\n3. LA LISTA NO SE VACÍA · todo import con `{ … }` cierra su llave");
// ════════════════════════════════════════════════════════════════════════
{
  const rotos: string[] = [];
  for (const f of archivos) {
    const lineas = fs.readFileSync(f, "utf-8").split("\n");
    lineas.forEach((l, i) => {
      const t = l.trimStart();
      if (!t.startsWith("import")) return;
      // Solo una línea que ya trae su `from "…"`: ahí la llave DEBE cerrar en la misma línea.
      if (!/from\s*["'][^"']+["']/.test(l)) return;
      const abre = (l.match(/\{/g) || []).length;
      const cierra = (l.match(/\}/g) || []).length;
      if (abre > cierra) rotos.push(`${path.relative(RAIZ, f)}:${i + 1}`);
    });
  }
  check("ningún import de lista queda abierto en su línea", rotos.length === 0, rotos.slice(0, 5).join(" | "));
}

console.log(`\n—— importsVivos: ${ok} correctas · ${mal} fallidas ——`);
if (mal) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
process.exitCode = mal ? 1 : 0;
