// scripts/preparar-vendor-3d.mjs — El motor 3D, en el lugar que ve el sandbox
// ===========================================================================
// QUÉ ES. `vendor/three/` vive en la INSTALACIÓN (viaja en el ZIP, versionado, con
// su licencia MIT). Pero el preview (`:3500`) resuelve los archivos contra la raíz
// de DATOS: `server/sandboxEstatico.ts:203` arma `bases = [raizEfectiva().dir,
// projectRoot]` y `projectRoot` es `PROJECT_ROOT = raizValidada.raiz`
// (`server.ts:713`), o sea `C:\Cerebronico`. Sin copiar, un
// `<script src="/vendor/three/three.module.js">` de un proyecto generado da 404 y
// la escena sale NEGRA sin explicación — el mismo "fallo mudo" que la casa viene
// curando en los espejos y en el lanzador.
//
// HACE UNA SOLA COSA: copiar y verificar. Idempotente (compara sha256, no
// «existe»), no borra nada del usuario, y sale con código != 0 si el resultado no
// quedó verificado — así lo pueden encadenar el `.bat`, el `.exe` y la skill sin
// creerse cuentos.
//
//   node scripts/preparar-vendor-3d.mjs              :: instala / actualiza
//   node scripts/preparar-vendor-3d.mjs --verificar  :: solo mira (no escribe)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, copyFileSync, readFileSync as LEER, statSync } from "node:fs";
import { join, sep } from "node:path";

const RAIZ_APP = process.cwd();
const SOLO_MIRA = process.argv.includes("--verificar");

/** La raíz de datos, con la misma precedencia que el lanzador y que server.ts. */
function raizDeDatos() {
  for (const candidato of [process.env.PROJECT_DIR, process.env.CEREBRONICO_DATOS, process.env.CN_PROJECT_DIR]) {
    if (candidato && String(candidato).trim()) return String(candidato).trim();
  }
  const home = process.env.USERPROFILE || process.env.HOME || ".";
  return join(home, "Cerebronico");
}

function sha256De(ruta) {
  return createHash("sha256").update(LEER(ruta)).digest("hex");
}

function main() {
  const manifiestoRuta = join(RAIZ_APP, "vendor", "three", "vendor-3d.json");
  if (!existsSync(manifiestoRuta)) {
    console.error("[FALLO] no está vendor/three/vendor-3d.json en " + RAIZ_APP);
    process.exit(1);
  }
  const manifiesto = JSON.parse(LEER(manifiestoRuta, "utf-8"));
  const destino = join(raizDeDatos(), "vendor", "three");
  let copiado = 0, ok = 0, mal = [];

  for (const [rel, hash] of Object.entries(manifiesto.archivos)) {
    const origen = join(RAIZ_APP, "vendor", "three", rel);
    const parada = join(destino, rel);
    if (!existsSync(origen)) { mal.push("falta en la instalación: " + rel); continue; }
    const actual = existsSync(parada) ? sha256De(parada) : null;
    if (actual === hash) { ok++; continue; }
    if (SOLO_MIRA) { mal.push(rel + " está distinto o ausente en el destino (dry-run)"); continue; }
    mkdirSync(parada.split(sep).slice(0, -1).join(sep), { recursive: true });
    copyFileSync(origen, parada);
    if (sha256De(parada) !== hash) { mal.push("la copia no verificó: " + rel); continue; }
    copiado++;
    console.log("[OK] " + rel + "  (" + Math.round(statSync(parada).size / 1024) + " KB)");
  }

  console.log(`[vendor:3d] three r${manifiesto.revision} · en destino ${destino}`);
  console.log(`[vendor:3d] verificados: ${ok} · copiados: ${copiado} · problemas: ${mal.length}`);
  for (const m of mal) console.error("  · " + m);
  if (mal.length) { console.error("[FALLO] el motor 3D NO quedó listo: una escena que importe 'three' va a dar 404 en el preview."); process.exit(1); }
  console.log(SOLO_MIRA ? "[OK] verificación: todo en su lugar." : "[OK] motor 3D listo para el sandbox.");
}

main();
