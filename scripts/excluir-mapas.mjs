// excluir-mapas.mjs — añade las exclusiones de sourcemaps al empaquetado.
// Idempotente: si ya están, no toca nada. No reordena el array.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ruta = path.join(raiz, "package.json");

const pkg = JSON.parse(readFileSync(ruta, "utf8"));
const files = pkg?.build?.files;

if (!Array.isArray(files)) {
  console.error("[ERROR] package.json no tiene build.files como array.");
  process.exit(1);
}

const ancla = files.indexOf("dist/**/*");
if (ancla < 0) {
  console.error("[ERROR] No encuentro el ancla \"dist/**/*\" en build.files.");
  process.exit(1);
}

const faltan = ["!dist/**/*.map", "!dist/*.meta.json"].filter((x) => !files.includes(x));
if (faltan.length === 0) {
  console.log("[OK] Las exclusiones ya estaban. Nada que hacer.");
  process.exit(0);
}

files.splice(ancla + 1, 0, ...faltan);
writeFileSync(ruta, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log("[OK] Añadidas: " + faltan.join(", "));
console.log("[OK] build.files ahora empieza con: " + JSON.stringify(files.slice(0, 5)));
