/**
 * tests/arranqueElectron.test.ts — LA VENTANA NUNCA SE QUEDA EN BLANCO (v1.56.8)
 * ==============================================================================
 * Mario compiló el instalador: el icono salió, y la pantalla se quedó blanca.
 * `electron-main.cjs` tenía tres fallos que comparten una misma forma — un error
 * que no se muestra es indistinguible de un programa que no hace nada:
 *
 *   1. `spawn("node", …)`: un paquete de Electron no trae un `node` en el PATH.
 *      El fallo llega por el evento `error` del hijo, que nadie escuchaba.
 *   2. `setTimeout(createWindow, 3000)`: tres segundos a ojo contra un server que
 *      carga la base de conocimiento y espera a los packs. `loadURL` no reintenta.
 *   3. Sin `did-fail-load`, sin `on("exit")`: el server moría y la ventana seguía.
 *
 * Esta suite EJECUTA el proceso principal real (stubando `electron` y
 * `child_process`, no reescribiéndolo) y comprueba las dos salidas que importan:
 * servidor arriba → carga la interfaz; servidor abajo → muestra un diagnóstico.
 * En ningún caso una pantalla en blanco.
 */
import http from "node:http";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireCjs = createRequire(import.meta.url);

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(titulo + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}

// ─── Stubs ───────────────────────────────────────────────────────────────────
type Ventana = { url: string | null; cargada: string | null; fail: ((c: number, d: string) => void) | null; destroyed: boolean };
function crearVentanaStub(): Ventana {
  const w: any = {
    url: null,
    destroyed: false,
    webPreferences: {},
    on: (_evt: string, _cb: any) => {},
    once: (_evt: string, _cb: any) => {},
    isDestroyed: () => w.destroyed,
    loadURL: async (u: string) => { w.url = u; return undefined; },
  };
  w.webContents = {
    on: (evt: string, cb: any) => { if (evt === "did-fail-load") w.__fail = cb; },
  };
  return w;
}

const ventanas: Ventana[] = [];
let whenReadyResuelto: any = null;
const electronStub: any = {
  app: {
    whenReady: () => { if (!whenReadyResuelto) whenReadyResuelto = Promise.resolve(); return whenReadyResuelto; },
    on: () => {},
    quit: () => {},
  },
  BrowserWindow: function BrowserWindow(this: any, _opts: any) {
    const v = crearVentanaStub();
    ventanas.push(v);
    return v;
  },
  ipcMain: { on: () => {}, handle: () => {} },
};
electronStub.BrowserWindow.getAllWindows = () => ventanas;

// El hijo simulado: NO se ejecuta ningún server real. Así el test decide si el
// servidor está arriba o abajo, sin depender de Node, puertos ni antivirus.
const hijoStub: any = {
  stdout: { on: () => {} },
  stderr: { on: () => {} },
  on: () => {},
  kill: () => {},
};
// v1.57.0 — además de tragar el hijo, CAPTURA con qué env se lanzó: el EXE moría
// porque `electron-main` no declaraba producción y el server pedía Vite.
const spawnCalls: any[] = [];
const childProcessStub: any = {
  spawn: (bin: string, args: string[], opts: any) => {
    spawnCalls.push({ bin, args, opts });
    return hijoStub;
  },
};

const originales = new Map<string, any>();
function interceptar(nombre: string, valor: any) {
  const mod = Module as any;
  if (!originales.has("_load")) originales.set("_load", mod._load);
  const previo = mod._load;
  mod._load = function (request: string, ...resto: any[]) {
    if (request === nombre) return valor;
    return previo.call(this, request, ...resto);
  };
  return () => { mod._load = previo; };
}

/** Carga electron-main.cjs con los stubs puestos, en un puerto dado. */
async function ejecutarMain(puerto: number, rutaBase: string = RAIZ) {
  ventanas.length = 0;
  process.env.CN_IDE_PORT = String(puerto);
  process.env.CN_ESPERA_ARRANQUE_MS = "1500"; // el test no espera 90 s
  const sueltaElectron = interceptar("electron", electronStub);
  const sueltaHijos = interceptar("child_process", childProcessStub);
  try {
    // `delete require.cache` para que cada escenario cargue el módulo de cero.
    // `rutaBase` permite simular un PAQUETE (directorio con dist/server.mjs) sin
    // tocar el repo real.
    const ruta = path.join(rutaBase, "electron-main.cjs");
    delete requireCjs.cache[requireCjs.resolve(ruta)];
    requireCjs(ruta);
    await whenReadyResuelto;
    await new Promise((r) => setTimeout(r, 2600)); // más que el techo de espera
  } finally {
    sueltaHijos();
    sueltaElectron();
  }
  return ventanas[0] as any;
}

// ─── Escenario A: no hay servidor escuchando ─────────────────────────────────
console.log("\n[Arranque Electron] La pantalla blanca, hecha prueba ejecutada.\n");
{
  // Puerto elegido alto y sin nada escuchando.
  const v = await ejecutarMain(59417);
  const url: string = v?.url || "";
  comprobar("★ sin servidor arriba NO queda en blanco: carga algo", url.length > 0, "loadURL no se llamó nunca");
  comprobar("y lo que carga es un DIAGNÓSTICO, no una página vacía",
    url.startsWith("data:text/html") && /no pudo arrancar|fallo de arranque/i.test(decodeURIComponent(url)),
    url.slice(0, 60));
  const html = decodeURIComponent(url);
  comprobar("el diagnóstico dice QUÉ se intentó (el puerto)", /59417/.test(html));
  comprobar("el diagnóstico dice DÓNDE mirar (puerto libre / npm run build)",
    /puerto|dist\/server\.mjs/i.test(html));
  comprobar("y advierte del caso más común: otra instancia ocupando el puerto",
    /otra instancia|puerto/i.test(html));
  // v1.0.49 · el fallo deja rastro: la pantalla enseña el comando exacto y la
  // ruta del registro, no solo «no contestó».
  comprobar("★ el diagnóstico enseña el comando con el que se lanzó el servidor",
    /ELECTRON_RUN_AS_NODE=1/.test(html) && /dist[\\/]server\.mjs/.test(html));
  comprobar("★ y la ruta del registro completo (para mandarla, no para adivinarla)",
    /Registro completo/.test(html) && /arranque-electron\.log/.test(html));
}

// ─── Escenario B: el servidor SÍ responde ────────────────────────────────────
{
  const puerto = 59418;
  const srv = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>ide</html>"); });
  await new Promise<void>((r) => srv.listen(puerto, "127.0.0.1", r));
  try {
    const v = await ejecutarMain(puerto);
    const url: string = v?.url || "";
    comprobar("★ con el servidor arriba, carga la interfaz real", url === `http://127.0.0.1:${puerto}`, url.slice(0, 60));
    comprobar("y NO muestra diagnóstico (no es un falso positivo)", !url.startsWith("data:text/html"));
  } finally {
    srv.close();
  }
}

// ─── Escenario C: las invariantes del código ─────────────────────────────────
{
  const fs = requireCjs("fs") as typeof import("node:fs");
  const src = fs.readFileSync(path.join(RAIZ, "electron-main.cjs"), "utf-8");
  // La cabecera de este archivo DOCUMENTA el bug viejo citando la línea exacta
  // (`setTimeout(createWindow, 3000)`), así que un guarda que lea el fuente crudo
  // denuncia su propio comentario. Los chequeos de fuente se hacen sobre el CÓDIGO:
  // se quitan los comentarios de línea y de bloque antes de mirar.
  const srcCod = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  comprobar("★ usa el Node del propio Electron (no un `node` del PATH que puede no existir)",
    /ELECTRON_RUN_AS_NODE/.test(srcCod) && /process\.execPath/.test(srcCod));
  comprobar("y `node` queda solo como respaldo, no como única vía",
    /nombre:\s*"node del PATH"/.test(srcCod) && /nombre:\s*"Node de Electron"/.test(srcCod));

  comprobar("★ el error del hijo se ESCUCHA (antes se tragaba en silencio)",
    /\.on\("error"/.test(srcCod));
  comprobar("y la salida del proceso también", /\.on\("exit"/.test(srcCod));

  comprobar("★ no queda el `setTimeout(createWindow, 3000)` a ciegas",
    !/setTimeout\(createWindow,\s*3000\)/.test(srcCod));
  comprobar("se espera al servidor sondeando el puerto, con techo",
    /esperarServidor/.test(srcCod) && /ESPERA_ARRANQUE_MS/.test(srcCod));

  comprobar("★ `did-fail-load` se atiende y reintenta", /did-fail-load/.test(srcCod) && /reintentos/.test(srcCod));
  comprobar("el anillo de log existe para poder enseñar algo", /colaLog/.test(srcCod) && /COLA_LOG/.test(srcCod));
  comprobar("el HTML del diagnóstico escapa el log (no inyecta etiquetas)",
    /replace\(\/\[&<>\]\//.test(srcCod));
  // v1.0.49 · EL ARRANQUE QUE NO DEJA RASTRO. Cuatro invariantes: el registro en
  // archivo, la prueba del intérprete, la salida contada y el código de salida.
  comprobar("★ el arranque se escribe en un archivo que sobrevive al cierre",
    /arranque-electron\.log/.test(srcCod) && /appendFileSync/.test(srcCod));
  comprobar("★ se prueba el intérprete antes de creerle (RUN_AS_NODE apagado = hijo mudo)",
    /CN_NODE_OK/.test(srcCod) && /preflightInterprete/.test(srcCod));
  comprobar("y si el intérprete no ejecuta JS, se releva con el node del PATH",
    /reintentarConNodeDelPath/.test(srcCod));
  comprobar("se cuenta cada byte del hijo y su código de salida (antes no se sabía)",
    /salidaHijo \+= d\.length/.test(srcCod) && /codigoSalida = codigo/.test(srcCod));
  comprobar("un hijo mudo no se espera en silencio: vigía a los 20 s",
    /a los 20 s/.test(srcCod));
  // v1.0.49 · LA SEGUNDA INSTANCIA. `prepararVendor3d` lanzaba el .exe SIN
  // ELECTRON_RUN_AS_NODE: abría otra app entera (cache denegada, otro :3000).
  comprobar("★ ningún script .mjs se lanza con el .exe como si fuera Node",
    !/const node = process\.execPath;/.test(srcCod) && /function prepararVendor3d[\s\S]{0,900}interpreteServidor\(\)/.test(srcCod));
  comprobar("★ instancia única: un segundo lanzamiento enfoca la ventana, no abre otro server",
    /requestSingleInstanceLock/.test(srcCod) && /second-instance/.test(srcCod) && /ya hay otra instancia/.test(srcCod));
  // Y el detector funciona: sobre el fuente COMPLETO el comentario de cabecera sí
  // encuentra el patrón viejo. Si esto cambiara, el guarda de arriba sería un no-op.
  comprobar("el guarda anti-`setTimeout` distingue comentario de código",
    /setTimeout\(createWindow,\s*3000\)/.test(src) && !/setTimeout\(createWindow,\s*3000\)/.test(srcCod));

  // Y el fallback (v1.57.0): la DECISIÓN es pura y vive en modoArranque.ts (se
  // prueba abajo con casos propios); el monolito solo aporta hechos. Los guardas
  // de fuente verifican AMBAS mitades: que el server consulta el módulo con el
  // hecho medido, y que el módulo existe con sus dos salidas ruidosas.
  const srv = fs.readFileSync(path.join(RAIZ, "server.ts"), "utf-8");
  const ma = fs.readFileSync(path.join(RAIZ, "src", "engine", "modoArranque.ts"), "utf-8");
  comprobar("★ el server mira si hay dist/ HERMANO antes de morir (hecho medido en el cable)",
    /existsSync\(distHermano\)/.test(srv) && /veredictoArranqueSinVite\(/.test(srv));
  comprobar("y ejecuta la sentencia del módulo sin reimplementarla",
    /servirProduccion = v\.servirProduccion/.test(srv));
  comprobar("el módulo tiene las DOS salidas ruidosas (servir o declararse muerto)",
    /servirProduccion: true/.test(ma) && /servirProduccion: false/.test(ma));
  comprobar("el aviso de salida dice que TAMPOCO hay dist/ (no miente)",
    /Y tampoco hay dist\/index\.html/.test(ma));
  comprobar("el detalle del error de Vite no se pierde en la extracción",
    /viteError/.test(ma) && /viteError:/.test(srv));
  comprobar("`createViteServer` se declara FUERA del bloque sonda (el scope de bloque era un ReferenceError latente)",
    srv.indexOf("let createViteServer") < srv.indexOf("if (!servirProduccion) {"));

  // La decisión pura, ejecutada (no leída): tres hechos, dos salidas.
  const { veredictoArranqueSinVite } = requireCjs(path.join(RAIZ, "src", "engine", "modoArranque.ts")) as any;
  const conCliente = veredictoArranqueSinVite({ distHermano: "/x/dist/index.html", distHermanoExiste: true });
  comprobar("★ con cliente al lado: producir, con aviso que nombra la ruta",
    conCliente.servirProduccion === true && conCliente.avisos.length === 1
    && conCliente.avisos[0].includes("/x/dist/index.html") && conCliente.errores.length === 0);
  const sinNada = veredictoArranqueSinVite({ distHermano: "/x/dist/index.html", distHermanoExiste: false, viteError: "Cannot find package 'vite'" });
  comprobar("★ sin cliente y sin Vite: morir, pero diciendo las dos cosas y las dos opciones",
    sinNada.servirProduccion === false && sinNada.errores.length === 4
    && sinNada.errores[0].includes("Cannot find package 'vite'") && /Opcion B/.test(sinNada.errores.join("\n")));
  const nodeEnvSin = veredictoArranqueSinVite({ distHermano: "/x/dist/index.html", distHermanoExiste: true });
  comprobar("NODE_ENV undefined se dice «sin definir», no se disfraza de production",
    /sin definir/.test(nodeEnvSin.avisos[0]));
}

// ─── Escenario D: el EXE empaquetado que moría por Vite (v1.57.0) ────────────
// Medido en la máquina de Mario (2026-10-12): el instalador arrancaba el server
// SIN NODE_ENV → rama de desarrollo → «Cannot find package 'vite'» → code=1,
// teniendo dist/index.html compilado al lado. Aquí se simula el paquete en un
// directorio temporal (con su dist/server.mjs) y se mira el ENV REAL con que
// electron-main lanza el hijo — no lo que el código dice que hará.
{
  const fs = requireCjs("fs") as typeof import("node:fs");
  const os = requireCjs("os") as typeof import("node:os");
  const bdir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-pack-"));
  fs.copyFileSync(path.join(RAIZ, "electron-main.cjs"), path.join(bdir, "electron-main.cjs"));
  const nodeEnvOriginal = process.env.NODE_ENV;
  try {
    // D1 · paquete con dist/server.mjs → el hijo nace en producción.
    fs.mkdirSync(path.join(bdir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(bdir, "dist", "server.mjs"), "// paquete simulado\n");
    delete process.env.NODE_ENV;
    spawnCalls.length = 0;
    await ejecutarMain(59419, bdir);
    comprobar("★ empaquetado: el server nace con NODE_ENV=production",
      spawnCalls[0]?.opts?.env?.NODE_ENV === "production",
      `NODE_ENV=${String(spawnCalls[0]?.opts?.env?.NODE_ENV)}`);
    comprobar("y el punto de entrada es dist/server.mjs, no `tsx server.ts`",
      /dist[/\\]server\.mjs$/.test(String(spawnCalls[0]?.args?.[0] ?? "")),
      String(spawnCalls[0]?.args?.[0]));

    // D2 · un NODE_ENV puesto a mano (alguien depurando el paquete) se respeta.
    process.env.NODE_ENV = "development";
    spawnCalls.length = 0;
    await ejecutarMain(59420, bdir);
    comprobar("★ no pisa un NODE_ENV explícito (la puerta de escape sigue abierta)",
      spawnCalls[0]?.opts?.env?.NODE_ENV === "development",
      String(spawnCalls[0]?.opts?.env?.NODE_ENV));

    // D3 · sin dist/ (desarrollo) no se fuerza nada: ahí Vite ES lo correcto.
    fs.rmSync(path.join(bdir, "dist"), { recursive: true, force: true });
    delete process.env.NODE_ENV;
    spawnCalls.length = 0;
    await ejecutarMain(59421, bdir);
    comprobar("en desarrollo NO se declara producción (no romper el modo bueno)",
      spawnCalls[0]?.opts?.env?.NODE_ENV === undefined,
      String(spawnCalls[0]?.opts?.env?.NODE_ENV));
  } finally {
    if (nodeEnvOriginal === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvOriginal;
    fs.rmSync(bdir, { recursive: true, force: true });
  }
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ ARRANQUE ELECTRON (v1.56.8 · v1.57.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length > 0) {
  console.log("FALLOS:");
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}
