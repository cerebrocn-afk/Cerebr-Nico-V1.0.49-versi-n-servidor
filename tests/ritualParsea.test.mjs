/**
 * tests/ritualParsea.test.mjs — EL RITUAL TIENE QUE PODER EJECUTARSE (v2.2.7)
 * ---------------------------------------------------------------------------
 * El 03/11 Mario corrió `npm run validar` en la v2.2.6 y recibió:
 *   scripts/validar.mjs:236  SyntaxError: Unexpected token '{'
 * Dos entradas que registré yo cerraban en `}` en vez de `},`. El paquete
 * instalaba y compilaba perfecto; lo único roto era EL VERIFICADOR, que es el que
 * avisa de todo lo demás. Y `censoSuites` no lo podía detectar porque vive adentro
 * del ritual: si el ritual no parsea, la valla que se queja tampoco corre.
 *
 * Esta valla corre `node --check` sobre el ritual y sobre todos los .mjs del repo.
 * Cuesta milisegundos y se corre en la Pre-entrega, no sólo dentro del ritual.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const absoluto = (rel) => `${RAIZ}/${rel}`;

let ok = 0;
const fallas = [];
function prueba(nombre, fn) {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallas.push(`${nombre} → ${e && e.message ? e.message : e}`);
    console.log(`  ✗ ${nombre} — ${e && e.message ? e.message : e}`);
  }
}

function chequear(rel) {
  const abs = absoluto(rel);
  if (!existsSync(abs)) throw new Error(`no existe ${rel}`);
  const r = spawnSync(process.execPath, ["--check", abs], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${rel} no parsea: ${String(r.stderr || "").split("\n").slice(0, 3).join(" | ")}`);
  }
}

const leer = (rel) => readFileSync(absoluto(rel), "utf8").split("\r\n").join("\n");

const mjs = [];
for (const carpeta of ["scripts", "tests"]) {
  for (const f of readdirSync(absoluto(carpeta))) {
    if (f.endsWith(".mjs")) mjs.push(`${carpeta}/${f}`);
  }
}

console.log("── ritualParsea ──");

prueba("★ scripts/validar.mjs PARSEA (el error que llegó a la máquina de Mario)", () => chequear("scripts/validar.mjs"));

prueba("★ cada entrada de la lista de suites cierra con `},` (la coma que faltó)", () => {
  const lineas = leer("scripts/validar.mjs").split("\n");
  const malas = [];
  lineas.forEach((l, i) => {
    const m = l.match(/^\s*\{\s*id:\s*"([^"]+)"/);
    if (!m) return;
    const sig = (lineas[i + 1] || "").trim();
    const cierra = sig.startsWith("];") || sig.startsWith("]");
    if (!l.trimEnd().endsWith("},") && !cierra) malas.push(`línea ${i + 1} · ${m[1]}`);
  });
  if (malas.length) throw new Error(`entradas sin coma: ${malas.join(" · ")}`);
});

prueba(`★ los ${mjs.length} archivos .mjs de scripts/ y tests/ parsean`, () => {
  const rotos = [];
  for (const rel of mjs) {
    try {
      chequear(rel);
    } catch (e) {
      rotos.push(e.message);
    }
  }
  if (rotos.length) throw new Error(`\n     ${rotos.join("\n     ")}`);
});

prueba("★ ningún .mjs usa require() sin createRequire (el paquete es type:module)", () => {
  const dudosos = mjs.filter((rel) => {
    const t = leer(rel);
    return /(^|[^.\w])require\s*\(/.test(t) && !t.includes("createRequire");
  });
  if (dudosos.length) throw new Error(`require() directo en ESM: ${dudosos.join(", ")}`);
});

prueba("los scripts críticos están en su sitio", () => {
  for (const rel of ["scripts/validar.mjs", "scripts/empaquetar.mjs", "scripts/manifiesto.mjs", "scripts/superficie.mjs", "scripts/sonda-arranque.mjs"]) {
    if (!existsSync(absoluto(rel))) throw new Error(`falta ${rel}`);
  }
});

console.log(`═══ ritualParsea: ${ok} correctas · ${fallas.length} fallidas ═══`);
if (fallas.length) {
  for (const f of fallas) console.error(" ·", f);
  process.exit(1);
}
