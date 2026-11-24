/**
 * tests/chatSinVallas.test.ts — v1.67.1 · EL CHAT DEJA DE SER LA MESA DE TRABAJO.
 *
 * La queja de Mario, con captura: «contaminan todo el chat de código y comandos y
 * en el editor no escriben nada». La raíz eran dos líneas de
 * `server/cicloOpenAICompat.ts`: el stream mandaba TODO al chat en vivo (388) y
 * la extracción tiraba `extra.textoLimpio` a la basura (410).
 *
 * Este test no prueba que «se vea lindo»: prueba la única promesa que importa —
 * que el filtro **no puede comerse una respuesta**. Por eso el CONTROL DE FALSO
 * POSITIVO (el HTML del sitio que el usuario pidió) pesa tanto como el defecto.
 */
import { crearFiltroDeVallas, extraerLlamadasEnTexto } from "../src/engine/cicloHerramientasOpenAICompat";

let ok = 0, mal = 0;
const probar = (cond: boolean, msg: string) => { if (cond) { ok++; console.log("  \u2713 " + msg); } else { mal++; console.log("  \u2717 " + msg); } };

const NOMBRES = new Set(["write_file", "search_in_files", "read_file", "edit_file", "run_command"]);

/** Simula el SSE: parte el texto en pedacitos y devuelve lo que llegó al chat. */
function simularStream(texto: string, trozos: number[], llamadasSaliaron: boolean): string {
  const f = crearFiltroDeVallas(NOMBRES);
  let chat = "", i = 0;
  for (const n of trozos) { chat += f.escribir(texto.slice(i, i + n)); i += n; }
  chat += f.escribir(texto.slice(i));
  chat += f.cerrar(llamadasSaliaron);
  return chat;
}
const deUnoenuno = (s: string) => new Array(s.length).fill(1);

console.log("\n1 · DEFECTO SEMBRADO — la línea exacta del log, sin llegar al chat");
{
  const delLog =
    "Voy a proceder a buscar la secci\u00f3n de caracter\u00edsticas en el archivo index.html:\n\n" +
    "```cerebronico:search_in_files\n" +
    '{"query": "<section class=\\"caracteristicas\\">", "glob": "*.html"}\n' +
    "```\n\n" +
    "Una vez que encuentre la secci\u00f3n, podr\u00e9 proceder a actualizarla.";

  // CONTROL DE FALSO POSITIVO: si el parser no la considera llamada, el filtro
  // tampoco tiene derecho a esconderla. Este test es el que da derecho al filtro.
  const esLlamada = extraerLlamadasEnTexto(delLog, NOMBRES).llamadas.length > 0;
  probar(esLlamada, "la valla del log S\u00cd es una llamada para el parser oficial (no la escondo por aparecer)");

  const entero = simularStream(delLog, [delLog.length], true);
  probar(!entero.includes("cerebro") && !entero.includes("caracteristicas"),
    "stream en un solo bloque: la valla y sus argumentos no aparecen en el chat");
  probar(entero.includes("Voy a proceder a buscar") && entero.includes("podr\u00e9 proceder a actualizarla"),
    "la prosa de antes y de despu\u00e9s llega intacta");

  const fino = simularStream(delLog, deUnoenuno(delLog), true);
  probar(!fino.includes("search_in_files") && !fino.includes('"glob"'),
    "stream char por char (el peor caso del SSE): sigue sin aparecer");
  probar(fino.includes("Voy a proceder a buscar"),
    "y char por char la prosa tampoco se perdi\u00f3");
}

console.log("\n2 · CONTROL DE FALSO POSITIVO — el c\u00f3digo del usuario NO es una llamada");
{
  const conCodigo =
    "Ac\u00e1 va el bloque de caracter\u00edsticas:\n\n" +
    "```html\n<section class=\"caracteristicas\">\n  <h2> list\u00edsimo </h2>\n</section>\n```\n\n" +
    "Y esto es un dato, no una acci\u00f3n:\n```json\n{\"total\": 3}\n```\n";
  const salio = simularStream(conCodigo, [7, 40, 200], false);
  probar(salio.includes('<section class="caracteristicas">'),
    "el HTML que el usuario pidi\u00f3 se ve completo (esconderlo ser\u00eda peor que el defecto)");
  probar(salio.includes('{"total": 3}'), "un bloque JSON de datos tampoco se toca");
  probar(salio === conCodigo, "con s\u00f3lo prosa y c\u00f3digo leg\u00edtimo, el chat sale byte a byte igual que antes");
}

console.log("\n3 · LA PROMESA DE SEGURIDAD — jam\u00e1s se traga una respuesta");
{
  const vallaSinCerrar = "Te dejo el archivo as\u00ed:\n```cerebronico:write_file\n{\"path\":\"a.html\",\"content\":\"<h1>";
  const liberado = simularStream(vallaSinCerrar, [12, 60], false);
  probar(liberado.includes("```cerebronico:write_file") && liberado.includes("<h1>"),
    "valla truncada y CERO llamadas ejecutadas \u2192 se muestra entera (el corte por tokens no puede borrar el aviso)");

  const escondido = simularStream(vallaSinCerrar, [12, 60], true);
  probar(!escondido.includes('{"path"'),
    "valla truncada PERO con llamadas ejecutadas \u2192 s\u00ed se esconde (ya se est\u00e1 ejecutando)");

  const soloProsa = "No encontr\u00e9 la secci\u00f3n, as\u00ed que te la describo en palabras.";
  probar(simularStream(soloProsa, [5, 9, 300], true) === soloProsa,
    "aunque el turno haya ejecutado acciones, la prosa suelta nunca se retiene");
}

console.log("\n4 · CONTABILIDAD — esconder no es basura silenciosa");
{
  const f = crearFiltroDeVallas(NOMBRES);
  const bloque = "```cerebronico:read_file\n{\"path\":\"x\"}\n```";
  f.escribir(bloque);
  f.cerrar(true);
  probar(f.retenido() === bloque.length, `retenido() reporta los ${bloque.length} caracteres escondidos (para el acta)`);
}

console.log(`\n═══ chatSinVallas: ${ok} correctas · ${mal} fallidas ═══`);
if (mal) process.exitCode = 1;
