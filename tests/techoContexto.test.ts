/**
 * techoContexto.test.ts — v1.57.14 · LA VENTANA QUE SE PIDE CUENTA EN RAM
 * =======================================================================
 * Raíz: la guía de optimización que mandó el usuario y docs.ollama.com/faq
 * («Required RAM will scale by OLLAMA_NUM_PARALLEL * OLLAMA_CONTEXT_LENGTH»).
 * El proyecto topaba `num_ctx` por TAMAÑO de modelo y por RAM total, pero nunca
 * lo topaba por lo que VALE esa ventana: la KV-cache. Con el dial del panel Pro
 * llegando hasta 131072, un clic alcanzaba para volcar una máquina de 16 GB —
 * el mismo 256k del diary del 14/10, pero con firma propia.
 *
 * Los números de esta suite se calcularon a mano sobre la fórmula:
 *   bytes/token = 2 (K y V) · capas · cabezasKV · head_dim · bytesPorValor
 *   qwen3:4b (36·8·128·f16)  = 147456 B/token = 0,140625 MB/token
 *   16384 · 0,140625 / 1024  = 2,25 GB
 *   defecto 0,15 MB/token · 16 GB · fracción 0,35 = 5,6 GB → 38229 tokens
 *   → redondeado a la baja en pasos de 1024 = 37888 (37 pasos)
 * Si alguien mueve FRACCION_RAM_PARA_KV o el defecto, la suite se pone roja y
 * la discusión es sobre el número, no sobre la memoria del que lo escribió.
 */
import {
  costoKvPorToken,
  gbKvParaVentana,
  redondearALaBaja,
  techoDeContexto,
  MB_KV_POR_TOKEN_DEFECTO,
  FRACCION_RAM_PARA_KV,
  SUELO_CONTEXTO,
  PASO_CONTEXTO,
} from "../src/engine/techoContexto";
import {
  getModelProfile,
  buildOllamaOptions,
  fijarPreferenciaMotor,
  leerPreferenciaMotor,
  resetearPreferenciaMotor,
  aplicarPreferenciaMotor,
  keepAliveBajoConsumo,
} from "../src/engine/modelTiers";
import { readFileSync } from "node:fs";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};
const seccion = (t: string) => console.log("\n" + t + "\n");

// ════════════════════════════════════════════════════════════════════════════
seccion("1 · La fórmula exacta, cuando la arquitectura se conoce");
const arqQwen34b = { nLayer: 36, nKvHeads: 8, headDim: 128 };
const costoExacto = costoKvPorToken(arqQwen34b);
comprobar("qwen3:4b = 0,140625 MB/token (2·36·8·128·2)", Math.abs(costoExacto.mbPorToken - 0.140625) < 1e-9, `=${costoExacto.mbPorToken}`);
comprobar("con arquitectura el origen es EXACTO", costoExacto.origen === "arquitectura");
comprobar("q8_0 paga la mitad que f16", Math.abs(costoKvPorToken({ ...arqQwen34b, bytesPorValor: 1 }).mbPorToken - 0.0703125) < 1e-9);
comprobar("un 7B con 4 cabezas KV paga MENOS que el 4B", costoKvPorToken({ nLayer: 28, nKvHeads: 4, headDim: 128 }).mbPorToken < costoExacto.mbPorToken);
comprobar("capas 0 no es arquitectura válida", costoKvPorToken({ nLayer: 0, nKvHeads: 8, headDim: 128 }).origen === "defecto");
comprobar("falta head_dim => defecto", costoKvPorToken({ nLayer: 36, nKvHeads: 8 }).origen === "defecto");
comprobar("sin argumento => defecto", costoKvPorToken().origen === "defecto");
comprobar("el defecto es 0,15 MB/token declarado", MB_KV_POR_TOKEN_DEFECTO === 0.15 && costoKvPorToken().mbPorToken === 0.15);
comprobar("bytesPorValor basura cae a f16", Math.abs(costoKvPorToken({ ...arqQwen34b, bytesPorValor: -3 }).mbPorToken - 0.140625) < 1e-9);

seccion("2 · GB de una ventana");
comprobar("16384 de qwen3:4b = 2,25 GB", gbKvParaVentana(16384, 0.140625) === 2.25);
comprobar("131072 con defecto = 19,2 GB", gbKvParaVentana(131072, 0.15) === 19.2);
comprobar("ventana 0 no opina", gbKvParaVentana(0, 0.15) === null);
comprobar("costo 0 no opina", gbKvParaVentana(2048, 0) === null);

// ════════════════════════════════════════════════════════════════════════════
seccion("3 · El techo: 131072 en una máquina de 16 GB NO pasa");
const t131 = techoDeContexto({ numCtxPedido: 131072, ramGb: 16 });
comprobar("recorta", t131.recortado === true);
comprobar("presupuesto 5,6 GB (16 · 0,35)", t131.presupuestoGb === 5.6, `=${t131.presupuestoGb}`);
comprobar("cae a 37888 (37 pasos de 1024)", t131.numCtx === 37888, `=${t131.numCtx}`);
comprobar("el resultado es múltiplo de 1024", t131.numCtx % PASO_CONTEXTO === 0);
comprobar("declara el costo de lo que dejó pasar", t131.costoPedidoGb === 19.2);
comprobar("declara el costo final", t131.costoFinalGb === 5.55, `=${t131.costoFinalGb}`);
comprobar("el motivo dice qué se hizo y por qué", /131072/.test(t131.motivo) && /37888/.test(t131.motivo) && /KV-cache/.test(t131.motivo), t131.motivo.slice(0, 90));
comprobar("el motivo da la salida real (más RAM o q8_0)", /q8_0|flash attention/m.test(t131.motivo));
comprobar("16384 en 16 GB pasa intacto (la escalera no seauto-corta)", techoDeContexto({ numCtxPedido: 16384, ramGb: 16 }).numCtx === 16384);
comprobar("y no se marca como recorte", techoDeContexto({ numCtxPedido: 16384, ramGb: 16 }).recortado === false);
comprobar("32768 en 16 GB también cabe (5,6 GB de tope)", techoDeContexto({ numCtxPedido: 32768, ramGb: 16 }).numCtx === 32768);

seccion("4 · Máquinas chicas y el suelo que no se puede pisar");
comprobar("4 GB topa una ventana de 16384", techoDeContexto({ numCtxPedido: 16384, ramGb: 4 }).recortado === true);
comprobar("pero nunca baja del suelo de 2048", techoDeContexto({ numCtxPedido: 16384, ramGb: 4 }).numCtx >= SUELO_CONTEXTO);
comprobar("1 GB de máquina => exactamente el suelo", techoDeContexto({ numCtxPedido: 8192, ramGb: 1 }).numCtx === SUELO_CONTEXTO);
comprobar("un pedido chico no se infla (la cota no sube)", techoDeContexto({ numCtxPedido: 2048, ramGb: 64 }).numCtx === 2048);
comprobar("redondearALaBaja(500) no devuelve 0", redondearALaBaja(500) === 2048);
comprobar("redondearALaBaja(37888) es idempotente", redondearALaBaja(37888) === 37888);
comprobar("redondearALaBaja(37000) baja un paso", redondearALaBaja(37000) === 36864);

seccion("5 · HONESTIDAD: sin medida de RAM no hay opinión");
const sinRam = techoDeContexto({ numCtxPedido: 131072 });
comprobar("sin ramGb NO recorta", sinRam.recortado === false);
comprobar("devuelve el pedido tal cual", sinRam.numCtx === 131072);
comprobar("y lo dice en el motivo", /no se midió/.test(sinRam.motivo), sinRam.motivo.slice(0, 80));
comprobar("ramGb 0 no es una medida", techoDeContexto({ numCtxPedido: 8192, ramGb: 0 }).recortado === false);
comprobar("ramGb NaN no es una medida", techoDeContexto({ numCtxPedido: 8192, ramGb: NaN }).recortado === false);
comprobar("FRACCION declarada y no mágica", FRACCION_RAM_PARA_KV === 0.35);

// ════════════════════════════════════════════════════════════════════════════
seccion("6 · El dial del panel Pro LLEGA al perfil (era decorativo)");
resetearPreferenciaMotor();
const base = getModelProfile("qwen3:4b", 16);
comprobar("sin dial: la escalera manda 16384", base.numCtx === 16384, `=${base.numCtx}`);
comprobar("sin dial: ctxEscalera coincide", base.ctxEscalera === 16384);
comprobar("sin dial: no hay recorte", base.ctxRecortado === false);
comprobar("sin dial: keep_alive de la escalera MR", base.keepAlive === keepAliveBajoConsumo(4, false, 16));

comprobar("el dial de 131072 se acepta", fijarPreferenciaMotor({ numCtx: 131072 }).ok === true);
const conDial = getModelProfile("qwen3:4b", 16);
comprobar("el dial BAJA de 16384 a lo pagable", conDial.numCtx === 37888, `=${conDial.numCtx}`);
comprobar("ctxEscalera conserva el 16384 original", conDial.ctxEscalera === 16384);
comprobar("ctxRecortado es true", conDial.ctxRecortado === true);
comprobar("y el perfil lo EXPLICA en notes", conDial.notes.some((n) => /Contexto:/.test(n) && /131072/.test(n)), conDial.notes.join("|").slice(0, 120));
comprobar("el dial de keep_alive manda sobre la escalera", fijarPreferenciaMotor({ numCtx: 8192, keepAlive: "30m" }).ok && getModelProfile("qwen3:4b", 16).keepAlive === "30m");
comprobar("keepAliveEscalera queda registrado", getModelProfile("qwen3:4b", 16).keepAliveEscalera === keepAliveBajoConsumo(4, false, 16));
comprobar("buildOllamaOptions hereda el dial topado", buildOllamaOptions("qwen3:4b", undefined, 8, 16).num_ctx === getModelProfile("qwen3:4b", 16).numCtx);

const nube = getModelProfile("gemini-2.5-flash", 16);
comprobar("LA NUBE ignora el dial (no paga KV local)", nube.numCtx === 32768, `=${nube.numCtx}`);

seccion("7 · Validación de la preferencia: rechaza con NOMBRE");
comprobar("511 se rechaza", fijarPreferenciaMotor({ numCtx: 511 }).ok === false);
comprobar("0 se rechaza", fijarPreferenciaMotor({ numCtx: 0 }).ok === false);
comprobar("no-entero se rechaza", fijarPreferenciaMotor({ numCtx: 2048.5 }).ok === false);
comprobar("'abc' se rechaza", fijarPreferenciaMotor({ numCtx: "abc" }).ok === false);
comprobar("el rechazo dice el rango", /512/.test(fijarPreferenciaMotor({ numCtx: 511 }).motivo || ""));
comprobar("keep_alive con espacio se rechaza", fijarPreferenciaMotor({ keepAlive: "30 minutos" }).ok === false);
comprobar("las cuatro formas del panel se aceptan", ["5m", "30m", "-1", "0"].every((k) => fijarPreferenciaMotor({ keepAlive: k }).ok));
comprobar("top_p 9 se rechaza", fijarPreferenciaMotor({ topP: 9 }).ok === false);
comprobar("top_p 0.8 se acepta", fijarPreferenciaMotor({ topP: 0.8 }).ok === true && leerPreferenciaMotor().topP === 0.8);
comprobar("top_k 0 se rechaza", fijarPreferenciaMotor({ topK: 0 }).ok === false);
comprobar("num_predict -1 (sin tope) es válido", fijarPreferenciaMotor({ numPredict: -1 }).ok === true);
comprobar("un objeto no-objeto se rechaza", fijarPreferenciaMotor("nada").ok === false);
comprobar("leer no devuelve la instancia viva", (() => { const p = leerPreferenciaMotor(); p.numCtx = 1; return leerPreferenciaMotor().numCtx !== 1; })());

seccion("8 · Los diales de muestreo también viajan (top_p/top_k/num_predict)");
resetearPreferenciaMotor();
const sinPref = buildOllamaOptions("qwen3:4b", undefined, 8, 16);
comprobar("default de la casa: top_p 0.9", sinPref.top_p === 0.9);
comprobar("default de la casa: top_k 40", sinPref.top_k === 40);
fijarPreferenciaMotor({ topP: 0.7, topK: 20, numPredict: 600 });
const conPref = buildOllamaOptions("qwen3:4b", undefined, 8, 16);
comprobar("el dial de top_p manda", conPref.top_p === 0.7);
comprobar("el dial de top_k manda", conPref.top_k === 20);
comprobar("el dial de máx tokens manda", conPref.num_predict === 600);
fijarPreferenciaMotor({ numPredict: -1 });
comprobar("num_predict -1 => se RETIRA el tope, no se clava -1", buildOllamaOptions("qwen3:4b", undefined, 8, 16).num_predict === undefined);
resetearPreferenciaMotor();
comprobar("resetear devuelve la escalera", buildOllamaOptions("qwen3:4b", undefined, 8, 16).top_p === 0.9 && getModelProfile("qwen3:4b", 16).numCtx === 16384);

seccion("9 · aplicarPreferenciaMotor: la función que explica las decisiones");
comprobar("la nube no se toca", aplicarPreferenciaMotor(32768, "10m", true, 16, { numCtx: 131072 }).numCtx === 32768);
comprobar("motivo vacío en nube", aplicarPreferenciaMotor(32768, "10m", true, 16, { numCtx: 131072 }).motivo === "");
comprobar("dial pagable => dice que cabe", /cabe|según tu dial/.test(aplicarPreferenciaMotor(16384, "5m", false, 16, { numCtx: 8192 }).motivo));
comprobar("dial impagable => nombra el recorte", /131072/.test(aplicarPreferenciaMotor(16384, "5m", false, 16, { numCtx: 131072 }).motivo));
comprobar("keep_alive distinto se informa", /Residencia según tu dial/.test(aplicarPreferenciaMotor(16384, "5m", false, 16, { keepAlive: "30m" }).motivo));
comprobar("keep_alive igual NO se queja", !/Residencia/.test(aplicarPreferenciaMotor(16384, "5m", false, 16, { keepAlive: "5m" }).motivo));
comprobar("sin preferencia y sin recorte => cambio false", aplicarPreferenciaMotor(16384, "5m", false, 16, {}).cambio === false);

// ════════════════════════════════════════════════════════════════════════════
seccion("10 · El BAT fija las tres variables de concurrencia de Ollama");
const bat = readFileSync("iniciar_todo_windows.bat", "utf8");
comprobar("OLLAMA_MAX_LOADED_MODELS=1 en la cadena de arranque", /set OLLAMA_MAX_LOADED_MODELS=1 &&/.test(bat));
comprobar("OLLAMA_NUM_PARALLEL=1 en la cadena de arranque", /set OLLAMA_NUM_PARALLEL=1 &&/.test(bat));
comprobar("OLLAMA_CONTEXT_LENGTH=4096 (el default documentado)", /set OLLAMA_CONTEXT_LENGTH=4096 &&/.test(bat));
comprobar("keep_alive 5m sigue vivo (no se perdió el fix viejo)", /set OLLAMA_KEEP_ALIVE=5m/.test(bat));
comprobar("el default de 3 modelos concurrentes se explica", /default es 3/.test(bat));
comprobar("la escala NUM_PARALLEL × CONTEXTO está documentada", /NUM_PARALLEL \* CONTEXTO|NUM_PARALLEL \* CONTEXT_LENGTH/.test(bat));
comprobar("AVISO honesto: si el motor no lo arrancó este BAT, no llegaron", /no le llegaron|NO le llegaron/.test(bat));
comprobar("dice cómo aplicarlas de verdad (salir y reabrir la app)", /sali de la app|Variables de/.test(bat));
comprobar("CRLF intacto (un BAT en LF 'se cierra enseguida')", bat.includes("\r\n") && !/[^\r]\n/.test(bat));
comprobar("ASCII puro (cp850 no bancaba acentos sueltos)", !/[^\x00-\x7f]/.test(bat));

seccion("11 · Las puertas que no mandaban num_ctx (el fantasma heredado)");
const srv = readFileSync("server.ts", "utf8");
comprobar("el puente UDS fija num_ctx", /options: \{ num_predict: 24, num_ctx: getProfile\(modelo\)\.numCtx \}/.test(srv));
comprobar("la medición usa el perfil completo", /\.\.\.buildOllamaOptions\(modelo, undefined, CPU_CORES, RAM_GB\), num_predict: 24/.test(srv));
comprobar("el director (/api/conductor) ya no viaja sin options", /format: "json", keep_alive: getProfile\(modelo\)\.keepAlive, options: buildOllamaOptions\(modelo/.test(srv));
comprobar("el registro de preferencia lleva ramGb", /registrarOllamaControl\(app, \{ ollamaUrl:[^}]*ramGb: RAM_GB \}/.test(srv));
// v1.57.17 · el tope se LEE del contrato (fuente única), no se duplica acá: el 12131
// de acá abajo era la clase de número mágico que la 1.57.15 juró desterrar.
comprobar("trinquete: server.ts NO creció más que su presupuesto", srv.split("\n").length - 1 <= JSON.parse(readFileSync("contrato-rutas.json", "utf8")).presupuesto_lineas, `${srv.split("\n").length - 1} líneas`);

seccion("12 · La valla de versión ahora mira LOS CUATRO sitios");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const html = readFileSync("index.html", "utf8");
const constants = readFileSync("src/constants.ts", "utf8");
const semilla = (constants.match(/const VERSION_SEMVER = "([^"]+)"/) || [])[1];
comprobar("constants.ts es la semilla", !!semilla);
comprobar("package.json = semilla", pkg.version === semilla);
comprobar("package-lock.json = semilla (antes viajaba solo)", lock.version === semilla, `lock=${lock.version} semilla=${semilla}`);
comprobar("el paquete del lock también", lock.packages?.[""]?.version === semilla);
comprobar("index.html = semilla", html.includes(`CerebróNico V${semilla}`));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const ultima = (changelog.match(/^## v(\d+\.\d+\.\d+)/m) || [])[1];
comprobar("la semilla es la versión más alta del CHANGELOG", ultima === semilla, `changelog=${ultima} semilla=${semilla}`);

seccion("13 · Los diales del panel tienen dueños (no hay reguladores mudos)");
const app = readFileSync("src/App.tsx", "utf8");
const panel = readFileSync("src/components/ProConfigPanel.tsx", "utf8");
const eng = readFileSync("src/utils/engine.ts", "utf8");
for (const dial of ["contextSize", "keepAlive", "topP", "topK", "maxTokens"]) {
  comprobar(`el panel expone ${dial}`, new RegExp(`settings\\.ai\\.${dial}`).test(panel));
  comprobar(`App.tsx envía ${dial} al motor`, new RegExp(`${dial}`).test(app));
}
comprobar("App.tsx fija la preferencia", /fijarPreferenciaMotor\(motor\)/.test(app));
comprobar("App.tsx la sincroniza con el server", /\/api\/ollama\/preferencia/.test(app));
comprobar("el recorte SE IMPRIME, no se calla", /Panel Pro → motor/.test(app));
comprobar("el camino directo ya no clava keep_alive '30m'", !/keep_alive: "30m"/.test(eng));
comprobar("el camino directo usa el perfil", /keep_alive: perfilLocal\.keepAlive/.test(eng));
comprobar("el camino directo manda num_ctx por perfil", /\.\.\.buildOllamaOptions\(\s*config\.model/.test(eng));
comprobar("la hint del panel no promete lo que no hace", /se recorta y se avisa/.test(panel));

console.log(`\n═══ TECHO DE CONTEXTO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  · " + f);
if (fallos.length) process.exit(1);
