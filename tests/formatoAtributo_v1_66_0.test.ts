/**
 * formatoAtributo_v1_66_0.test.ts — FORMATO 6 + FILTRO DE CHAT GEMINI (v1.66.0)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/formatoAtributo_v1_66_0.test.ts
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * RAÍZ que cierra (sesión mistral-code-fim del 22/10): el modelo emitía sus
 * llamadas como ATRIBUTOS tipo HTML en una sola pieza de texto
 *   edit_file path="web/css/sections.css" find="body" replace="…css con SVG…"
 * y como ningún formato lo reconocía, el VOLCADO CRUDO acababa escrito como
 * contenido del archivo (css/sections.css arrancaba con `edit_file path="…`).
 * Aquí se fija que:
 *   1. el valor tolera comillas internas (width="100", fill="white") y SOLO
 *      cierra ante fin, la siguiente clave canónica o un code-fence;
 *   2. se extraen path/find/replace sin partir el payload;
 *   3. el detector `pareceVolcadoDeLlamada` caza el volcado y respeta CSS real;
 *   4. `esModeloDeChatGemini` descarta los IDs no-chat del log (lyria, imagen,
 *      transcribe, robotics, computer-use, deep-research…) y conserva los de chat.
 * Lógica pura: sin red, sin SDK, sin disco. Corre sin node_modules.
 */
import {
  extraerLlamadasAtributos,
  leerValorAtributo,
  pareceVolcadoDeLlamada,
  extraerLlamadasEnTexto,
} from "../src/engine/cicloHerramientasOpenAICompat";
import { esModeloDeChatGemini, filtrarModelosChatGemini } from "../src/engine/fusibleGemini";

const VALIDAS = new Set(["write_file", "edit_file", "read_file", "list_files", "delete_file", "run_command"]);

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] leerValorAtributo tolera comillas internas de SVG/HTML");
{
  const svg = `<svg width="100" height="2" fill="white"/>`;
  const txt = `replace="${svg}" content="x"`;
  const i = txt.indexOf('replace="') + 'replace="'.length;
  const { valor, fin } = leerValorAtributo(txt, i);
  comprobar("no corta en width=\"100\"", valor === svg, valor);
  comprobar("cierra justo antes de la clave can\u00f3nica content=", txt.slice(fin).trim().startsWith("content="), txt.slice(fin));
}

console.log("\n[2] extraerLlamadasAtributos: edit_file con path/find/replace");
{
  const replace = `.hero{color:#fff;background:url("data:image/svg+xml,<svg width=\\"10\\"/>")}`;
  const txt = `edit_file path="web/css/sections.css" find="body" replace="${replace}"`;
  const { llamadas } = extraerLlamadasAtributos(txt, VALIDAS);
  comprobar("una llamada", llamadas.length === 1, `len=${llamadas.length}`);
  const a = JSON.parse(llamadas[0]?.arguments || "{}");
  comprobar("name edit_file", llamadas[0]?.name === "edit_file", llamadas[0]?.name);
  comprobar("path correcto", a.path === "web/css/sections.css", a.path);
  comprobar("find correcto", a.find === "body", a.find);
  comprobar("replace completo (incluye el data:image)", String(a.replace).includes("data:image/svg+xml"), a.replace);
}

console.log("\n[3] write_file con content + alias en espa\u00f1ol (ruta/contenido)");
{
  const txt = `write_file ruta="index.html" contenido="<h1>Hola</h1>"`;
  const { llamadas } = extraerLlamadasAtributos(txt, VALIDAS);
  const a = JSON.parse(llamadas[0]?.arguments || "{}");
  comprobar("alias ruta -> path", a.path === "index.html", JSON.stringify(a));
  comprobar("alias contenido -> content", a.content === "<h1>Hola</h1>", JSON.stringify(a));
}

console.log("\n[4] extraerLlamadasEnTexto integra el Formato 6 y limpia el texto");
{
  const txt = `Voy a arreglarlo:\nwrite_file path="a.css" content=".x{color:red}"`;
  const { llamadas, textoLimpio } = extraerLlamadasEnTexto(txt, VALIDAS);
  comprobar("detecta la llamada en prosa", llamadas.length === 1, `len=${llamadas.length}`);
  comprobar("el volcado sale del texto visible", !textoLimpio.includes('write_file path='), textoLimpio);
}

console.log("\n[5] pareceVolcadoDeLlamada: caza el volcado, respeta CSS real");
{
  comprobar("edit_file path=... => true", pareceVolcadoDeLlamada('edit_file path="web/css/x.css" find="body" replace="'));
  comprobar("write_file ruta=... => true", pareceVolcadoDeLlamada('write_file ruta="a.js" contenido="'));
  comprobar("CSS con selector de atributo NO es falso positivo", !pareceVolcadoDeLlamada('[data-x="y"]{color:red}'));
  comprobar("CSS normal => false", !pareceVolcadoDeLlamada('.hero{min-height:100vh}'));
}

console.log("\n[6] esModeloDeChatGemini / filtrarModelosChatGemini (IDs reales del log)");
{
  const noChat = ["lyria-3-pro-preview", "imagen-4.0", "gemini-3-pro-image", "gemini-nano-banana-2.1", "nano-banana-pro-preview", "gemini-3.5-transcribe", "gemini-robotics-er-2-preview", "gemini-2.5-computer-use-preview-10-2025", "computer-use-preview", "deep-research-pro-preview-12-2025"];
  const chat = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-4-argon", "gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-pro"];
  comprobar("todos los no-chat se descartan", noChat.every((m) => !esModeloDeChatGemini(m)), noChat.filter(esModeloDeChatGemini).join(","));
  comprobar("todos los de chat se conservan", chat.every((m) => esModeloDeChatGemini(m)), chat.filter((m) => !esModeloDeChatGemini(m)).join(","));
  const mezcla = [...chat, ...noChat];
  const filtrados = filtrarModelosChatGemini(mezcla);
  comprobar("el filtro deja SOLO los de chat y en orden", filtrados.length === chat.length && filtrados.every((m, i) => m === chat[i]), filtrados.join(","));
}

console.log(`\n== formatoAtributo_v1_66_0: ${pasan} \u2713 / ${fallan} \u2717 ==`);
if (fallan > 0) {
  console.log("FALLOS:\n" + fallos.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
