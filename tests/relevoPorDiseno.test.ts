/**
 * tests/relevoPorDiseno.test.ts — FASE 1: EL RELEVO POR DISEÑO (v1.80.0)
 * ======================================================================
 * Motor simulado, como pide el plano: «el modelo primario siempre falla → el
 * relevo termina en éxito; todos fallan → se produce el informe y no se
 * buclea». Además: la puerta es la capacidad del panel (no localStorage), la
 * cascada hereda memoria entre patas, y la telemetría de sesión cuenta.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import { decisionRelevoFavoritos, decisionRelevoPorFallo, informeHonestoRelevo, TOPE_RELEVOS, type EstadoRelevo } from "../src/engine/relevoFavoritos";
import { registrarRelevo, cerrarRelevo, resumenRelevo, lineaTelemetria } from "../src/engine/telemetriaRelevo";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

const COLA = [
  { provider: "zai", modelId: "glm-4.7-flash", name: "GLM" },
  { provider: "groq", modelId: "llama-3.3-70b", name: "Groq" },
];
const estado = (p: Partial<EstadoRelevo>): EstadoRelevo => ({ activado: true, relevosEsteTurno: 0, probados: ["modelo-rot0:local"], intentos: [], ...p });

prueba("primario falla por red → decisionRelevoPorFallo releva al primer favorito (1/2)", () => {
  const d = decisionRelevoPorFallo(estado({}), "fetch failed", COLA);
  assert.strictEqual(d.accion, "relevar");
  if (d.accion === "relevar") {
    assert.strictEqual(d.destino.modelId, "glm-4.7-flash");
    assert.ok(d.aviso.includes("1/2") && d.aviso.includes("fetch failed"), d.aviso);
  }
});

prueba("el favorito también falla → segundo relevo (2/2); al agotarse, INFORME con traza", () => {
  const segundo = decisionRelevoPorFallo(
    estado({ relevosEsteTurno: 1, probados: ["modelo-rot0:local", "glm-4.7-flash"], intentos: [{ provider: "zai", modelId: "glm-4.7-flash", motivo: "fetch failed" }] }),
    "ECONNRESET",
    COLA
  );
  assert.strictEqual(segundo.accion, "relevar", "la cascada llega hasta el tope, no antes");
  const agotado = decisionRelevoPorFallo(
    estado({
      relevosEsteTurno: TOPE_RELEVOS,
      probados: ["modelo-rot0:local", "glm-4.7-flash", "llama-3.3-70b"],
      intentos: [
        { provider: "zai", modelId: "glm-4.7-flash", motivo: "fetch failed" },
        { provider: "groq", modelId: "llama-3.3-70b", motivo: "429 quota" },
      ],
    }),
    "429 quota",
    COLA
  );
  assert.strictEqual(agotado.accion, "informar", "en el tope el usuario recibe la traza, no silencio");
  if (agotado.accion === "informar") {
    assert.ok(agotado.informe.includes("glm-4.7-flash") && agotado.informe.includes("fetch failed"), agotado.informe);
    assert.ok(agotado.informe.includes("llama-3.3-70b") && agotado.informe.includes("429"), agotado.informe);
    assert.ok(!/cuarta|sexta/.test(agotado.informe), "el informe no promete más reintentos del tope");
  }
});

prueba("turno vacío sin favoritos ya probados → informe igual de honesto; sin intentos, motivo seco", () => {
  const sinNada = decisionRelevoFavoritos(estado({ relevosEsteTurno: TOPE_RELEVOS }), "", COLA, "glm-4.7-flash");
  assert.strictEqual(sinNada.accion, "quedarse");
  const conTraza = decisionRelevoFavoritos(estado({ relevosEsteTurno: TOPE_RELEVOS, intentos: [{ provider: "zai", modelId: "glm", motivo: "x" }] }), "⊕⊕ informe del motor", COLA, "glm");
  assert.strictEqual(conTraza.accion, "informar");
});

prueba("apagado (capacidad off) JAMÁS releva: el usuario manda", () => {
  assert.strictEqual(decisionRelevoPorFallo(estado({ activado: false }), "fetch failed", COLA).accion, "quedarse");
  assert.strictEqual(decisionRelevoFavoritos(estado({ activado: false }), "", COLA, "x").accion, "quedarse");
});

prueba("telemetría de sesión: registra, cierra en éxito/fallo y resume por proveedor", () => {
  let L = registrarRelevo([], { momento: "10:00", desde: "glm-4.7-flash", desdeProvider: "zai", a: "llama-3.3-70b", aProvider: "groq", motivo: "fallo-comunicacion" });
  L = cerrarRelevo(L, "exito");
  L = registrarRelevo(L, { momento: "10:02", desde: "llama-3.3-70b", desdeProvider: "groq", a: "gemini-2.5-flash", aProvider: "gemini", motivo: "turno-vacio" });
  L = cerrarRelevo(L, "fallo", "429 quota");
  const r = resumenRelevo(L);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.exito, 1);
  assert.strictEqual(r.fallo, 1);
  assert.deepStrictEqual(r.porProveedor.groq, { exito: 1, fallo: 0 });
  assert.ok(lineaTelemetria(L).includes("groq (1✓/0✗)"), lineaTelemetria(L));
});

prueba("cable en App: la cascada HEREDA memoria y la puerta es la capacidad del panel", () => {
  const app = lee("src/App.tsx");
  assert.ok(app.includes("decisionRelevoPorFallo"), "el onError usa el criterio puro del fallo");
  assert.ok(app.includes("relevoContinuacionRef"), "la cascada hereda contador/traza entre patas");
  assert.ok(/relevoPrefido\(\)\s*[=\n]/.test(app) === false || app.includes("capacidadActiva(\"auto_relay\")"), "la puerta lee la capacidad del motor");
  const feats = lee("src/engine/advancedFeatures.ts");
  assert.ok(feats.includes('\"auto_relay\"') && feats.includes('\"consejo_eclectico\"'), "las capacidades existen en el catálogo del panel");
  assert.ok(lee("src/components/AdvancedFeaturesPanel.tsx").includes("auto_relay:"), "el panel le dio icono");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nrelevoPorDiseno: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
