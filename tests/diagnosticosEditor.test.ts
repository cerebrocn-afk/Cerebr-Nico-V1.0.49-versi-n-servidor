/**
 * diagnosticosEditor.test.ts — FASE 3 (v1.57.3) · LOS ERRORES DEL EDITOR AL MODELO
 * ===============================================================================
 * Fija que la salida CRUDA de tsc/tests se convierte en diagnósticos accionables:
 *   · parsea tsc clásico  src/x.ts(10,5): error TS2345: …
 *   · parsea tsc "pretty" src/x.ts:10:5 - error TS2345: …
 *   · deduplica (mismo error repetido = una entrada con ×veces)
 *   · archivos distintos → firmas distintas (no colapsan en «tipo|»)
 *   · compilación limpia → compilacionLimpia true y resumen «COMPILA»
 *   · firma repetida de un turno previo → el resumen AD VIERTE del bucle
 *   · vite/import sin líneas tsc → cae en el reconocedor y clasifica
 *
 * Corre con:  npx tsx tests/diagnosticosEditor.test.ts
 */
import { extraerDiagnosticos, compilacionLimpia, firmasDe, resumenParaModelo } from "../src/engine/diagnosticosEditor";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// ── 1. tsc clásico + dedup ───────────────────────────────────────
const salidaClasica = [
  "src/App.tsx(2750,13): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
  "src/App.tsx(2750,13): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
  "src/engine/x.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
].join("\n");
const d1 = extraerDiagnosticos(salidaClasica);
comprobar("clásico: 2 diagnósticos únicos", d1.length === 2, String(d1.length));
const dup = d1.find((d) => d.linea === 2750);
comprobar("clásico: el repetido cuenta ×2", dup?.veces === 2, String(dup?.veces));
comprobar("clásico: captura código TS", dup?.codigo === "TS2345");
comprobar("clásico: captura archivo", dup?.archivo === "src/App.tsx");
comprobar("clásico: clase tipo", dup?.clase === "tipo");

// ── 2. firmas distintas por archivo ────────────────────────────────
const firmas = firmasDe(d1);
comprobar("firmas: 2 distintas (no colapsan en tipo|)", new Set(firmas).size === 2, JSON.stringify(firmas));
comprobar("firmas: incluyen el archivo", firmas.every((f) => /src\//.test(f)));

// ── 3. tsc pretty ───────────────────────────────────────────
const d2 = extraerDiagnosticos("src/App.tsx:2750:13 - error TS2345: Argument of type 'number'.");
comprobar("pretty: 1 diagnóstico", d2.length === 1 && d2[0].codigo === "TS2345" && d2[0].linea === 2750 && d2[0].columna === 13, JSON.stringify(d2));

// ── 4. compilación limpia ──────────────────────────────────────
comprobar("limpia: vacío compila", compilacionLimpia("") === true);
comprobar("limpia: 'Found 0 errors.' compila", compilacionLimpia("Found 0 errors.") === true);
comprobar("limpia: con error NO compila", compilacionLimpia(salidaClasica) === false);
comprobar("resumen limpio dice COMPILA", /COMPILA/.test(resumenParaModelo(extraerDiagnosticos(""))));

// ── 5. resumen con errores + tope ─────────────────────────────────
const muchos = Array.from({ length: 20 }, (_, i) => `src/f${i}.ts(1,1): error TS2345: msg ${i}.`).join("\n");
const resu = resumenParaModelo(extraerDiagnosticos(muchos), { max: 5 });
comprobar("resumen: anuncia 20 errores", /20 error/.test(resu), resu.slice(0, 120));
comprobar("resumen: topa a 5 y cuenta el resto", /y 15 error/.test(resu));

// ── 6. bucle: firma de turno anterior ──────────────────────────────
const d6 = extraerDiagnosticos("src/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.");
const resuBucle = resumenParaModelo(d6, { firmasPrevias: firmasDe(d6) });
comprobar("bucle: advierte REPETICIÓN", /REPETICIÓN/.test(resuBucle), resuBucle);
comprobar("bucle: da CAUSA RAÍZ", /CAUSA RAÍZ/.test(resuBucle));
comprobar("bucle: da NO HAGAS", /NO HAGAS/.test(resuBucle));

// ── 7. fallback vite/import ──────────────────────────────────────
const d7 = extraerDiagnosticos('[plugin:vite:import-analysis] Failed to resolve import "react-dom/client" from "src/main.tsx". Does the file exist?');
comprobar("fallback: 1 diagnóstico de import", d7.length === 1 && d7[0].clase === "import-no-resuelto", JSON.stringify(d7));

// ── cierre ────────────────────────────────────────────────
const total = correctas + fallos.length;
console.log(`\ndiagnosticosEditor: ${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  · " + f);
  process.exit(1);
}
console.log("✅ FASE 3 — los errores reales del editor vuelven al modelo, deduplicados y con causa raíz.");
