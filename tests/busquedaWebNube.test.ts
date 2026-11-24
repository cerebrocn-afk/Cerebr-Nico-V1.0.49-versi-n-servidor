/**
 * busquedaWebNube.test.ts — SUITE DE LA BÚSQUEDA WEB POR DEFECTO EN NUBE (PASO 6)
 * ==============================================================================
 * PASO 6 de la HOJA DE RUTA v1.54 (ver documentacion/HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md).
 * Se ejecuta con tsx (como el resto del motor). Verifica lo COMPROBABLE HOY: la
 * POLÍTICA de decisión (nube por defecto ON, local OFF, el usuario siempre manda),
 * el ensamblado del PAYLOAD de grounding por proveedor (Gemini nativo / OpenRouter
 * :online / solo-directiva), la DIRECTIVA de sistema (confirma→ejecuta sobre lo
 * seguro→cita) y la política de citas. Usa la FUENTE ÚNICA real `modelTiers` para
 * clasificar el modelo.
 *
 * La BÚSQUEDA WEB REAL contra internet NO se corre aquí (no hay red en dev) y queda
 * SIN VERIFICAR: la ejerce Mario al cablear en vivo (`server.ts`, v1.54.x).
 *
 * Registrado en scripts/validar.mjs como:
 *   { id: "busquedaWebNube", archivo: "tests/busquedaWebNube.test.ts", que: "v1.54.0 · ..." }
 */
import assert from "node:assert";
import {
  CONFIG_BUSQUEDA_DEFECTO, resolverSoporteGrounding, modeloExcluido, decidirBusquedaWeb,
  payloadGeminiGrounding, aplicarGroundingATools, modeloConSufijoOnline, directivaBusquedaWeb,
  requiereCitas, formatearCitas, parteBusqueda,
} from "../src/engine/busquedaWebNube";
import type { DecisionBusqueda } from "../src/engine/busquedaWebNube";

let pasadas = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); pasadas++; }
const J = (x: unknown) => JSON.stringify(x);
const OFF: DecisionBusqueda = { activa: false, esNube: false, soporte: "ninguno", motivo: "" };

// ── 1. resolverSoporteGrounding ──
ok(resolverSoporteGrounding("gemini") === "gemini-nativo", "gemini -> nativo");
ok(resolverSoporteGrounding("openrouter") === "openrouter-online", "openrouter -> online");
ok(resolverSoporteGrounding("openai") === "solo-directiva", "openai -> solo-directiva");
ok(resolverSoporteGrounding("deepseek") === "solo-directiva", "deepseek -> solo-directiva");
ok(resolverSoporteGrounding("") === "ninguno", "vacío -> ninguno");
ok(resolverSoporteGrounding(null) === "ninguno", "null -> ninguno");
ok(resolverSoporteGrounding("GEMINI") === "gemini-nativo", "case-insensitive");

// ── 2. NUBE por defecto ON ──
{
  const d = decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" });
  ok(d.activa === true && d.esNube === true, "nube + default -> activa");
  ok(d.soporte === "gemini-nativo", "soporte gemini-nativo");
}
{
  const d = decidirBusquedaWeb({ modelo: "gpt-4o", proveedor: "openai" });
  ok(d.activa === true && d.soporte === "solo-directiva", "gpt-4o nube + solo-directiva");
}
{
  const d = decidirBusquedaWeb({ modelo: "anthropic/claude-3.5-sonnet", proveedor: "openrouter" });
  ok(d.activa === true && d.soporte === "openrouter-online", "openrouter nube + online");
}

// ── 3. LOCAL -> OFF ──
{
  const d = decidirBusquedaWeb({ modelo: "llama3.1:8b" });
  ok(d.activa === false && d.esNube === false, "local -> no activa");
  ok(/LOCAL/.test(d.motivo), "motivo menciona LOCAL");
}
ok(decidirBusquedaWeb({ modelo: "qwen2.5-coder:1.5b" }).activa === false, "local pequeño -> no activa");

// ── 4. el usuario SIEMPRE manda ──
ok(decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini", anuladoPorUsuario: false }).activa === false, "usuario fuerza OFF");
ok(decidirBusquedaWeb({ modelo: "llama3.1:8b", anuladoPorUsuario: true }).activa === true, "usuario fuerza ON en local");
ok(decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini", config: { ...CONFIG_BUSQUEDA_DEFECTO, desactivadaGlobal: true } }).activa === false, "apagado global");
ok(decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini", config: { ...CONFIG_BUSQUEDA_DEFECTO, porDefectoEnNube: false } }).activa === false, "por-defecto-OFF");
ok(decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini", config: { ...CONFIG_BUSQUEDA_DEFECTO, modelosExcluidos: ["gemini"] } }).activa === false, "modelo excluido");
ok(decidirBusquedaWeb({ modelo: "gpt-4o", proveedor: "openai", anuladoPorUsuario: true, config: { ...CONFIG_BUSQUEDA_DEFECTO, desactivadaGlobal: true } }).activa === true, "anulación ON gana al global");

// ── 5. modeloExcluido ──
ok(modeloExcluido("GEMINI-2.5-flash", ["gemini"]) === true, "substring case-insensitive");
ok(modeloExcluido("gpt-4o", ["gemini"]) === false, "sin coincidencia");
ok(modeloExcluido("gpt-4o", []) === false, "lista vacía");
ok(modeloExcluido("gpt-4o", ["", "  "]) === false, "entradas vacías se ignoran");

// ── 6. payload / tools de Gemini ──
ok(J(payloadGeminiGrounding()) === J({ googleSearch: {} }), "payload googleSearch");
{
  const d = decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" });
  const tools = aplicarGroundingATools([{ functionDeclarations: [] }], d);
  ok(tools.length === 2 && tools.some((x: any) => "googleSearch" in x), "añade grounding");
}
{
  const entrada: any[] = [{ functionDeclarations: [] }];
  aplicarGroundingATools(entrada, decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" }));
  ok(entrada.length === 1, "no muta la entrada");
}
ok(aplicarGroundingATools([{ googleSearch: {} }], decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" })).length === 1, "no duplica grounding");
ok(aplicarGroundingATools([{ functionDeclarations: [] }], decidirBusquedaWeb({ modelo: "gpt-4o", proveedor: "openai" })).length === 1, "solo-directiva no toca tools");
ok(aplicarGroundingATools([{ a: 1 }], OFF).length === 1, "OFF no toca tools");

// ── 7. sufijo :online ──
ok(modeloConSufijoOnline("anthropic/claude-3.5-sonnet") === "anthropic/claude-3.5-sonnet:online", "añade :online");
ok(modeloConSufijoOnline("x/y:online") === "x/y:online", "no duplica :online");
ok(modeloConSufijoOnline("") === "", "vacío intacto");

// ── 8. directiva ──
{
  const d = decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" });
  const dir = directivaBusquedaWeb(d, {});
  ok(dir.length > 0, "directiva no vacía");
  ok(/ANTES de dar por válido/.test(dir), "confirma ANTES");
  ok(/SOLO sobre lo que quede CONFIRMADO/.test(dir), "ejecuta sobre lo confirmado");
  ok(/SIN VERIFICAR/.test(dir), "marca lo no confirmado");
  ok(/CITA las fuentes/.test(dir), "exige citar");
  ok(/grounding de Google/.test(dir), "menciona grounding en gemini");
  ok(/Máximo 3 citas/.test(directivaBusquedaWeb(d, { maxCitas: 3 })), "respeta maxCitas");
}
ok(directivaBusquedaWeb(OFF, {}) === "", "directiva vacía cuando OFF");
ok(/EXPLÍCITO sobre lo que no puedes confirmar/.test(directivaBusquedaWeb(decidirBusquedaWeb({ modelo: "gpt-4o", proveedor: "openai" }), {})), "solo-directiva avisa");

// ── 9. política de citas ──
{
  const d = decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" });
  ok(requiereCitas(d, true) === true, "cita si externa");
  ok(requiereCitas(d, false) === false, "no cita si no externa");
}
ok(requiereCitas(OFF, true) === false, "no cita si OFF");

// ── 10. formatear citas ──
{
  const txt = formatearCitas([{ url: "https://a.com", motivo: "versión" }, { url: "https://b.com", motivo: "" }], 5);
  ok(/^Fuentes:/.test(txt), "cabecera Fuentes:");
  ok(/\[1\] https:\/\/a\.com — versión/.test(txt), "cita con motivo");
  ok(/\[2\] https:\/\/b\.com$/m.test(txt), "cita sin motivo");
}
ok(formatearCitas([{ url: "https://a", motivo: "" }, { url: "https://b", motivo: "" }, { url: "https://c", motivo: "" }], 2).split("\n").length === 3, "recorta al tope");
ok(formatearCitas([], 5) === "", "vacía -> cadena vacía");
ok(formatearCitas([{ url: "  ", motivo: "x" }], 5) === "", "urls vacías se descartan");

// ── 11. parte legible ──
ok(/ACTIVADA/.test(parteBusqueda(decidirBusquedaWeb({ modelo: "gemini-2.5-flash", proveedor: "gemini" }))), "parte ACTIVADA");
ok(/desactivada/.test(parteBusqueda(decidirBusquedaWeb({ modelo: "llama3.1:8b" }))), "parte desactivada");

console.log(`busquedaWebNube.test.ts · ${pasadas} comprobaciones OK`);
