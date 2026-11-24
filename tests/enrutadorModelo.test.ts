/**
 * tests/enrutadorModelo.test.ts — MODEL ROUTER (v1.39.0 · FASE 9)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/enrutadorModelo.test.ts
 *
 * Hoja de ruta §9: enruta cada clase de tarea al modelo más barato que cumpla
 * el piso (fuente única modelTiers), exige toolCapable en tareas de agente y
 * degrada con honestidad cuando nada alcanza.
 */
import {
  enrutar, PISO_POR_CLASE, ORDEN_NIVELES, USA_HERRAMIENTAS,
} from "../src/engine/enrutadorModelo";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

const FLOTA = ["llama3.2:1b", "qwen2.5:3b", "qwen2.5:7b", "qwen2.5:32b", "gpt-oss:120b-cloud"];

seccion("1. Tabla de pisos y coherencia");
{
  comprobar("clasificar tiene el piso más bajo", PISO_POR_CLASE.clasificar === "micro");
  comprobar("arquitectura tiene piso alto", ORDEN_NIVELES.indexOf(PISO_POR_CLASE.arquitectura) >= ORDEN_NIVELES.indexOf("large"));
  comprobar("agente usa herramientas", USA_HERRAMIENTAS.agente === true && USA_HERRAMIENTAS.chat === false);
}

seccion("2. Elige el más barato que cumple el piso");
{
  const d = enrutar("clasificar", FLOTA);
  comprobar("clasificar → el más pequeño (1b)", d.elegido === "llama3.2:1b" && d.suficiente);

  const d2 = enrutar("codigo", FLOTA);
  comprobar("codigo (piso small) → 7b, no el 1b ni el 3b", d2.elegido === "qwen2.5:7b" && d2.suficiente);

  const d3 = enrutar("chat", FLOTA);
  comprobar("chat (piso tiny) → 3b", d3.elegido === "qwen2.5:3b");
}

seccion("3. Agente exige toolCapable");
{
  const d = enrutar("agente", FLOTA);
  comprobar("agente (piso medium + tool) → 32b", d.elegido === "qwen2.5:32b" && d.suficiente);
  // Flota sin nada toolCapable de nivel suficiente:
  const dd = enrutar("agente", ["llama3.2:1b", "qwen2.5:3b"]);
  comprobar("sin modelo apto → insuficiente y honesto", dd.suficiente === false && dd.elegido !== null);
  comprobar("el motivo dice INSUFICIENTE", /INSUFICIENTE/.test(dd.motivo));
}

seccion("4. Casos límite");
{
  const d = enrutar("chat", []);
  comprobar("sin modelos → elegido null e insuficiente", d.elegido === null && !d.suficiente);
  const d2 = enrutar("clasificar", FLOTA);
  comprobar("registra descartados de mayor nivel", Array.isArray(d2.descartados));
}

console.log("\n" + "\u2500".repeat(58));
console.log(`\u2550\u2550\u2550 MODEL ROUTER: ${correctas} correctas \u00b7 ${fallos.length} ${fallos.length === 1 ? "FALLIDA" : "fallidas"} \u2550\u2550\u2550`);
if (fallos.length) { fallos.forEach((f) => console.log("  \u2717 " + f)); process.exit(1); }
