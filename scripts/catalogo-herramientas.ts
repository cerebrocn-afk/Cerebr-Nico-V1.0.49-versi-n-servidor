/**
 * scripts/catalogo-herramientas.ts — v1.0.31 · CENSO del catálogo
 * ===============================================================
 * El catálogo decía 104 y había 105: nadie lo comprobaba. Este censo compara la
 * ficha legible (`HERRAMIENTAS-PUENTE.md`) contra el registro en ejecución y
 * contra los nombres externos del puente, y nombra lo que falta y lo que sobra.
 *
 *   npx tsx scripts/catalogo-herramientas.ts        (informe)
 *   npx tsx scripts/catalogo-herramientas.ts --json (máquina)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerBuiltinPacks, getAllToolNames } from "../src/engine/toolRegistry";
import { registrarPackDocumentos } from "../src/engine/packDocumentos";
import { registrarPackTerminal } from "../src/engine/packTerminal";

export const CATALOGO = "HERRAMIENTAS-PUENTE.md";

/** Nombres externos del puente: los que la ficha documenta pero no viven en proceso. */
export function nombresExternosDeLaFicha(texto: string): string[] {
  const nombres = new Set<string>();
  // Solo filas de tabla de la forma `| n | `nombre` | …`
  for (const m of texto.matchAll(/^\|\s*\d+\s*\|\s*`([a-z][a-z0-9_]{2,40})`/gm)) nombres.add(m[1]);
  return [...nombres];
}

function main(): void {
  registerBuiltinPacks();
  registrarPackDocumentos();
  registrarPackTerminal();
  const enProceso = getAllToolNames();
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const ruta = path.join(aqui, "..", CATALOGO);
  const texto = fs.readFileSync(ruta, "utf-8");
  const fichados = nombresExternosDeLaFicha(texto);

  const faltanEnLaFicha = enProceso.filter((n) => !fichados.includes(n));
  const totalDeclarado = Number((texto.match(/Total:\s*(\d+)\s*herramientas/) || [])[1] || 0);
  const reporte = {
    enProceso: enProceso.length,
    filasEnLaFicha: fichados.length,
    totalDeclarado,
    faltanEnLaFicha,
    coincide: faltanEnLaFicha.length === 0 && totalDeclarado === fichados.length,
  };
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(reporte, null, 2));
  } else {
    console.log(`Registro en proceso: ${reporte.enProceso}`);
    console.log(`Filas en ${CATALOGO}: ${reporte.filasEnLaFicha} (declara ${reporte.totalDeclarado})`);
    console.log(reporte.coincide ? "CENSO: OK" : `CENSO: FALLAN ${reporte.faltanEnLaFicha.length} herramientas`);
    for (const n of reporte.faltanEnLaFicha) console.log(`  · falta en la ficha: ${n}`);
  }
  process.exitCode = reporte.coincide ? 0 : 1;
}

if (process.argv[1] && /catalogo-herramientas\.ts$/.test(process.argv[1])) main();
