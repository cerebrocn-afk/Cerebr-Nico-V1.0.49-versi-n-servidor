/**
 * tests/matrizVerificacion.test.ts — SOFTWARE QA MATRIX (v1.34.0 · FASE 4)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/matrizVerificacion.test.ts
 *
 * Hoja de ruta §10: no se dice "terminado" con capas obligatorias sin correr.
 * Se prueba: qué capas son obligatorias por perfil, que una obligatoria sin
 * evidencia bloquea el cierre, que una capa fallida bloquea aunque no sea
 * obligatoria, y que con todo verde sí se puede cerrar.
 */
import {
  MATRIZ,
  capasObligatorias,
  evaluarMatriz,
  directivaDeMatriz,
  matrizAParte,
} from "../src/engine/matrizVerificacion";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. La tabla del §10 está completa");
{
  comprobar("14 capas", MATRIZ.length === 14);
  comprobar("cada capa tiene herramienta y claim", MATRIZ.every((d) => d.herramienta && d.claim));
}

seccion("2. Obligatorias por perfil");
{
  const base = capasObligatorias("base");
  comprobar("base exige sintaxis/tipos/deps/unit/seguridad", ["sintaxis", "tipos", "dependencias", "unit", "seguridad"].every((c) => base.includes(c as any)));
  comprobar("base NO exige ui", !base.includes("ui" as any));
  comprobar("web sí exige ui", capasObligatorias("web").includes("ui" as any));
  comprobar("servicio exige api y runtime", ["api", "runtime"].every((c) => capasObligatorias("servicio").includes(c as any)));
}

seccion("3. Una obligatoria sin evidencia bloquea el 'terminado'");
{
  const d = evaluarMatriz({ sintaxis: "build ok", tipos: "0 errors", dependencias: "declarado en package, node_modules/x existe", unit: "31 passed" }, "base");
  comprobar("falta seguridad → no puede decir terminado", d.puedeDecirTerminado === false);
  comprobar("seguridad aparece como pendiente", d.obligatoriasPendientes.includes("seguridad"));
  comprobar("la directiva nombra seguridad", /seguridad/.test(directivaDeMatriz(d, "base")));
}

seccion("4. Con todas las obligatorias VERIFICADO, sí cierra");
{
  const ev = { sintaxis: "build success", tipos: "0 errors", dependencias: "instalado, resolved", unit: "31 passed, 0 fail", seguridad: "auditoría pasa, 0 bloqueantes" };
  const d = evaluarMatriz(ev, "base");
  comprobar("puede decir terminado", d.puedeDecirTerminado === true);
  comprobar("directiva vacía", directivaDeMatriz(d, "base") === "");
}

seccion("5. Una capa FALLIDA bloquea aunque no sea obligatoria");
{
  const ev = { sintaxis: "build ok", tipos: "0 errors", dependencias: "instalado", unit: "31 passed", seguridad: "0 bloqueantes", api: "500 internal server error" };
  const d = evaluarMatriz(ev, "base");
  comprobar("api falló", d.fallidas.includes("api"));
  comprobar("no cierra por el fallo", d.puedeDecirTerminado === false);
  comprobar("el parte marca con ✓/✗/·", /[\u2713\u2717·~]/.test(matrizAParte(d)));
}

console.log("\n" + "\u2500".repeat(58));
if (fallos.length === 0) console.log(`\u2550\u2550\u2550 MATRIZ DE VERIFICACIÓN: ${correctas} correctas · 0 fallidas \u2550\u2550\u2550`);
else { console.log(`\u2550\u2550\u2550 MATRIZ DE VERIFICACIÓN: ${correctas} correctas · ${fallos.length} FALLIDAS \u2550\u2550\u2550`); fallos.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
