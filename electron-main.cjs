// electron-main.cjs — CerebroNico IDE — Proceso principal de Electron
//
// v1.56.8 — LA PANTALLA BLANCA DEL .EXE.
// El empaquetado compilaba, el icono salía, y la ventana se quedaba en blanco sin
// decir nada. Eran tres fallos, y los tres eran de la misma familia: **un error que
// no se muestra es indistinguible de un programa que no hace nada**.
//
//   1. `spawn("node", [dist/server.mjs])`. Un paquete de Electron NO lleva un `node`
//      en el PATH: Node viene dentro del propio `electron.exe`. Si el usuario no
//      tiene Node instalado (o lo tiene en otra versión), `spawn` emite un evento
//      `error` ASÍNCRONO que nadie escuchaba → el servidor nunca arranca → blanco.
//      Ahora se usa el Node del propio Electron (`ELECTRON_RUN_AS_NODE=1` sobre
//      `process.execPath`) y `node` queda solo como respaldo.
//
//   2. `setTimeout(createWindow, 3000)`. Tres segundos a ojo. El server carga la
//      base de conocimiento, sondea Ollama y espera a los packs externos; en un
//      portátil de 8 GB con antivirus eso es más de tres segundos, y `loadURL` se
//      dispara contra un puerto que aún no escucha. `loadURL` no reintenta: se
//      queda en blanco para siempre. Ahora se ESPERA a que responda, con techo.
//
//   3. Ningún `did-fail-load`, ningún `on("exit")`, ningún `on("error")`. Si el
//      servidor moría (puerto ocupado, falta una dependencia), la ventana seguía
//      ahí, blanca, muda. Ahora la ventana muestra un DIAGNÓSTICO: qué se intentó,
//      por qué falló y las últimas líneas del registro del server.
//
// La pantalla blanca se convierte en una pantalla que habla.
const { app, BrowserWindow, Menu, ipcMain, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");

const IDE_PORT = Number(process.env.CN_IDE_PORT || 3000);
const BRIDGE_PORT = Number(process.env.CN_BRIDGE_PORT || 5000);

// Cuánto se espera al servidor antes de rendirse, y cada cuánto se le pregunta.
// v2.3.25 · el reloj de la ventana NO puede ir detrás del de la pantalla: con
// 45 s de paciencia y 90 s de espera, `esperarLaCasa` nunca llegaba a su propia
// decisión «se acabó la paciencia, se entra igual» y se seguía esperando 45 s
// más. Se le da margen para decidir y para un último sondeo de :3000.
const ESPERA_ARRANQUE_MS = Number(process.env.CN_ESPERA_ARRANQUE_MS || Math.max(90_000, Number(process.env.CN_PACIENCIA_PUERTOS_MS || 45_000) + 15_000));
/**
 * v2.3.25 · CUANTO ESPERA LA PANTALLA A QUE LA CASA ESTE ENTERA.
 *
 * Antes la ventana esperaba UNA cosa: que :3000 contestara. Contesta 4 s antes de
 * que el puente y los packs Python esten arriba, asi que la IDE se abria «con el
 * servidor caido» y la cabecera amanecia llena de OFF mientras el supervisor
 * reanimaba puertos ya sanos. Ahora se espera la FOTO COMPLETA de los siete, con
 * paciencia: `CN_PACIENCIA_PUERTOS_MS` (default 45 s) y despues se abre igual,
 * avisando en la propia pantalla que falta. Un pack opcional no puede secuestrar
 * el arranque; un arranque a medias sí se nota, y se nota una sola vez.
 */
const PACIENCIA_PUERTOS_MS = Number(process.env.CN_PACIENCIA_PUERTOS_MS || 45_000);
/** El plano de la casa: lo único que NO se inventa acá es el orden ni los puertos. */
/**
 * EL PLANO MÍNIMO: los siete de la casa, en el orden del inventario. Se escribe
 * acá (tres líneas, sin dependencias) para que el .exe pueda pintar la pantalla
 * aunque el paquete no traiga el módulo; el orden y los puertos reales siguen
 * saliendo de `src/engine/arranqueVentanas.ts` (fuente única del proyecto).
 */
const PLANO_MINIMO = [
  { id: "ide", puerto: 3000, critico: true }, { id: "sandbox", puerto: 3500, critico: false },
  { id: "puente", puerto: 5000, critico: true }, { id: "memoria", puerto: 5100, critico: true },
  { id: "creador", puerto: 5102, critico: true }, { id: "motor", puerto: 5103, critico: true },
  { id: "ollama", puerto: 11434, critico: false },
];
let planoPuertos = () => PLANO_MINIMO.map((s) => ({ ...s }));
try {
  const m = require(path.join(__dirname, "dist", "engine", "arranqueVentanas.js"));
  if (typeof m.inventarioConCriticos === "function") planoPuertos = m.inventarioConCriticos;
} catch { /* paquete sin el módulo: queda el plano mínimo */ }
/** La decisión de abrir (pura, en el plano compartido). Sin plano: abrir con :3000. */
let decidirApertura = null;
try { decidirApertura = require(path.join(__dirname, "dist", "engine", "arranqueVentanas.cjs")).decidirApertura; } catch {}
if (typeof decidirApertura !== "function") {
  // Respaldo: la MISMA regla, en tres líneas. El .cjs se copia al empaquetar
  // (scripts/preparar-arranque-cjs.mjs) para que el .exe no cargue un .ts.
  try { decidirApertura = require("./scripts/arranquePuertos.cjs").decidirApertura; } catch { decidirApertura = null; }
}
const PASO_SONDEO_MS = 500;
// Anillo de log: las últimas líneas del server, para poder enseñarlas.
// v1.0.49 · 80 líneas no alcanzaban para ver el arranque completo cuando el
// server escribe su propio preámbulo: el diagnóstico enseñaba solo la cola.
const COLA_LOG = 200;

/**
 * El icono real es `public/favicon.ico` (ICO multiresolución con 256×256 a 32 bpp).
 * En el paquete no viaja `public/`, pero Vite copia su contenido a `dist/`, y `dist`
 * completo sí está en `build.files`. Si no hay ninguno se devuelve `undefined` y se
 * avisa: sin icono Electron lo dice en el log, mejor que una ruta inventada callada.
 */
function iconoDeApp() {
  const candidatos = [
    path.join(__dirname, "dist", "favicon.ico"),
    path.join(__dirname, "public", "favicon.ico"),
  ];
  for (const ruta of candidatos) {
    try {
      if (fs.existsSync(ruta)) return ruta;
    } catch {}
  }
  console.warn("[electron-main] sin icono de app: no está ni dist/favicon.ico ni public/favicon.ico");
  return undefined;
}

let mainWindow = null;
let serverProc = null;
/** Anillo con lo último que escupió el server; es lo que verá el usuario. */
const colaLog = [];
let motivoFallo = null;

/* ============================================================================
 * v1.0.49 · EL ARRANQUE QUE NO DEJA RASTRO ES UN ARRANQUE QUE NO SE PUEDE CURAR
 * ---------------------------------------------------------------------------
 * Medido en la máquina de Mario (22/11, 1.0.48): el .exe instalado no llega a
 * :3000 y la pantalla de fallo solo podía enseñar el anillo de memoria — que
 * muere al cerrar la ventana. Sin el stderr crudo del hijo ni su código de
 * salida, cada diagnóstico era una suposición.
 *
 * Ahora todo lo que pasa se escribe TAMBIÉN en un archivo, y el diagnóstico
 * enseña el comando exacto, el resultado de una prueba del intérprete y lo que
 * el hijo escribió. Un archivo que sobrevive al cierre convierte «no abre» en
 * una causa con nombre.
 * ========================================================================== */
let preflight = null;      // { ok, detalle, ms } — ¿este intérprete ejecuta JS?
let salidaHijo = 0;        // bytes que escribió el servidor (0 = ni una letra)
let pidHijo = null;
let codigoSalida = null;
let servidorListo = false;
let primerByteMs = null;
const arranqueT0 = Date.now();

/** Dónde queda el registro. `CN_LOG_ARRANQUE` manda (depurar sin permisos). */
function rutaRegistroArranque() {
  const forzada = String(process.env.CN_LOG_ARRANQUE || "").trim();
  if (forzada) return forzada;
  try { return path.join(raizDatosElectron(), "registros", "arranque-electron.log"); } catch { return null; }
}

let registroListo = false;
/**
 * Escribe en disco. En las pruebas (node sin Electron) no se toca nada salvo que
 * se pida por entorno: una suite no debe escribir en la carpeta de datos real.
 */
function aArchivo(linea) {
  if (!process.versions.electron && !process.env.CN_LOG_ARRANQUE) return;
  try {
    const ruta = rutaRegistroArranque();
    if (!ruta) return;
    if (!registroListo) { fs.mkdirSync(path.dirname(ruta), { recursive: true }); registroListo = true; }
    fs.appendFileSync(ruta, `[${new Date().toISOString()}] ${linea}\n`, "utf-8");
  } catch { /* sin permiso de escritura: el anillo en memoria sigue sirviendo */ }
}

function anotar(linea) {
  for (const l of String(linea).split(/\r?\n/)) {
    if (!l.trim()) continue;
    colaLog.push(l);
    aArchivo(l);
    if (colaLog.length > COLA_LOG) colaLog.shift();
  }
}

/**
 * ¿El intérprete que vamos a usar ejecuta JavaScript de verdad?
 *
 * `ELECTRON_RUN_AS_NODE=1` sobre `process.execPath` es el camino correcto, pero
 * si alguien apaga esa función (fuse `runAsNode`) el ejecutable NO dice nada:
 * arranca como aplicación y se queda vivo, mudo y sin escuchar. Ese síntoma es
 * indistinguible de un servidor colgado, así que se prueba en 8 s y se anota.
 */
function preflightInterprete() {
  return new Promise((resuelve) => {
    const int = interpreteServidor();
    const t0 = Date.now();
    let salida = "";
    let cerrado = false;
    let p = null;
    const terminar = (extra) => {
      if (cerrado) return;
      cerrado = true;
      try { p && p.kill(); } catch {}
      resuelve({
        ok: /CN_NODE_OK/.test(salida),
        detalle: `${extra || ""}${salida.trim() ? " · " + salida.trim().slice(0, 300) : " · sin salida"}`,
        ms: Date.now() - t0,
      });
    };
    try {
      p = spawn(int.bin, ["-e", "console.log('CN_NODE_OK ' + process.versions.node)"], {
        cwd: __dirname, env: { ...process.env, ...int.env },
        stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
    } catch (e) {
      resuelve({ ok: false, detalle: `no se pudo lanzar: ${e && e.message ? e.message : e}`, ms: 0 });
      return;
    }
    const tope = setTimeout(() => terminar("no respondió en 8 s"), 8000);
    p.stdout && p.stdout.on("data", (d) => { salida += String(d); });
    p.stderr && p.stderr.on("data", (d) => { salida += String(d); });
    p.on("error", (e) => { clearTimeout(tope); terminar("error de spawn: " + (e && e.message ? e.message : e)); });
    p.on("close", (c) => { clearTimeout(tope); terminar(`code=${c}`); });
  });
}

/**
 * Si el intérprete de Electron no ejecuta JS, el `node` del PATH es la única
 * salida. Se mata el hijo mudo y se reintenta UNA vez — sin duplicar el server.
 */
function reintentarConNodeDelPath(serverPath, env) {
  anotar("[electron-main] el intérprete de Electron no ejecutó JS: reintento con node del PATH");
  try {
    if (serverProc) { try { serverProc.kill(); } catch {} }
    pidHijo = null; salidaHijo = 0; primerByteMs = null;
    const env2 = { ...env };
    delete env2.ELECTRON_RUN_AS_NODE;
    serverProc = spawn("node", [serverPath], { cwd: __dirname, env: env2, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    cablearHijo();
    anotar(`[electron-main] reintento lanzado (pid ${serverProc.pid || "?"}) con node del PATH`);
  } catch (e) {
    anotar(`[electron-main] el reintento con node del PATH tampoco arrancó: ${e && e.message ? e.message : e}`);
  }
}

/** Los oyentes del hijo, en un solo sitio: los usan el primer intento y el relevo. */
function cablearHijo() {
  const p = serverProc;
  if (!p) return;
  pidHijo = p.pid || pidHijo;
  p.stdout && p.stdout.on("data", (d) => {
    if (primerByteMs === null) primerByteMs = Date.now() - arranqueT0;
    salidaHijo += d.length;
    anotar(d); process.stdout.write(d);
  });
  p.stderr && p.stderr.on("data", (d) => {
    if (primerByteMs === null) primerByteMs = Date.now() - arranqueT0;
    salidaHijo += d.length;
    anotar(d); process.stderr.write(d);
  });
  p.on("error", (e) => {
    motivoFallo =
      `El proceso del servidor no pudo arrancar: ${e && e.code ? e.code + " — " : ""}${e && e.message ? e.message : e}`;
    anotar(`[electron-main] ERROR de spawn: ${motivoFallo}`);
    mostrarDiagnostico();
  });
  p.on("exit", (codigo, senal) => {
    codigoSalida = codigo;
    anotar(`[electron-main] el server terminó (code=${codigo}, signal=${senal}, ${salidaHijo} bytes escritos)`);
    if (motivoFallo) return;
    if (codigo !== null) {
      motivoFallo = codigo === 0
        ? "El servidor terminó sin error (código 0) antes de abrir el puerto: no llegó a escuchar."
        : `El servidor terminó con código ${codigo} antes de poder servir la interfaz.`;
      mostrarDiagnostico();
    }
  });
}

/**
 * Dónde está el Node que va a ejecutar `dist/server.mjs`.
 *
 * Un `electron.exe` SÍ es un Node: basta con `ELECTRON_RUN_AS_NODE=1`. Ese es el
 * intérprete garantizado dentro del paquete. Buscar `node` en el PATH era el bug:
 * en una máquina sin Node instalado (que es justamente el público de un instalador)
 * el spawn fallaba sin dejar rastro.
 */
function interpreteServidor() {
  if (process.versions && process.versions.electron) {
    return { bin: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" }, nombre: "Node de Electron" };
  }
  return { bin: "node", env: {}, nombre: "node del PATH" };
}

/**
 * v2.0.1 — LA RAIZ DE DATOS, DECIDIDA EN UN SOLO SITIO.
 *
 * server.ts:673 hace `path.join(process.cwd(), ".proyectos")` cuando PROJECT_DIR
 * no esta definida. Y este proceso lanza el server con `cwd: __dirname`, asi que
 * process.cwd() es la carpeta de la instalacion: la raiz de datos caia en
 * `app\.proyectos` mientras el puente :5000 (que SI recibe CN_PROJECT_DIR)
 * escribia en C:\Cerebronico. Dos cerebros, dos kb.json, dos espejos.
 *
 * Orden de precedencia:
 *   1) PROJECT_DIR del entorno (lo fija el .bat o el usuario) — manda.
 *   2) C:\Cerebronico en Windows / ~/Cerebronico fuera — la raiz de la casa.
 * Nunca se devuelve la carpeta de la instalacion: eso es justo el bug.
 */
function raizDatosElectron() {
  const delEntorno = String(process.env.PROJECT_DIR || "").trim();
  if (delEntorno) return delEntorno;
  if (process.platform === "win32") return "C:\\Cerebronico";
  return path.join(require("os").homedir(), "Cerebronico");
}

function arrancarServidor() {
  const serverPath = path.join(__dirname, "dist", "server.mjs");
  const usaEmpaquetado = fs.existsSync(serverPath);
  // El Python embebido viaja dentro del paquete; si no está (arranque en
  // desarrollo), se cae al del sistema sin moretear el arranque.
  const pythonBin = pythonEmbebido() || (process.platform === "win32" ? "python" : "python3");

  const int = interpreteServidor();
  // v1.57.0 · EL EXE MORÍA POR ESTA LÍNEA QUE FALTABA (medido en la máquina de
  // Mario, 2026-10-12): sin NODE_ENV, dist/server.mjs caía en la rama de desarrollo,
  // pedía Vite (que viaja fuera del paquete a propósito) y se salía con code=1
  // TENIENDO el cliente compilado al lado. Si el paquete trae dist/server.mjs,
  // producción es un HECHO, no una intención: se declara acá. El `!process.env.
  // NODE_ENV` respeta quien quiera forzar otro modo a mano; y en desarrollo
  // (usaEmpaquetado=false, se lanza `tsx server.ts`) no se toca nada: ahí Vite es
  // exactamente lo que debe haber.
  const env = {
    ...process.env,
    ...int.env,
    ...(usaEmpaquetado && !process.env.NODE_ENV ? { NODE_ENV: "production" } : {}),
    CN_PYTHON: pythonBin,
    CN_ELECTRON_MAIN: "1",
    // v2.0.1 — la raiz de datos viaja al hijo: sin esto server.ts cae a
    // process.cwd()/.proyectos (= app\.proyectos) y el almacenamiento se parte.
    PROJECT_DIR: raizDatosElectron(),
    CN_PROJECT_DIR: raizDatosElectron(),
    // v1.0.23 · LA CASA, DECLARADA. El supervisor reanima `scripts\x.py` con ruta
    // relativa y `cwd: <raiz de instalacion>`. Esa raiz NO se adivina desde
    // `process.cwd()` (cambia segun como se lance: doble clic, acceso directo con
    // «Iniciar en» vacio, `node dist\server.mjs` desde otro lado). Este proceso
    // SI sabe donde esta: `__dirname` es la carpeta del .exe / de este archivo.
    // Se lo decimos al server por entorno: una sola verdad, sin adivinar.
    CN_INSTALL_ROOT: __dirname,
  };
  const args = usaEmpaquetado ? [serverPath] : [path.join(__dirname, "node_modules", ".bin", "tsx"), "server.ts"];

  // v1.0.49 · EL ARRANQUE, ESCRITO ANTES DE INTENTARLO. Si el hijo muere mudo,
  // esto es lo único que dice qué se lanzó, desde dónde y si el archivo estaba.
  let tamServidor = -1;
  try { tamServidor = fs.statSync(serverPath).size; } catch { tamServidor = -1; }
  anotar(`[electron-main] arrancando server con ${int.nombre} (${usaEmpaquetado ? "dist/server.mjs" : "tsx server.ts"})`);
  anotar(`[electron-main] comando: ${int.bin} ${args.map((a) => JSON.stringify(a)).join(" ")}`);
  anotar(`[electron-main] cwd=${__dirname} · dist/server.mjs ${tamServidor >= 0 ? `presente (${tamServidor} bytes)` : "AUSENTE (modo desarrollo)"} · registro: ${rutaRegistroArranque() || "(sin ruta)"}`);
  try {
    serverProc = spawn(int.bin, args, { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } catch (e) {
    // Spawn casi nunca lanza aquí: el fallo llega por el evento `error`. Se cubren
    // los dos caminos porque uno solo no basta.
    motivoFallo = `No se pudo lanzar el servidor: ${e && e.message ? e.message : e}`;
    anotar(`[electron-main] ${motivoFallo}`);
    return;
  }

  cablearHijo();
  anotar(`[electron-main] hijo lanzado (pid ${pidHijo || "?"})`);

  // El vigía: un hijo VIVO que no escribe ni una letra y no abre el puerto no es
  // «lento», es otro problema. Se dice a los 20 s para no esperar los 90 en vano.
  const vigia = setTimeout(() => {
    if (servidorListo || motivoFallo) return;
    const vivo = serverProc && serverProc.exitCode === null;
    anotar(`[electron-main] a los 20 s: :${IDE_PORT} sin abrir · hijo ${vivo ? "vivo" : "terminado"}` +
      ` · ${salidaHijo} bytes escritos${primerByteMs === null ? " (ni una letra)" : ` · primer byte a los ${Math.round(primerByteMs / 1000)} s`}`);
  }, 20_000);
  if (vigia.unref) vigia.unref();

  // La prueba del intérprete, EN PARALELO y DESPUÉS del server (el primer hijo
  // spawneado sigue siendo el del server: lo fija tests/arranqueElectron).
  void preflightInterprete().then((r) => {
    preflight = r;
    anotar(`[electron-main] prueba del intérprete (${int.nombre}): ${r.ok ? "OK" : "FALLÓ"}${r.detalle} [${r.ms} ms]`);
    if (!r.ok && !servidorListo && !motivoFallo && usaEmpaquetado) {
      reintentarConNodeDelPath(serverPath, env);
    }
  });
}

/** Un intento de preguntar al servidor. Resuelve true si hay respuesta. */
function intentar() {
  return new Promise((resuelve) => {
    const req = http.get({ host: "127.0.0.1", port: IDE_PORT, path: "/", timeout: 1500 }, (r) => {
      r.resume();
      servidorListo = true;
      resuelve(true);
    });
    req.on("error", () => resuelve(false));
    req.on("timeout", () => { req.destroy(); resuelve(false); });
  });
}

/* ============================================================================
 * v2.3.24 · EL .EXE TAMBIENENCIENDE LOS PACKS — EL AGUJERO DEL :5102
 * ---------------------------------------------------------------------------
 * LA QUEJA DE MARIO (6/11): «en el arranque no encienden todos los puertos …
 * el 5102 no arranca». Medido en este archivo, y no es un bug de pulsos:
 *
 *   `arrancarServidor()` era LO UNICO QUE ESTE PROCESO LANZABA. Los tres packs
 *   Python (:5100 memoria, :5102 creador, :5103 motor) los enciende
 *   `iniciar_todo_windows.bat`, y el instalador NO ejecuta ese .bat: el EXE va
 *   directo al server. O sea que en la instalación por instalador, de los siete
 *   puertos de la casa nacían cuatro (3000, 5000 por el server, 11434 si Ollama
 *   ya estaba, y 3500 bajo demanda) y TRES dependían de que el supervisor del
 *   server los reanimara dos minutos después por un shim — que además corría
 *   contra la raíz de datos equivocada (otro fallo de esta versión).
 *
 * LA CURA: el mismo plano del .bat, ejecutado por el .exe. Se respeta la
 * precedencia de siempre (si el puerto ya escucha NO se duplica; si el usuario
 * lo puso en «apagado» en servicios.json tampoco se prende) y el orden importa:
 * el motor :5103 nace ANTES que la memoria :5100 porque :5100 se configura
 * mirándolo (`HINDSITE_API_URL`). En el .bat viejo ese `set` se evaluaba antes
 * de lanzar el motor: en un arranque frío la memoria nunca veía al cerebro.
 * ========================================================================== */

/** El mapa canónico de los siete puertos de la casa, del lado del escritorio. */
const SERVICIOS = {
  ide: { id: "ide", puerto: 3000, rol: "La propia IDE (el proceso hijo de este archivo)", loArrancaElServer: false },
  sandbox: { id: "sandbox", puerto: 3500, rol: "Sandbox / preview del proyecto", bajoDemanda: true },
  puente: { id: "puente", puerto: 5000, rol: "Puente PC (agent_bridge_5000.py)", loArrancaElServer: true },
  memoria: {
    id: "memoria", puerto: 5100, rol: "Memoria híbrida (hindsight)",
    script: "hindsight_daemon.py", variableDePuerto: "CN_MEMORY_PORT",
    env: (raiz) => ({ CN_HINDSITE_MIRROR: path.join(raiz, "hindsight-mirror.json") }),
  },
  creador: {
    id: "creador", puerto: 5102, rol: "Creador de sitios web",
    script: "creador_daemon.py", variableDePuerto: "CN_CREATOR_PORT",
    env: (raiz) => ({ CN_CREADOR_ROOT: path.join(raiz, ".creador") }),
  },
  motor: {
    id: "motor", puerto: 5103, rol: "Motor del cerebro (guarda hechos y páginas)",
    script: "cerebro_motor.py", variableDePuerto: "CN_MOTOR_PORT",
    env: (raiz) => ({ CN_MOTOR_STORE: path.join(raiz, ".cerebro-db", "cerebro-motor.json"), CN_CEREBRO_MOTOR: path.join(raiz, ".cerebro-db", "cerebro-motor.json") }),
  },
  ollama: { id: "ollama", puerto: 11434, rol: "Inferencia local (proceso de la máquina, no de la app)", externo: true },
};

/** Los packs que este proceso puede encender, EN EL ORDEN EN QUE DEBEN NACER. */
const DAEMONS_PYTHON = [SERVICIOS.motor, SERVICIOS.creador, SERVICIOS.memoria];

/** Los hijos que engendró ESTE exe: son los únicos que puede matar al salir. */
const daemonsPython = [];

/** El Python embebido del paquete, o `null` (entonces se usa el del sistema). */
function pythonEmbebido() {
  const candidato = path.join(
    __dirname, "runtime", "python-embed",
    process.platform === "win32" ? "python.exe" : "python3"
  );
  try { if (fs.existsSync(candidato)) return candidato; } catch {}
  return null;
}

/** ¿Hay alguien escuchando? Conecta y corta: no presupone que el puerto es nuestro. */
function isPortUp(puerto) {
  return new Promise((resuelve) => {
    const s = net.connect({ host: "127.0.0.1", port: puerto, timeout: 900 });
    const ya = (v) => { try { s.destroy(); } catch {} resuelve(v); };
    s.once("connect", () => ya(true));
    s.once("timeout", () => ya(false));
    s.once("error", () => ya(false));
  });
}

/**
 * `servicios.json` es el interruptor del usuario (auto / encendido / apagado),
 * en la raíz de DATOS y compartido con la IDE y el `.bat`. Acá solo se consulta
 * una cosa: si algo está APAGADO a mano, el EXE no lo enciende por las puras.
 */
function estaApagadoAMano(id) {
  try {
    const ruta = path.join(raizDatosElectron(), "servicios.json");
    if (!fs.existsSync(ruta)) return false;
    const j = JSON.parse(fs.readFileSync(ruta, "utf-8"));
    return String((j && j[id]) || "").trim().toLowerCase() === "apagado";
  } catch { return false; } // un JSON ilegible nunca apaga un servicio: se toma «auto»
}

/** Enciende los packs que faltan. Nunca lanza dos veces el mismo puerto. */
async function arrancarDaemonsPython() {
  const interprete = pythonEmbebido() || (process.platform === "win32" ? "python" : "python3");
  const raiz = raizDatosElectron();
  for (const t of DAEMONS_PYTHON) {
    try {
      if (await isPortUp(t.puerto)) { anotar(`[electron-main] :${t.puerto} (${t.id}) ya estaba arriba: no se duplica.`); continue; }
      if (estaApagadoAMano(t.id)) { anotar(`[electron-main] :${t.puerto} (${t.id}) está «apagado» en servicios.json: se respeta la orden.`); continue; }
      const script = path.join(__dirname, "scripts", t.script);
      if (!fs.existsSync(script)) { anotar(`[electron-main] falta ${t.script}: el pack :${t.puerto} se omite (la IDE funciona igual).`); continue; }
      const env = {
        ...process.env,
        [t.variableDePuerto]: String(t.puerto),
        PROJECT_DIR: raiz, CN_PROJECT_DIR: raiz,
        PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1",
        // v2.3.24 · sin esto, con la salida redireccionada Python bufferiza y el
        // log queda VACÍO mientras el daemon vive: exactamente «la ventana se
        // abre y se cierra y no se lee nada».
        PYTHONUNBUFFERED: "1",
        ...(t.env ? t.env(raiz) : {}),
      };
      // :5100 consulta al cerebro por HTTP: se le dice dónde está sólo si de
      // verdad contesta (el motor ya nació, va primero en la lista).
      if (t.id === "memoria" && await isPortUp(SERVICIOS.motor.puerto)) {
        env.HINDSITE_API_URL = `http://127.0.0.1:${SERVICIOS.motor.puerto}`;
      }
      const proc = spawn(interprete, [script, "--port", String(t.puerto)], {
        cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      daemonsPython.push({ id: t.id, puerto: t.puerto, proc });
      proc.stdout && proc.stdout.on("data", (d) => anotar(`[:${t.puerto}] ${d}`));
      proc.stderr && proc.stderr.on("data", (d) => anotar(`[:${t.puerto}] ${d}`));
      proc.on("error", (e) => anotar(`[electron-main] no pude lanzar :${t.puerto} (${t.id}): ${e && e.message ? e.message : e}`));
      proc.on("exit", (codigo, senal) => anotar(`[electron-main] :${t.puerto} (${t.id}) terminó (code=${codigo} signal=${senal}).`));
      anotar(`[electron-main] pack :${t.puerto} (${t.id}) lanzado con ${interprete}`);
      if (t.id === "motor") await new Promise((r) => setTimeout(r, 500)); // que dé tiempo a escuchar antes de :5100
      // v1.0.6 · el motor 3D del sandbox se prepara con el mismo criterio que los
      // packs: si ya está verificado, el script no escribe nada. Se lanza DETRAS de
      // los daemons y no se espera: una escena 3D no puede frenar la ventana.
    } catch (e) {
      anotar(`[electron-main] el arranque de ${t.id} tiró: ${e && e.message ? e.message : e}`);
    }
  }
}

/** La foto de los siete puertos, medida (no declarada): para el log y el diagnóstico. */
async function estadoServicios() {
  const lista = Object.values(SERVICIOS);
  const sondeados = await Promise.all(lista.map(async (t) => ({
    id: t.id, puerto: t.puerto, rol: t.rol,
    vivo: await isPortUp(t.puerto),
    externo: !!t.externo, bajoDemanda: !!t.bajoDemanda, loArrancaElServer: !!t.loArrancaElServer,
  })));
  return sondeados;
}

/**
 * v1.0.6 · El motor 3D del sandbox (three r169 vendorizado) tiene que estar copiado
 * a la raiz de DATOS antes de que un proyecto importe "/vendor/three/…": el preview
 * resuelve contra ahi (server/sandboxEstatico.ts:203). El script de la casa es
 * idempotente (verifica sha256) y reporta, asi que el .EXE lo corre y escucha: si no
 * verifica, la escena 3D va a dar pantalla negra y eso tiene que estar en el log del
 * diagnostico, no descubriendolo el usuario a oscuras.
 */
function prepararVendor3d() {
  try {
    const script = path.join(__dirname, "scripts", "preparar-vendor-3d.mjs");
    if (!fs.existsSync(script)) { anotar("[electron-main] no hay scripts/preparar-vendor-3d.mjs: sin motor 3D en esta instalacion."); return; }
    const node = interpreteServidor();
    // v1.0.49 · SIN `ELECTRON_RUN_AS_NODE` ESTO ABRÍA UNA SEGUNDA APP.
    //
    // Medido en el log de Mario (22/11): `[vendor:3d] Unable to move the cache:
    // Acceso denegado (0x5)` y `Gpu Cache Creation failed`. Eso no era un permiso
    // de carpeta: era OTRA instancia completa de CerebroNico peleando por el mismo
    // userData y, de paso, lanzando su propio server sobre :3000 y sus propios
    // packs. Un script .mjs se ejecuta con el Node de Electron, con su entorno.
    const hijo = spawn(node.bin, [script], { cwd: __dirname, env: { ...process.env, ...node.env, PROJECT_DIR: raizDatosElectron() }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    hijo.stdout && hijo.stdout.on("data", (d) => anotar(`[vendor:3d] ${d}`));
    hijo.stderr && hijo.stderr.on("data", (d) => anotar(`[vendor:3d] ${d}`));
    hijo.on("exit", (codigo) => anotar(codigo === 0 ? "[electron-main] motor 3D verificado." : `[electron-main] motor 3D NO verificado (code=${codigo}): las escenas que importen three van a fallar en el preview.`));
  } catch (e) {
    anotar(`[electron-main] prepararVendor3d tiro: ${e && e.message ? e.message : e}`);
  }
}

// ==================================================================
// EL OJO (v1.0.8) · CAPTURAR LA ESCENA Y COMPARAR DOS FOTOGRAMAS
// ==================================================================
// POR QUÉ. El testigo-3d de v1.0.7 confirma el MONTAJE (motor servido, canvas,
// data-testigos) pero no puede decir «se MUEVE con el scroll»: eso sólo se prueba
// mirando dos fotogramas. Acá el proceso principal —el único que tiene pantalla—
// abre una ventana OCULTA, carga el preview local, la posiciona en dos scrolls,
// captura, reduce cada PNG a su sha256 y a una rejilla 32×32 de luminancia, y le
// pasa TODO al motor para que él dicte el veredicto. Las imágenes no salen de acá.
//
// HONESTIDAD DEL ENTORNO. Sin display (CI, servidor headless) no hay captura real;
// el handler responde `{ ok:false, error }` con el motivo en vez de inventar que
// «se ve y se mueve». `backgroundThrottling:false` evita que Electron congele el
// render de una ventana oculta y falsee un «no cambió nada».
const ANCHO_REJILLA = 32;
const ALTO_REJILLA = 32;

/** Reduce una captura (nativeImage) a una rejilla 32×32 de luminancia 0..255. */
function rejillaDeLuminancia(imagen) {
  const chico = imagen.resize({ width: ANCHO_REJILLA, height: ALTO_REJILLA, quality: "good" });
  const bgra = chico.toBitmap(); // 4 bytes por pixel, orden B,G,R,A
  const valores = new Array(ANCHO_REJILLA * ALTO_REJILLA);
  for (let i = 0, p = 0; p + 3 < bgra.length && i < valores.length; i++, p += 4) {
    const b = bgra[p], g = bgra[p + 1], r = bgra[p + 2];
    // luminancia perceptual (Rec. 601): transformación mecánica, no criterio.
    valores[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { ancho: ANCHO_REJILLA, alto: ALTO_REJILLA, valores };
}

/** Posiciona el scroll, espera a que asiente y devuelve sha256 + rejilla + testigos DOM. */
async function capturarUnFotograma(win, scroll) {
  await win.webContents.executeJavaScript(`window.scrollTo(0, ${Number(scroll) || 0});`, true);
  await new Promise((r) => setTimeout(r, 350)); // dejar que el render del frame asiente
  const testigos = await win.webContents.executeJavaScript(
    `(() => {
       const el = document.querySelector('[data-progreso],[data-fotograma],[data-motor]');
       if (!el) return null;
       return { motor: el.getAttribute('data-motor'), progreso: el.getAttribute('data-progreso'), fotograma: el.getAttribute('data-fotograma') };
     })()`,
    true
  ).catch(() => null);
  const imagen = await win.webContents.capturePage();
  const png = imagen.toPNG();
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  return { sha, rejilla: rejillaDeLuminancia(imagen), testigos };
}

/** POST al motor local para que `fotogramas.ts` dicte el veredicto. */
function pedirVeredicto(cuerpo) {
  return new Promise((resolve, reject) => {
    const datos = Buffer.from(JSON.stringify(cuerpo), "utf8");
    const req = http.request(
      {
        host: "127.0.0.1",
        port: IDE_PORT,
        path: "/api/capacidades/comparar-fotogramas",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": datos.length },
      },
      (res) => {
        let txt = "";
        res.on("data", (d) => { txt += d; });
        res.on("end", () => {
          try { resolve(JSON.parse(txt)); }
          catch { reject(new Error(`el motor respondio algo que no es JSON (${res.statusCode})`)); }
        });
      }
    );
    req.on("error", reject);
    req.write(datos);
    req.end();
  });
}

/** Registra el handler IPC. Guarda `ipcMain`/`nativeImage`: con los stubs del test
 *  (`tests/arranqueElectron.test.ts`) no existe `nativeImage`, y no debe romper el
 *  arranque; sólo quien tenga display real llega a capturar. */
function cablearCapturaEscena() {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    anotar("[electron-main] sin ipcMain: no se cablea la captura de escena (entorno de prueba).");
    return;
  }
  ipcMain.handle("cn:capturar-escena", async (_evt, opciones) => {
    const o = opciones || {};
    if (!nativeImage) {
      return { ok: false, error: "no se pudo mirar: este entorno no tiene nativeImage (sin display real)." };
    }
    const ruta = String(o.ruta || "/index.html").trim() || "/index.html";
    const base = `http://127.0.0.1:${IDE_PORT}`;
    const url = base + (ruta.startsWith("/") ? ruta : "/" + ruta);
    const scrollA = Number.isFinite(Number(o.scrollA)) ? Number(o.scrollA) : 0;
    const scrollB = Number.isFinite(Number(o.scrollB)) ? Number(o.scrollB) : 1200;
    let oculta = null;
    try {
      oculta = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: false, backgroundThrottling: false },
      });
      await oculta.loadURL(url);
      await new Promise((r) => setTimeout(r, 500)); // que el motor 3D arranque
      const a = await capturarUnFotograma(oculta, scrollA);
      const b = await capturarUnFotograma(oculta, scrollB);
      const veredicto = await pedirVeredicto({
        shaA: a.sha, shaB: b.sha,
        testigosA: a.testigos, testigosB: b.testigos,
        rejillaA: a.rejilla, rejillaB: b.rejilla,
      });
      return { ok: true, url, scrollA, scrollB, veredicto };
    } catch (e) {
      return { ok: false, error: `no se pudo mirar: ${e && e.message ? e.message : e}` };
    } finally {
      if (oculta && !oculta.isDestroyed()) { try { oculta.destroy(); } catch {} }
    }
  });
  anotar("[electron-main] captura de escena cableada (cn:capturar-escena).");
}

/** Mata SOLO los hijos de este proceso. Los ajenos (otra IDE, Ollama) no se tocan. */
function matarDaemonsPython() {
  for (const d of daemonsPython) {
    try { d.proc && d.proc.kill(); } catch {}
  }
  daemonsPython.length = 0;
}

/** Espera a que el server escuche. Devuelve false si se agotó el tiempo. */
async function esperarServidor() {
  const limite = Date.now() + ESPERA_ARRANQUE_MS;
  let intentos = 0;
  while (Date.now() < limite) {
    if (motivoFallo) return false;
    intentos++;
    if (await intentar()) return true;
    if (intentos % 10 === 0) {
      anotar(`[electron-main] esperando al server en :${IDE_PORT} (${Math.round((limite - Date.now()) / 1000)} s restantes)…`);
    }
    await new Promise((r) => setTimeout(r, PASO_SONDEO_MS));
  }
  return false;
}

/* ============================================================================
 * v2.3.25 · LA PANTALLA DEL ARRANQUE, DENTRO DEL .EXE (no en el navegador)
 * ---------------------------------------------------------------------------
 * LA QUEJA DE MARIO (15/11): «antes solo abria un CMD, ahora abre 2 — uno con la
 * consola y otro con ollama serve — y el servidor arranca caido, tarda en
 * levantar puertos». Son dos cosas y la cura es una:
 *
 *   · el lanzador abre su propia consola porque necesita narrar el arranque;
 *   · la ventana del IDE se abria en cuanto :3000 contestaba, con la casa a
 *     medio nacer — de ahi la cabecera con OFF y el «servidor local caido».
 *
 * Ahora el .exe llama al lanzador SIN consola (`cmd /c`, `windowsHide`) y pinta
 * él mismo la pantalla de arranque: el mismo dibujo del telón (cerebro, aro que
 * gira, lineas «comprobando los 7 puertos de la casa / consultando el estado del
 * motor»), con el estado REAL de cada puerto medido en esta máquina. Cuando la
 * casa está entera —o cuando se acaba la paciencia, y entonces lo dice— la
 * ventana carga la IDE.
 * ========================================================================== */

/** ¿Hay un lanzador en la instalación? Sin él se arranca el server de siempre. */
function rutaDelLanzador() {
  const candidato = path.join(__dirname, "iniciar_todo_windows.bat");
  try { return fs.existsSync(candidato) ? candidato : null; } catch { return null; }
}

/** Estado medido de la casa: una foto, sin prometer nada. */
async function fotoPuertos() {
  const plano = planoPuertos() || [];
  const filas = await Promise.all(plano.map(async (s) => ({
    id: s.id, puerto: s.puerto, critico: !!s.critico,
    vivo: await isPortUp(s.puerto),
  })));
  return filas;
}

const htmlDeArranque = () => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>CerebroNico — arrancando</title><style>
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:radial-gradient(1200px 600px at 50% 0%,#0a1020 0%,#04070d 60%,#02040a 100%);color:#e5e7eb;font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;overflow:hidden}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
.aro{position:relative;width:132px;height:132px;display:flex;align-items:center;justify-content:center}
.aro .gira{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(34,211,238,.18);border-top-color:#22d3ee;border-right-color:#60a5fa;animation:girar 1.1s linear infinite;filter:drop-shadow(0 0 12px rgba(34,211,238,.55))}
.aro .pulso{position:absolute;inset:14px;border-radius:50%;border:1px solid rgba(125,211,252,.35);animation:pulso 1.8s ease-out infinite}
.cerebro{width:62px;height:62px;filter:drop-shadow(0 0 14px rgba(34,211,238,.85));animation:latir 2.4s ease-in-out infinite}
h1{margin:16px 0 0;font-size:31px;font-weight:900;letter-spacing:-.02em;background:linear-gradient(90deg,#a5f3fc,#22d3ee 45%,#60a5fa);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{margin:6px 0 0;font:12px ui-monospace,monospace;color:#9ca3af}
.card{margin-top:22px;width:min(620px,92vw);border:1px solid #1b2a3f;background:rgba(7,12,21,.9);border-radius:16px;padding:14px 16px;box-shadow:0 0 50px rgba(34,211,238,.1)}
.cab{display:flex;justify-content:space-between;font:11px ui-monospace,monospace;color:#6b7280;margin-bottom:10px}
.cab b{color:#22d3ee;font-weight:600}
.fila{display:flex;align-items:center;gap:10px;padding:5px 0;font:12.5px ui-monospace,monospace;animation:entra .3s ease-out both}
.punto{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex:0 0 auto}
.on{background:rgba(16,185,129,.15);color:#6ee7b7;box-shadow:0 0 12px rgba(16,185,129,.35)}
.off{background:rgba(244,63,94,.14);color:#fda4af}
.gris{background:rgba(113,113,122,.12);color:#a1a1aa}
.nombre{color:#e5e7eb}.puerto{color:#6b7280}
.barra{margin-top:12px;height:3px;border-radius:3px;background:#111a28;overflow:hidden}
.barra i{display:block;height:100%;width:34%;background:linear-gradient(90deg,#22d3ee,#60a5fa);animation:corre 1.4s ease-in-out infinite}
.final{margin-top:12px;font:11.5px ui-monospace,monospace;color:#fbbf24;min-height:16px}
@keyframes girar{to{transform:rotate(360deg)}}
@keyframes pulso{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.35);opacity:0}}
@keyframes latir{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes entra{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes corre{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
</style></head><body><div class="wrap">
<div class="aro"><div class="gira"></div><div class="pulso"></div>
<svg class="cerebro" viewBox="0 0 24 24" fill="none" stroke="#d9f9ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
<path d="M12 5.5a3 3 0 0 0-5.9-.7A3.2 3.2 0 0 0 3.6 8c0 .6.2 1.2.5 1.7A3.3 3.3 0 0 0 3 12.4c0 1 .4 1.9 1.2 2.5-.1.3-.2.6-.2 1A3.2 3.2 0 0 0 7.2 19c.6 1 1.8 1.6 3 1.5V5.5Z"/>
<path stroke="#7dd3fc" d="M12 5.5a3 3 0 0 1 5.9-.7A3.2 3.2 0 0 1 20.4 8c0 .6-.2 1.2-.5 1.7a3.3 3.3 0 0 1 1.1 2.7c0 1-.4 1.9-1.2 2.5.1.3.2.6.2 1A3.2 3.2 0 0 1 16.8 19c-.6 1-1.8 1.6-3 1.5V5.5Z"/>
<path stroke="#a5f3fc" stroke-width="1.1" opacity=".8" d="M12 5.5v15"/></svg></div>
<h1>CerebroNico arrancando motor</h1>
<p class="sub">El conocimiento vive en el motor · el conductor puede ser cualquiera · comprobando la casa…</p>
<div class="card">
  <div class="cab"><span id="cab">comprobando los 7 puertos de la casa</span><b id="marcador">consultando…</b></div>
  <div id="filas"></div>
  <div class="barra"><i></i></div>
  <div class="final" id="final"></div>
</div></div><script>
(function(){
  var filas=document.getElementById("filas"),marcador=document.getElementById("marcador"),final_=document.getElementById("final");
  function pintar(foto,motivo){
    var arriba=0,html="";
    for(var i=0;i<foto.length;i++){
      var f=foto[i]; if(f.vivo) arriba++;
      var cls=f.vivo?"on":(f.critico?"off":"gris");
      var txt=f.vivo?"OK":(f.critico?"OFF":"—");
      html+='<div class="fila"><span class="punto '+cls+'">'+txt+'</span>'+
        '<span class="nombre">:'+f.puerto+'</span><span class="puerto">'+f.id+'</span></div>';
    }
    filas.innerHTML=html;
    marcador.textContent=arriba+"/"+foto.length+" arriba";
    final_.textContent=motivo||"";
  }
  window.cnPintar=pintar;
  pintar([], "consultando el estado del motor…");
})();
</script></body></html>`;

/**
 * Muestra la pantalla de arranque y la refresca hasta que la casa esté entera
 * (o se acabe la paciencia). Devuelve el motivo: qué se abrió y por qué.
 */
async function esperarLaCasa(win) {
  const inicio = Date.now();
  let ultimoPintado = 0;
  let motivo = "sin plano de puertos: se abre con :3000";
  let abrirPor = null;
  while (Date.now() - inicio < ESPERA_ARRANQUE_MS) {
    if (motivoFallo) return { abrir: false, motivo: motivoFallo };
    const foto = await fotoPuertos();
    const transcurrido = Date.now() - inicio;
    const decision = decidirApertura
      ? decidirApertura({
          vivos: foto.filter((f) => f.vivo).map((f) => f.puerto),
          inventory: foto.map((f) => ({ puerto: f.puerto, vivo: f.vivo, quien: f.id, critico: !!f.critico })),
          total: foto.length || 7,
          transcurridoMs: transcurrido,
          pacienciaMs: PACIENCIA_PUERTOS_MS,
        })
      : { abrir: foto.length > 0 && foto.every((f) => !f.critico || f.vivo), motivo: "regla mínima" };
    // La IDE tiene que poder servir ANTES de cargarla: el plano dice que está
    // viva, pero quien lo confirma es una petición HTTP de verdad.
    const ideLista = decision.abrir ? await intentar() : false;
    // v2.3.25 · la foto tiene que ser de AHORA: entre el sondeo y la carga pueden
    // pasar segundos, y abrir con «falta :5000» cuando :5000 acaba de subir es el
    // mismo ruido que se está quitando. Se re-mide la cabecera con esta foto.
    if (Date.now() - ultimoPintado > 350) {
      ultimoPintado = Date.now();
      try {
        if (win && !win.isDestroyed()) {
          const json = JSON.stringify(foto);
          const txt = JSON.stringify(ideLista ? decision.motivo : decision.motivo + " · esperando a :3000");
          win.webContents.executeJavaScript(`window.cnPintar && window.cnPintar(${json},${txt})`).catch(() => {});
        }
      } catch { /* la ventana puede estar cerrándose */ }
    }
    if (decision.abrir && ideLista) { abrirPor = decision.motivo; break; }
    await new Promise((r) => setTimeout(r, PASO_SONDEO_MS));
  }
  if (!abrirPor) {
    // v1.0.22 · Si :3000 NO contestó nunca, abrir «igual» es el camino a la
    // pantalla blanca: no hay a dónde abrir. Se declara el fallo y se pinta el
    // DIAGNÓSTICO (puerto, qué revisar, últimas líneas del server).
    const hayFrente = await intentar();
    if (!hayFrente) {
      return { abrir: false, motivo: "el servidor no llegó a escuchar en :" + IDE_PORT + " dentro del plazo" };
    }
    return { abrir: true, motivo: "la espera se agotó: se abre la IDE para poder trabajar" };
  }
  const foto = await fotoPuertos();
  anotar(`[electron-main] se abre la IDE (${abrirPor}) · foto: ${foto.map((f) => `${f.puerto}:${f.vivo ? "OK" : "OFF"}`).join(" ")}`);
  return { abrir: true, motivo: abrirPor };
}

/** HTML de diagnóstico: la ventana nunca se queda en blanco. */
function paginaDiagnostico(titulo, detalle) {
  const log = colaLog.slice(-COLA_LOG).join("\n");
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // v1.0.49 · LA FICHA, armada con hechos medidos (no con lo que el código cree).
  const serverPath = path.join(__dirname, "dist", "server.mjs");
  let tamServidor = -1;
  try { tamServidor = fs.statSync(serverPath).size; } catch { tamServidor = -1; }
  const int = interpreteServidor();
  const ficha = [
    ["Intérprete", `${int.nombre} → ${int.bin}`],
    ["¿Este intérprete ejecuta JS?", preflight ? (preflight.ok ? `sí (${preflight.ms} ms)` : `NO — ${preflight.detalle}`) : "sin resultado todavía"],
    ["Archivo del servidor", tamServidor >= 0 ? `${serverPath} · ${tamServidor} bytes` : `${serverPath} · NO EXISTE`],
    ["Hijo del servidor", pidHijo ? `pid ${pidHijo} · ${salidaHijo} bytes escritos${primerByteMs === null ? " (ni una letra)" : ` · primer byte a los ${(primerByteMs / 1000).toFixed(1)} s`}` : "no se llegó a lanzar"],
    ["Código de salida", codigoSalida === null ? "sigue vivo (o nunca arrancó)" : String(codigoSalida)],
    ["Registro completo", rutaRegistroArranque() || "(sin ruta escribible)"],
  ];
  const filas = ficha.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  const exeDir = path.dirname(process.execPath);
  const aMano = `cd /d "${exeDir}"\nset ELECTRON_RUN_AS_NODE=1\n"${process.execPath}" "${serverPath}"`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8">
<title>CerebroNico — fallo de arranque</title><style>
body{background:#0b0f17;color:#e5e7eb;font:14px/1.5 system-ui,sans-serif;padding:32px;max-width:980px;margin:0 auto}
h1{font-size:18px;color:#fca5a5;margin:0 0 4px} code{background:#111827;padding:2px 6px;border-radius:4px}
pre{background:#060a12;border:1px solid #1f2937;border-radius:8px;padding:14px;overflow:auto;font-size:12px;max-height:44vh}
ul{color:#9ca3af} li{margin:6px 0}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:12.5px}
th{text-align:left;color:#9ca3af;font-weight:600;padding:5px 10px 5px 0;white-space:nowrap;vertical-align:top;width:1%}
td{padding:5px 0;color:#e5e7eb;word-break:break-all}
tr+tr{border-top:1px solid #16202e}
</style></head><body>
<h1>⚠ ${esc(titulo)}</h1>
<p>${esc(detalle)}</p>
<!-- v1.0.22 · QUÉ SE INTENTÓ, primero y sin buscarlo: el puerto y la URL reales. -->
<p>Se intentó abrir <code>http://127.0.0.1:${esc(String(IDE_PORT))}</code> y el puerto no contestó a tiempo.</p>
<table>${filas}</table>
<p><strong>Qué revisar</strong></p>
<ul>
  <li>Que el puerto <code>${IDE_PORT}</code> esté libre. El caso más común, con diferencia: <strong>otra instancia</strong> de CerebroNico (o el propio servidor de desarrollo) ya lo ocupa — cerrá esa ventana o elegí otro puerto.</li>
  <li>Que exista <code>dist/server.mjs</code> — se genera con <code>npm run build</code> antes de <code>npm run dist</code>.</li>
  <li>El arranque completo, en modo consola: <code>"${esc(path.basename(process.execPath))}" --enable-logging</code>.</li>
</ul>
<p><strong>El servidor, a mano (pegá estas tres líneas en una consola y mandame lo que salga)</strong></p>
<pre>${esc(aMano)}</pre>
<p><strong>Últimas ${COLA_LOG} líneas del arranque</strong> — el registro completo queda en la ruta de arriba.</p>
<pre>${esc(log || "(el servidor no escribió nada: probablemente no llegó a arrancar)")}</pre>
</body></html>`);
}

function mostrarDiagnostico() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // v1.0.49 · el motivo también al archivo: la pantalla se cierra, el registro no.
  aArchivo(`=== DIAGNÓSTICO EN PANTALLA: ${motivoFallo || "El servidor no respondió a tiempo."}`);
  try {
    mainWindow.loadURL(paginaDiagnostico(
      "CerebroNico no pudo arrancar su servidor",
      motivoFallo || "El servidor no respondió a tiempo."
    ));
  } catch (e) {
    console.error("[electron-main] ni el diagnóstico se pudo mostrar:", e);
  }
}

/**
 * v1.57.9 — EL CORRECTOR ORTOGRÁFICO, DE VERDAD, EN EL .EXE.
 *
 * 🐞 La raíz del «no anda»: Electron NO tiene menú contextual nativo. El
 * navegador de toda la vida pinta ahí las sugerencias de ortografía; Electron
 * solo pinta lo que la app construya en `context-menu`. El renderer (v1.52.3)
 * ya dejaba pasar el «menú nativo» en campos con spellcheck… pero ese menú
 * nativo no existe aquí: el resultado era un botón derecho MUDO. Además el
 * diccionario por defecto es en-US: escribías en español y no subrayaba nada
 * útil. Se arreglan las dos cosas:
 *   · idiomas del diccionario: español + inglés (el corrector del chat escribe
 *     en el idioma de la interfaz; los dos cubren el uso real),
 *   · menú de sugerencias: al pulsar derecho sobre una palabra mal escrita
 *     salen las correcciones (clic → se reemplaza), «añadir al diccionario»,
 *     y debajo las acciones de edición de siempre.
 * El renderer hace preventDefault en TODO lo demás (su menú propio), así que
 * este handler solo recibe los campos con spellcheck: sin solapamiento.
 */
function cablearCorrectorOrtografico(win) {
  const ses = win.webContents.session;
  try { ses.setSpellCheckerLanguages(["es", "en-US"]); }
  catch (e) { console.warn("[electron-main] no se pudieron fijar los idiomas del corrector:", e && e.message); }

  win.webContents.on("context-menu", (_ev, params) => {
    const plantilla = [];
    if (params.isEditable && params.misspelledWord) {
      const sugerencias = (params.dictionarySuggestions || []).slice(0, 6);
      for (const s of sugerencias) {
        plantilla.push({
          label: s,
          click: () => { try { win.webContents.replaceMisspelling(s); } catch {} },
        });
      }
      if (sugerencias.length === 0) {
        plantilla.push({ label: "(sin sugerencias para «" + params.misspelledWord + "»)", enabled: false });
      }
      plantilla.push({ type: "separator" });
      plantilla.push({
        label: "Añadir «" + params.misspelledWord + "» al diccionario",
        click: () => { try { ses.addWordToSpellCheckerDictionary(params.misspelledWord); } catch {} },
      });
      plantilla.push({ type: "separator" });
    }
    if (params.isEditable || params.selectionText) {
      plantilla.push({ role: "undo" }, { type: "separator" }, { role: "cut" }, { role: "copy" });
      if (params.isEditable) plantilla.push({ role: "paste" }, { role: "selectAll" });
    }
    if (plantilla.length === 0) return; // nada que ofrecer: no se abre menú vacío
    try { Menu.buildFromTemplate(plantilla).popup(); } catch {}
  });
}

async function crearVentana() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconoDeApp(),
    title: "CerebróNico IDE",
    // v2.3.25 · nace oculta: primero el dibujo del arranque, después la IDE.
    // `CN_MOSTRAR_AL_INSTANTE=1` la muestra desde el primer frame (depurar).
    show: process.env.CN_MOSTRAR_AL_INSTANTE === "1",
    // `spellcheck: true` es el default de Electron, pero se pone EXPLÍCITO:
    // sin diccionario no hay subrayado rojo ni sugerencias, y nadie debe
    // descubrirlo por omisión dentro de dos versiones.
    // v1.0.8 · `preload` expone el puente mínimo (cerebronico.capturarEscena) sin
    // abrir Node al renderer: sigue con contextIsolation y sin nodeIntegration.
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  cablearCorrectorOrtografico(mainWindow);

  // `loadURL` no reintenta solo: sin esto, un puerto que aún no escuchaba significa
  // blanco permanente. Se reintenta y, agotados los intentos, se explica.
  let reintentos = 0;
  mainWindow.webContents.on("did-fail-load", (_e, codigo, descripcion) => {
    if (codigo === -3) return; // abortado por el propio usuario, no es un fallo
    anotar(`[electron-main] did-fail-load ${codigo} ${descripcion}`);
    if (reintentos++ < 5) setTimeout(() => mainWindow && mainWindow.loadURL(`http://127.0.0.1:${IDE_PORT}`), 1000);
    else mostrarDiagnostico();
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  // v2.3.25 · LA PANTALLA DE ARRANQUE, PRIMERO. La ventana nace oculta, se le
  // carga el dibujo del arranque y recién entonces se muestra: nadie ve un
  // blanco ni un «servidor caído» mientras la casa todavía está naciendo.
  let pantallaPuesta = false;
  try {
    await mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlDeArranque()));
    pantallaPuesta = true;
    try { mainWindow.show(); } catch {}
  } catch { /* si el dibujo no carga, se sigue con la espera muda de siempre */ }

  const veredicto = pantallaPuesta ? await esperarLaCasa(mainWindow) : { abrir: await esperarServidor(), motivo: "" };
  if (!veredicto.abrir) {
    if (!motivoFallo) {
      motivoFallo = `Pasaron ${Math.round(ESPERA_ARRANQUE_MS / 1000)} s y el servidor no arrancó.`;
    }
    mostrarDiagnostico();
    return;
  }
  // Se abre pase lo que pase, pero si faltó algo se dice UNA vez y con nombre:
  // una cabecera con OFF sin explicación es justo lo que se está corrigiendo.
  const faltan = /falta|arriba \d+\//.test(veredicto.motivo) ? veredicto.motivo : "";
  if (faltan) anotar(`[electron-main] ARRANQUE: ${faltan}`);

  try {
    await mainWindow.loadURL(`http://127.0.0.1:${IDE_PORT}`);
  } catch (e) {
    motivoFallo = `No se pudo cargar la interfaz: ${e && e.message ? e.message : e}`;
    mostrarDiagnostico();
  }
}

/* ============================================================================
 * v1.0.49 · UNA SOLA INSTANCIA, UN SOLO SERVIDOR, UN SOLO :3000
 * ---------------------------------------------------------------------------
 * Sin cerrojo, cada doble clic abre otra app completa: otro server peleando por
 * :3000 (el segundo muere con EADDRINUSE) y otro juego de packs. El usuario ve
 * «no abre» y el puerto es de un proceso que nadie sabe que existe. Con cerrojo,
 * la segunda se cierra y le pasa el foco a la primera y única.
 * ========================================================================== */
const yaHayInstancia = typeof app.requestSingleInstanceLock === "function" && !app.requestSingleInstanceLock();
if (yaHayInstancia) {
  anotar("[electron-main] ya hay otra instancia abierta: esta no arranca server ni packs.");
  // Cerrarse en silencio sería el mismo pecado de siempre (un programa que no
  // hace nada). Se dice en una ventana chica y se apaga ahí mismo.
  app.whenReady().then(() => {
    try {
      mainWindow = new BrowserWindow({ width: 560, height: 280, title: "CerebróNico", show: true });
      mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>CerebroNico</title><style>body{background:#0b0f17;color:#e5e7eb;font:14px/1.6 system-ui,sans-serif;padding:26px}h1{font-size:16px;color:#7dd3fc;margin:0 0 10px}p{color:#9ca3af;margin:8px 0}</style></head><body><h1>CerebroNico ya está abierto</h1><p>Se cerró este segundo lanzamiento para no levantar otro servidor sobre el mismo puerto ni otro juego de packs.</p><p>Si no ves la ventana de la otra instancia, cerrala desde el Administrador de tareas y volvé a abrir.</p></body></html>`));
    } catch { try { app.quit(); } catch {} }
  });
} else {
  if (typeof app.on === "function") {
    app.on("second-instance", () => {
      anotar("[electron-main] llegó un segundo lanzamiento: se enfoca la ventana que ya existe.");
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized && mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      } catch { /* ventana cerrándose */ }
    });
  }

app.whenReady().then(async () => {
  arrancarServidor();
  // v2.3.24 · DESPUES del server, para que el primer hijo spawneado siga siendo
  // el del server (lo que congela `tests/arranqueElectron.test.ts`) y para que la
  // ventana no espere a los packs: se lanzan en paralelo y se anuncian en el log.
  void arrancarDaemonsPython()
    .then(async () => {
      const foto = await estadoServicios();
      const arriba = foto.filter((s) => s.vivo).map((s) => `${s.id}:${s.puerto}`);
      anotar(`[electron-main] puertos arriba (${arriba.length}/7): ${arriba.join(" ") || "ninguno"}`);
    })
    .catch((e) => anotar(`[electron-main] los packs tiraron: ${e && e.message ? e.message : e}`));
  prepararVendor3d(); // v1.0.6 · no frena la ventana: prepara y avisa
  cablearCapturaEscena(); // v1.0.8 · el ojo IPC, guardado para no romper el arranque sin display
  await crearVentana();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana(); });
});
}

app.on("window-all-closed", () => {
  if (serverProc) { try { serverProc.kill(); } catch {} serverProc = null; }
  matarDaemonsPython(); // v2.3.24 · los packs que este EXE encendió se van con él
  if (process.platform !== "darwin") app.quit();
});

// v2.3.24 · `before-quit` cubre el cierre por menú/`app.quit()` directo, que no
// pasa por `window-all-closed` en todas las plataformas. Un daemon huérfano es la
// segunda mitad de esta queja: al día siguiente el puerto está «ocupado» y nadie
// sabe quién es.
app.on("before-quit", () => {
  if (serverProc) { try { serverProc.kill(); } catch {} serverProc = null; }
  matarDaemonsPython();
});
