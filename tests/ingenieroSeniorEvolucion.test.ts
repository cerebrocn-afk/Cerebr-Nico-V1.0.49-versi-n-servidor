/**
 * tests/ingenieroSeniorEvolucion.test.ts — EVOLUCIÓN DE LA CAPA (v1.28.1)
 * ============================================================================
 * La capa «Ingeniero senior + transmutación binaria» ya vivía montada y probada
 * (tests/ingenieroSenior.test.ts, 25 ✓). Esta suite CUSTODIA su EVOLUCIóN, sin
 * pisar lo anterior:
 *
 *   1. REGISTRO VERSIONADO: la capa declara `version` y el registro la conserva.
 *   2. AUDITORÍA VERIFICABLE: `auditarExtensiones()` enseña id/modo/versión y los
 *      CARACTERES reales de cada directriz — medir, no prometer.
 *   3. NUEVAS COMPETENCIAS: disciplina de pruebas (TDD, propiedades, fuzzing) y
 *      reproducibilidad/observabilidad (builds deterministas, sha256, logs).
 *   4. NO REGRESIÓN: lo viejo sigue vivo y viaja íntegro al botón Ingeniero.
 *
 * Se ejecuta con:  npx tsx tests/ingenieroSeniorEvolucion.test.ts
 */
import {
  montarExtension,
  desmontarExtension,
  auditarExtensiones,
  extensionesMontadas,
} from "../src/engine/extensionesMotor";
import { EXTENSION_INGENIERO_SENIOR, DIRECTRIZ_INGENIERO_SENIOR } from "../src/engine/extensiones/ingenieroSenior";
import { directrizModo } from "../src/engine/thinkingMode";
import { buildExpertDirective } from "../src/utils/contextCache";

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = ""): void {
  if (condicion) correctas++;
  else {
    fallos.push(titulo + (detalle ? ` — ${detalle}` : ""));
    console.error(`  ✗ ${titulo}${detalle ? `\n      ${detalle}` : ""}`);
  }
}

// ─── 1 · REGISTRO VERSIONADO ──────────────────────────────────────────
comprobar("la capa de fábrica declara su versión", EXTENSION_INGENIERO_SENIOR.version === "1.28.1");
const okVer = montarExtension({ id: "demo.ver", modo: "ingeniero", directriz: "con version", version: "9.9.9" });
comprobar("monta una capa con versión y la acepta", okVer.ok === true);
comprobar("la versión montada se conserva en el registro",
  extensionesMontadas().find((e) => e.id === "demo.ver")?.version === "9.9.9");
const okSinVer = montarExtension({ id: "demo.sinver", modo: "ingeniero", directriz: "sin version" });
comprobar("la versión es OPCIONAL: sin ella también monta", okSinVer.ok === true);
comprobar("una versión en blanco no se guarda como cadena vacía",
  montarExtension({ id: "demo.verblanco", modo: "ingeniero", directriz: "x", version: "   " }).ok === true &&
  extensionesMontadas().find((e) => e.id === "demo.verblanco")?.version === undefined);

// ─── 2 · AUDITORÍA VERIFICABLE ──────────────────────────────────────
const auditoria = auditarExtensiones();
comprobar("la auditoría incluye la capa de fábrica",
  auditoria.some((f) => f.id === EXTENSION_INGENIERO_SENIOR.id));
const filaFabrica = auditoria.find((f) => f.id === EXTENSION_INGENIERO_SENIOR.id)!;
comprobar("la fila trae el botón al que se engancha", filaFabrica.modo === "ingeniero");
comprobar("la fila trae la versión real de la capa", filaFabrica.version === "1.28.1");
comprobar("la fila MIDE los caracteres reales de la directriz (no promete: cuenta)",
  filaFabrica.caracteres === DIRECTRIZ_INGENIERO_SENIOR.length && filaFabrica.caracteres > 0);
comprobar("la capa sin versión se audita como '(sin versión)'",
  auditarExtensiones().find((f) => f.id === "demo.sinver")?.version === "(sin versión)");

// ─── 3 · NUEVAS COMPETENCIAS DE LA EVOLUCIÓN ──────────────────────────
comprobar("añade DISCIPLINA DE PRUEBAS (TDD, propiedades, fuzzing)",
  /DISCIPLINA DE PRUEBAS/.test(DIRECTRIZ_INGENIERO_SENIOR) && /fuzzing/i.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /decode\(encode\(x\)\) === x/.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("añade REPRODUCIBILIDAD Y OBSERVABILIDAD (builds deterministas, sha256, logs)",
  /REPRODUCIBILIDAD Y OBSERVABILIDAD/.test(DIRECTRIZ_INGENIERO_SENIOR) &&
  /deterministas/i.test(DIRECTRIZ_INGENIERO_SENIOR) && /sha256/i.test(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("las nuevas competencias siguen siendo HONESTAS (SIN VERIFICAR sobrevive)",
  /SIN VERIFICAR/.test(DIRECTRIZ_INGENIERO_SENIOR));

// ─── 4 · NO REGRESIÓN: LO VIEJO SIGUE VIVO Y VIAJA AL BOTÓN ─────────────────
const dIng = directrizModo("ingeniero");
comprobar("ingeniero sigue partiendo de la base de código",
  dIng.startsWith(buildExpertDirective("code")));
comprobar("la capa (ya evolucionada) viaja íntegra al prompt del botón",
  dIng.includes(DIRECTRIZ_INGENIERO_SENIOR));
comprobar("los frentes originales siguen presentes (software, sistemas, binario)",
  /INGENIERO SENIOR/.test(dIng) && /ANÁLISIS DE SISTEMAS/.test(dIng) &&
  /TRANSMUTACIÓN DE CÓDIGOS BINARIOS/.test(dIng));
comprobar("auto/rápido/profundo no arrastran la capa evolucionada",
  directrizModo("auto") === "" && !/DISCIPLINA DE PRUEBAS/.test(directrizModo("rapido")) &&
  !/DISCIPLINA DE PRUEBAS/.test(directrizModo("profundo")));

// Limpieza de los ids demo.* que introdujo esta suite (honesta: no ensucia el registro).
for (const id of ["demo.ver", "demo.sinver", "demo.verblanco"]) desmontarExtension(id);

console.log(`\n═══ INGENIERO SENIOR · EVOLUCIÓN v1.28.1: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  ·", f);
}
process.exit(fallos.length ? 1 : 0);
