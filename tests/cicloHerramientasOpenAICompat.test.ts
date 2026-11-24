/**
 * cicloHerramientasOpenAICompat.test.ts — BUCLE DE HERRAMIENTAS OpenAI-compat (v1.45.0)
 * ===================================================================================
 * Se ejecuta con:  npx tsx tests/cicloHerramientasOpenAICompat.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * RAÍZ que cierra: hasta v1.44 las ramas OpenAI-compat (Z.ai/GLM, Groq,
 * OpenRouter, Custom) sólo transmitían TEXTO; no pasaban `tools` ni leían las
 * `tool_calls`, así que el modelo de nube se inventaba un puente. El bucle real
 * vive en server.ts (red + executeToolCall), pero la parte dura y verificable
 * —ENSAMBLAR las tool_calls que llegan FRAGMENTADAS por el stream SSE y armar el
 * transcript— es lógica pura y queda fijada aquí:
 *   1. fragmentos de arguments concatenados por índice (no se pierden trozos),
 *   2. name que llega sólo en el primer fragmento se conserva,
 *   3. varias herramientas en paralelo por índices distintos,
 *   4. mensajes assistant(tool_calls) + role:"tool" bien formados y enlazados,
 *   5. parseo tolerante de arguments vacíos/rotos (no tumba el bucle),
 *   6. líneas SSE: data/[DONE]/basura.
 *
 * Lógica pura: sin red, sin SDK, sin disco. Corre sin node_modules.
 */
import {
  acumularToolCallsDelta,
  finalizarToolCalls,
  parsearArgsHerramienta,
  construirMensajeAsistenteConTools,
  construirMensajeRespuestaTool,
  extraerDatosDeLineaSSE,
  parsearArgsConEstado,
  pareceTruncado,
  anotarRepeticion,
  REPETICION_SIN_VER,
  UMBRAL_REPETICION,
  TOPE_INTERVENCIONES,
  esHerramientaDeObra,
  techoPasosConObra,
  DIRECTIVA_TRUNCAMIENTO,
  directivaRepeticion,
  cierrePorLazoAgotado,
  nuevoVigilanteArgs,
  registrarFalloArgs,
  UMBRAL_SIN_HERRAMIENTAS,
  type AcumuladorToolCall,
} from "../src/engine/cicloHerramientasOpenAICompat";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] Ensamblado de tool_calls fragmentadas por el stream SSE");
{
  const acc = new Map<number, AcumuladorToolCall>();
  // El modelo manda el name + id en el primer fragmento, y los arguments a trozos.
  acumularToolCallsDelta(acc, [{ index: 0, id: "call_a", type: "function", function: { name: "write_file", arguments: "{\"path\":\"" } }]);
  acumularToolCallsDelta(acc, [{ index: 0, function: { arguments: "a.txt\",\"contenido\":\"" } }]);
  acumularToolCallsDelta(acc, [{ index: 0, function: { arguments: "hola\"}" } }]);
  const fin = finalizarToolCalls(acc);
  comprobar("una sola llamada ensamblada", fin.length === 1, `len=${fin.length}`);
  comprobar("name conservado del primer fragmento", fin[0]?.name === "write_file", fin[0]?.name);
  comprobar("id conservado", fin[0]?.id === "call_a", fin[0]?.id);
  const args = parsearArgsHerramienta(fin[0]?.arguments);
  comprobar("arguments concatenados y parseables", args.path === "a.txt" && args.contenido === "hola", JSON.stringify(args));
}

console.log("\n[2] Varias herramientas en el mismo turno (índices distintos)");
{
  const acc = new Map<number, AcumuladorToolCall>();
  acumularToolCallsDelta(acc, [
    { index: 1, id: "c1", function: { name: "list_files", arguments: "{}" } },
    { index: 0, id: "c0", function: { name: "read_file", arguments: "{\"path\":\"x\"}" } },
  ]);
  const fin = finalizarToolCalls(acc);
  comprobar("dos llamadas", fin.length === 2, `len=${fin.length}`);
  comprobar("ordenadas por índice (0 antes que 1)", fin[0]?.name === "read_file" && fin[1]?.name === "list_files", fin.map(f=>f.name).join(","));
}

console.log("\n[3] Fragmentos huérfanos sin name se descartan");
{
  const acc = new Map<number, AcumuladorToolCall>();
  acumularToolCallsDelta(acc, [{ index: 0, function: { arguments: "{}" } }]); // nunca llegó el name
  const fin = finalizarToolCalls(acc);
  comprobar("sin name => descartado", fin.length === 0, `len=${fin.length}`);
  // Y un delta sin tool_calls no revienta.
  acumularToolCallsDelta(acc, undefined);
  acumularToolCallsDelta(acc, null as any);
  comprobar("delta sin tool_calls es inofensivo", finalizarToolCalls(acc).length === 0);
}

console.log("\n[4] Transcript OpenAI: assistant(tool_calls) + role:tool enlazados");
{
  const llamadas: AcumuladorToolCall[] = [{ id: "call_z", name: "run_tests", arguments: "{}" }];
  const asistente = construirMensajeAsistenteConTools("voy a probar", llamadas);
  comprobar("rol assistant", asistente.role === "assistant");
  comprobar("content preservado", asistente.content === "voy a probar");
  comprobar("tool_calls bien formado", asistente.tool_calls[0].type === "function" && asistente.tool_calls[0].function.name === "run_tests");
  comprobar("id propagado", asistente.tool_calls[0].id === "call_z");
  const resp = construirMensajeRespuestaTool("call_z", "run_tests", "{\"ok\":true}");
  comprobar("rol tool", resp.role === "tool");
  comprobar("tool_call_id enlaza con la llamada", resp.tool_call_id === "call_z", resp.tool_call_id);
  comprobar("contenido de la herramienta preservado", resp.content === "{\"ok\":true}");
}

console.log("\n[5] assistant sin id usa fallback call_<i>; respuesta tolera id vacío");
{
  const asistente = construirMensajeAsistenteConTools("", [{ id: "", name: "deshacer_cambios", arguments: "" }]);
  comprobar("id fallback call_0", asistente.tool_calls[0].id === "call_0", asistente.tool_calls[0].id);
  comprobar("arguments vacío => '{}'", asistente.tool_calls[0].function.arguments === "{}", asistente.tool_calls[0].function.arguments);
  const resp = construirMensajeRespuestaTool("", "deshacer_cambios", "ok");
  comprobar("tool_call_id fallback por nombre", resp.tool_call_id === "call_deshacer_cambios", resp.tool_call_id);
}

console.log("\n[6] Parseo tolerante de arguments");
{
  comprobar("vacío => {}", JSON.stringify(parsearArgsHerramienta("")) === "{}");
  comprobar("undefined => {}", JSON.stringify(parsearArgsHerramienta(undefined)) === "{}");
  comprobar("roto => {}", JSON.stringify(parsearArgsHerramienta("{no es json")) === "{}");
  comprobar("válido => objeto", parsearArgsHerramienta("{\"a\":1}").a === 1);
}

console.log("\n[7] Líneas SSE: data / [DONE] / basura");
{
  comprobar("data válido", extraerDatosDeLineaSSE("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}")?.choices?.[0]?.delta?.content === "hi");
  comprobar("[DONE] => null", extraerDatosDeLineaSSE("data: [DONE]") === null);
  comprobar("línea vacía => null", extraerDatosDeLineaSSE("") === null);
  comprobar("comentario SSE => null", extraerDatosDeLineaSSE(": keep-alive") === null);
  comprobar("json roto => null", extraerDatosDeLineaSSE("data: {roto") === null);
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.57.9 — LOS DOS LAZOS DE LA SESIÓN EXPORTADA DEL 14/10:
//   · arguments truncados por el tope de tokens del proveedor → la llamada NO
//     se ejecuta (antes se ejecutaba con args={} y escribía basura),
//   · guardia anti-repetición FIRME pero NO letal (antes: 3 iguales y turno
//     muerto con «Detenido» en cada mensaje siguiente).
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n[8] parsearArgsConEstado: distingue JSON roto de JSON CORTADO");
{
  const ok = parsearArgsConEstado("{\"path\":\"a.txt\",\"contenido\":\"hola\"}");
  comprobar("completo: ok, sin truncar", ok.ok && !ok.truncado && ok.args.path === "a.txt");
  const vacio = parsearArgsConEstado("");
  comprobar("vacío: ok=true (el modelo puede llamar sin args)", vacio.ok && !vacio.truncado);
  const cortado = parsearArgsConEstado("{\"path\":\"index.html\",\"contenido\":\"<!DOCTYPE html><html><body>");
  comprobar("★ cortado a media cadena: truncado=true", !cortado.ok && cortado.truncado);
  const cortadoLlave = parsearArgsConEstado("{\"path\":\"app.js\",\"contenido\":\"function init() { const x = [1,2,3");
  comprobar("★ cortado a media estructura: truncado=true", !cortadoLlave.ok && cortadoLlave.truncado);
  const basura = parsearArgsConEstado("{esto no es json}");
  comprobar("basura con llaves cerradas: NO se finge truncamiento", !basura.ok && !basura.truncado);
  comprobar("pareceTruncado: cadena sin cerrar => true", pareceTruncado("{\"a\":\"sin cerrar") === true);
  comprobar("pareceTruncado: escapado dentro de cadena no rompe", pareceTruncado("{\"a\":\"x\\\"y") === true);
  comprobar("pareceTruncado: documento completo => false", pareceTruncado("{\"a\":1}") === false);
}

console.log("\n[9] Guardia anti-repetición: cuenta consecutiva, no total");
{
  let g = { ...REPETICION_SIN_VER };
  g = anotarRepeticion(g, "read_file:{\"path\":\"a\"}");
  comprobar("1ª vez: veces=1", g.veces === 1);
  g = anotarRepeticion(g, "read_file:{\"path\":\"a\"}");
  comprobar("2ª igual: veces=2", g.veces === 2);
  g = anotarRepeticion(g, "read_file:{\"path\":\"a\"}");
  comprobar("3ª igual: veces=3 (umbral)", g.veces === UMBRAL_REPETICION);
  g = anotarRepeticion(g, "write_file:{\"path\":\"b\"}");
  comprobar("★ llamada distinta reinicia a 1 (no es un contador global que acumula y mata el turno)", g.veces === 1);
  comprobar("umbral y tope coherentes", UMBRAL_REPETICION === 3 && TOPE_INTERVENCIONES === 3);
}

console.log("\n[10] Pasos con obra: la tarea larga NO muere al paso 8");
{
  comprobar("v1.0.14 base 24 sin escrituras", techoPasosConObra(0) === 24);
  comprobar("5 escrituras sanas => 34", techoPasosConObra(5) === 34);
  comprobar("★ 40 escrituras: tope 96 (no crece sin freno)", techoPasosConObra(40) === 96);
  comprobar("escrituras negativas no restan", techoPasosConObra(-4) === 24);
  comprobar("write_file/edit_file/append_file son obra", esHerramientaDeObra("write_file") && esHerramientaDeObra("edit_file") && esHerramientaDeObra("append_file"));
  comprobar("read_file NO es obra (no compra pasos)", !esHerramientaDeObra("read_file"));
}

console.log("\n[11] Las directivas dicen QUÉ hacer (no solo «detenido»)");
{
  comprobar("truncamiento ordena dividir en partes", /append_file/.test(DIRECTIVA_TRUNCAMIENTO) && /NO se ejecut/.test(DIRECTIVA_TRUNCAMIENTO));
  const d = directivaRepeticion("read_file", 3, "{\"ok\":true,\"content\":\"...\"}");
  comprobar("repeticion nombra la herramienta y el conteo", /read_file/.test(d) && /3 veces/.test(d));
  comprobar("repeticion devuelve el resultado que YA tenía el modelo", /content/.test(d));
  const c = cierrePorLazoAgotado("read_file");
  comprobar("el cierre por lazo agotado explica y propone salida", /read_file/.test(c) && /sigue|cambia/i.test(c));
}

console.log(`\n== cicloHerramientasOpenAICompat: ${pasan} ✓ / ${fallan} ✗ ==`);
if (fallan > 0) {
  console.error("FALLOS:\n - " + fallos.join("\n - "));
  process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════════
// v1.57.10 — ARGUMENTOS-OBJETO (gemma4) + VIGILANTE DE FALLOS DE ARGUMENTOS
// ═════════════════════════════════════════════════════════════════════════
console.log("\n[12] Arguments que llegan YA como objeto (Ollama cloud)");
{
  const e = parsearArgsConEstado({ path: "C:\\x\\server.ts", content: "hola" } as any);
  comprobar("objeto admitido: ok, args intactos", e.ok && e.args.path === "C:\\x\\server.ts");
  const h = parsearArgsHerramienta({ command: "npm run build" } as any);
  comprobar("parsearArgsHerramienta también traga objetos", h.command === "npm run build");
}

console.log("\n[13] Vigilante: 3 fallos de argumentos seguidos retiran las herramientas");
{
  const v = nuevoVigilanteArgs();
  let r = registrarFalloArgs(v, true, '{"ok":false,"error":"falta el argumento path"}');
  comprobar("1º fallo de args: aún con herramientas", !r.cortoHerramientas && v.seguidos === 1);
  registrarFalloArgs(v, true, "Argumentos inválidos: missing required field 'command'");
  r = registrarFalloArgs(v, true, "faltan campos obligatorios");
  comprobar("3º seguido: se cruzó el umbral", r.cortoHerramientas && r.justoAlCruzarlo);
  const v2 = nuevoVigilanteArgs();
  registrarFalloArgs(v2, true, "falta el argumento path");
  registrarFalloArgs(v2, true, "falta el argumento path");
  const resucito = registrarFalloArgs(v2, false, '{"ok":true}');
  comprobar("un éxito limpia la cuenta (no es castigo eterno)", resucito.seguidos === 0 && !resucito.cortoHerramientas);
  const v3 = nuevoVigilanteArgs();
  const normal = registrarFalloArgs(v3, true, '{"ok":false,"error":"el puerto 3500 está ocupado"}');
  comprobar("fallo de herramienta NORMAL no suma (no es culpa del formato)", normal.seguidos === 0);
}
