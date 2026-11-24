/**
 * scripts/entregar.ts — UN SOLO COMANDO PARA EMBALAR (v1.83.0 · FASE 5)
 * ====================================================================
 * `npm run entregar` convierte el ritual de seis pasos en uno: tsc → validar →
 * sin-claves → superficie → zip (sin node_modules/.cerebro-db/dist) →
 * FALTANTES contra el árbol (la lección de la rev.A: el `*` de `zip -x` cruza
 * carpetas y se llevó 104 .png) → escaneo de claves REALES dentro del zip →
 * split en 4 → manifiesto + .BAT → reensamblaje verificado (`cat partes` tiene
 * que dar el hash del zip; si no da, la entrega NO SALE: exit 1).
 *
 * Las decisiones puras viven en src/engine/entregaRitual.ts y las prueba
 * tests/entregaAutoverificada.test.ts; este archivo solo ejecuta y reporta.
 *
 *   --skip-checks : asume los rituales ya pasados (dev/CI que los corrió antes).
 *   --salida DIR  : destino del paquete (por defecto: el padre del proyecto).
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { planSplit, renderManifiesto, sha256hex, zipReensambladoBate } from "../src/engine/entregaRitual";

// npm run entregar se corre desde la raiz del proyecto: cwd es la raiz.
const RAIZ = path.resolve(process.cwd());
const argv = process.argv.slice(2);
const SKIP = argv.includes("--skip-checks");
const iSal = argv.indexOf("--salida");
const SALIDA = iSal > -1 && argv[iSal + 1] ? path.resolve(argv[iSal + 1]) : path.join(RAIZ, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const V = pkg.version as string;
const NOMBRE = `CerebroNico-IDE-v${V}`;
const EXCLUÍDAS = ["node_modules", ".cerebro-db", "dist"];
// v1.99.0 · el criterio de la pelusa es UNO y lo comparten el walk y el `zip -x`.
import { esPelusa, exclusionesZip, contarPelusa } from "../src/engine/peluza";
const CLAVE_RUINA = /sk-or-v1-[0-9a-f]{24,}|AQ\.Ab8AA|mstrl_[A-Za-z0-9]{20,}|sk-cz-[A-Za-z0-9]{20,}/;

const paso = (t: string) => console.log(`\n━━ ${t} ━━`);
const correr = (cmd: string) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: RAIZ, stdio: "inherit" });
};
const salir = (motivo: string): never => {
  console.error(`\n✖ LA ENTREGA NO SALE: ${motivo}`);
  process.exit(1);
};

// 1) Los rituales primero — la misma puerta que el código.
if (!SKIP) {
  paso("tsc --noEmit");
  correr("npx tsc --noEmit");
  paso("npm run validar");
  correr("node scripts/validar.mjs");
  paso("sin-claves");
  correr("node scripts/sin-claves.mjs");
}
paso("contrato de rutas (superficie)");
correr("node scripts/superficie.mjs");

// 2) Árbol de origen (lo que DEBE entrar) y zip.
paso(`empaquetando ${NOMBRE}.zip`);
fs.mkdirSync(SALIDA, { recursive: true });
const zipRuta = path.join(SALIDA, `${NOMBRE}.zip`);
if (fs.existsSync(zipRuta)) fs.rmSync(zipRuta);
const esperados = new Set<string>();
const pelusa = new Set<string>();
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXCLUÍDAS.includes(e.name)) walk(f);
    } else if (e.isFile()) {
      // v1.96.0 · `e.isFile()` en lugar de `else`: en un montaje donde `node_modules`
      // es un SYMLINK, `withFileTypes` no lo ve como carpeta y el walk lo contaba como
      // archivo esperado, mientras `zip` no lo mete. El diff mentía «falta 1 archivo:
      // node_modules» y el ritual se negaba a firmar (correcto: no firma incompletos,
      // pero el incompleto era fantasma). El FALTANTES existe para cazar los .png que se
      // van con el `*` de `zip -x`, no enlaces de instalación.
      const rel = path.relative(RAIZ, f);
      // v1.99.0 · la pelusa NO se empaqueta y TAMPOCO se cuenta como esperada (si se
      // contara, el `faltantes` de abajo se pondría rojo contra un fantasma).
      if (esPelusa(rel)) { pelusa.add(rel); continue; }
      esperados.add(rel);
    }
  }
};
walk(RAIZ);
// El `*` de zip cruza `/`: por eso las exclusiones van con -x "app/x/*" SOLO
// sobre las tres carpetas prohibidas, y el control serio es el diff de abajo.
// Se excluye TAMBIÉN el nombre pelado: si la carpeta prohibida llegó como symlink,
// `zip` la guardaría como enlace (y se llevaría puesta una ruta absoluta del host).
execSync(`zip -9 -q -r "${zipRuta}" app ${["-x", ...exclusionesZip().map((x) => `"${x}"`)].join(" ")}`, { cwd: path.join(RAIZ, ".."), stdio: "inherit" });

// `unzip -Z -1` escupea UN nombre completo por linea: con `unzip -l | awk` los
// nombres CON ESPACIOS se partian y el diff mentia (falsa ausencia medida en
// la primera corrida real del ritual: 4 docs con espacios "faltaban" sin faltar).
const listado = execSync(`unzip -Z -1 "${zipRuta}"`, { encoding: "utf8" });
const enZip = new Set(listado.split("\n").map((x) => x.trim()).filter((x) => x && !x.endsWith("/")));
const faltan = [...esperados].filter((p) => !enZip.has(`app/${p}`));
if (faltan.length) salir(`faltan ${faltan.length} archivos del árbol en el zip (primeros: ${faltan.slice(0, 3).join(", ")}). El ritual no firma paquetes incompletos.`);
{
  const dentro = [...enZip].filter((x) => esPelusa(x.replace(/^app\//, "")));
  if (dentro.length) salir(`la pelusa volvió al zip (${dentro.length}, primeros: ${dentro.slice(0, 3).join(", ")}).`);
  console.log(`  árbol: ${esperados.size} archivos · zip: ${enZip.size} entradas · faltantes: 0 · pelusa fuera: ${pelusa.size} (y 0 dentro del zip, verificado)`);
}

// 3) Claves reales dentro del paquete (la casa no firma secretos ajenos).
const buf = fs.readFileSync(zipRuta);
if (CLAVE_RUINA.test(buf.toString("latin1"))) salir("el ZIP contiene lo que parece una clave API real");
console.log("  escaneo de claves dentro del zip: limpio");

// 4) Split en 4 + manifiesto + .BAT.
const partes = planSplit(buf.length, 4);
const piezas = partes.map((p) => {
  const chunk = buf.subarray(p.desde, p.hasta);
  const nombre = `${NOMBRE}-parte-${p.i}de4.zip`;
  fs.writeFileSync(path.join(SALIDA, nombre), chunk);
  return { nombre, bytes: chunk.length, sha256: sha256hex(chunk) };
});
const zipPieza = { nombre: `${NOMBRE}.zip`, bytes: buf.length, sha256: sha256hex(buf) };
const man = renderManifiesto({
  version: V,
  zip: zipPieza,
  partes: piezas,
  validaciones: SKIP
    ? ["rituales declarados --skip-checks por el que ejecuta", "faltantes vs árbol: 0", "claves reales en el zip: 0", "reensamblaje: verificado abajo, en este mismo run"]
    : ["tsc --noEmit: exit 0", "npm run validar: VEREDICTO TODO CORRECTO (ver arriba)", "sin-claves: limpio", "faltantes vs árbol: 0", "claves reales en el zip: 0", "reensamblaje: verificado abajo, en este mismo run"],
});
fs.writeFileSync(path.join(SALIDA, `MANIFIESTO-CHECKSUMS-v${V}.txt`), `MANIFIESTO-CHECKSUMS-${NOMBRE}.txt\n` + man);

const shaLinea = piezas.map((p, i) => `set SHA${i + 1}=${p.sha256}`).join("\r\n");
const bat = ["@echo off",
  "REM Autogenerado por npm run entregar (v" + V + "). ASCII + CRLF: BAT de la casa.",
  "setlocal EnableExtensions EnableDelayedExpansion",
  'cd /d "%~dp0"'.replace("%~dp0", "%~dp0"),
  `set ZIP=${NOMBRE}.zip`,
  `set ZIPSHA=${zipPieza.sha256}`,
  shaLinea,
  "set FALTA=0",
  "for %%N in (1 2 3 4) do call :check %%N",
  'if "%FALTA%"=="1" ( echo   [NO REUNIR] hay partes corruptas o faltantes. & pause & exit /b 1 )',
  'if exist "%ZIP%" del "%ZIP%"',
  `copy /b ${NOMBRE}-parte-1de4.zip+${NOMBRE}-parte-2de4.zip+${NOMBRE}-parte-3de4.zip+${NOMBRE}-parte-4de4.zip "%ZIP%" >nul`,
  'certutil -hashfile "%ZIP%" SHA256 | find /i "%ZIPSHA%" >nul && echo   [OK] SHA256 coincide. Descomprimi y corre npm install y npm run validar. || echo   [ERROR] hash final no coincide: bajá todo de nuevo.',
  "pause",
  "exit /b 0",
  ":check",
  'set P=' + NOMBRE + '-parte-%~1de4.zip',
  'if not exist "%P%" ( echo   [FALTA] %P% & set FALTA=1 & exit /b )',
  'for /f "skip=1 tokens=1" %%H in (\'certutil -hashfile "%P%" SHA256\') do set GOT=%%H',
  "call set WANT=%%SHA%~1%%",
  'if /i not "!GOT!"=="!WANT!" ( echo   [HASH MAL] %P% & set FALTA=1 ) else ( echo   [OK] %P% )',
  "exit /b 0",
].join("\r\n");
fs.writeFileSync(path.join(SALIDA, `reunir-y-verificar-v${V}.bat`), bat);

// 5) La prueba final del plano: reensamblar ACÁ y batir contra el zip.
const pedazos = partes.map((p) => fs.readFileSync(path.join(SALIDA, `${NOMBRE}-parte-${p.i}de4.zip`)));
const reunido = Buffer.concat(pedazos);
if (!zipReensambladoBate(zipPieza.sha256, sha256hex(reunido))) salir("la reunión de las 4 partes NO reproduce el zip");

console.log(`\n✔ ENTREGA v${V} Lista en ${SALIDA}`);
console.log(`  ${NOMBRE}.zip  ${buf.length} bytes  ${zipPieza.sha256}`);
for (const p of piezas) console.log(`  ${p.nombre}  ${p.bytes}  ${p.sha256.slice(0, 16)}...`);
console.log("  + MANIFIESTO-CHECKSUMS y reunir-y-verificar-*.bat");
