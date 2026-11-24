/**
 * tests/bajoConsumo.test.ts — MODO BAJO CONSUMO + CAMINO QUIRÚRGICO (v1.16.4)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/bajoConsumo.test.ts
 *
 * Custodia las tres entregas de la mejora MEJORA_MODO_BAJO_CONSUMO_v1 sobre el
 * árbol v1.16.3-blanco y los mandamientos nuevos del usuario:
 *   1. el BAT arranca Ollama con keep-alive CON CADUCIDAD (5m), no clavado (-1),
 *      y viaja en CRLF sin trampas de paréntesis (empaque EXE automatizado);
 *   2. la residencia por petición sigue la ESCALERA MR (3m / 5m / 0) leída
 *      desde la RAM real del equipo, y el warmup (demanda explícita) manda;
 *   3. la RAM de Ollama es VISIBLE (chip en Puertos) y se puede EXPULSAR con un
 *      clic o con la herramienta del agente — una verdad, dos puertas;
 *   4. el bucle de automatismo consciente conoce sus fases (crear → modificar
 *      → reparar) y su escalera; y
 *   5. el camino de los archivos tiene peajes: nada prohibido entra al árbol
 *      del proyecto ni cruza al sandbox sin la lista quirúrgica.
 *
 * Lo medible se prueba en seco (puras); lo cableado se comprueba SOBRE el
 * código, como manda la casa: un pin que lee el archivo no se puede mentir a
 * sí mismo tan fácil como un test que reimplementa la lógica.
 */
import {
  keepAliveBajoConsumo,
  keepAliveExplicito,
  getModelProfile,
  modoLivianoLocal,
  DIMINUTO_PARAMS_B,
  PESADO_PARAMS_B,
  RAM_LIMITADA_GB,
} from "../src/engine/modelTiers";
import {
  normalizarPs,
  sumarResidenteMb,
  PS_CADUCIDAD_MS,
  type ModeloResidente,
} from "../server/ollamaBajoConsumo";
import { faseDelTurno, escalonDeReparacion, totalFallos, directivaDeReparacion } from "../src/engine/bucleAutonomo";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

// ════════════════════════════════════════════════════════════════════════════
seccion("1 · La escalera MR: cuánto vive un modelo en RAM según el equipo");
// ════════════════════════════════════════════════════════════════════════════
comprobar("nube → 10m (no toca la RAM local)", keepAliveBajoConsumo(120, true) === "10m");
comprobar("diminuto 0.5B → 3m", keepAliveBajoConsumo(0.5, false, 8) === "3m");
comprobar("el umbral diminuto es 1.7B", DIMINUTO_PARAMS_B === 1.7);
comprobar("1.7B exacto sigue siendo diminuto (3m)", keepAliveBajoConsumo(1.7, false, 4) === "3m");
comprobar("mediano 3B → 5m", keepAliveBajoConsumo(3, false, 8) === "5m");
comprobar("pesado >7B en ≤8 GB → 0 (NO residente)", keepAliveBajoConsumo(14, false, 8) === "0");
comprobar("el umbral pesado es >7B", PESADO_PARAMS_B === 7 && RAM_LIMITADA_GB === 8);
comprobar("7B no es pesado (5m)", keepAliveBajoConsumo(7, false, 8) === "5m");
comprobar("pesado en MR3+ (16 GB) → 5m", keepAliveBajoConsumo(14, false, 16) === "5m");
comprobar("tamaño desconocido → 5m (ni clava ni expulsa a ciegas)", keepAliveBajoConsumo(null, false) === "5m");
comprobar("sin RAM informada asume la conservadora (8 GB)", keepAliveBajoConsumo(14, false) === "0");
comprobar("la demanda explícita (warmup) manda: 0 → 5m", keepAliveExplicito("0") === "5m");
comprobar("...y un 3m explícito no se infla", keepAliveExplicito("3m") === "3m");

// El perfil completo debe heredar la escalera con la RAM delante.
const p1b = getModelProfile("llama3.2:1b", 8);
const p14b = getModelProfile("qwen2.5:14b", 8);
const p14bGrande = getModelProfile("qwen2.5:14b", 32);
const pnube = getModelProfile("gpt-oss:120b-cloud", 8);
comprobar("perfil 1B/8GB → keepAlive 3m", p1b.keepAlive === "3m", p1b.keepAlive);
comprobar("perfil 14B/8GB → keepAlive 0", p14b.keepAlive === "0", p14b.keepAlive);
comprobar("perfil 14B/32GB → keepAlive 5m", p14bGrande.keepAlive === "5m", p14bGrande.keepAlive);
comprobar("perfil nube → keepAlive 10m", pnube.keepAlive === "10m", pnube.keepAlive);
comprobar("sin ramGb, el 14B trata el equipo como limitado", getModelProfile("qwen2.5:14b").keepAlive === "0");

// ════════════════════════════════════════════════════════════════════════════
seccion("2 · ollama ps: medir la residencia sin inventar números");
// ════════════════════════════════════════════════════════════════════════════
const ahora = Date.UTC(2026, 8, 27, 12, 0, 0);
const ps = normalizarPs(
  {
    models: [
      { model: "qwen2.5:14b", size: 9_000_000_000, size_vram: 4_000_000_000, until: new Date(ahora + 60_000).toISOString() },
      { model: "smollm2:135m", size: 150_000_000, until: new Date(ahora - 1).toISOString() },
      { model: "   " },
      { size: 5 },
    ],
  },
  ahora
);
comprobar("dos modelos válidos, la basura se descarta", ps.length === 2, String(ps.length));
comprobar("el tamaño llega en bytes tal cual", ps[0].sizeBytes === 9_000_000_000);
comprobar("sin size_vram → vram null (no se supone 0)", ps[1].vramBytes === null);
comprobar("until en el pasado → expirado true", ps[1].expirado === true);
comprobar("until en el futuro → expirado false", ps[0].expirado === false);
comprobar("la suma redondea a MB y no cuenta lo no-medido", sumarResidenteMb([{ sizeBytes: 150_000_000 } as ModeloResidente, { sizeBytes: null } as ModeloResidente]) === Math.round(150_000_000 / 1024 / 1024));
comprobar("respuesta sin «models» → lista vacía, no excepción", normalizarPs(undefined).length === 0 && normalizarPs({ models: "no" }).length === 0);
comprobar("la caducidad de la muestra es 5 s (el paso del monitor)", PS_CADUCIDAD_MS === 5_000);

// ════════════════════════════════════════════════════════════════════════════
seccion("3 · El BAT de arranque: caducidad sí, apagones no, CRLF siempre");
// ════════════════════════════════════════════════════════════════════════════
const batBytes = readFileSync(path.join(RAIZ, "iniciar_todo_windows.bat"));
const bat = batBytes.toString("utf8");
comprobar("keep-alive del BAT es 5m (ya no -1)", /set OLLAMA_KEEP_ALIVE=5m/.test(bat));
comprobar("ningún -1 clavado sobrevivió en el arranque", !bat.includes("OLLAMA_KEEP_ALIVE=-1"));
comprobar("CRLF en TODAS las líneas (un BAT en LF se cierra enseguida)", batBytes.includes(Buffer.from("\r\n")) && (batBytes.toString("binary").match(/\n/g) || []).length === (batBytes.toString("binary").match(/\r\n/g) || []).length);
comprobar("cero bloques «if (...)» multilínea con eco dentro (trampa de cmd)", !/^\s*if\b.*\(\s*$/im.test(bat));
comprobar("el flujo usa goto/etiquetas, no paréntesis anidados", /goto :start_server/.test(bat) && /:start_server/.test(bat));
comprobar("prohibida la trampa «pause <nul» (mataba la pausa del doble-clic)", !/pause\s*<nul/.test(bat.replace(/^REM.*$/gm, "")));
comprobar("pausa real a secas ante el error (pasa sola con stdin=NUL del EXE)", /^\s*pause\s*$/m.test(bat));
comprobar("sin tildes (página de código OEM de cmd)", !/[áéíóúñÁÉÍÓÚÑ]/.test(bat));
comprobar("instala dependencias solo si faltan (primer arranque del ZIP)", /if exist "node_modules\\" goto :deps_ok/.test(bat.replace(/\r/g, "")));
comprobar("el server sigue siendo npm run dev en :3000", /npm run dev/.test(bat));

// ════════════════════════════════════════════════════════════════════════════
seccion("4 · El motor cableado: keep_alive en las llamadas y en el warmup");
// ════════════════════════════════════════════════════════════════════════════
const srv = leer("server.ts");
comprobar("getProfile pasa la RAM real del equipo", /getModelProfile\(modelName, RAM_GB\)/.test(srv));
comprobar("/api/conductor (generate) ya no viaja sin keep_alive", /format: "json", keep_alive: getProfile\(modelo\)\.keepAlive/.test(srv));
comprobar("warmup = demanda EXPLÍCITA (el ahorro no lo mata)", /keep_alive: keepAliveExplicito\(profile\.keepAlive\)/.test(srv));
comprobar("el bucle de agente manda la política por perfil", /keep_alive: profile\.keepAlive,\n\s+options: buildOllamaOptions/.test(srv));
comprobar("el router de control está montado", /registrarOllamaControl\(app, \{ ollamaUrl: OLLAMA_DEFAULT/.test(srv));
comprobar("las herramientas del agente existen en el ejecutor", srv.includes('case "ollama_estado"') && srv.includes('case "ollama_expulsar"') && srv.includes('case "recursos_maquina"'));
comprobar("y viven en un módulo extraído, no en el monolito", /export async function sondearOllamaPs/.test(leer("server/ollamaBajoConsumo.ts")));
const contrato = JSON.parse(leer("contrato-rutas.json"));
comprobar("GET /api/ollama/ps está en el contrato", contrato.rutas.some((r: any) => r.ruta === "/api/ollama/ps" && r.metodo === "GET"));
comprobar("POST /api/ollama/expulsar está en el contrato", contrato.rutas.some((r: any) => r.ruta === "/api/ollama/expulsar" && r.metodo === "POST"));
const lineasServidor = srv.split("\n").length - 1; // sin contar el hueco tras el \n final
comprobar(`el trinquete aguanta: server.ts ${lineasServidor} ≤ presupuesto ${contrato.presupuesto_lineas}`, lineasServidor <= contrato.presupuesto_lineas);

// ════════════════════════════════════════════════════════════════════════════
seccion("5 · El monitor y la interfaz: la RAM de Ollama a la vista");
// ════════════════════════════════════════════════════════════════════════════
const telem = leer("server/routers/telemetria.ts");
comprobar("/api/system stats sondea la residencia", /ollamaPs = await sondearOllamaPs/.test(telem));
comprobar("el bloque «ollama» del stats es medido, no supuesto", /vivo: ollamaPs\.vivo,\s*\n\s*residenteMb: ollamaPs\.residenteMb/.test(telem));
const sidebar = leer("src/components/LeftSidebar.tsx");
comprobar("chip «Ollama: X GB» en la pestaña Puertos", /Ollama: \{ollamaStats\?\.vivo \? `\$\{/.test(sidebar));
comprobar("botón Expulsar presente y con su título honesto", /⏏ Expulsar modelos \(liberar RAM\)/.test(sidebar));
comprobar("el botón se apaga cuando no hay nada que expulsar", /ollamaStats\.modelos\.length === 0/.test(sidebar));
const app = leer("src/App.tsx");
comprobar("App cablea el expulsar contra POST /api/ollama/expulsar", /fetch\("\/api\/ollama\/expulsar", \{[\s\S]{0,120}method: "POST"/.test(app));
comprobar("...y refresca la muestra tras el portazo", /await fetchStats\(\);\s*\n\s*setIsExpulsando\(false\)/.test(app));

// ════════════════════════════════════════════════════════════════════════════
seccion("6 · Herramientas activas: el pack «sistema» registrado de verdad");
// ════════════════════════════════════════════════════════════════════════════
const registry = leer("src/engine/toolRegistry.ts");
comprobar("SISTEMA_PACK declarado y registrado", /const SISTEMA_PACK: ToolPack/.test(registry) && /registerToolPack\(SISTEMA_PACK\)/.test(registry));
comprobar("ollama_estado es cheap (llega hasta a los modelos chicos)", /name: "ollama_estado",\s*\n\s*pack: "sistema",\s*\n\s*cheap: true/.test(registry));
comprobar("ollama_expulsar explica que no borra del disco", /No borra nada del disco/.test(registry));
comprobar("recursos_maquina promete medidas, no opiniones", /Medida real del equipo/.test(registry));

// ════════════════════════════════════════════════════════════════════════════
seccion("7 · Automatismo consciente: fases y escalera en el cable del bucle");
// ════════════════════════════════════════════════════════════════════════════
comprobar("el bucle registra fallos por herramienta e historial", /fallosPorHerramienta\[fnName\] = isError/.test(srv) && /historialBucle\.push/.test(srv));
comprobar("...y se los pasa al juez determinista", /decidirBucle\(\{[^}]*fallosPorHerramienta[^}]*historialBucle/.test(srv));
comprobar("el techo de pasos compra presupuesto de reparación", /techoDePasos\(tareasPendientes\(plan\)\.length, PASOS_BASE, PASOS_TOPE,/.test(srv));
comprobar("un éxito limpia el contador de ESA herramienta", /: 0;\s*\n\s*historialBucle\.push/.test(srv));
// Comportamiento puro de las fases (la suite bucleAutonomo las prueba a fondo;
// acá solo se asegura de que lo cableado coincide con lo probado).
comprobar("sin historial ni fallos la fase es CREAR", faseDelTurno({}) === "crear");
comprobar("con write_file exitoso la fase es MODIFICAR", faseDelTurno({ historialBucle: [{ nombre: "write_file", ok: true }] }) === "modificar");
comprobar("con último fallo la fase es REPARAR", faseDelTurno({ ultimoFallo: { herramienta: "run_command", error: "x" } }) === "reparar");
comprobar("escalón 2 a partir de 3 fallos acumulados", escalonDeReparacion(totalFallos({ a: 2, b: 1 })) === 2);
comprobar("la escalera nombra la herramienta de retroceder", /deshacer_cambios/.test(directivaDeReparacion(2)));

// ════════════════════════════════════════════════════════════════════════════
seccion("8 · El camino de los archivos (mandato del usuario, v1.16.4)");
// ════════════════════════════════════════════════════════════════════════════
comprobar("App trae la aduana al cliente", /import \{ clasificarRuta, auditarArbol, puedeIrEnElEmpaque \} from "\.\/engine\/aduanaArbol"/.test(app));
comprobar("peaje de entrada: adjunto del chat", /aduanaDeEntrada\(newWorkspaceFiles, "adjunto del chat"\)/.test(app));
comprobar("peaje de entrada: adjunto del editor", /aduanaDeEntrada\(newWorkspaceFiles, "adjunto del editor"\)/.test(app));
comprobar("lo admitido, no lo bruto, es lo que toca el árbol", /admitidos\.forEach\(\(f\) => map\.set\(f\.path, f\)\)/.test(app));
comprobar("preguntar se confirma con la pregunta REDACTADA por la aduana", /auditarArbol\(preguntar\.map\(\(f\) => f\.path\)\)/.test(app) && /window\.confirm\(/.test(app));
comprobar("la lista quirúrgica filtra ANTES de mandar al sandbox", /workspaceFiles\.filter\(\(f\) => puedeIrEnElEmpaque\(f\.path\)\)/.test(app));
comprobar("...y lo vetado se informa, nunca en silencio", /Lista quirúrgica al sandbox/.test(app));
const fp = leer("src/utils/fileParser.ts");
comprobar("abrir un .cn también pasa por la aduana de entrada", /v1\.16\.4 · CAMINO DE LOS ARCHIVOS[\s\S]{0,400}clasificarRuta\(path\)\.veredicto === "prohibido"/.test(fp));

// ════════════════════════════════════════════════════════════════════════════
seccion("9 · Fuente única de versión");
// ════════════════════════════════════════════════════════════════════════════
const constants = leer("src/constants.ts");
comprobar("constants.ts tiene UNA sola semilla de versión", (constants.match(/^\s*const VERSION_SEMVER = "[^"]+";/m) || []).length === 1);
const semilla = constants.match(/const VERSION_SEMVER = "([^"]+)"/)![1];
// v1.46.0 — LA VALLA DEJA DE FIJAR UN NÚMERO. Venía clavada a «1.43.0» y con
// cada subida de versión viajaba ROJA DE FÁBRICA: ya se había «arreglado» una
// vez subiendo el literal a mano (v1.31.0). Una valla que hay que editar en cada
// release no vigila nada — solo obliga a tocar el test, y enseñar a tocar el
// test para que se ponga verde es la peor costumbre que puede coger una suite.
// Lo que importa es que la semilla sea una semver de verdad y que package.json
// diga LO MISMO (eso se comprueba en la línea siguiente y no caduca).
comprobar(`la semilla es una semver válida (${semilla})`, /^\d+\.\d+\.\d+$/.test(semilla));
comprobar("package.json viaja con la misma versión", JSON.parse(leer("package.json")).version === semilla);

// ════════════════════════════════════════════════════════════════════════════
seccion("10 · sin-manos-no-narras: la nube NUNCA está liviana (v1.57.1)");
// ════════════════════════════════════════════════════════════════════════════
// Raíz del fallo (sesión exportada 2026-10-12): la IIFE de server.ts apagaba las
// tools por `RAM_GB <= 8` a CUALQUIER modelo Ollama — incluso a NEMESIS, alias de
// gpt-oss:120b-cloud, que no consume RAM local. Sin tools y sin la guarda de
// honestidad (que antes solo hablaba a micro/tiny), el modelo narraba ✔ falsos.
const pNem = getModelProfile("NEMESIS:latest", 8);
comprobar("★ NEMESIS:latest es nube por alias (→ gpt-oss:120b-cloud)", pNem.remote === true && pNem.tier === "cloud", `remote=${pNem.remote} tier=${pNem.tier}`);
comprobar("★ en PC de 8 GB la nube NO entra en modo liviano: keeps sus tools", modoLivianoLocal(pNem, 8) === false);
comprobar("el diminuto local en 8 GB sigue liviano (el ahorro de v1.56.3 vive)", modoLivianoLocal(getModelProfile("qwen2.5:0.5b", 8), 8) === true);
comprobar("local grande en equipo de 16 GB no está liviano (solo micro/tiny o ≤8)", modoLivianoLocal(getModelProfile("qwen2.5:7b", 16), 16) === false);
comprobar("CN_LOCAL_LIVIANO=1 manda hasta sobre la nube", modoLivianoLocal(pNem, 8, "1") === true);
comprobar("CN_LOCAL_LIVIANO=0 manda sobre el diminuto", modoLivianoLocal(getModelProfile("qwen2.5:0.5b", 8), 8, "0") === false);
const srvLiv = leer("server.ts");
comprobar("server.ts usa modoLivianoLocal y la guarda ya no filtra por tier", /const localLiviano = modoLivianoLocal\(profile, RAM_GB\)/.test(srvLiv) && !srvLiv.includes('RAM_GB <= 8 || profile.tier === "micro"') && /guardaSinHerramientas\(\)/.test(srvLiv));

console.log(`\n═══ BAJO CONSUMO v1.16.4: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
