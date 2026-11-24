#!/usr/bin/env node
/**
 * scripts/limpiar-dist.mjs — v1.0.43 · `npm run clean` QUE ANDA EN WINDOWS
 * ==========================================================================
 * Queja de la consola de Mario (`npm run dist`, 21/11):
 *
 *   ✗ FALTA server.js → lo invoca «npm run clean» y no existe en disco
 *
 * La receta era `rm -rf dist server.js`. Dos defectos en una línea:
 *   1. `server.js` NUNCA existió: el servidor se llama `server.ts` y se compila
 *      a `dist/server.mjs`. Un `rm` de algo que no está no limpia nada y, en la
 *      puerta de empaquetado, hace abortar el build entero por un fantasma.
 *   2. `rm -rf` es un comando de Unix. En el Windows de Mario (cmd.exe) falla
 *      con «no se reconoce como un comando interno o externo» — el `clean`
 *      estaba roto en la única máquina donde se usa.
 *
 * Acá la limpieza es Node puro: borra lo que SÍ es salida de build (`dist/`,
 * `dist_electron/`) y, si quedó un `server.js` viejo de una versión anterior,
 * también. Nada más: no toca fuentes, ni `node_modules`, ni datos.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBJETIVOS = ["dist", "dist_electron", "server.js"];

let borrados = 0;
for (const rel of OBJETIVOS) {
  const abs = path.join(RAIZ, rel);
  if (!fs.existsSync(abs)) continue;
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`  ✓ borrado ${rel}`);
    borrados++;
  } catch (e) {
    console.error(`  ✗ no pude borrar ${rel}: ${e?.message || e}`);
    process.exitCode = 1;
  }
}
console.log(borrados ? `[clean] ${borrados} artefacto(s) de build borrado(s).` : "[clean] nada que borrar: el árbol ya está limpio.");
