/**
 * accionesRapidas.test.ts — ACCIONES RÁPIDAS SIN SECUESTROS (v1.16.6)
 * ====================================================================
 * POR QUÉ EXISTE
 * El bug, capturado en pantalla (v1.16.5, Windows): el Editor web envuelve
 * cada orden con «[ORDEN DEL EDITOR WEB] … no expliques: ejecuta.» y la manda
 * al motor. Con Agente PC ON, el parser determinista de acciones rápidas veía
 * «ejecuta» + «orden», le pescaba a la PROPIA ETIQUETA el texto «DEL EDITOR
 * WEB», lo mandaba al puente como comando real y el puente respondía (bien)
 * «binario no permitido: «DEL»». El corto-circuito impedía que la orden
 * llegara al modelo: NINGUNA orden del editor web se ejecutaba nunca.
 *
 * QUÉ DEMUESTRA ESTA SUITE
 *   1. REGRESIÓN: el envoltorio exacto del bug NO produce acción rápida.
 *   2. La guarda reconoce la etiqueta en cualquier capitalización y con
 *      espacios por delante.
 *   3. extractCommand ya no pesca palabras de etiquetas [ ... ].
 *   4. Las acciones rápidas LEGÍTIMAS siguen vivas (ejecutar/crear/leer/
 *      borrar/listar) — la lista blanca que bloquea el trabajo legítimo es
 *      la misma clase de error que no tener lista blanca.
 *   5. COHERENCIA DE CADENAS: la etiqueta del frontend (src/constants.ts) y
 *      la del servidor (server/quickParser.ts) son la MISMA, medida del disco.
 *   6. El sitio de llamada del monolito tiene la guarda explícita y el parser
 *      ya no está duplicado en server.ts (partir, no añadir).
 *
 * Se ejecuta con:  npx tsx tests/accionesRapidas.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseQuickAction,
  extractCommand,
  esOrdenDelEditorWeb,
  ETIQUETA_ORDEN_EDITOR_WEB,
  pareceProsa,
  pareceContenidoPegado,
} from "../server/quickParser";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${nombre}${detalle ? ` (${detalle})` : ""}`);
  }
}

// El envoltorio EXACTO que App.tsx (sendWebEditorOrder) mandaba al motor el
// día del reporte. Si esta cadena cambia en App.tsx, la comprobación 5 lo
// canta igualmente porque compara las dos etiquetas reales del disco.
const ORDEN_REAL_DEL_EDITOR =
  "[ORDEN DEL EDITOR WEB] Modifica la página del sandbox (puerto 3500) aplicando esta instrucción " +
  "sobre los archivos HTML/CSS/JS del workspace. Aplica los cambios directamente con las herramientas " +
  "(prefiere edit_file antes que reescribir el archivo entero), mantén el tema oscuro y no expliques: ejecuta.\n\n" +
  'Instrucción: "genera una pagina web sobre una veterinaria , pestañas de productos clasicos en una veterinaria, peluqueria y hospital"';

// ─── 1. REGRESIÓN DEL BUG «DEL» ─────────────────────────────────────────────
{
  console.log("\n[1] El envoltorio del Editor web NO es una acción rápida");
  comprobar("la orden real del editor no produce ninguna acción", parseQuickAction(ORDEN_REAL_DEL_EDITOR) === null,
    JSON.stringify(parseQuickAction(ORDEN_REAL_DEL_EDITOR)));
  comprobar("la guarda reconoce la etiqueta", esOrdenDelEditorWeb(ORDEN_REAL_DEL_EDITOR));
  comprobar("ni mayúsculas ni espacios la esconden",
    esOrdenDelEditorWeb("   [orden del Editor Web] cambia el hero") === true);
  comprobar("una petición normal de PC NO dispara la guarda",
    esOrdenDelEditorWeb("ejecuta el comando dir") === false);
}

// ─── 2. extractCommand ya no pesca dentro de etiquetas ──────────────────────
{
  console.log("\n[2] extractCommand ignora el texto de las etiquetas [ ... ]");
  const cmd = extractCommand("[ORDEN DEL EDITOR WEB] Modifica la página del sandbox y ejecuta.") || "";
  comprobar("no devuelve «DEL EDITOR WEB» (el bug)", !/^DEL EDITOR WEB\b/i.test(cmd), cmd);
  comprobar("un comando legítimo sigue saliendo entero",
    extractCommand("ejecuta el comando ipconfig /all") === "ipconfig /all");
  comprobar("respeta comillas: comando «git status»",
    extractCommand('ejecuta el comando "git status"') === "git status");
}

// ─── 3. Las acciones rápidas legítimas siguen vivas ─────────────────────────
{
  console.log("\n[3] El Agente PC sigue entendiendo al usuario");
  const exec = parseQuickAction("ejecuta el comando dir");
  comprobar("exec: «ejecuta el comando dir»", !!exec && exec.intent === "exec" && exec.command === "dir",
    JSON.stringify(exec));

  const write = parseQuickAction('crea un archivo llamado hola.txt que dice "hola mundo"');
  comprobar("write: crea hola.txt con contenido", !!write && write.intent === "write" && write.path === "Desktop/hola.txt" && write.content === "hola mundo",
    JSON.stringify(write));

  // ── v1.23.0 · CONTRATO NUEVO: la PC solo se toca cuando la nombran ────────
  // Captura del usuario (2026-09-29): «lee el archivo validar.mjs» sobre un
  // archivo DEL PROYECTO produjo «No existe: Desktop\validar.mjs» — el parser
  // adivinaba Desktop y secuestraba el turno. Sin carpeta de PC nombrada,
  // estas órdenes van al modelo (null), no al puente.
  comprobar("delete sin carpeta de PC ya NO adivina Desktop", parseQuickAction("borra el archivo notas.txt") === null);
  comprobar("read sin carpeta de PC ya NO adivina Desktop", parseQuickAction("lee el archivo datos.csv") === null);
  comprobar("list sin carpeta de PC ya NO adivina Desktop", parseQuickAction("lista los archivos de la carpeta del proyecto") === null);

  const del2 = parseQuickAction("borra el archivo notas.txt del Escritorio");
  comprobar("delete con Escritorio nombrado sigue directo al puente", !!del2 && del2.intent === "delete" && del2.path === "Desktop/notas.txt",
    JSON.stringify(del2));

  const read2 = parseQuickAction("leé el contenido de Documents/datos.csv");
  comprobar("read con Documents/ explícito sigue directo al puente", !!read2 && read2.intent === "read" && read2.path === "Documents/datos.csv",
    JSON.stringify(read2));

  const list = parseQuickAction("lista los archivos de la carpeta Documentos");
  comprobar("list: lista Documents/", !!list && list.intent === "list" && list.path === "Documents/",
    JSON.stringify(list));

  comprobar("una charla normal no secuestra nada", parseQuickAction("¿qué diferencia hay entre flex y grid?") === null);
}

// ─── 3b. v1.23.0 · LA PROSA NO ES COMANDO Y EL LOG PEGADO NO ES ORDEN ───────
{
  console.log("\n[3b] Capturas 2026-09-29: «binario no permitido: «de»» y el log que traba");
  comprobar("«el comando de compilar» no pesca «de compilar» como comando",
    extractCommand("ejecutá el comando de compilar otra vez") === null,
    String(extractCommand("ejecutá el comando de compilar otra vez")));
  comprobar("«el comando en la terminal» no pesca «en ...»",
    extractCommand("corré el comando en la terminal del proyecto") === null);
  comprobar("pareceProsa rechaza frases", pareceProsa("de compilar la app") && pareceProsa("en la terminal") && !pareceProsa("npm run build"));
  comprobar("pareceProsa no rechaza comandos reales", !pareceProsa("node scripts/gen-reflejo.mjs") && !pareceProsa("git status"));
  const log = [
    "> cerebronico@23.0.0 build",
    "> tsc && vite build",
    "src/engine/reflejo/tablas-lite-v3.json(10,1): error TS1005: '{' expected.",
    "src/engine/reflejo/tablas-lite-v3.json(10,7): error TS1005: ',' expected.",
    "src/engine/reflejo/tablas-max-v3.json(15,14): error TS1136: Property assignment expected.",
    "error Command failed with exit code 2.",
  ].join("\n");
  comprobar("un log npm pegado NO es acción rápida (va al modelo)", parseQuickAction(`Me da este error, ejecutá lo que dice el log:\n${log}`) === null);
  comprobar("pareceContenidoPegado ve código cercado", pareceContenidoPegado("arreglá esto:\n```js\neval(x)\n```"));
  comprobar("pareceContenidoPegado ve trazas", pareceContenidoPegado("Traceback (most recent call last): ..."));
  comprobar("una orden de una línea con la carpeta nombrada NO es contenido pegado", !pareceContenidoPegado("listá los archivos del Escritorio"));
}

// ─── 4. La etiqueta compartida frontend ↔ servidor ──────────────────────────
{
  console.log("\n[4] Una sola etiqueta, dos casas (frontend y servidor)");
  const constantes = readFileSync(path.join(RAIZ, "src", "constants.ts"), "utf-8");
  const mFront = constantes.match(/WEB_EDITOR_ORDER_TAG\s*=\s*"([^"]+)"/);
  comprobar("src/constants.ts declara WEB_EDITOR_ORDER_TAG", !!mFront, "no encontrada");
  comprobar("la etiqueta del frontend es idéntica a la del servidor",
    !!mFront && mFront[1] === ETIQUETA_ORDEN_EDITOR_WEB,
    `front=${mFront?.[1]} · server=${ETIQUETA_ORDEN_EDITOR_WEB}`);

  const app = readFileSync(path.join(RAIZ, "src", "App.tsx"), "utf-8");
  comprobar("App.tsx arma la orden con la etiqueta compartida (no un literal suelto)",
    /WEB_EDITOR_ORDER_TAG/.test(app) && !app.includes('"[ORDEN DEL EDITOR WEB] Modifica'));
}

// ─── 5. El monolito: guarda en el sitio de llamada, parser no duplicado ─────
{
  console.log("\n[5] server.ts: la guarda plantada y el parser extraído");
  const servidor = readFileSync(path.join(RAIZ, "server.ts"), "utf-8");
  comprobar("el sitio de llamada excluye órdenes del editor",
    /!esOrdenDelEditorWeb\(prompt\)/.test(servidor));
  comprobar("parseQuickAction ya NO se redefine en el monolito",
    !/function parseQuickAction/.test(servidor));
  comprobar("quickParser.ts SÍ define parseQuickAction (fuente única)",
    /export function parseQuickAction/.test(readFileSync(path.join(RAIZ, "server", "quickParser.ts"), "utf-8")));
}

// ─── 6. AISLAMIENTO :5000 — el hijo del sandbox no sondea el puente ajeno ───
{
  console.log("\n[6] El sandbox hijo queda aislado del :5000 del anfitrión");
  const servidor = readFileSync(path.join(RAIZ, "server.ts"), "utf-8");
  comprobar("el cargador de packs conoce la marca del hijo",
    /const ES_HIJO_SANDBOX = process\.env\.CN_SANDBOX_CHILD === "1" \|\| process\.env\.CN_DISABLE_BRIDGE === "1"/.test(servidor));
  comprobar("un pack que apunta al puerto del puente se OMITA en el hijo",
    /if \(ES_HIJO_SANDBOX && apuntaAlPuente\(p\.url\)\)/.test(servidor));
  comprobar("la guarda del puente en startAgentBridge sigue viva (no se borró al parchear)",
    /process\.env\.CN_SANDBOX_CHILD === "1" \|\| process\.env\.CN_DISABLE_BRIDGE === "1"/.test(servidor));
}

console.log(`\n═══ RESULTADO: ${pasan} correctas · ${fallan} fallidas ═══`);
if (fallan > 0) {
  console.log("Fallos:");
  fallos.forEach((f) => console.log(`  · ${f}`));
}
process.exitCode = fallan > 0 ? 1 : 0;
