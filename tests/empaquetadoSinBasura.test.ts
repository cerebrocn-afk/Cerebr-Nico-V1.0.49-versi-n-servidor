/**
 * tests/empaquetadoSinBasura.test.ts — EL CORTE NO DEJA FUGAS NI SE COME OBRA (v2.1.3)
 * ==================================================================================
 * POR QUÉ EXISTE
 * --------------
 * `tests/empaquetadoReceta.test.ts` vigila que la receta EXISTA y que sus patrones
 * estén escritos. Eso no alcanza: la v2.1.1 tenía los patrones escritos y el ZIP
 * firmado llevaba 5 fugas dentro, porque los patrones no casaban los nombres
 * reales (`.bak2-` con dígito en medio, `.bak.json` que no termina en `.bak`,
 * `.patch-zai.txt` que termina en `.txt`).
 *
 * La regla de la casa que salió de ese golpe: una valla textual es un espejo del
 * fuente, no una prueba del corte. Acá se importa la receta REAL y se le pasan
 * rutas reales — las que viajaron de verdad y las que no pueden dejar de viajar.
 *
 * QUÉ EXIGE
 * ---------
 * 1. `scripts/empaquetar.mjs` está versionado y exporta `debeViajar` (el nombre
 *    que importa `manifiesto.mjs`: si falta, el manifiesto no arranca).
 * 2. `debeViajar` RECHAZA la basura histórica, en la raíz y en subcarpetas.
 * 3. `debeViajar` ACEPTA el código legítimo: el corte no se come el proyecto.
 * 4. La lista de basura global no está vacía y cubre `.bak-`/`.bak` seco/`.patch-`.
 *
 * SI FALLA: el paquete viaja con basura (y la firma la firma) o, peor, deja de
 * viajar obra real — que es la clase de defecto que sólo se ve al abrir el ZIP.
 */
import * as assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..");
const rutaScript = path.join(raiz, "scripts", "empaquetar.mjs");

const casos: Array<{ nombre: string; fn: () => void | Promise<void> }> = [];
const prueba = (nombre: string, fn: () => void | Promise<void>) => casos.push({ nombre, fn });

let receta: any = null;
const cargar = async () => {
  if (!receta) receta = await import(pathToFileURL(rutaScript).href);
  return receta;
};

prueba("la receta de empaquetado está VERSIONADA en el repo (scripts/empaquetar.mjs)", async () => {
  assert.ok(existsSync(rutaScript), "NO EXISTE scripts/empaquetar.mjs: la receta vive fuera del repo");
  const fuente = readFileSync(rutaScript, "utf8");
  assert.ok(fuente.length > 500, "la receta existe pero está vacía o truncada");
  const m = await cargar();
  assert.equal(typeof m.debeViajar, "function", "la receta no exporta debeViajar (manifiesto.mjs lo importa)");
});

prueba("debeViajar rechaza la basura que viajó en la v2.1.0 (raíz y subcarpetas)", async () => {
  const { debeViajar } = await cargar();
  const basura = [
    // lo que el unzip -Z1 del paquete firmado mostró DENTRO de la v2.1.1
    path.join("scripts", "_retirar.mjs"),
    path.join("src", "engine", "rutasSistema.ts.bak2-20261101-181456"),
    path.join("src", "engine", "rutasSistema.ts.bak3-20261101-181532"),
    path.join("src", "engine", "rutasSistema.ts.bak4-20261101-181636"),
    path.join("vendor", "hindsight-agent-sdk", "package.v1166.bak.json"),
    // el .bak seco (sin guion ni extensión) que se colaba en la fusión
    path.join("scripts", "verificar-artefactos.mjs.bak"),
    path.join("server", "routers", "telemetria.ts.bak"),
    // parches a mano: terminan en .txt, así que un sufijo `.patch-` no los casa
    path.join("src", "components", "ApiKeyModal.tsx.patch-zai.txt"),
    // sondas y diarios de corrida
    path.join("_probe.mjs"),
    path.join("herramientas", "_diag.py"),
    path.join("runtime", "arranque.log"),
    path.join("build", "salida.tmp"),
    path.join("src", "engine", "notas.p.ts"),
    // artefactos de la herramienta de transporte (partes .bin + su manifiesto)
    path.join("parte01.bin"),
    path.join("parte02.bin"),
    path.join("MANIFIESTO-PARTES.json"),
    // basura de sistema y secretos
    path.join(".DS_Store"),
    path.join("config", ".env"),
    path.join("claves", "privada.pem"),
    // artefactos de build del proyecto
    path.join("dist", "server.mjs"),
    path.join("node_modules", "react", "index.js"),
    path.join("__pycache__", "x.cpython-312.pyc"),
    path.join(".git", "HEAD"),
  ];
  const fugas = basura.filter((r) => debeViajar(r) !== false);
  assert.deepEqual(fugas, [], "estas rutas VIAJAN y no deberían: " + fugas.join(", "));
  assert.ok(basura.length >= 19, "la lista de basura de la valla quedó corta (" + basura.length + ")");
});

prueba("debeViajar ACEPTA el código legítimo (no se come el proyecto)", async () => {
  const { debeViajar } = await cargar();
  const obra = [
    "server.ts",
    path.join("src", "engine", "cerebroOrgano.ts"),
    path.join("src", "engine", "rutasSistema.ts"),
    path.join("src", "engine", "backupHorario.ts"),
    path.join("server", "routers", "keys.ts"),
    path.join("scripts", "empaquetar.mjs"),
    path.join("scripts", "manifiesto.mjs"),
    path.join("docs", "patch-notas.md"),
    path.join("tests", "empaquetadoSinBasura.test.ts"),
    path.join("skills", "cn-docx", "SKILL.md"),
    // el SDK del vendor viaja CON su build: excluir `dist` por nombre suelto se
    // lo comió en la v1.57.14 y es la regla que dejó escrita verificar-empaque.mjs
    path.join("vendor", "hindsight-agent-sdk", "dist", "index.js"),
    path.join("extensions", "cn.demo", "dist", "y.js"),
  ];
  const comidos = obra.filter((r) => debeViajar(r) !== true);
  assert.deepEqual(comidos, [], "estas rutas NO viajan y son obra: " + comidos.join(", "));
});

prueba("la lista de basura global no está vacía y cubre .bak- y .patch-", async () => {
  // No se lee la forma del fuente: se prueba el EFECTO sobre los cuatro nombres
  // que la v2.1.2 declaró curados. Si alguien vacía la lista, esto se pone rojo.
  const { debeViajar, decideViaje } = await cargar();
  const curados = [
    path.join("x", "a.ts.bak-20260101-000000"),
    path.join("x", "a.ts.bak2-20260101-000000"),
    path.join("x", "a.json.bak"),
    path.join("x", "a.tsx.patch-zai.txt"),
  ];
  for (const r of curados) {
    assert.equal(debeViajar(r), false, r + " viaja: la lista global perdió su patrón");
    assert.ok(String(decideViaje(r).motivo || "").length > 0, r + " se rechaza sin motivo legible");
  }
  assert.equal(debeViajar(path.join("x", "a.ts")), true, "un .ts normal dejó de viajar");
});

let fallos = 0;
for (const c of casos) {
  try {
    await c.fn();
    console.log("  \u2713 " + c.nombre);
  } catch (e: any) {
    fallos++;
    console.log("  \u2717 " + c.nombre);
    console.log("    " + String(e?.message).split("\n").slice(0, 8).join("\n"));
  }
}
console.log(`\nempaquetadoSinBasura: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
