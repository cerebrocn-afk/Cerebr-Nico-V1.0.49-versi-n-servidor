/**
 * tests/puertosCableados.test.ts — LOS SIETE CABLEADOS HASTA EL FINAL (v1.0.1)
 * =============================================================================
 * LA QUEJA DE MARIO (6/11). Medida en v2.3.23 y en su árbol v1.0 — los archivos
 * de arranque de los dos árboles son BYTE A BYTE IGUALES, así que el diagnóstico
 * sirve para los dos:
 *   «revisa los puertos, son 7 … en el arranque no encienden todos los puertos;
 *    fijate en la cabecera y en la hoja de ruta de la barra de tareas que los
 *    indicadores estén bien cableados. Un comando py se abre y se cierra…
 *    el 5000 se cae, no muy seguido, pero el 5102 no arranca».
 *
 * LO QUE SE MIDIO (nada de esto estaba vallado; por eso se rompio):
 *  1 · La hoja de ruta pintaba CINCO puertos y la cabecera SIETE: `Servicios`
 *      sale de `SERVICIOS_VENTANA` (5 filas) y faltaban el motor :5103 y el
 *      sandbox :3500.
 *  2 · El .EXE nunca encendía NINGÚN pack: `electron-main.cjs` sólo lanzaba el
 *      server, y el instalador NO ejecuta `iniciar_todo_windows.bat` (que es el
 *      único que prendía :5100/:5102/:5103). De ahí el «5102 no arranca».
 *  3 · El reanimado moría al nacer — el «py que se abre y se cierra»: el
 *      supervisor recibía `raizProyecto: PROJECT_ROOT` (la raíz de DATOS) y el
 *      shim hace `cd /d <esa raíz>` + `scripts\x.py` con ruta RELATIVA.
 *  4 · El :5000 perdía la autocura para siempre: `puertoRobado` nunca volvía a
 *      `false` y el `exit` lo traducía en `restartCount = MAX_RESTARTS`.
 *  5 · El motor :5103 nacía DESPUÉS de que :5100 mirara si existía.
 *  6 · Los logs de arranque salían vacíos (sin PYTHONUNBUFFERED, Python
 *      bufferiza al redireccionar): «se abrió y se cerró y no se lee nada».
 *
 * Esta suite no prueba el módulo puro (eso ya lo hacen `arranqueVentanas`,
 * `reavivarServicio` e `indicadorServicios`): prueba EL CABLE, que es donde la
 * casa siempre se rompe.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PORTS } from "../src/constants";
import {
  SERVICIOS_VENTANA,
  SERVICIOS_ADICIONALES,
  INVENTARIO_SERVICIOS,
  contarPorTipo,
  serviciosVigilados,
  puertosDelInventario,
} from "../src/engine/arranqueVentanas";
import { serviciosInterrumpibles, servicioDe } from "../src/engine/interruptoresServicios";

const RAIZ = process.cwd();
const P = (...a: string[]) => path.join(RAIZ, ...a);
const leer = (rel: string): string => {
  try { return fs.readFileSync(path.join(RAIZ, rel), "utf-8").replace(/\r\n/g, "\n"); }
  catch { return ""; }
};

let correctas = 0;
const rojos: string[] = [];
const c = (titulo: string, cond: boolean, detalle = "") => {
  if (cond) { correctas++; console.log(`  \u2713 ${titulo}`); }
  else { rojos.push(titulo + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${titulo}${detalle ? `  \u2192 ${detalle}` : ""}`); }
};

const SIETE = [PORTS.IDE, PORTS.SANDBOX, PORTS.BRIDGE, PORTS.MEMORY, PORTS.CREATOR, PORTS.CEREBRO, PORTS.OLLAMA];
const ord = (v: number[]) => v.slice().sort((a, b) => a - b).join(",");

if (!fs.existsSync(path.join(RAIZ, "package.json"))) {
  console.error(`\u26d4 la suite se corre desde la raíz del proyecto (cwd=${RAIZ}).`);
  process.exit(1);
}

console.log("\n[1] EL INVENTARIO: siete órganos declarados, contrato de ventanas intacto\n");
c("\u2605 el contrato del usuario sigue escrito: 2 ventanas CMD", contarPorTipo("cmd") === 2, `hay ${contarPorTipo("cmd")}`);
c("\u2605 y 3 procesos con ventana propia (2 CMD + 3 PY)", contarPorTipo("py") === 3, `hay ${contarPorTipo("py")}`);
c("\u2605 el inventario completo tiene LOS SIETE órganos", INVENTARIO_SERVICIOS.length === 7, `hay ${INVENTARIO_SERVICIOS.length}`);
c("\u2605 y son exactamente los números de `PORTS`, ni uno más ni uno menos",
  ord(puertosDelInventario()) === ord(SIETE), `${ord(puertosDelInventario())} vs ${ord(SIETE)}`);
c("los adicionales son el motor :5103 y el sandbox :3500 (los que faltaban en la hoja de ruta)",
  ord(SERVICIOS_ADICIONALES.map((s) => s.puerto)) === ord([PORTS.SANDBOX, PORTS.CEREBRO]));
c("el plano de ventanas no se infló: sigue teniendo cinco filas", SERVICIOS_VENTANA.length === 5);
c("ids únicos (el id es el nombre del log y el del interruptor)",
  new Set(INVENTARIO_SERVICIOS.map((s) => s.id)).size === INVENTARIO_SERVICIOS.length);
c("cada órgano tiene un título legible para la hoja de ruta",
  INVENTARIO_SERVICIOS.every((s) => s.titulo.trim().length > 0));
c("\u2605 la hoja de ruta (barra de Tareas) pinta los SIETE, no cinco",
  serviciosInterrumpibles().length === 7, `pinta ${serviciosInterrumpibles().length}`);
c("el sandbox está declarado como inmutable: lo maneja el preview, no el lanzador",
  !!servicioDe("sandbox") && serviciosInterrumpibles().some((s) => s.id === "sandbox" && !!s.inmutable));
c("el motor :5103 es reanimable por el supervisor (antes nadie lo cuidaba)",
  serviciosVigilados().some((s) => s.puerto === PORTS.CEREBRO));
c("el propio IDE y el sandbox NO se reaniman a sí mismos",
  !serviciosVigilados().some((s) => s.id === "front" || s.id === "sandbox"));
c("todo lo vigilado tiene un comando que ejecutar (sin comando no hay reavivado)",
  serviciosVigilados().every((s) => s.comando.trim().length > 0),
  serviciosVigilados().filter((s) => !s.comando.trim()).map((s) => s.id).join(","));
c("lo no vigilado trae su motivo escrito (adiós al aviso prestado del IDE)",
  INVENTARIO_SERVICIOS.filter((s) => s.vigilado === false).every((s) => !!s.noVigilado));

console.log("\n[2] EL CABLE DEL SUPERVISOR (se lee el archivo real, no se supone)\n");
const sup = leer("server/routers/supervisorArranque.ts");
c("\u2605 la pasada recorre el INVENTARIO (7), no sólo las ventanas (5)",
  /for \(const s of INVENTARIO_SERVICIOS\) \{/.test(sup));
c("el estado que consume la UI también sale del inventario completo",
  /servicios: INVENTARIO_SERVICIOS\.map/.test(sup) && /for \(const s of INVENTARIO_SERVICIOS\) m\[s\.id\]/.test(sup));
c("el motivo de lo no vigilado lo dice el plano, no está hardcodeado",
  /s\.noVigilado \|\|/.test(sup) && !/es el propio IDE: no se reanima a s[íi] mismo/.test(sup));
c("sigue vigente el criterio único `=== true` + `medido: vivos.has()`",
  /vivo: vivos\.get\(s\.id\) === true, medido: vivos\.has\(s\.id\)/.test(sup));

const server = leer("server.ts");
// v1.0.23 · MÁS ESTRICTA QUE ANTES: ya no basta «no usar PROJECT_ROOT». El cwd
// tampoco sirve (cambia con el lanzador: System32 con un acceso directo vacío).
// La raíz la decide `decidirRaizInstalacion` por marcas en el disco.
c("\u2605 el supervisor se monta con la RAÍZ DE INSTALACIÓN DECIDIDA, no con el cwd",
  /registrarSupervisorArranque\(app, \{ raizProyecto: RAIZ_INSTALACION/.test(server) && /import \{ decidirRaizInstalacion/.test(server),
  "si vuelve a decir process.cwd() el reanimado muere al nacer cuando el lanzador no es el .bat");
c("y el cwd suelto ya no decide la raíz del supervisor",
  !/registrarSupervisorArranque\(app, \{ raizProyecto: process\.cwd\(\)/.test(server));
c("y no con la raíz de datos (regresa el bug del py que se abre y se cierra)",
  !/registrarSupervisorArranque\(app, \{ raizProyecto: PROJECT_ROOT/.test(server));
const presupuestoLineas = (() => { try { return JSON.parse(leer("contrato-rutas.json")).presupuesto_lineas as number; } catch { return 12253; } })();
c("el monolito no creció para arreglar esto (contrato de líneas)",
  server.split("\n").length <= presupuestoLineas, `${server.split("\n").length} líneas > presupuesto ${presupuestoLineas}`); // v1.0.16 · ya NO es un literal congelado: lee `presupuesto_lineas` del contrato (misma fuente única de verdad que superficieRutas). El contrato se regenera A PROPÓSITO con scripts/superficie.mjs cuando el alta de líneas es querida.
c("\u2605 el puente :5000 se lanza con `-u` (log inmediato, no bufferizado)",
  /spawn\(pythonElegido, \["-u", scriptPath\]/.test(server));
c("\u2605 la bandera de puerto robado se limpia en cada intento",
  /puertoRobado = false;\s*\n?\s*nacidoEn = Date\.now\(\);/.test(server.replace(/ *\/\/[^\n]*/g, "")));
c("\u2605 una caída después de un minuto sano no gasta los reinicios",
  /Date\.now\(\) - nacidoEn > 60_000\) restartCount = 0/.test(server));

console.log("\n[3] EL .EXE: la instalación sin .BAT también enciende los packs\n");
const main = leer("electron-main.cjs");
for (const p of SIETE) c(`\u2605 el mapa SERVICIOS del EXE declara el puerto ${p}`, new RegExp(`puerto:\\s*${p}\\b`).test(main));
c("existe el mapa canónico (una sola fuente de verdad del escritorio)", /const SERVICIOS = \{/.test(main));
c("\u2605 existe arrancarDaemonsPython: el hueco del .BAT está cerrado", /async function arrancarDaemonsPython/.test(main));
c("usa el Python embebido del paquete cuando existe", /function pythonEmbebido\(\)/.test(main) && /pythonEmbebido\(\)/.test(main));
c("no duplica un daemon si el puerto ya escucha", /isPortUp\(t\.puerto\)/.test(main));
c("respeta el interruptor del usuario (servicios.json = apagado no se prende)", /estaApagadoAMano\(t\.id\)/.test(main));
c("cada daemon lleva su --port y su variable de puerto propia", /"--port", String\(t\.puerto\)/.test(main) && /variableDePuerto/.test(main));
c("al salir mata LOS QUE ÉL ENCENDIÓ (ni Ollama ni otra IDE)", /for \(const d of daemonsPython\)/.test(main));
c("y está enganchado a before-quit además de window-all-closed",
  /app\.on\("before-quit"[\s\S]{0,200}matarDaemonsPython\(\)/.test(main));
c("el orden de nacimiento es motor \u2192 creador \u2192 memoria (:5100 consulta a :5103)",
  /const DAEMONS_PYTHON = \[SERVICIOS\.motor, SERVICIOS\.creador, SERVICIOS\.memoria\]/.test(main));
c("HINDSITE_API_URL se fija DESPUÉS de comprobar que :5103 contesta",
  /t\.id === "memoria" && await isPortUp\(SERVICIOS\.motor\.puerto\)[\s\S]{0,160}HINDSITE_API_URL/.test(main));
c("el server sigue siendo el PRIMER hijo lanzado (lo que congela arranqueElectron)",
  main.indexOf("arrancarServidor();") < main.indexOf("void arrancarDaemonsPython()"));
c("existe el sondeo de los siete para poder mostrar la foto", /async function estadoServicios/.test(main));
c("el EXE también bufferiza en cero: PYTHONUNBUFFERED", /PYTHONUNBUFFERED: "1"/.test(main));

console.log("\n[4] EL LANZADOR .BAT: orden, verificación y logs legibles\n");
const bat = leer("iniciar_todo_windows.bat");
const bL = bat.split("\n");
c("el archivo existe y es el lanzador grande", bL.length > 400, `${bL.length} líneas`);
c("\u2605 exactamente TRES packs se lanzan con %CN_PYW%",
  bL.filter((l) => /^start /.test(l) && l.includes("%CN_PYW%")).length === 3,
  `${bL.filter((l) => /^start /.test(l) && l.includes("%CN_PYW%")).length} usos`);
const iPyw = bL.findIndex((l) => /^\s*set\s+"CN_PYW=/.test(l));
c("CN_PYW se define ANTES de los tres packs", iPyw > -1 && bL.filter((l, i) => /^start /.test(l) && l.includes("%CN_PYW%")).every((l) => bL.indexOf(l) > iPyw));
c("\u2605 PYTHONUNBUFFERED=1 (sin esto el log de arranque sale VACÍO con el daemon vivo)",
  /set "PYTHONUNBUFFERED=1"/.test(bat));
c("CN_PYTHON se define en la rama del Python del sistema", /:py_sistema\nset "CN_PY=python"(?:\nREM[^\n]*)*\nset "CN_PYTHON=python"/.test(bat));
c("CN_PYTHON también en la rama del lanzador `py` (evita la asociación de archivos)", /:py_launcher\nset "CN_PY=py -3"\nset "CN_PYTHON=py"/.test(bat));
const esLanz = (prefijo: string) => bL.findIndex((l) => l.startsWith(prefijo));
const iMotor = esLanz('start "CerebroNico Motor :5103"');
const iHind = bL.findIndex((l) => !l.trimStart().startsWith("REM") && l.includes("HINDSITE_API_URL=http://127.0.0.1"));
const iMem = esLanz('start "CerebroNico Memoria :5100"');
const iCread = esLanz('start "CerebroNico Creador :5102"');
c("\u2605 el motor :5103 se lanza ANTES de fijar HINDSITE_API_URL", iMotor > -1 && iHind > iMotor, `motor:${iMotor} hindsite:${iHind}`);
c("\u2605 y :5100 se lanza después (la memoria nace viendo al cerebro)", iMem > iMotor);
c("los tres packs tienen su bucle de verificación (:wait_motor / :wait_memoria / :wait_creador)",
  /:wait_motor/.test(bat) && /:wait_memoria/.test(bat) && /:wait_creador/.test(bat));
c("cada verificación dice el puerto, los segundos y el log donde mirar",
  /El motor :%CN_MOTOR_PORT% no respondio/.test(bat) && /El pack creador \(:5102\) no respondio/.test(bat) && /La capa de memoria no respondio/.test(bat));
c("\u2605 el inventario final mide los SIETE puertos uno por uno",
  (bat.match(/^call :chequeo \d+/gm) || []).length === 7, `${(bat.match(/^call :chequeo \d+/gm) || []).length} llamadas`);
c("la subrutina ancla el puerto con espacio (:5102 ) para no leer :51020",
  /netstat -ano \| findstr ":%~1 " \| findstr "LISTENING"/.test(bat));
c("los netstat de los packs también van anclados (cero falsos «ya estaba arriba»)",
  /findstr ":%CN_CREATOR_PORT% "/.test(bat) && /findstr ":%CN_MOTOR_PORT% "/.test(bat) && /findstr ":%CN_MEMORY_PORT% "/.test(bat));
c("cero pythonw.exe (la casa decide /b con log, no consola escondida)", !/pythonw\.exe/.test(bat));
const etiquetas = bL.filter((l) => /^:[A-Za-z0-9_]+\s*$/.test(l)).map((l) => l.trim());
c("\u2605 cero etiquetas duplicadas (cmd salta a la PRIMERA: el duplicado es código muerto)",
  new Set(etiquetas).size === etiquetas.length,
  etiquetas.filter((e, i) => etiquetas.indexOf(e) !== i).join(", "));
c("las reglas del empaque EXE siguen vivas (pausa final + fin de lote)",
  /:pausa_final/.test(bat) && /goto :fin/.test(bat) && /^endlocal/m.test(bat));

console.log("\n[5] EL PUENTE :5000 (la autocura se prueba de verdad en puente_autocura_test.py)\n");
const puente = leer("agent_bridge_5000.py");
c("\u2605 el lazo de atención se reabre solo (serve_forever dentro del while)", /while True:\s*\n\s*try:\s*\n\s*server\.serve_forever/.test(puente));
c("la caída se ANUNCIA con tipo y motivo, nunca en silencio", /LAZO DE ATENCION CAIDO/.test(puente));
c("hay techo honesto de reaperturas (10) y entonces se rinde diciendo por qué", /reaperturas >= 10/.test(puente));
c("el plazo por conexión está puesto (hilos que no quedan clavados en recv)", /PuenteHandler\.timeout = 30/.test(puente));
c("la suite que inyecta el fallo viaja en el paquete", fs.existsSync(path.join(RAIZ, "tests", "puente_autocura_test.py")));

console.log("\n[6] LA CABECERA: el rótamento también es un indicador\n");
const header = leer("src/components/Header.tsx");
c("\u2605 :3500 dice SANDBOX (decía «Backend de agentes»: un rótulo mintiendo)",
  /title="Puerto 3500: [^"]*[Ss]andbox/.test(header) && !/Backend de agentes/.test(header));
c(":5000 nombra al Puente PC (no «Microservicios / FastAPI» de otra era)",
  /title="Puerto 5000:[^"]*[Pp]uente PC/.test(header));
c(":5102 y :5100 conservan su rótulo real",
  /title="Puerto 5102:[^"]*[Cc]reador/.test(header) && /title="Puerto 5100:[^"]*[Mm]emoria/.test(header));
c("los seis chips siguen pasando por `chipPuerto` (no rompo indicadorServicios)",
  (header.match(/\{chipPuerto\(telemetry\.port\w+\)\}/g) || []).length === 6);
c("el chip del :5103 sigue con sus tres estados", /estado5103 === "caido"/.test(header));

const validar = leer("scripts/validar.mjs");
c("\u2605 esta suite está registrada en la valla maestra (si no, no corre nunca)",
  validar.includes("puertosCableados.test.ts"));
c("y la prueba de autocura del puente está registrada como orden de npm",
  leer("package.json").includes("puente_autocura_test.py"));


console.log("\n[7] COMODIDAD v1.0.2: Reconentrant sin dobles, muestra parcial visible, limpieza manifiesta\n");
// (a) «Reconectar» dos veces NO levanta dos puentes sobre el :5000
c("\u2605 hay un solo reinicio en curso a la vez (guard de reentrancia)",
  /if \(reinicioEnCurso\) \{/.test(server) && /reinicioEnCurso = new Promise<boolean>/.test(server));
c("el guard se suelta en los DOS caminos de salida (si no, el boton muere para siempre)",
  /reinicioEnCurso = null; aflojarReinicio\(true\); return true;/.test(server)
  && /reinicioEnCurso = null; aflojarReinicio\(false\); return false;/.test(server));
c("\u2605 la bandera del kill manual se suelta ESPERANDO que el viejo muera",
  /for \(let k = 0; k < 8 && child && !\(child as any\)\.exitCode && !\(child as any\)\.signalCode; k\+\+\) await sleepMs\(250\)/.test(server));
// (b) la muestra incompleta se ve
const tipos = leer("src/types.ts");
c("\u2605 el contrato del front declara lo que la ruta ya contestaba (incompleto/motivos/heredados)",
  /incompleto\?: boolean;/.test(tipos) && /motivos\?: Record<string, string>;/.test(tipos) && /heredados\?: string\[\];/.test(tipos));
c("\u2605 la cabecera avisa cuando la tanda vino incompleta (y cuantos chips heredados trae)",
  /MUESTRA PARCIAL/.test(header) && /telemetry\.incompleto/.test(header) && /telemetry\.heredados/.test(header));
c("el aviso usa <span>, no el Fragmento abreviado que prohibe `reglasDeLaCasa`",
  !/<>\s*\{\/\* v1\.0\.2/.test(header));
c("los seis chips siguen intactos (la valla de `indicadorServicios` manda)",
  (header.match(/\{chipPuerto\(telemetry\.port\w+\)\}/g) || []).length === 6);
// (c) la limpieza esta manifestada, no hecha a ojo
c("\u2605 existe un manifiesto de limpieza legible", fs.existsSync(P("MANIFIESTO-LIMPIEZA.md")));
const manifiesto = fs.existsSync(P("MANIFIESTO-LIMPIEZA.md")) ? fs.readFileSync(P("MANIFIESTO-LIMPIEZA.md"), "utf-8") : "";
c("el manifiesto declara que NADA fue borrado y donde esta cada archivo",
  manifiesto.includes(".cerebro-papelera/limpieza-2026-11-07") && /Nada fue borrado/.test(manifiesto));
c("la raiz quedo limpia de residuos de sesion",
  !fs.readdirSync(RAIZ).some((f) => /^_(diag|tmp|suites|sonda|fix|ver|lanzar|tsc|run-build|esperar|chk|check|parche|limpiar|ev2|build)\b/.test(f) || /^_suites/.test(f)));
c("los ocho .bat de version de un solo uso ya no estan en la raiz",
  !fs.readdirSync(RAIZ).some((f) => /^ACTUALIZAR-A-/.test(f) || /^FIJAR-1\.0\.0\.bat$/.test(f) || /^FIJAR-VERSION-1\.0\.0\.bat$/.test(f) || f === "build-2.3.14.bat"));
c("\u2605 existe UN solo FIJAR-VERSION.BAT y delega en el derivador (no escribe espejos a mano)",
  fs.existsSync(P("FIJAR-VERSION.BAT")) && /npm run deriva:fijar/.test(fs.readFileSync(P("FIJAR-VERSION.BAT"), "utf-8")));
const fijar = fs.existsSync(P("scripts/fijar-version.mjs")) ? fs.readFileSync(P("scripts/fijar-version.mjs"), "utf-8") : "";
c("el utilitario de semilla toca UN solo archivo (la semilla vive en constants.ts)",
  /VERSION_SEMVER/.test(fijar) && /src\/constants\.ts/.test(fijar) && !/package-lock|package\.json/.test(fijar));
// (d) el piso de version del linaje nuevo
const rutas = leer("tests/rutasSistema.test.ts");
c("\u2605 el piso de version fue reafirmado CON la razon escrita (no bajado en silencio)",
  /linaje 1\.0 reescrito por Mario/.test(rutas) && !/MIN > 86/.test(rutas));
// (e) la documentacion no se desyncroniza
c("\u2605 el informe de comodidad y limpieza viaja en el paquete",
  fs.existsSync(P("COMODIDAD-Y-LIMPIEZA-v1.0.2.md")));
c("y el INDICE de documentación (el router real de este árbol) lo conoce",
  // v1.0.10 · UN SOLO ÍNDICE (pedido de Mario 09/11): el archivo canónico ya no
  // lleva versión en el nombre — un árbol, un router. Los viejos versionados
  // viven en documentacion/_archivo-consolidado/.
  leer("INDICE-DOCUMENTACION.md").includes("COMODIDAD-Y-LIMPIEZA-v1.0.2.md"));



console.log("\n[8] AUTOLLAMADO: que el lazo sepa que quedan tareas (y si se calla, por qu\u00e9)\n");
const bat8 = bat;
const app8 = leer("src/App.tsx");
const engine8 = leer("src/engine/autoLlamado.ts");
const cable8 = leer("server/routers/autoLlamado.ts");
const hemi8 = leer("src/engine/hemisferios.ts");
c("el contrato declara que el LANZADOR escribe REANUDAR.md",
  /izquierdo: "iniciar_todo_windows\.bat",\s*derecho: "REANUDAR\.md"/.test(hemi8));
c("\u2605 y el lanzador lo escribe de verdad (antes ment\u00eda: el lazo estaba ciego)",
  /4f-cero\. REANUDAR\.md/.test(bat8) && /## Trabajo pendiente/.test(bat8) && /"%PROJECT_DIR%\\REANUDAR\.md"/.test(bat8));
c("el parte arranca diciendo NINGUNO (el parseador lo reconoce como negacion, no como tarea)",
  /Trabajo pendiente:\*\* NINGUNO/.test(bat8) && /\^\(ninguno\|ninguna/.test(engine8));
c("la seccion que escribe el .bat es la misma que parsea el motor",
  cable8.includes("RUTA_REANUDAR") && /## Trabajo pendiente/.test(engine8));
c("\u2605 el cable sigue sin aceptar el plan del navegador (un solo dueno del trabajo)",
  /plan: \[\]/.test(cable8) && !/cuerpo\.plan/.test(cable8));
c("\u2605 un «callar» se muestra con su motivo (apagado / agotado / sin-tareas ya no son iguales)",
  /d\.accion !== "llamar"[\s\S]{0,320}d\.motivo/.test(app8));
c("y la ausencia de respuesta del server tambien se dice (no se finge un turno limpio)",
  /if \(!d\) \{[\s\S]{0,200}no contesto/.test(app8));


console.log(`\n${"─".repeat(56)}`);
console.log(`PUERTOS CABLEADOS (v1.0.2): ${correctas} correctas · ${rojos.length} fallos`);
if (rojos.length) { for (const r of rojos) console.log(`  · ${r}`); process.exit(1); }
