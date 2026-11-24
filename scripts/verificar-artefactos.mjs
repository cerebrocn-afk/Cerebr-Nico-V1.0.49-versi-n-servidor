#!/usr/bin/env node
/**
 * verificar-artefactos.mjs — v1.20.1 (EMPAQUETADO) — puerta previa al build
 * =============================================================================
 * Informe del cliente, §22: «antes de electron-builder hay que verificar
 * físicamente que existan todos los recursos; se debe ABORTAR el build si
 * falta alguno. No debe generarse un instalador parcialmente funcional.»
 *
 * `npm run dist` ya invoca este script ANTES de electron-builder. También puede
 * lanzarse a mano:  node scripts/verificar-artefactos.mjs
 *
 * Jerarquía de runtime del paquete final:
 *  · resources/python-embed/python.exe  → OBLIGATORIO (autonomía sin Python)
 *  · resources/dist/*.exe (PyInstaller) → OPCIONAL (refuerzo; sin ellos cubre
 *    el Python embebido con los .py que ya viajan en resources/app/).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

const OBLIGATORIOS = [
  ["dist/server.mjs", "server compilado — npm run build"],
  ["dist/index.html", "frontend compilado — npm run build"],
  ["electron-main.cjs", "proceso principal de Electron"],
  ["agent_bridge_5000.py", "puente PC :5000 (solo stdlib)"],
  ["scripts/hindsight_daemon.py", "daemon memoria :5100 (solo stdlib)"],
  ["scripts/creador_daemon.py", "daemon creador :5102 (solo stdlib)"],
  ["tools.config.json", "config de packs externos"],
  ["requirements.txt", "referencia de dependencias (documentación)"],
  ["runtime/python-embed/python.exe", "Python embebido Windows — node scripts/preparar-python-embed.mjs"],
];

const OPCIONALES = [
  ["dist/CerebroNicoAgent.exe", "agente compilado — build_backend.bat"],
  ["dist/cerebronico_bridge.exe", "puente compilado — build_backend.bat"],
  ["dist/hindsight_daemon.exe", "memoria compilada — build_backend.bat"],
  ["dist/creador_daemon.exe", "creador compilado — build_backend.bat"],
];

let faltan = 0;
console.log("[verificar-artefactos] Comprobación previa al empaquetado:");
for (const [ruta, que] of OBLIGATORIOS) {
  if (existe(ruta)) {
    console.log(`  ✓ existe   ${ruta} — ${que}`);
  } else {
    console.error(`  ✗ FALTA    ${ruta} — ${que}`);
    faltan++;
  }
}
for (const [ruta, que] of OPCIONALES) {
  console.log(
    existe(ruta)
      ? `  ✓ existe   ${ruta} — ${que}`
      : `  · opcional ${ruta} — sin él cubre el Python embebido (${que})`
  );
}

// v1.22.2 (REPARACIÓN EXE) — auditoría de imports huérfanos desde el METAFILE
// de esbuild (no regex: el bundle trae «import» como texto generado y daría
// falsos positivos). Con `--packages=external`, un `import` de un paquete queda
// VIVO en dist/server.mjs; si ese paquete está en devDependencies (o no está),
// electron-builder no lo empaqueta y el EXE muere con ERR_MODULE_NOT_FOUND.
const BUILTINS_NODE = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "module", "net", "os", "path",
  "perf_hooks", "process", "punycode", "querystring", "readline", "repl",
  "stream", "string_decoder", "timers", "tls", "trace_events", "tty", "url",
  "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

function raizDePaquete(spec) {
  if (spec.startsWith("@")) {
    const partes = spec.split("/");
    return partes.length >= 2 ? `${partes[0]}/${partes[1]}` : spec;
  }
  return spec.split("/")[0];
}

function auditarImportsHuerfanos() {
  const metafile = path.join(RAIZ, "dist", "server.meta.json");
  if (!fs.existsSync(metafile)) {
    console.error("  ✗ No existe dist/server.meta.json — ejecuta npm run build (emite --metafile).");
    return 1;
  }
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metafile, "utf8")); }
  catch (e) { console.error(`  ✗ dist/server.meta.json ilegible: ${e.message}`); return 1; }

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")); }
  catch (e) { console.error(`  ✗ package.json ilegible: ${e.message}`); return 1; }
  const deps = new Set(Object.keys(pkg.dependencies || {}));

  const externos = new Set();
  for (const entrada of Object.values(meta.inputs || {})) {
    for (const imp of entrada.imports || []) {
      if (!imp.external) continue;
      // Solo los imports ESTÁTICOS rompen el EXE al cargar (ERR_MODULE_NOT_FOUND).
      // Los `dynamic-import` (esbuild, vite, jszip) se cargan perezosamente y van
      // envueltos en try/catch: su ausencia se AVISA, no aborta el arranque.
      if (imp.kind !== "import-statement" && imp.kind !== "require-call") continue;
      const spec = String(imp.path || "");
      if (!spec || spec.startsWith("node:")) continue;
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      const raiz = raizDePaquete(spec);
      if (!raiz) continue;
      if (BUILTINS_NODE.has(raiz)) continue;
      externos.add(raiz);
    }
  }

  const huerfanos = [...externos].filter((p) => !deps.has(p)).sort();
  const listado = [...externos].sort().join(", ") || "ninguno";
  console.log(`  · imports estáticos externos: ${externos.size} (${listado})`);
  if (huerfanos.length > 0) {
    console.error(`  ✗ imports huérfanos (no están en "dependencies"; el EXE no los traería): ${huerfanos.join(", ")}`);
    return huerfanos.length;
  }
  console.log('  ✓ todos los imports estáticos externos están en "dependencies".');
  return 0;
}

faltan += auditarImportsHuerfanos();

/* ─── Comprobación R — código local que invocan los scripts ────────────────
   v1.53.1 (anti-regresión de D1). D1 fue que `autonomia.py` no viajó en el
   ZIP mientras 4 scripts de package.json lo invocan: nada preguntaba por los
   ficheros de CÓDIGO LOCAL que los scripts llaman, así que la ausencia pasó
   desapercibida.

   v2.1.8 (2026-11-01) — SEGUNDA MITAD DEL HUECO, con el criterio corregido.
   La versión anterior solo comprobaba que el archivo EXISTIERA EN DISCO. Eso
   dejaba pasar el caso D1 exacto: `autonomia.py` existía, la R daba verde, y
   aun así NO viajaba en el paquete porque no estaba en `build.files`.
   Existir no es viajar.

   Pero exigir que TODO lo invocado por un script viaje en el .exe es un falso
   positivo masivo: `server.ts`, `tests/*`, `quirofano-cli.mjs`, `validar.mjs`
   son HERRAMIENTAS DE DESARROLLO y no deben viajar (25 falsos positivos en la
   primera pasada). El criterio correcto separa dos clases:

     · RUNTIME  — corre en la máquina del USUARIO dentro del .exe (daemons,
                  autonomia.py). Debe existir Y viajar. Si no viaja, ABORTA.
     · DESARROLLO — se ejecuta en la máquina del DESARROLLADOR (build, tests,
                  validadores). Debe existir en disco; NO se exige que viaje.

   La clase se decide por una lista explícita, no por heurística de nombre: una
   heurística («todo lo que está en scripts/ es dev») volvería a dejar pasar D1,
   porque los daemons también viven en scripts/. */
const RUNTIME_OBLIGATORIO = new Set([
  "autonomia.py",
  "scripts/cerebro_motor.py",
  "scripts/hindsight_daemon.py",
  "scripts/creador_daemon.py",
  "scripts/vigilante_autonomo.py",
  "scripts/analizar_autonomia.py",
  "scripts/mcp_fetch.py",
  "agent_bridge_5000.py",
]);

function comprobacionR() {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")); }
  catch (e) { console.error(`  ✗ package.json ilegible: ${e.message}`); return 1; }

  const CODIGO = /^[\w./\\-]+\.(py|mjs|cjs|mts|ts|js)$/;
  const invocados = new Map(); // ruta -> script que la invoca
  for (const [nombre, linea] of Object.entries(pkg.scripts || {})) {
    for (let tok of String(linea).split(/\s+/)) {
      tok = tok.replace(/^["']|["']$/g, "");
      if (!tok || tok.startsWith("-")) continue;
      if (tok.includes("%") || tok.includes("$") || tok.includes("*")) continue;
      if (!CODIGO.test(tok)) continue;
      const rel = tok.replace(/\\/g, "/");
      // dist/* son artefactos de build: ya los fiscaliza OBLIGATORIOS.
      if (rel.startsWith("dist/")) continue;
      if (!invocados.has(rel)) invocados.set(rel, nombre);
    }
  }

  // Patrones de empaquetado: positivos (incluyen) y negativos (excluyen).
  const patrones = []
    .concat(pkg?.build?.files || [])
    .map((f) => (typeof f === "string" ? f : f?.from || ""))
    .filter(Boolean);
  const positivos = patrones.filter((p) => !p.trim().startsWith("!"));
  const negativos = patrones
    .filter((p) => p.trim().startsWith("!"))
    .map((p) => p.trim().slice(1));

  // Glob mínimo: convierte un patrón de electron-builder en RegExp.
  // Soporta `**` (cualquier profundidad), `*` (sin separador) y `?`.
  const globARegExp = (glob) => {
    const g = glob.replace(/\\/g, "/").replace(/^\.\//, "");
    let re = "";
    for (let i = 0; i < g.length; i++) {
      const c = g[i];
      if (c === "*" && g[i + 1] === "*") {
        // `**/` consume cero o más segmentos; `**` suelto consume todo.
        if (g[i + 2] === "/") { re += "(?:.*/)?"; i += 2; }
        else { re += ".*"; i += 1; }
      } else if (c === "*") { re += "[^/]*"; }
      else if (c === "?") { re += "[^/]"; }
      else if ("\\^$.|+()[]{}".includes(c)) { re += "\\" + c; }
      else { re += c; }
    }
    return new RegExp("^" + re + "$");
  };

  const cubierto = (rel) => {
    const ruta = rel.replace(/\\/g, "/");
    const incluido = positivos.some((p) => globARegExp(p).test(ruta));
    if (!incluido) return { ok: false, motivo: "ningún patrón de build.files lo incluye" };
    const excluido = negativos.find((p) => globARegExp(p).test(ruta));
    if (excluido) return { ok: false, motivo: `lo excluye «!${excluido}»` };
    return { ok: true };
  };

  let ausentes = 0;
  let noViajan = 0;
  let devOk = 0;
  console.log("[verificar-artefactos] Comprobación R — código local que invocan los scripts:");
  for (const [rel, script] of invocados) {
    const esRuntime = RUNTIME_OBLIGATORIO.has(rel);

    if (!existe(rel)) {
      console.error(`  ✗ FALTA ${rel} → lo invoca «npm run ${script}» y no existe en disco`);
      ausentes++;
      continue;
    }

    if (!esRuntime) {
      // Herramienta de desarrollo: basta con que exista. No viaja al .exe.
      devOk++;
      continue;
    }

    const c = cubierto(rel);
    if (!c.ok) {
      console.error(`  ✗ NO VIAJA ${rel} → lo invoca «npm run ${script}» y ${c.motivo}`);
      console.error(`                  (es código de RUNTIME: existe en disco, pero el .exe saldría sin él)`);
      noViajan++;
      continue;
    }
    console.log(`  ✓ ${rel}  (npm run ${script}) — runtime, viaja en el paquete`);
  }
  if (devOk > 0) {
    console.log(`  · ${devOk} herramientas de desarrollo: existen en disco, no viajan al .exe (correcto)`);
  }
  if (ausentes === 0 && noViajan === 0) {
    console.log(`  ✓ ${RUNTIME_OBLIGATORIO.size} archivos de runtime: existen y viajan en el paquete.`);
  }
  return ausentes + noViajan;
}

faltan += comprobacionR();

/* ─── Comprobación I — el ICONO de la app ──────────────────────────────────
   v1.56.8. `build.win.icon` apuntaba a `build/icon.ico`, que no existe en el
   repo. electron-builder no aborta: **avisa y sigue**, y el .exe salió con el
   icono genérico de Electron. Su propio log lo decía clarísimo y se perdía
   entre cuarenta líneas:
     «default Electron icon is used  reason=application icon is not set»
   Un aviso que nadie lee es, a efectos prácticos, un bug silencioso. Aquí se
   vuelve ruidoso: o el icono declarado existe, o el build se detiene. Se
   comprueban las DOS rutas por separado —la del empaquetador y la de la ventana
   en tiempo de ejecución— porque son independientes y ambas estaban rotas. */
function comprobacionIcono() {
  console.log("[verificar-artefactos] Comprobación I — icono de la aplicación:");
  let rotos = 0;
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf-8"));

  const exigir = (ruta, que, opcional) => {
    if (!ruta) {
      if (opcional) return;
      console.log(`  ✗ no declarado  ${que} — sin icono, Electron pondrá el suyo`);
      rotos++;
      return;
    }
    if (fs.existsSync(path.join(RAIZ, ruta))) {
      console.log(`  ✓ existe        ${ruta} — ${que}`);
    } else {
      console.log(`  ✗ FALTA         ${ruta} — ${que}`);
      console.log(`                  (el empaquetador NO aborta: usa el icono de Electron en silencio)`);
      rotos++;
    }
  };

  exigir(pkg?.build?.win?.icon, "icono de la app Windows (build.win.icon)");
  exigir(pkg?.build?.nsis?.installerIcon, "icono del instalador NSIS", true);

  // El icono de la VENTANA se resuelve dentro del paquete: `public/` no viaja en
  // `files`, pero Vite copia su contenido a `dist/`. Se comprueba lo que Electron
  // va a ver de verdad, no lo que uno supone que existe.
  // Solo vale `dist/favicon.ico`: es el que viaja dentro del paquete (`files` no
  // incluye `public/`). Aceptar también `public/favicon.ico` aquí sería un verde
  // vacío — pasar la comprobación con un archivo que Electron no va a ver nunca.
  if (fs.existsSync(path.join(RAIZ, "dist", "favicon.ico"))) {
    console.log("  ✓ existe        dist/favicon.ico — icono de la ventana (viaja en el paquete)");
  } else {
    console.log("  ✗ FALTA         dist/favicon.ico — la ventana saldrá con icono genérico");
    console.log("                  (Vite copia public/ a dist/ al compilar: corre npm run build)");
    rotos++;
  }
  return rotos;
}

faltan += comprobacionIcono();

/* ─── Comprobación C — el cerebro VIVO no viaja dentro del paquete ─────────
   v2.1.7 (2026-11-01). `build.files` decía «app, todo», y dentro de `app/`
   había quedado un `.cerebro-db/` de una instalación anterior: un
   `cerebro-motor.json` con 2202 hechos OBSOLETOS, un `hindsight-mirror.json`
   de 3,4 MB y una carpeta `rescate-obras/` con un `node_modules` ajeno
   (68,6 MB en total). El `.gitignore` lo excluía, pero electron-builder NO
   lee `.gitignore`: lee `build.files`. El `exe` habría salido con un cerebro
   viejo dentro, que al primer arranque puede ganarle al real y sobrescribirlo.

   Dos comprobaciones independientes, porque fallan por motivos distintos:
     a) `build.files` no debe volver a incluir `.cerebro-db` ni `rescate-obras`.
     b) la carpeta no debe existir físicamente dentro de `app/`.
   Si cualquiera falla, el empaquetado se detiene: es más barato borrar una
   carpeta que repartir un instalador con el saber de hace un mes. */
function comprobacionCerebroObsoleto() {
  console.log("[verificar-artefactos] Comprobación C — el cerebro vivo no viaja en el paquete:");
  let rotos = 0;

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")); }
  catch (e) { console.error(`  ✗ package.json ilegible: ${e.message}`); return 1; }

  // (a) `files` no debe incluir las rutas de estado vivo.
  const patrones = []
    .concat(pkg?.build?.files || [])
    .map((f) => (typeof f === "string" ? f : f?.from || ""))
    .filter(Boolean);
  const PROHIBIDOS = [".cerebro-db", "rescate-obras", "hindsight-mirror.json"];
  // Un patrón que empieza por «!» es una EXCLUSIÓN: justo lo que queremos.
  // Marcarlo como fuga sería un falso positivo que bloquea un build correcto.
  const fugas = patrones
    .filter((p) => !p.trim().startsWith("!"))
    .filter((p) => PROHIBIDOS.some((x) => p.includes(x)));
  if (fugas.length > 0) {
    console.error(`  ✗ build.files incluye estado vivo: ${fugas.join(", ")}`);
    console.error("                  (electron-builder NO lee .gitignore: usa build.files)");
    rotos++;
  } else {
    console.log(`  ✓ build.files no incluye estado vivo (${patrones.length} patrones revisados)`);
  }

  // (b) la carpeta no debe existir dentro de la instalación.
  const RESIDUOS = [
    [".cerebro-db", "almacén del cerebro (hechos y páginas)"],
    ["rescate-obras", "obras rescatadas con node_modules ajeno"],
    ["hindsight-mirror.json", "espejo de memoria duplicado"],
  ];
  for (const [rel, que] of RESIDUOS) {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) {
      console.log(`  ✓ no existe      ${rel} — ${que}`);
      continue;
    }
    let bytes = 0;
    try {
      const pila = [abs];
      while (pila.length) {
        const p = pila.pop();
        const st = fs.statSync(p);
        if (st.isDirectory()) for (const h of fs.readdirSync(p)) pila.push(path.join(p, h));
        else bytes += st.size;
      }
    } catch { /* tamaño best-effort: la presencia ya es motivo de aborto */ }
    console.error(`  ✗ EXISTE         ${rel} — ${que} (${(bytes / 1048576).toFixed(1)} MB)`);
    // v1.0.43 · el remedio no es «bórralo»: es MOVERLO. Un `rm -rf .cerebro-db`
    // a mano se lleva la memoria del usuario por delante; el archivador la deja
    // en <raíz de datos>/respaldos/instalacion/<fecha>/ y él decide qué hacer.
    console.error("                  (muévelo fuera de la instalación: npm run cerebro:archivar)");
    console.error("                  (el archivador NO borra nada: copia y verifica antes de sacarlo)");
    rotos++;
  }

  return rotos;
}

faltan += comprobacionCerebroObsoleto();

// ── Comprobación EB — las herramientas de empaquetado están instaladas ───────
// Reporte de Mario (22/11, v1.0.44): `npm run dist` moría en la última línea con
// «"electron-builder" no se reconoce como un comando interno o externo».
// Causa: package.json no declaraba electron/electron-builder (el lockfile sí),
// así que `npm install` los podaba y no existía node_modules\.bin\electron-builder.cmd.
// El guardián lo dice claro y aborta antes de que cmd conteste con un galimatías.
{
  const cliEB = path.join("node_modules", "electron-builder", "cli.js");
  const exeLocal = path.join("node_modules", "electron", "dist", "electron.exe");
  let distExterno = "";
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")).build || {};
    if (typeof cfg.electronDist === "string" && cfg.electronDist) distExterno = cfg.electronDist;
  } catch {}
  const override = process.env.ELECTRON_OVERRIDE_DIST_PATH || "";
  const exeOverride = override ? path.join(override, "electron.exe") : "";
  const exeDist = distExterno ? path.join(distExterno, "electron.exe") : "";
  const hayExterno = Boolean((exeOverride && fs.existsSync(exeOverride)) || (exeDist && fs.existsSync(exeDist)));

  let faltanHerramientas = 0;
  if (existe(cliEB)) console.log(`  ✓ existe   ${cliEB} — electron-builder instalado`);
  else {
    console.error(`  ✗ falta    ${cliEB} — electron-builder instalado`);
    faltanHerramientas++;
  }

  if (existe(exeLocal)) console.log(`  ✓ existe   ${exeLocal} — Electron descargó su binario`);
  else if (hayExterno) {
    const donde = exeOverride && fs.existsSync(exeOverride) ? exeOverride : exeDist;
    console.log(`  ✓ existe   ${donde} — Electron local (override; npm no bajó el suyo)`);
  } else {
    console.error(`  ✗ falta    ${exeLocal} — Electron no descargó su binario`);
    faltanHerramientas++;
  }

  const sdkDestino = path.join("node_modules", "@vectorize-io", "hindsight-agent-sdk");
  const sdkPkg = path.join(sdkDestino, "package.json");
  let sdkEnlace = false;
  try { sdkEnlace = fs.lstatSync(path.join(RAIZ, sdkDestino)).isSymbolicLink(); } catch { sdkEnlace = false; }
  if (!existe(sdkPkg)) {
    console.error(`  ✗ falta    ${sdkPkg} — SDK vendor sin materializar en node_modules`);
    faltanHerramientas++;
  } else if (sdkEnlace) {
    console.log(`  ✓ existe   ${sdkDestino} — SDK vendor (enlace; electron-builder lo sigue)`);
  } else {
    console.log(`  ✓ existe   ${sdkDestino} — SDK vendor (copia real, sobrevive mudanzas)`);
  }

  if (faltanHerramientas > 0) {
    console.error("");
    console.error(`[verificar-artefactos] BUILD ABORTADO: faltan ${faltanHerramientas} herramienta(s) de empaquetado.`);
    console.error("  Si npm 12 bloqueó el postinstall de electron (allowScripts):");
    console.error("    npm run electron:bin        (lanza node_modules/electron/install.js)");
    console.error("  o bien:");
    console.error("    npm install-scripts approve electron");
    console.error("    npm rebuild electron --foreground-scripts");
    console.error("  Si el que falta es el SDK vendor:");
    console.error("    npm run prep:sdk");
    console.error("  O usa un Electron ya descomprimido en disco:");
    console.error("    set ELECTRON_OVERRIDE_DIST_PATH=C:\\ELECTRON");
    console.error("    electron-builder --win --x64 -c.electronDist=C:\\ELECTRON");
    process.exit(1);
  }
}

if (faltan > 0) {
  console.error("");
  console.error(`[verificar-artefactos] BUILD ABORTADO: faltan ${faltan} artefactos obligatorios.`);
  console.error("  Prepara todo y reintenta:");
  console.error("    node scripts/preparar-python-embed.mjs");
  console.error("    npm run build");
  process.exit(1);
}
console.log("[verificar-artefactos] Todo lo necesario queda DENTRO del paquete. electron-builder puede continuar.");
