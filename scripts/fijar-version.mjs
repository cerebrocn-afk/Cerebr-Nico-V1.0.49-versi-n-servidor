// scripts/fijar-version.mjs — LA SEMILLA EN UN LADO SOLO (v1.0.2)
// ============================================================================
// LA COMODIDAD QUE FALTA. El arbol tenia ocho .bat de un solo uso para cambiar
// el numero de version a mano (ACTUALIZAR-A-2.3.13/14/15/23, FIJAR-1.0.0,
// FIJAR-VERSION-1.0.0, build-2.3.14). Cada uno escribia el numero en varios
// espejos; cuando alguno se olvidaba de un archivo, `deriva-documental` cortaba
// la entrega por "contradiccion documental" y habia que descubrir cual falta.
//
// Este script hace UNA sola cosa: escribe la semilla en src/constants.ts
// (VERSION_SEMVER) y nada mas. Propagar los espejos ya lo hace
// `npm run deriva:fijar`, el derivador oficial de la casa.
//
//   node scripts/fijar-version.mjs         -> dice la semilla actual
//   node scripts/fijar-version.mjs 1.0.2   -> la fija
import { readFileSync, writeFileSync } from "node:fs";

const RUTA = "src/constants.ts";
const NUEVA = (process.argv[2] || "").trim();
const actual = readFileSync(RUTA, "utf-8");
const semilla = actual.match(/const VERSION_SEMVER = "([^"]+)";/);
if (!semilla) {
  console.error("[FALLO] no encuentro `const VERSION_SEMVER = \"...\"` en " + RUTA);
  process.exit(1);
}
if (!NUEVA) {
  console.log("[INFO] semilla actual: " + semilla[1] + " (en " + RUTA + ")");
  process.exit(0);
}
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(NUEVA)) {
  console.error("[FALLO] `" + NUEVA + "` no es MAJOR.MINOR.PATCH.");
  process.exit(1);
}
const futuro = actual.replace(/(const VERSION_SEMVER = ")[^"]+(";)/, "$1" + NUEVA + "$2");
if (futuro === actual) {
  console.log("[OK] la semilla ya era " + NUEVA + ": no se toco nada.");
  process.exit(0);
}
writeFileSync(RUTA, futuro, "utf-8");
console.log("[OK] semilla " + semilla[1] + " -> " + NUEVA);
console.log("[INFO] ahora falta propagar los espejos: npm run deriva:fijar");
