/**
 * tests/relevoFavoritos.test.ts — EL RELEVO AUTOMÁTICO (v1.77.0)
 * ==============================================================
 * Congela el criterio pedido por Mario 26/10: «que auto marque el mismo
 * prompt del chat a otro modelo cloud de la carpeta favoritos» cuando un
 * modelo cierra el turno sin contestar. Controles:
 *   · DEFECTO SEMBRADO por LECTURA DE FUENTE: el cable debe existir — App.tsx
 *     debe importar decisionRelevoFavoritos Y reiniciar la memoria del turno
 *     en el sender; desconectar el cable pone rojo (v1.66.1: módulos vivos
 *     con cables olvidados);
 *   · FALSO POSITIVO: turno que SÍ contestó jamás releva; capacidad apagada
 *     jamás releva; ya no hay dos relevos en el mismo turno (el bucle de
 *     reintentos es el defecto, no la cura);
 *   · un local jamás es destino (mismo hardware, misma sordera);
 *   · el orden de ⭐ Favoritos manda; los probados se saltan.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import { decisionRelevoFavoritos, turnoQuedoVacio } from "../src/engine/relevoFavoritos";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

const favoritas = [
  { provider: "ollama", modelId: "qwen2.5:0.5b", name: "local" },
  { provider: "zai", modelId: "glm-4.7-flash", name: "GLM" },
  { provider: "groq", modelId: "llama-3.3-70b", name: "Groq" },
];
const encendido = { activado: true, relevosEsteTurno: 0, probados: ["qwen2.5:0.5b"] };

prueba("turno vacío con relevo encendido pasa al primer cloud de favoritos (saltando locales)", () => {
  const d = decisionRelevoFavoritos(encendido, "   ", favoritas, "ollama");
  assert.strictEqual(d.accion, "relevar");
  if (d.accion === "relevar") {
    assert.strictEqual(d.destino.modelId, "glm-4.7-flash", "el local de favoritos jamás es destino");
    assert.ok(d.aviso.includes("MISMO prompt"), "el aviso promete el mismo prompt: " + d.aviso);
  }
});

prueba("FALSO POSITIVO: turno que contestó no releva, aunque esté encendido", () => {
  const d = decisionRelevoFavoritos(encendido, "Acá está el archivo que pediste, listo en el sandbox.", favoritas, "ollama");
  assert.strictEqual(d.accion, "quedarse");
  assert.ok(d.motivo.includes("sí entregó"), d.motivo);
});

prueba("apagado por preferencia: jamás releva (el usuario manda)", () => {
  const d = decisionRelevoFavoritos({ ...encendido, activado: false }, "", favoritas, "ollama");
  assert.strictEqual(d.accion, "quedarse");
  assert.ok(d.motivo.includes("apagado"), d.motivo);
});

// v1.80.0 · FASE 1 del plano: el tope pasó de 1 a 2 relevos por mensaje (la
// cascada que el plano pide) y el tope trae informe. La propiedad anti-bucle NO
// se afloja: sigue habiendo techo, y ahora el techo habla. El test viejo exigía
// «un relevo y silencio»; exige «dos relevos y, al tercer turno vacío, informe
// con la traza». Se actualiza a propósito y se declara en el CHANGELOG.
prueba("CASCADA CON TOPE: el segundo relevo entra, el tercero no — y llega el informe", () => {
  const segundo = decisionRelevoFavoritos({ ...encendido, relevosEsteTurno: 1, probados: ["qwen2.5:0.5b", "glm-4.7-flash"] }, "", favoritas, "glm-4.7-flash");
  assert.strictEqual(segundo.accion, "relevar", "el 2/2 está dentro del tope");
  const agotado = decisionRelevoFavoritos(
    { ...encendido, relevosEsteTurno: 2, probados: ["qwen2.5:0.5b", "glm-4.7-flash", "llama-3.3-70b"], intentos: [{ provider: "zai", modelId: "glm-4.7-flash", motivo: "fetch failed" }] },
    "",
    favoritas,
    "llama-3.3-70b"
  );
  assert.strictEqual(agotado.accion, "informar", "alcanzado el tope, el usuario recibe la traza");
  if (agotado.accion === "informar") {
    assert.ok(agotado.informe.includes("glm-4.7-flash"), "el informe nombra a quién se marcó");
    assert.ok(agotado.informe.includes("fetch failed"), "y con qué cayó");
  }
});

prueba("sin intentos previos no hay informe: se queda con el motivo legible", () => {
  const d = decisionRelevoFavoritos({ ...encendido, relevosEsteTurno: 2 }, "", favoritas, "ollama");
  assert.strictEqual(d.accion, "quedarse");
  assert.ok(d.motivo.includes("tope"), d.motivo);
});

prueba("los probados se saltan: si GLM ya fue probado, el destino es Groq", () => {
  const d = decisionRelevoFavoritos({ ...encendido, probados: ["qwen2.5:0.5b", "glm-4.7-flash"] }, "", favoritas, "ollama");
  assert.strictEqual(d.accion, "relevar");
  if (d.accion === "relevar") assert.strictEqual(d.destino.modelId, "llama-3.3-70b");
});

prueba("sin cloud en favoritos: se queda honesto, con motivo legible", () => {
  const d = decisionRelevoFavoritos(encendido, "", [{ provider: "ollama", modelId: "solo-local" }], "ollama");
  assert.strictEqual(d.accion, "quedarse");
  assert.ok(d.motivo.includes("Favoritos"), d.motivo);
});

prueba("turnoQuedoVacio: solo constancias del motor (⊕⊕) cuentan como vacío; prosa normal no", () => {
  assert.strictEqual(turnoQuedoVacio("⊕⊕ Constancia: 3 archivos escritos"), true);
  assert.strictEqual(turnoQuedoVacio("3 archivos escritos. ¿Seguimos?"), false);
  assert.strictEqual(turnoQuedoVacio(null as any), true);
});

// ─── DEFECTO SEMBRADO por lectura de fuente: el cable del relevo ───────────
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
prueba("cable en App: importa el criterio, abre memoria por turno y dispara en onDone", () => {
  assert.ok(app.includes("decisionRelevoFavoritos"), "App.tsx debe importar el criterio puro");
  assert.ok(app.includes("relevoTurnoRef.current = {"), "el sender debe reiniciar la memoria en cada turno");
  // v1.80.0 · la ventana era 700 caracteres; FASE 1 sumó telemetría e informe
  // dentro del bloque, que sigue re-entrando por el MISMO sender. La propiedad
  // congelada es la re-entrada con el mismo texto, no una distancia arbitraria.
  assert.ok(/accion === "relevar"[\s\S]{0,1600}handleSendMessageWithRAGRef\.current\(/.test(app),
    "la decisión relevar debe re-llamar al mismo sender con el mismo texto");
  assert.ok(app.includes("_rlTexto") && app.includes("setCurrentModel(dec.destino.modelId)"),
    "el relevo cambia de modelo y reusa el texto guardado del turno");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nrelevoFavoritos: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
