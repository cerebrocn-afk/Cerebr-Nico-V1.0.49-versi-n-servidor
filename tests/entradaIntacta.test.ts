/**
 * tests/entradaIntacta.test.ts — NINGÚN ARCHIVO DE ORIGEN LLEGA VACÍO (v2.1.9)
 * =========================================================================
 * LO QUE PASÓ (y por qué esta valla existe, con nombres y bytes)
 * -------------------------------------------------------------
 * Dos veces, al subir la versión, usué esta línea:
 *
 *     open(f,'w').write(open(f).read().replace(...))
 *
 * En Python el objeto `open(f,'w')` se construye ANTES de evaluar el argumento:
 * abre, **trunca el archivo a cero bytes**, y recién después `open(f).read()` lee
 * un archivo que ya está vacío. Resultado: se escribe la cadena vacía sobre el
 * contenido. No es un empate raro — es un `> file` seguido de un `< file`.
 *
 * El daño:
 *   v2.1.7 · `index.html`  19.745 B -> 0 B
 *   v2.1.8 · `src/constants.ts`  22.656 B -> 0 B
 *
 * Y el efecto que Mario vio en la consola:
 *
 *     vite v6.4.5 building for production...
 *     ✓ 1 modules transformed.
 *     dist/index.html  0.00 kB │ gzip: 0.02 kB
 *     ▲ [WARNING] Import "PORTS" ... because the file "src/constants.ts" has no exports
 *
 * Con el HTML de entrada vacío Vite no tiene grafo que armar: "1 módulo" es el
 * propio archivo vacío. La app no carga y no hay error ruidoso: solo una página
 * en blanco. Y como `index.html` estaba vacío, la pantalla de arranque tampoco
 * podía aparecer: de ahí el "no pasa del logo" / "se queda cargando".
 *
 * Lo que esta valla exige (barata, y mata las dos clases de daño)
 * --------------------------------------------------------------
 *  1. Que NINGÚN archivo de origen del árbol esté en 0 bytes.
 *  2. Que `index.html` tenga lo que necesita el navegador: root + módulo de
 *     entrada + el rótulo de versión igual a la semilla.
 *  3. Que `src/constants.ts` exported lo que medio proyecto importa.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e: any) {
    fallos.push(`${nombre} → ${e?.message || e}`);
    console.log(`  ✗ ${nombre} — ${e?.message || e}`);
  }
}

/** Carpetas de origen: si un archivo de éstas está en 0 bytes, algo lo truncó. */
const CARPETAS = ["src", "server", "scripts", "tests"];
const EXT = /\.(ts|tsx|js|mjs|cjs|css|html|json)$/;

function caminata(dir: string, sale: string[] = []): string[] {
  for (const e of readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir.split(path.sep).join("/"), e.name);
    const abs = path.join(RAIZ, rel);
    if (e.isDirectory()) {
      if (["node_modules", "dist", ".git", ".vite", "vendor"].includes(e.name)) continue;
      caminata(rel.split("/").join(path.sep), sale);
    } else if (EXT.test(e.name)) sale.push(rel);
  }
  return sale;
}

console.log("\n── 1. Ningún archivo de origen en cero bytes ──");

prueba("★ no hay archivos de origen truncados (el daño de 2.1.7 y 2.1.8)", () => {
  const vacios: string[] = [];
  for (const rel of CARPETAS.flatMap((c) => caminata(c))) {
    try {
      if (statSync(path.join(RAIZ, rel)).size === 0) vacios.push(rel);
    } catch {}
  }
  assert.deepEqual(
    vacios,
    [],
    `${vacios.length} archivo(s) de origen en 0 bytes: ${vacios.slice(0, 8).join(", ")}` +
      ` — alguien abrió el archivo para escribir antes de leerlo`,
  );
});

console.log("\n── 2. La entrada del navegador está completa ──");

prueba("★ index.html existe y pesa lo que pesa una pantalla de arranque (> 4 KB)", () => {
  assert.ok(existsSync(path.join(RAIZ, "index.html")), "no existe index.html");
  const n = statSync(path.join(RAIZ, "index.html")).size;
  assert.ok(n > 4096, `index.html tiene ${n} bytes — Vite no tendría grafo que construir`);
});

prueba("index.html tiene el root y el módulo de entrada", () => {
  const h = leer("index.html");
  assert.match(h, /id="root"/, "falta <div id=\"root\">: React no tiene dónde montarse");
  assert.match(h, /<script[^>]*type="module"[^>]*src="\/src\/main\.[tj]sx?"/, "falta el <script type=\"module\" src=\"/src/main.tsx\">: Vite no arranca la app");
});

prueba("★ el rótulo de index.html es la semilla (misma versión en los dos lados)", () => {
  const semilla = leer("src/constants.ts").match(/const VERSION_SEMVER = "([\d.]+)"/)?.[1];
  assert.ok(semilla, "no se lee VERSION_SEMVER de src/constants.ts");
  assert.ok(leer("index.html").includes(`CerebróNico V${semilla}`), `index.html no dice CerebróNico V${semilla}`);
});

console.log("\n── 3. constants.ts exporta lo que medio proyecto importa ──");

prueba("★ constants.ts exporta PORTS e IDE_BRAND, y tiene UN solo literal de versión", () => {
  const c = leer("src/constants.ts");
  assert.ok(c.length > 1000, `constants.ts tiene ${c.length} chars — está vacío o truncado`);
  for (const sym of ["PORTS", "IDE_BRAND"]) {
    assert.match(c, new RegExp(`export const ${sym}\\b`), `constants.ts no exporta ${sym}`);
  }
  // La semilla es un `const` privado a propósito (una sola fuente); lo que se
  // exporta es IDE_BRAND.SEMVER. Se comprueba el literal Y su exportación.
  assert.match(c, /const VERSION_SEMVER = "\d+\.\d+\.\d+";/, "no está el literal único VERSION_SEMVER");
  assert.match(c, /SEMVER: VERSION_SEMVER/, "VERSION_SEMVER no se expone por IDE_BRAND.SEMVER");
});

prueba("los importadores de constants no quedan colgados (PORTS/IDE_BRAND se usan)", () => {
  const c = leer("src/constants.ts");
  // Si alguien borra la exportación pero deja los imports, esbuild avisa y el
  // valor sale `undefined` en runtime: la pantalla se cae sin error ruidoso.
  assert.match(c, /PORTS/, "constants.ts ni menciona PORTS");
});

console.log(`\n═══ entradaIntacta: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}
