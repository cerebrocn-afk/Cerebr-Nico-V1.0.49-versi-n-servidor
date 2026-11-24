/**
 * tests/catalogoHerramientas.test.ts — v1.0.31 · LA FICHA NO MANDA
 * ===============================================================
 * `HERRAMIENTAS-PUENTE.md` decía 104 herramientas y había 105. Nadie lo miraba,
 * así que el error vivió semanas y se citó en conversación como si fuera dato.
 *
 * Esta suite fija la regla: la lista autoritativa es el REGISTRO en ejecución;
 * la ficha tiene que nombrar las 46 que viven en proceso, y su total declarado
 * tiene que cuadrar con sus propias filas. Cuando alguien añada una herramienta
 * y olvide la ficha, esto se pone rojo en vez de esperar a que lo note un humano.
 *
 * `npx tsx tests/catalogoHerramientas.test.ts`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nombresExternosDeLaFicha, CATALOGO } from "../scripts/catalogo-herramientas";
import { registerBuiltinPacks, getAllToolNames } from "../src/engine/toolRegistry";
import { registrarPackDocumentos } from "../src/engine/packDocumentos";
import { registrarPackTerminal } from "../src/engine/packTerminal";
import { TOOL_MANUALS } from "../src/engine/manuals";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function check(desc: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(desc); console.log(`  \u2717 ${desc}`); }
}

registerBuiltinPacks();
registrarPackDocumentos();
registrarPackTerminal();
const REGISTRO = getAllToolNames();
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TEXTO = fs.readFileSync(path.join(AQUI, "..", CATALOGO), "utf-8");
const FILAS = nombresExternosDeLaFicha(TEXTO);

console.log("\n1. LA FICHA · nombra todo lo que vive en proceso");
// ════════════════════════════════════════════════════════════════════════
{
  check(`el registro tiene 46 herramientas (${REGISTRO.length})`, REGISTRO.length === 46);
  const faltan = REGISTRO.filter((n) => !FILAS.includes(n));
  check("ninguna herramienta del registro falta en la ficha", faltan.length === 0);
  if (faltan.length) console.log(`      · faltan: ${faltan.join(", ")}`);
  check("la ficha nombra `abrir_red` (el que faltaba)", FILAS.includes("abrir_red"));
  check("la ficha declara 105 y tiene 105 filas", /Total:\s*105\s*herramientas/.test(TEXTO) && FILAS.length === 105);
  check("el título dice 105, no 104", /Catálogo de las 105 herramientas/.test(TEXTO) && !/Catálogo de las 104/.test(TEXTO));
  check("lleva el aviso de que la fuente es el registro", /Aviso de fuente/.test(TEXTO));
  check("59 externas + 46 en proceso = 105", FILAS.filter((n) => !REGISTRO.includes(n)).length === 59);
}

console.log("\n2. LOS MANUALES · los 46 tienen ficha de prompt");
// ════════════════════════════════════════════════════════════════════════
{
  const sinManual = REGISTRO.filter((n) => !(TOOL_MANUALS as Record<string, unknown>)[n]);
  check("no hay ninguna herramienta sin manual", sinManual.length === 0);
  if (sinManual.length) console.log(`      · sin manual: ${sinManual.join(", ")}`);
  check("los manuales no inventan herramientas que no existan", Object.keys(TOOL_MANUALS).every((n) => REGISTRO.includes(n)));
}

console.log("\n3. EL CENSO · el que se ejecuta, no el que se recuerda");
// ════════════════════════════════════════════════════════════════════════
{
  // Se extrae de una tabla sintética: solo las filas con nombre en backticks.
  const sintetico = [
    "# T",
    "| 1 | `read_file` | lee | `read_file({path})` | ok |",
    "| 2 | `write_file` | escribe | `write_file({path,content})` | ok |",
    "| sin número | `nombre_suelto` | no cuenta | — | — |",
    "prosa con `codigo_inline` que no es fila",
  ].join("\n");
  const r = nombresExternosDeLaFicha(sintetico);
  check("solo cuentan las filas numeradas", r.length === 2 && r.includes("read_file") && r.includes("write_file"));
  check("una fila sin número no cuenta", !r.includes("nombre_suelto"));
  check("el código en prosa no cuenta", !r.includes("codigo_inline"));
  check("no repite nombres", nombresExternosDeLaFicha(sintetico + "\n| 3 | `read_file` | otra vez | — | ok |").length === 2);
}

console.log(`\n—— catalogoHerramientas: ${ok} correctas · ${mal} fallidas ——`);
if (mal) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
process.exitCode = mal ? 1 : 0;
