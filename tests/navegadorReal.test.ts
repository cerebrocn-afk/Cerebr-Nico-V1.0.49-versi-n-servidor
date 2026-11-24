/**
 * tests/navegadorReal.test.ts — NAVEGADOR REAL (v1.37.0 · FASE 7)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/navegadorReal.test.ts
 *
 * Hoja de ruta §7: agente de navegador real. Se prueba que la validación de
 * acciones es correcta, que SIN motor el plan queda degradado (nada se ejecuta,
 * cero fingir) y que CON motor cada paso hereda su validez pura.
 */
import {
  validarAccion, planificarNavegacion, timeoutEfectivo,
  type AccionNavegador, type BrowserDriver,
} from "../src/engine/navegadorReal";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

const SIN: BrowserDriver = { disponible: false, motor: "" };
const CON: BrowserDriver = { disponible: true, motor: "playwright" };

seccion("1. validarAccion: cada tipo exige lo suyo");
{
  comprobar("ir con URL http(s) válida", validarAccion({ tipo: "ir", url: "https://x.com/a" }).ok);
  comprobar("ir sin URL válida = rechazo", !validarAccion({ tipo: "ir", url: "noesurl" }).ok);
  comprobar("clic exige selector", validarAccion({ tipo: "clic", selector: "#b" }).ok && !validarAccion({ tipo: "clic" }).ok);
  comprobar("escribir exige selector y texto", validarAccion({ tipo: "escribir", selector: "#i", texto: "hola" }).ok && !validarAccion({ tipo: "escribir", selector: "#i" }).ok);
  comprobar("esperar acepta selector o timeout", validarAccion({ tipo: "esperar", selector: "#x" }).ok && validarAccion({ tipo: "esperar", timeoutMs: 500 }).ok);
  comprobar("esperar sin nada = rechazo", !validarAccion({ tipo: "esperar" }).ok);
  comprobar("leer exige selector", validarAccion({ tipo: "leer", selector: "body" }).ok);
  comprobar("captura siempre válida", validarAccion({ tipo: "captura" }).ok);
  comprobar("timeout fuera de rango = rechazo", !validarAccion({ tipo: "captura", timeoutMs: 999999 }).ok);
  comprobar("tipo desconocido = rechazo", !validarAccion({ tipo: "volar" as any }).ok);
}

seccion("2. SIN motor: plan degradado, cero ejecución, cero fingir");
{
  const plan = planificarNavegacion([{ tipo: "ir", url: "https://x.com" }, { tipo: "clic", selector: "#a" }], SIN);
  comprobar("degradado=true sin motor", plan.degradado === true);
  comprobar("ejecutables=0 sin motor", plan.ejecutables === 0);
  comprobar("todos los pasos bloqueados", plan.bloqueados === 2 && plan.pasos.every((p) => !p.ejecutable));
  comprobar("el motivo declara que no hay navegador", plan.pasos[0].motivo.includes("sin motor"));
  comprobar("el parte pide instalar Playwright", plan.parte.includes("Playwright"));
}

seccion("3. CON motor: cada paso hereda su validez pura");
{
  const plan = planificarNavegacion([
    { tipo: "ir", url: "https://x.com" },
    { tipo: "clic", selector: "" },        // inválido
    { tipo: "escribir", selector: "#i", texto: "hola" },
  ], CON);
  comprobar("degradado=false con motor", plan.degradado === false);
  comprobar("motor reportado = playwright", plan.motor === "playwright");
  comprobar("2 ejecutables, 1 bloqueado", plan.ejecutables === 2 && plan.bloqueados === 1);
  comprobar("el clic sin selector queda no ejecutable", plan.pasos[1].ejecutable === false);
  comprobar("el parte cuenta ejecutables", plan.parte.includes("2") && plan.parte.includes("ejecutable"));
}

seccion("4. timeoutEfectivo");
{
  comprobar("usa el default cuando falta", timeoutEfectivo({ tipo: "captura" }) === 30000);
  comprobar("respeta el declarado", timeoutEfectivo({ tipo: "esperar", timeoutMs: 1500 }) === 1500);
}

console.log("\n" + "\u2500".repeat(58));
console.log(`\u2550\u2550\u2550 NAVEGADOR REAL: ${correctas} correctas \u00b7 ${fallos.length} ${fallos.length === 1 ? "FALLIDA" : "fallidas"} \u2550\u2550\u2550`);
if (fallos.length) { fallos.forEach((f) => console.log("  \u2717 " + f)); process.exit(1); }
