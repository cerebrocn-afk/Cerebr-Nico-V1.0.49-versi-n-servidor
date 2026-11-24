/**
 * herramientasNube.test.ts — EL PUENTE DE HERRAMIENTAS PARA LA NUBE (v1.44.0)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/herramientasNube.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * El bug de Mario: un modelo de nube inventaba un puente porque NUNCA recibía
 * las herramientas en el formato de Gemini ni se le leían sus `functionCall`.
 * Esta suite fija el CONTRATO de traducción/extracción para que ese cableado no
 * se rompa en silencio:
 *   1. tools estilo Ollama/OpenAI → functionDeclarations de Gemini (type en
 *      MAYÚSCULAS, claves no soportadas podadas, sin parameters si no hay props).
 *   2. de un chunk/respuesta de Gemini salen las llamadas, vengan como array,
 *      como función o dentro de candidates[].content.parts[].functionCall.
 *   3. el resultado crudo de executeToolCall se envuelve como functionResponse.
 *
 * Lógica pura: sin red, sin SDK, sin disco. Corre sin node_modules.
 */
import {
  toGeminiFunctionDeclarations,
  sanitizarSchemaGemini,
  extraerLlamadasGemini,
  respuestaHerramientaGemini,
} from "../src/engine/herramientasNube";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] Traducci\u00f3n tools Ollama \u2192 functionDeclarations Gemini");
const ollamaTools = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Escribe un archivo",
      parameters: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "ruta" },
          lines: { type: "array", items: { type: "string" } },
        },
        required: ["path"],
      },
    },
  },
  { type: "function", function: { name: "list_files", description: "Lista", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "" } }, // sin nombre: se descarta
];
const decls = toGeminiFunctionDeclarations(ollamaTools);
comprobar("descarta la herramienta sin nombre", decls.length === 2, `len=${decls.length}`);
const wf = decls.find((d: any) => d.name === "write_file");
comprobar("write_file conserva nombre y descripci\u00f3n", !!wf && wf.description === "Escribe un archivo");
comprobar("type del esquema queda en MAY\u00daSCULAS", !!wf && wf.parameters.type === "OBJECT", JSON.stringify(wf?.parameters?.type));
comprobar("poda $schema y additionalProperties", !!wf && !("$schema" in wf.parameters) && !("additionalProperties" in wf.parameters));
comprobar("propiedades anidadas se normalizan (string\u2192STRING)", !!wf && wf.parameters.properties.path.type === "STRING");
comprobar("items de array se normaliza", !!wf && wf.parameters.properties.lines.items.type === "STRING");
comprobar("required se conserva", !!wf && Array.isArray(wf.parameters.required) && wf.parameters.required[0] === "path");
const lf = decls.find((d: any) => d.name === "list_files");
comprobar("sin propiedades: se omite parameters", !!lf && !("parameters" in lf));

console.log("\n[2] sanitizarSchemaGemini es tolerante");
comprobar("null \u2192 OBJECT vac\u00edo", sanitizarSchemaGemini(null).type === "OBJECT");
comprobar("sin type \u2192 OBJECT por defecto", sanitizarSchemaGemini({ properties: {} }).type === "OBJECT");

console.log("\n[3] Extracci\u00f3n de llamadas, en sus tres formas");
// a) functionCalls como array
comprobar("array directo", extraerLlamadasGemini({ functionCalls: [{ name: "a", args: { x: 1 } }] }).length === 1);
// b) functionCalls como funci\u00f3n
const respFn: any = { functionCalls: () => [{ name: "b", args: {} }] };
comprobar("functionCalls como funci\u00f3n", extraerLlamadasGemini(respFn)[0]?.name === "b");
// c) dentro de candidates
const respCand: any = { candidates: [{ content: { parts: [{ text: "hola" }, { functionCall: { name: "c", args: { y: 2 } } }] } }] };
const llc = extraerLlamadasGemini(respCand);
comprobar("candidates.parts.functionCall", llc.length === 1 && llc[0].name === "c" && llc[0].args.y === 2);
comprobar("args ausentes \u2192 objeto vac\u00edo", extraerLlamadasGemini({ functionCalls: [{ name: "d" }] })[0].args && Object.keys(extraerLlamadasGemini({ functionCalls: [{ name: "d" }] })[0].args).length === 0);
comprobar("basura \u2192 []", extraerLlamadasGemini(null as any).length === 0 && extraerLlamadasGemini({} as any).length === 0);
comprobar("functionCall sin name se ignora", extraerLlamadasGemini({ functionCalls: [{ args: {} }] }).length === 0);
// v1.45.6 — d) firma de pensamiento (Gemini 3): se CAPTA desde la parte y
// viaja con la llamada, para poder devolvérsela al modelo en el turno siguiente.
const respFirma: any = { candidates: [{ content: { parts: [{ functionCall: { name: "e", args: {} }, thoughtSignature: "ABC123" }] } }] };
const llf = extraerLlamadasGemini(respFirma);
comprobar("capta thoughtSignature de la parte", llf.length === 1 && llf[0].thoughtSignature === "ABC123");
comprobar("sin firma → thoughtSignature undefined", extraerLlamadasGemini({ functionCalls: [{ name: "f", args: {} }] })[0].thoughtSignature === undefined);

console.log("\n[4] functionResponse envuelve el resultado real");
const rOk = respuestaHerramientaGemini("list_files", JSON.stringify({ ok: true, files: ["a.ts"] }));
comprobar("JSON v\u00e1lido \u2192 response objeto", rOk.functionResponse.name === "list_files" && rOk.functionResponse.response.ok === true);
const rTxt = respuestaHerramientaGemini("x", "texto plano");
comprobar("no-JSON \u2192 { resultado }", rTxt.functionResponse.response.resultado === "texto plano");
const rNum = respuestaHerramientaGemini("x", "42");
comprobar("JSON escalar \u2192 { resultado }", rNum.functionResponse.response.resultado === 42);

console.log(`\n\u2500\u2500\u2500 herramientasNube: ${pasan} \u2713  ${fallan} \u2717 \u2500\u2500\u2500`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
