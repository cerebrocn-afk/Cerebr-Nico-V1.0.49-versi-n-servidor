/**
 * tests/motorEvidencia.test.ts — CLAIM → EVIDENCE → VERDICT (v1.34.0 · FASE 4)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/motorEvidencia.test.ts
 *
 * Hoja de ruta §8: sin evidencia no hay VERIFICADO; cada afirmación importante
 * tiene su comando canónico (anclaje MECÁNICO, no por orden). Aquí se prueba la
 * clasificación, la tabla de anclas, el veredicto (FALLO manda sobre éxito) y el
 * tablero por turno con su directiva de cierre.
 */
import {
  clasificarClaim,
  comandoDeEvidencia,
  veredictoDeEvidencia,
  registrarClaim,
  adjuntarEvidencia,
  estadoEvidencias,
  directivaDeEvidencia,
  evidenciaAParte,
  reiniciarEvidencia,
  verTablero,
  TABLA_EVIDENCIA,
} from "../src/engine/motorEvidencia";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. Clasificación: de prosa a tipo de claim");
{
  comprobar("«el archivo existe» → archivo_creado", clasificarClaim("el archivo Contacto.tsx existe") === "archivo_creado");
  comprobar("«compila sin errores» → compila", clasificarClaim("compila sin errores de tipo") === "compila");
  comprobar("«los tests pasan» → test_pasa", clasificarClaim("los tests pasan") === "test_pasa");
  comprobar("«el endpoint responde» → endpoint_funciona", clasificarClaim("el endpoint /api/users responde") === "endpoint_funciona");
  comprobar("«publicable / auditor» → publicable", clasificarClaim("el sitio pasa el auditor y es publicable") === "publicable");
  comprobar("«mismo hash» → archivo_identico", clasificarClaim("el archivo es idéntico al backup (sha256)") === "archivo_identico");
  comprobar("«bug arreglado» → bug_arreglado", clasificarClaim("el bug del overflow quedó arreglado") === "bug_arreglado");
  comprobar("«dependencia instalada» → dependencia_instalada", clasificarClaim("la dependencia jspdf está instalada") === "dependencia_instalada");
  comprobar("vacío → generico", clasificarClaim("") === "generico");
}

seccion("2. Ancla mecánica: criterio → comando (el salto sobre v1.32 por orden)");
{
  comprobar("compila → tsc/build", /tsc|build/i.test(comandoDeEvidencia("compila el proyecto").comando));
  comprobar("idÃ©ntico → SHA256", /sha256/i.test(comandoDeEvidencia("archivo idéntico").comando));
  comprobar("endpoint → HTTP", /http/i.test(comandoDeEvidencia("el endpoint responde").comando));
  comprobar("acepta el tipo directo", comandoDeEvidencia("test_pasa").tipo === "test_pasa");
  comprobar("toda la tabla tiene comando y autoridad", Object.values(TABLA_EVIDENCIA).every((a) => a.comando && a.autoridad));
}

seccion("3. Veredicto: sin evidencia jamás VERIFICADO; FALLO manda");
{
  comprobar("sin evidencia → SIN_VERIFICAR", veredictoDeEvidencia("compila", null).estado === "SIN_VERIFICAR");
  comprobar("build ok → VERIFICADO", veredictoDeEvidencia("compila", "build success, 0 errors").estado === "VERIFICADO");
  comprobar("error TS → FALLO", veredictoDeEvidencia("compila", "error TS2322: type mismatch").estado === "FALLO");
  comprobar("fallo manda aunque haya éxito en el texto", veredictoDeEvidencia("tests", "12 passed, 3 failed").estado === "FALLO");
  comprobar("evidencia sin marcador → PARCIAL", veredictoDeEvidencia("compila", "corriendo build… salida ambigua").estado === "PARCIAL");
  comprobar("la autoridad viaja en el veredicto", veredictoDeEvidencia("compila", "build ok").autoridad === "COMPILADOR");
}

seccion("4. Tablero por turno + directiva de cierre");
{
  reiniciarEvidencia();
  const c1 = registrarClaim("el formulario compila");
  registrarClaim("los tests pasan", "c-tests");
  comprobar("nace SIN_VERIFICAR", c1.veredicto.estado === "SIN_VERIFICAR");
  comprobar("tablero abierto con 2 claims", estadoEvidencias().abierto && estadoEvidencias().total === 2);
  adjuntarEvidencia(c1.id, "tsc --noEmit: 0 errors, build success");
  comprobar("tras evidencia → VERIFICADO", verTablero().find((x) => x.id === c1.id)!.veredicto.estado === "VERIFICADO");
  comprobar("sigue abierto (falta el de tests)", estadoEvidencias().abierto);
  adjuntarEvidencia("c-tests", "31 passed, 0 fail");
  comprobar("ahora cierra: nada pendiente", !estadoEvidencias().abierto && estadoEvidencias().verificados === 2);
  comprobar("directiva vacía cuando todo VERIFICADO", directivaDeEvidencia(estadoEvidencias()) === "");
}

seccion("5. Directiva cita el comando exacto que falta");
{
  reiniciarEvidencia();
  registrarClaim("el archivo es idéntico al backup", "c-hash");
  const d = directivaDeEvidencia(estadoEvidencias());
  comprobar("la directiva nombra SHA256", /sha256/i.test(d));
  const f = registrarClaim("compila", "c-fail");
  adjuntarEvidencia("c-fail", "build failed: 3 errors");
  comprobar("el fallido entra en fallidos", estadoEvidencias().fallidos.includes("c-fail"));
  comprobar("el parte lista estados", /VERIFICADO|SIN_VERIFICAR|FALLO/.test(evidenciaAParte()));
}

console.log("\n" + "\u2500".repeat(58));
if (fallos.length === 0) console.log(`\u2550\u2550\u2550 MOTOR DE EVIDENCIA: ${correctas} correctas · 0 fallidas \u2550\u2550\u2550`);
else { console.log(`\u2550\u2550\u2550 MOTOR DE EVIDENCIA: ${correctas} correctas · ${fallos.length} FALLIDAS \u2550\u2550\u2550`); fallos.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
