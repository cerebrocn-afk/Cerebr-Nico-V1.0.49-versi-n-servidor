/**
 * tests/empaquetadoDist.test.ts — QUE `npm run dist` LLEGUE AL INSTALADOR
 * ======================================================================
 * v1.0.43 · las cuatro consolas de Mario (21/11) destaparon que `npm run dist`
 * abortaba con «faltan 8 artefactos». Las ocho causas eran de EMPAQUETADO, no
 * de la app: una receta de `clean` que invocaba un `server.js` inexistente con
 * un `rm` de Unix, cinco `.py` de runtime fuera de `build.files`, un icono
 * declarado y ausente, un `.cerebro-db` de 76 MB dentro de la instalación y un
 * `__dirname` en el config de Vite. Esta suite las vigila una por una, sin
 * abrir procesos: lee la receta, el árbol y los módulos puros.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VARIABLES_DATOS, parcheEntornoReavivado, entornoDeReavivado } from "../src/engine/entornoReavivado";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let correctas = 0;
const rojos: string[] = [];
const c = (titulo: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log(`  ✔ ${titulo}`); }
  else { rojos.push(titulo + (detalle ? ` → ${detalle}` : "")); console.log(`  ✘ ${titulo}${detalle ? ` → ${detalle}` : ""}`); }
};
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf-8");
const existe = (rel: string) => fs.existsSync(path.join(RAIZ, rel));

const pkg = JSON.parse(leer("package.json"));
const scripts: Record<string, string> = pkg.scripts || {};

console.log("\n1. La receta no invoca fantasmas ni comandos de otro sistema");
{
  c("`clean` ya no nombra server.js (nunca existió: el server es server.ts)",
    !/\bserver\.js\b/.test(scripts.clean || ""), scripts.clean);
  c("`clean` no usa `rm -rf` (en el cmd.exe de Windows no existe)",
    !/\brm\b\s+-rf/.test(scripts.clean || ""));
  c("`clean` corre un script Node del repo", /node\s+scripts\/limpiar-dist\.mjs/.test(scripts.clean || ""));
  c("y ese script existe en disco", existe("scripts/limpiar-dist.mjs"));
  c("`dist` archiva el cerebro ANTES de empaquetar (mover, no borrar)",
    /^node scripts\/archivar-cerebro-db\.mjs &&/.test(scripts.dist || ""), scripts.dist);
  c("el archivador existe y tiene modo seco", existe("scripts/archivar-cerebro-db.mjs"));
  c("y `cerebro:archivar` lo expone para hacerlo a mano",
    /archivar-cerebro-db\.mjs/.test(scripts["cerebro:archivar"] || "") && /--seco/.test(scripts["cerebro:archivar:seco"] || ""));
}

console.log("\n2. Todo código que la receta invoca existe (cazafantasmas)");
{
  const CODIGO = /^[\w./\\-]+\.(py|mjs|cjs|mts|ts|js)$/;
  const fantasmas: string[] = [];
  for (const [nombre, linea] of Object.entries(scripts)) {
    for (let tok of String(linea).split(/\s+/)) {
      tok = tok.replace(/^["']|["']$/g, "");
      if (!tok || tok.startsWith("-") || /[%$*]/.test(tok) || !CODIGO.test(tok)) continue;
      const rel = tok.replace(/\\/g, "/");
      if (rel.startsWith("dist/")) continue;
      if (!existe(rel)) fantasmas.push(`${rel} (npm run ${nombre})`);
    }
  }
  c("ningún archivo invocado por un script npm falta en disco", fantasmas.length === 0, fantasmas.join(", "));
  for (const py of ["cerebro_motor.py", "hindsight_daemon.py", "creador_daemon.py"]) {
    c(`build.files incluye scripts/${py} (si no, el .exe sale sin ${py})`,
      (pkg.build?.files || []).some((f: any) => String(typeof f === "string" ? f : f?.from).includes("scripts")));
  }
  c("el runtime vendorizado 3D viaja (lo invoca electron-main)",
    existe("scripts/preparar-vendor-3d.mjs"));
}

console.log("\n3. El cerebro nunca escribe dentro de la instalación");
{
  for (const py of ["cerebro_motor.py", "hindsight_daemon.py", "creador_daemon.py"]) {
    const src = leer(`scripts/${py}`);
    c(`${py} resuelve RAIZ_DATOS con PROJECT_DIR/CN_DATA_ROOT/CN_PROJECT_DIR`,
      /RAIZ_DATOS = _raiz_datos\(\)/.test(src) && /"PROJECT_DIR", "CN_DATA_ROOT", "CN_PROJECT_DIR"/.test(src));
    c(`${py} ya no cuelga su almacén de RAIZ_APP`, !/os\.path\.join\(\s*RAIZ_APP,\s*"\.(cerebro-db|creador)"/.test(src));
  }
  const parche = parcheEntornoReavivado("C:\\Cerebronico\\");
  c("el parche de reavivado fija las seis variables de datos",
    VARIABLES_DATOS.every((v) => typeof parche[v] === "string" && parche[v].length > 0), JSON.stringify(parche));
  c("la raíz de datos llega sin separador final y con las rutas del .bat",
    !/[\\/]$/.test(parche.PROJECT_DIR) && /[\\/]\.cerebro-db[\\/]cerebro-motor\.json$/.test(parche.CN_MOTOR_STORE),
    JSON.stringify(parche));
  const env = entornoDeReavivado({ project_dir: "D:\\viejo", PATH: "x" }, "C:\\Cerebronico");
  c("una project_dir heredada (Windows no distingue mayúsculas) no duplica la clave",
    !("project_dir" in env) && env.PROJECT_DIR === "C:\\Cerebronico" && env.PATH === "x");
  const sup = leer("server/routers/supervisorArranque.ts");
  c("★ los DOS caminos de reavivado pasan el entorno (shim y argv)",
    (sup.match(/entornoDeReavivado\(process\.env/g) || []).length === 2);
}

console.log("\n4. Icono: declarado Y presente, con el tamaño grande");
{
  const ico = path.join(RAIZ, pkg.build?.win?.icon || "build/icon.ico");
  c("build.win.icon está declarado", Boolean(pkg.build?.win?.icon));
  c("el .ico existe", fs.existsSync(ico));
  let hay256 = false;
  try {
    const d = fs.readFileSync(ico);
    const n = d.readUInt16LE(4);
    for (let i = 0; i < n; i++) if (d[6 + i * 16] === 0 && d[7 + i * 16] === 0) hay256 = true;
  } catch { /* sin archivo ya lo dice la comprobación anterior */ }
  c("el .ico trae una entrada de 256×256", hay256);
}

console.log("\n5. Vite compila sin `__dirname` (un ESM no lo tiene)");
{
  const v = leer("vite.config.ts");
  const codigo = v.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  c("no queda ningún `__dirname` vivo en el config (solo se nombra en el comentario)",
    !codigo.includes("__dirname"));
  c("y la raíz se calcula desde import.meta.url", /path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/.test(v));
  c("la guarda cerebroNodeGuard sigue puesta", v.includes("cerebroNodeGuard"));
}

console.log("\n6. Las herramientas de empaquetado están declaradas (1.0.48)");
{
  const dev: Record<string, string> = pkg.devDependencies || {};
  const deps: Record<string, string> = pkg.dependencies || {};
  const declarada = (n: string) => typeof dev[n] === "string" || typeof deps[n] === "string";
  const puesta = (n: string) => dev[n] ?? deps[n];
  c("`npm run dist` invoca electron-builder", /electron-builder/.test(scripts.dist || ""), scripts.dist);
  c("electron-builder está declarado (si no, npm install lo poda)", declarada("electron-builder"), String(puesta("electron-builder")));
  c("electron está declarado (el empaquetador lo necesita)", declarada("electron"), String(puesta("electron")));
  c("declaración y lockfile coinciden en versión", (() => {
    try {
      const lock = JSON.parse(leer("package-lock.json"));
      const raiz = lock.packages?.[""] ?? {};
      const enLock = { ...(raiz.devDependencies || {}), ...(raiz.dependencies || {}) };
      return enLock["electron-builder"] === puesta("electron-builder") && enLock["electron"] === puesta("electron");
    } catch { return false; }
  })(), "package.json vs package-lock.json");
  c("`dist` materializa el SDK vendor antes de empaquetar", /prep:sdk|preparar-sdk/.test(scripts.dist || ""), scripts.dist);
  c("el script prep:sdk existe y apunta a un archivo del repo", Boolean(scripts["prep:sdk"]) && leer("scripts/preparar-sdk.mjs").includes("@vectorize-io"), String(scripts["prep:sdk"]));
  c("el guardián previo verifica las herramientas (Comprobación EB)", leer("scripts/verificar-artefactos.mjs").includes("Comprobación EB"));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`EMPAQUETADO DIST (v1.0.49): ${correctas} correctas · ${rojos.length} fallos`);
if (rojos.length) { for (const r of rojos) console.log(`  · ${r}`); process.exit(1); }
