/**
 * tests/ranuraVozEclectica.test.ts — EL USUARIO ELIGE QUIÉN CONTESTA (v2.3.6)
 * ==========================================================================
 * Se ejecuta con:  npx tsx tests/ranuraVozEclectica.test.ts
 *
 * El pedido (4/11): «revisa si es posible seleccionar a los modelos del ecléctico,
 * con una función parecida al favorito pero de ecléctico, y sea elegido para una de
 * las voces, así selecciono modelos que contesten». Medido antes de tocar: las voces
 * se armaban solas desde favoritos (`server/routers/enjambre.ts:128`, y el descarte
 * de `:143` lo decía: «cargá modelos en ⭐ Favoritos…»), sin ranura propia.
 *
 * Esta suite no prueba gusto: prueba los TRES límites que hacen que una ranura sea
 * segura — prioridad sin apagar el enjambre, la aduana por encima del capricho, y
 * ranura vacía = comportamiento idéntico al de ayer.
 */
import { armarEnjambre, CRITERIO_POR_DEFECTO, type VozPlana } from "../src/engine/enjambreEclectico";
import { vocesFijasDelUsuario } from "../src/utils/enjambreCliente";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: unknown, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};
const NUBE: Record<string, boolean> = { gemini: true, openrouter: true, groq: true, ollama: false };
const v = (provider: string, modelId: string): VozPlana => ({ provider, modelId });

console.log("\n1) La ranura manda en el orden, no en la aduana\n");
{
  const favoritos = [v("groq", "comp-1"), v("openrouter", "oro-2"), v("gemini", "gem-3")];
  const r = armarEnjambre(favoritos, NUBE, { maximas: 3, vocesFijas: [v("gemini", "gem-3")] });
  c("\u2605 el modelo de la ranura ocupa la primera voz disponible", r.voces[0]?.modelId === "gem-3", JSON.stringify(r.voces.map((x) => x.modelId)));
  c("y se lo marca como puesto a mano (`fijada`)", r.voces[0]?.fijada === true, JSON.stringify(r.voces[0]));
  c("el resto de los favoritos sigue completando hasta el techo", r.voces.length === 3, String(r.voces.length));
}

console.log("\n2) NUNCA CERO VOCES: la ranura no puede apagar el enjambre\n");
{
  const favoritos = [v("groq", "comp-1")];
  const r = armarEnjambre(favoritos, NUBE, { maximas: 3, vocesFijas: [] });
  c("ranura vacía = comportamiento idéntico al de ayer", r.voces.length === 1 && r.voces[0].modelId === "comp-1");
  const mala = armarEnjambre(favoritos, NUBE, { maximas: 3, vocesFijas: [{ provider: "", modelId: "" }] });
  c("una ranura mal cargada no borra las voces que sí existían", mala.voces.length >= 1, JSON.stringify(mala.voces));
  const sinFav = armarEnjambre([], NUBE, { maximas: 3, vocesFijas: [v("gemini", "gem-3")] });
  c("\u2605 con favoritos vacíos, la ranura alcanz para contestar", sinFav.voces.some((x) => x.modelId === "gem-3"), JSON.stringify(sinFav.voces));
}

console.log("\n3) La aduana est por encima del capricho\n");
{
  const r = armarEnjambre([v("groq", "comp-1")], NUBE, { maximas: 3, vocesFijas: [v("ollama", "snowflake-arctic-embed:33m")] });
  c("declarar un embedding no lo cuela como voz", !r.voces.some((x) => /embed/i.test(x.modelId)));
  c("\u2605 y el rechazo se LEE en los descartes, no se reemplaza en silencio",
    r.descartes.some((d) => /embed/i.test(d.razon) || /embedding/i.test(d.razon)), JSON.stringify(r.descartes));
  const sinClave = armarEnjambre([v("groq", "comp-1")], { gemini: false }, { maximas: 3, vocesFijas: [v("gemini", "gem-3")] });
  c("un modelo de proveedor sin clave no entra slo por haber sido elegido", !sinClave.voces.some((x) => x.provider === "gemini" && x.fijada === true));
}

console.log("\n4) El cable: la ranura viaja del navegador al router\n");
{
  const fij = vocesFijasDelUsuario({ tarea: "x", favoritos: [], unificados: null, tieneClave: {}, claves: {},
    vocesFijas: [{ provider: "gemini", modelId: " gem-3 " }, { provider: "", modelId: "" }, { provider: "cerebro", modelId: "cerebro/raro" }] } as any);
  c("\u2605 la ranura pasa por el MISMO filtro que las voces (un solo dueo de la limpieza)",
    fij.length === 1 && fij[0].modelId === "gem-3", JSON.stringify(fij));
  const enc = leer("server/routers/enjambre.ts");
  c("el router recibe `vocesFijas` y se la pasa al criterio", /vocesFijas: fijadas/.test(enc) && /const fijadas = \(Array\.isArray\(cuerpo\.vocesFijas\)/.test(enc));
  c("la mochila la declara y el cliente la manda en el cuerpo",
    /vocesFijas\?:/.test(leer("src/utils/enjambreCliente.ts")) && /vocesFijas: vocesFijasDelUsuario\(m\)/.test(leer("src/utils/enjambreCliente.ts")));
  c("App.tsx la llena desde la bandera del favorito", /\(fm as any\)\.vozEclectica === true/.test(leer("src/App.tsx")));
  c("la suite est registrada en la valla maestra", leer("scripts/validar.mjs").includes("ranuraVozEclectica.test.ts"));
}

console.log("\n" + "\u2500".repeat(56));
console.log(`\u2550\u2550\u2550 RANURA DE VOZ (v2.3.6): ${correctas} correctas \u00b7 ${fallos.length} fallos \u2550\u2550\u2550`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
