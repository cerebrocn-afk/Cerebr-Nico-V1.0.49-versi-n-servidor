/**
 * tests/censoSuites.test.mjs — NINGUNA SUETE VIVA FUERA DEL RITUAL (v1.84.0)
 * =========================================================================
 * La pregunta de Mario 27/10: «verificadas por suite suelta: pueden haber
 * huerfanas?». Hoy la cuenta da 202<->202; esta valla hace que MAANA tambien:
 * un .test.* en tests/ sin registrar en validar.mjs jamas corre (huerfana), y
 * una entrada del ritual sin archivo es un fantasma. Las dos direcciones, con
 * nombre y apellido en el rojo.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const casos = [];
const prueba = (n, f) => casos.push({ n, f });

prueba("censo de suites: disco y ritual baten en las dos direcciones", () => {
  const testsDir = path.join(RAIZ, "tests");
  const enDisco = fs.readdirSync(testsDir).filter((f) => /\.test\.(ts|mjs|js)$/.test(f));
  const validar = fs.readFileSync(path.join(RAIZ, "scripts", "validar.mjs"), "utf8");
  const registradas = new Set();
  for (const m of validar.matchAll(/archivo:\s*"tests\/([^"]+)"/g)) registradas.add(m[1]);
  const huerfanas = enDisco.filter((f) => !registradas.has(f)).sort();
  const fantasmas = [...registradas].filter((f) => !enDisco.includes(f)).sort();
  assert.deepStrictEqual(huerfanas, [], "suites que existen y NUNCA corren en el ritual: " + huerfanas.join(", "));
  assert.deepStrictEqual(fantasmas, [], "registradas en el ritual sin archivo: " + fantasmas.join(", "));
  assert.ok(enDisco.length >= 200, "el censo no puede leerse con el padron vacio: " + enDisco.length);
});

let fallos = 0;
for (const c of casos) {
  try { c.f(); console.log("  \u2713 " + c.n); }
  catch (e) { fallos++; console.log("  \u2717 " + c.n); console.log("    " + String(e?.message).split("\n").slice(0, 3).join("\n")); }
}
console.log(`\ncensoSuites: ${casos.length - fallos}/${casos.length} OK`);
process.exit(fallos ? 1 : 0);
