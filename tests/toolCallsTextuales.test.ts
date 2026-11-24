// ============================================================
// v1.58.2 — REGRESIÓN: TOOL-CALLS EMITIDAS COMO TEXTO
// ------------------------------------------------------------
// QUÉ CONGELA: que las llamadas a herramientas que un modelo SIN function-
// calling nativo (p. ej. openrouter/free) escribe EN EL TEXTO se capturen y se
// traduzcan a llamadas ejecutables. Esta es la cura del «no tienes acceso al
// editor/sandbox» de la sesión del 16/10: antes la llamada viajaba por
// `delta.content`, el parser nativo no la veía, la herramienta jamás corría y
// el sandbox nunca cambiaba.
//
// Los tres formatos de aquí son LITERALES de la sesión exportada:
//   · msg 5/9  → nombre pelado + JSON    (`list_dir\n{ "path": "" }`)
//   · msg 23   → pseudo-XML              (`<dots_function_call><list_files>…`)
//   · msg 37/41 → bloque cercado         (```` ```cerebronico:write_file ````)
//
// Ejecutar:  npx tsx tests/toolCallsTextuales.test.ts
// ============================================================
import {
  extraerLlamadasEnTexto,
  normalizarArgsAlias,
  normalizarNombreHerramienta,
  extraerPrimerJSON,
  extraerLlamadasParen,
} from "../src/engine/cicloHerramientasOpenAICompat";

let fallos = 0;
let total = 0;
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  total++;
  if (cond) {
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos++;
    console.error(`  ✖ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

// El set de nombres válidos que, en producción, llega de getAllToolNames().
const NOMBRES = new Set([
  "list_files",
  "write_file",
  "edit_file",
  "append_file",
  "read_file",
  "delete_file",
  "make_dir",
  "run_command",
  "run_tests",
]);

console.log("\n1) ★ Los tres formatos reales de la sesión se capturan\n");

// ─── Formato 3: nombre pelado + JSON (msg 5/9) ────────────────────────
const bare = extraerLlamadasEnTexto('list_dir\n{ "path": "" }', NOMBRES);
comprobar(
  "nombre pelado `list_dir` → 1 llamada",
  bare.llamadas.length === 1,
  `${bare.llamadas.length} llamadas`
);
comprobar(
  "`list_dir` se traduce al canónico `list_files`",
  bare.llamadas[0]?.name === "list_files",
  bare.llamadas[0]?.name
);

// ─── Formato 2: pseudo-XML dots_function_call (msg 23) ───────────────────
const dots = extraerLlamadasEnTexto(
  "\n\n<dots_function_call>\n<list_files>\n</invoke>\n</dots_function_call>\n",
  NOMBRES
);
comprobar(
  "pseudo-XML `<list_files>` → 1 llamada",
  dots.llamadas.length === 1 && dots.llamadas[0]?.name === "list_files",
  JSON.stringify(dots.llamadas)
);
comprobar(
  "sin JSON → argumentos vacíos {} (no rompe)",
  dots.llamadas[0]?.arguments === "{}",
  dots.llamadas[0]?.arguments
);

// ─── Formato 1: bloque cercado cerebronico: (msg 37) ───────────────────
const fence = extraerLlamadasEnTexto(
  'Escribiendo:\n```cerebronico:write_file\n{"ruta":"index.html","contenido":"<h1>hola</h1>"}\n```\nlisto',
  NOMBRES
);
comprobar(
  "bloque `cerebronico:write_file` → 1 llamada write_file",
  fence.llamadas.length === 1 && fence.llamadas[0]?.name === "write_file",
  JSON.stringify(fence.llamadas)
);
const argsFence = JSON.parse(fence.llamadas[0]?.arguments || "{}");
comprobar(
  "campos en español `ruta`/`contenido` → `path`/`content`",
  argsFence.path === "index.html" && argsFence.content === "<h1>hola</h1>",
  JSON.stringify(argsFence)
);
comprobar(
  "el texto limpio ya no re-muestra el pseudo-código",
  !fence.textoLimpio.includes("write_file") && fence.textoLimpio.includes("Escribiendo"),
  JSON.stringify(fence.textoLimpio)
);

// ─── Dos bloques pegados (msg 41: delete + list) ──────────────────────
const multi = extraerLlamadasEnTexto(
  '```cerebronico:delete_file\n{"ruta":"index.html"}\n``````cerebronico:list_dir\n{"ruta": "."}\n```',
  NOMBRES
);
comprobar(
  "dos bloques pegados → 2 llamadas (delete_file + list_files)",
  multi.llamadas.length === 2 &&
    multi.llamadas[0]?.name === "delete_file" &&
    multi.llamadas[1]?.name === "list_files",
  JSON.stringify(multi.llamadas.map((l) => l.name))
);

console.log("\n2) ★ La prosa normal NO dispara falsos positivos\n");

const prosa = extraerLlamadasEnTexto(
  "Voy a revisar el archivo index.html y luego continuo con el diseño.\n{\"foo\":1}",
  NOMBRES
);
comprobar(
  "prosa + JSON suelto → 0 llamadas",
  prosa.llamadas.length === 0,
  JSON.stringify(prosa.llamadas)
);

const bloqueHtml = extraerLlamadasEnTexto(
  '```html file="index.html"\n<!DOCTYPE html><html></html>\n```',
  NOMBRES
);
comprobar(
  "bloque ```html (no es herramienta) → 0 llamadas",
  bloqueHtml.llamadas.length === 0,
  JSON.stringify(bloqueHtml.llamadas)
);

const nombreInventado = extraerLlamadasEnTexto('inventada_tool\n{"x":1}', NOMBRES);
comprobar(
  "nombre que no existe ni por alias → 0 llamadas",
  nombreInventado.llamadas.length === 0,
  JSON.stringify(nombreInventado.llamadas)
);

console.log("\n3) ★ Piezas puras: alias de nombre, alias de campo, JSON balanceado\n");

comprobar(
  "normalizarNombreHerramienta(`list_dir`) → list_files",
  normalizarNombreHerramienta("list_dir", NOMBRES) === "list_files"
);
comprobar(
  "normalizarNombreHerramienta(`create_file`) → write_file",
  normalizarNombreHerramienta("create_file", NOMBRES) === "write_file"
);
comprobar(
  "normalizarNombreHerramienta(desconocida) → null",
  normalizarNombreHerramienta("no_existe", NOMBRES) === null
);

const alias = normalizarArgsAlias({ ruta: "a.txt", contenido: "x", comando: "ls" });
comprobar(
  "normalizarArgsAlias traduce ruta/contenido/comando",
  alias.path === "a.txt" && alias.content === "x" && alias.command === "ls",
  JSON.stringify(alias)
);
comprobar(
  "normalizarArgsAlias NO pisa una clave canónica ya presente",
  normalizarArgsAlias({ path: "ya.txt", ruta: "otra.txt" }).path === "ya.txt"
);

comprobar(
  "extraerPrimerJSON respeta llaves dentro de cadenas",
  extraerPrimerJSON('ruido {"a":"}{","b":1} cola') === '{"a":"}{","b":1}',
  String(extraerPrimerJSON('ruido {"a":"}{","b":1} cola'))
);
comprobar(
  "extraerPrimerJSON devuelve null si la llave no cierra (cortado)",
  extraerPrimerJSON('{"a":1') === null
);

console.log("\n4) ★ v1.60.11 — envoltura de tokens + sintaxis de paréntesis (sesión 19/10)\n");

// ─── Formato 4: envoltura <|tool_call_start|> con paréntesis dentro ─────
const env1 = extraerLlamadasEnTexto(
  'Verifico los puertos.\n<|tool_call_start|>[list_files()]<|tool_call_end|>\nlisto',
  NOMBRES
);
comprobar(
  "envoltura <|tool_call_start|>[list_files()] → 1 llamada list_files",
  env1.llamadas.length === 1 && env1.llamadas[0]?.name === "list_files",
  JSON.stringify(env1.llamadas)
);
comprobar(
  "la envoltura se retira del texto visible",
  !env1.textoLimpio.includes("tool_call_start") && !env1.textoLimpio.includes("list_files"),
  JSON.stringify(env1.textoLimpio)
);

// Envoltura con write_file y JSON por dentro (estilo paren-call con args).
const env2 = extraerLlamadasEnTexto(
  '<|tool_call_start|>write_file({"ruta":"test-site/manifest.json","contenido":"{}"})<|tool_call_end|>',
  NOMBRES
);
const argsEnv2 = JSON.parse(env2.llamadas[0]?.arguments || "{}");
comprobar(
  "envoltura write_file({ruta,contenido}) → write_file con path/content normalizados",
  env2.llamadas.length === 1 &&
    env2.llamadas[0]?.name === "write_file" &&
    argsEnv2.path === "test-site/manifest.json" &&
    argsEnv2.content === "{}",
  JSON.stringify(env2.llamadas)
);

// Envoltura con JSON-nombre {"name":…,"arguments":…}.
const env3 = extraerLlamadasEnTexto(
  '<|tool_call_start|>{"name":"read_file","arguments":{"ruta":"index.html"}}<|tool_call_end|>',
  NOMBRES
);
const argsEnv3 = JSON.parse(env3.llamadas[0]?.arguments || "{}");
comprobar(
  "envoltura JSON-nombre {name,arguments} → read_file con path",
  env3.llamadas.length === 1 && env3.llamadas[0]?.name === "read_file" && argsEnv3.path === "index.html",
  JSON.stringify(env3.llamadas)
);

// Slash-command inexistente dentro de la envoltura → 0 llamadas, pero se limpia.
const envSlash = extraerLlamadasEnTexto(
  'Reviso.\n<|tool_call_start|>[/check-ports()]<|tool_call_end|>',
  NOMBRES
);
comprobar(
  "[/check-ports()] (no es herramienta real) → 0 llamadas (no se inventa)",
  envSlash.llamadas.length === 0,
  JSON.stringify(envSlash.llamadas)
);
comprobar(
  "aun así la envoltura ruidosa se retira del texto",
  !envSlash.textoLimpio.includes("tool_call_start"),
  JSON.stringify(envSlash.textoLimpio)
);

// ─── Formato 5: paréntesis suelto sin envoltura ────────────────────
const paren1 = extraerLlamadasEnTexto(
  'write_file({"path":"index.html","content":"<h1>hola)(</h1>"})',
  NOMBRES
);
const argsP1 = JSON.parse(paren1.llamadas[0]?.arguments || "{}");
comprobar(
  "paréntesis write_file({json}) con ) dentro de la cadena → 1 llamada, JSON intacto",
  paren1.llamadas.length === 1 &&
    paren1.llamadas[0]?.name === "write_file" &&
    argsP1.content === "<h1>hola)(</h1>",
  JSON.stringify(paren1.llamadas)
);

const paren2 = extraerLlamadasEnTexto("[list_files()] y luego /read_file({\"path\":\"a.ts\"})", NOMBRES);
comprobar(
  "[list_files()] + /read_file({path}) → 2 llamadas en orden",
  paren2.llamadas.length === 2 &&
    paren2.llamadas[0]?.name === "list_files" &&
    paren2.llamadas[1]?.name === "read_file",
  JSON.stringify(paren2.llamadas.map((l) => l.name))
);

// Falsos positivos: nombre inválido con paréntesis (prosa) → 0 llamadas.
const parenProsa = extraerLlamadasEnTexto("Voy a revisar(el index) antes de seguir.", NOMBRES);
comprobar(
  "`revisar(…)` (no es herramienta) → 0 llamadas",
  parenProsa.llamadas.length === 0,
  JSON.stringify(parenProsa.llamadas)
);

// Pieza pura: extraerLlamadasParen con paréntesis vacíos.
const puro = extraerLlamadasParen("antes list_files() después", NOMBRES);
comprobar(
  "extraerLlamadasParen `list_files()` → 1 llamada, args {}",
  puro.llamadas.length === 1 && puro.llamadas[0]?.arguments === "{}",
  JSON.stringify(puro.llamadas)
);

if (fallos > 0) {
  console.error(`\n✖ ${fallos} fallidas (de ${total} comprobaciones).`);
  process.exit(1);
}
console.log(`\n✔ Todo verde — ${total} correctas · 0 fallidas: la captura de tool-calls textuales queda congelada.\n`);
