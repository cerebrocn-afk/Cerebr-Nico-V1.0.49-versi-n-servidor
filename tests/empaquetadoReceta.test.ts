/**
 * tests/empaquetadoReceta.test.ts — LA RECETA DE EMPAQUETADO TIENE QUE ESTAR EN EL REPO (v2.1.2)
 * ==============================================================================================
 * POR QUÉ EXISTE
 * --------------
 * La v2.1.1 se empaquetó con un script que vivía SOLO en la instalación
 * (`C:\Users\BirdBox\Downloads\CerebroNico-IDE-v2.0.0\app\scripts\empaquetar.mjs`),
 * fuera del árbol que se versiona. Consecuencia medida: dos pipelines distintos
 * firmaron la MISMA versión con hashes distintos (5a266196… con 2176 entradas
 * frente a 49c0530e… con 2161), y ninguno de los dos pudo ver el defecto del otro
 * porque cada uno se auto-validaba contra su propia receta.
 *
 * Y el corte `.bak` que yo daba por hecho: el artefacto salió limpio, pero la
 * RECETA que lo producía no estaba en el repo. Un ✅ sobre el artefacto no es un
 * ✅ sobre el proceso. Esta valla vigila el proceso.
 *
 * QUÉ EXIGE
 * ---------
 * 1. `scripts/empaquetar.mjs` EXISTE dentro del árbol (no en la instalación).
 * 2. Su lista de exclusión cubre `.bak-*` a CUALQUIER profundidad (no solo raíz).
 * 3. Cubre `.patch-*` a cualquier profundidad.
 * 4. Cubre `.p.ts` (archivo suelto en la raíz).
 * 5. Cubre los scripts de sonda: `_probe`, `_prueba`, `_verif`, `_recall`, `_ingesta`.
 * 6. Cubre los artefactos de build: `node_modules`, `dist`, `.git`, `__pycache__`.
 * 7. La exclusión es GLOBAL, no anclada a la raíz (el bug de la v2.1.0: 34 fugas
 *    en subcarpetas porque los patrones vivían en BASURA_RAIZ).
 *
 * SI FALLA: la receta no está versionada. Empaquetar desde otro sitio reintroduce
 * el bug del otro árbol y nadie lo ve.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..");
const rutaScript = path.join(raiz, "scripts", "empaquetar.mjs");

const casos: Array<{ nombre: string; fn: () => void | Promise<void> }> = [];
const prueba = (nombre: string, fn: () => void | Promise<void>) => casos.push({ nombre, fn });

let fuente = "";
prueba("scripts/empaquetar.mjs EXISTE en el árbol versionado", () => {
  assert.ok(
    fs.existsSync(rutaScript),
    "NO EXISTE " + rutaScript + " — la receta vive fuera del repo (el defecto de la v2.1.1)",
  );
  fuente = fs.readFileSync(rutaScript, "utf8");
  assert.ok(fuente.length > 500, "el script existe pero está vacío o truncado");
});

prueba("la receta excluye .bak-* (el corte que la v2.1.1 no tenía en el repo)", () => {
  assert.ok(fuente.length > 0, "sin fuente: el script no existe");
  assert.ok(
    /\.bak-/.test(fuente),
    "la lista de exclusión NO menciona .bak- : los respaldos viajarían al ZIP",
  );
});

prueba("la receta excluye .patch-* a cualquier profundidad", () => {
  assert.ok(fuente.length > 0, "sin fuente");
  assert.ok(/\.patch-/.test(fuente), "falta .patch- (ApiKeyModal.tsx.patch-zai.txt viajó en la v2.1.0)");
});

prueba("la receta excluye .p.ts (archivo suelto en la raíz)", () => {
  assert.ok(fuente.length > 0, "sin fuente");
  assert.ok(/\.p\\?\.ts/.test(fuente), "falta el patrón .p.ts");
});

prueba("la receta excluye los scripts de sonda (_probe/_prueba/_verif/_recall/_ingesta)", () => {
  assert.ok(fuente.length > 0, "sin fuente");
  for (const p of ["_probe", "_prueba", "_verif", "_recall", "_ingesta"]) {
    assert.ok(fuente.includes(p), "falta el patrón " + p + " (7 scripts de sonda viajaron en la v2.1.0)");
  }
});

prueba("la receta excluye los artefactos de build", () => {
  assert.ok(fuente.length > 0, "sin fuente");
  for (const p of ["node_modules", "dist", ".git", "__pycache__"]) {
    assert.ok(fuente.includes(p), "falta el patrón " + p);
  }
});

prueba("la exclusión es GLOBAL, no anclada a la raíz (el bug de las 34 fugas)", async () => {
  assert.ok(fuente.length > 0, "sin fuente");
  // La lista tiene que existir (es la que dice QUÉ se corta)...
  assert.ok(
    /SUFIJOS_EXCLUIDOS/.test(fuente),
    "no hay SUFIJOS_EXCLUIDOS: los patrones solo se aplican en la raíz y las subcarpetas fugan",
  );
  // ...y tiene que estar VIVA. Hasta la v2.1.2 esta valla miraba la FORMA
  // (`.includes(` en el texto) y por eso se puso roja cuando la receta pasó a
  // `endsWith`: una valla textual es un espejo del fuente, no una prueba del
  // corte. Ahora se importa la receta REAL y se le pasan rutas de SUBCARPETA.
  const mod: any = await import(pathToFileURL(rutaScript).href);
  const decide = mod.decideViaje ?? mod.debeViajar;
  assert.equal(
    typeof decide,
    "function",
    "la receta no exporta decideViaje/debeViajar: el corte no se puede probar por comportamiento",
  );
  const viaja = (rel: string) => {
    const r = decide(rel);
    return typeof r === "boolean" ? r : r?.viaja;
  };
  const basuraEnSubcarpeta = [
    path.join("src", "engine", "rutasSistema.ts.bak2-20261101-181456"),
    path.join("src", "engine", "rutasSistema.ts.bak3-20261101-181532"),
    path.join("src", "engine", "chat", "ApiKeyModal.tsx.patch-zai.txt"),
    path.join("src", "engine", "arranque.log"),
    path.join("vendor", "hindsight-agent-sdk", "package.v1166.bak.json"),
    path.join("scripts", "_retirar.mjs"),
    path.join("herramientas", "_probe.mjs"),
  ];
  for (const r of basuraEnSubcarpeta) {
    assert.equal(viaja(r), false, `${r} VIAJA: la exclusión no es global (el bug de las 34 fugas)`);
  }
  const obraEnSubcarpeta = [
    path.join("src", "engine", "rutasSistema.ts"),
    path.join("src", "engine", "backupHorario.ts"),
    path.join("docs", "patch-notas.md"),
    path.join("server", "routers", "keys.ts"),
    path.join("scripts", "empaquetar.mjs"),
    path.join("vendor", "hindsight-agent-sdk", "dist", "index.js"),
    path.join("extensions", "cn.demo", "dist", "y.js"),
  ];
  for (const r of obraEnSubcarpeta) {
    assert.equal(viaja(r), true, `${r} NO VIAJA: el corte se está comiendo obra`);
  }
});

let fallos = 0;
for (const c of casos) {
  try {
    await c.fn();
    console.log("  \u2713 " + c.nombre);
  } catch (e: any) {
    fallos++;
    console.log("  \u2717 " + c.nombre);
    console.log("    " + String(e?.message).split("\n").slice(0, 6).join("\n"));
  }
}
console.log(`\nempaquetadoReceta: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
