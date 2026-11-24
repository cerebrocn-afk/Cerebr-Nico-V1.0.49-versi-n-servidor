/**
 * continuidadTurno.test.ts — EL MODELO QUE ANUNCIA Y NO HACE (v1.66.0)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/continuidadTurno.test.ts
 *
 * RAÍZ (reportado por el usuario): el modelo dice «voy a revisar…» y corta el
 * turno sin ejecutar ni entregar; el humano tiene que escribir «sigue». Aquí se
 * fija que una promesa de acción inminente SIN obra ni tool-call se marca como
 * corte prematuro y produce una directiva; y —CONTROL DE FALSO POSITIVO triple—
 * que un turno que SÍ actuó, una pregunta legítima o una entrega cerrada NO se
 * marcan. Lógica pura: sin red, sin disco. Corre sin node_modules.
 */
import {
  evaluarContinuidad,
  mensajeContinuidad,
} from "../src/engine/continuidadTurno";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] DEFECTO SEMBRADO: «voy a revisar…» y corta sin actuar");
{
  const v = evaluarContinuidad({
    textoFinal: "Perfecto. Voy a revisar el archivo y completar las secciones faltantes\u2026",
    huboToolCalls: false,
    huboObra: false,
  });
  comprobar("es prematuro", v.prematuro === true, JSON.stringify(v));
  comprobar("trae directiva", !!v.directiva && v.directiva.includes("CONTINUIDAD"), v.directiva);
  comprobar("nombra la promesa", !!v.promesa, v.promesa);
}

console.log("\n[2] «ahora lo completo» también es promesa vacía");
{
  const v = evaluarContinuidad({ textoFinal: "Entendido. Ahora lo completo.", huboToolCalls: false, huboObra: false });
  comprobar("es prematuro", v.prematuro === true, JSON.stringify(v));
}

console.log("\n[3] FALSO POSITIVO 1: el turno SÍ actuó (tool-call u obra)");
{
  const a = evaluarContinuidad({ textoFinal: "Voy a revisar\u2026", huboToolCalls: true, huboObra: false });
  const b = evaluarContinuidad({ textoFinal: "Voy a revisar\u2026", huboToolCalls: false, huboObra: true });
  comprobar("con tool-call => ok", a.prematuro === false, JSON.stringify(a));
  comprobar("con obra => ok", b.prematuro === false, JSON.stringify(b));
}

console.log("\n[4] FALSO POSITIVO 2: pregunta legítima al usuario");
{
  const v = evaluarContinuidad({ textoFinal: "Para seguir, \u00bfqu\u00e9 framework prefieres?", huboToolCalls: false, huboObra: false });
  comprobar("pregunta => ok", v.prematuro === false, JSON.stringify(v));
}

console.log("\n[5] FALSO POSITIVO 2b: entrega cerrada con resultado");
{
  const v = evaluarContinuidad({ textoFinal: "Listo, dej\u00e9 el index.html completo y la hoja de estilos.", huboToolCalls: false, huboObra: false });
  comprobar("entrega => ok", v.prematuro === false, JSON.stringify(v));
}

console.log("\n[6] FALSO POSITIVO 3: charla normal sin verbo de acción inminente");
{
  const v = evaluarContinuidad({ textoFinal: "Interesante enfoque, me parece correcto el patr\u00f3n que describes.", huboToolCalls: false, huboObra: false });
  comprobar("charla => ok", v.prematuro === false, JSON.stringify(v));
}

console.log("\n[7] la directiva es accionable y en español");
{
  const m = mensajeContinuidad("voy a revisar");
  comprobar("pide actuar ahora", /HAZLO AHORA/.test(m), m);
  comprobar("desaconseja esperar «sigue»", /sigue/.test(m), m);
}

console.log(`\nRESUMEN continuidadTurno: ${pasan} pasan, ${fallan} fallan`);
if (fallan) { console.error("FALLOS:\n - " + fallos.join("\n - ")); process.exit(1); }
console.log("OK continuidadTurno");
