/**
 * tests/lanzadorRepliegue.test.ts — QUE EL .BAT DEJE DE SER UN MISTERIO (v2.3.7)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/lanzadorRepliegue.test.ts
 *
 * El pedido del 4/11, textual: «he tenido problemas con el iniciar_todo_windows,
 * se cae y tengo que usar npm run dev». Dos cosas hacían eso inreportable:
 *
 *   · el `.bat` elegía un modo rápido y, si fallaba, moría en el diagnóstico de
 *     siempre (puertos / node_modules / PATH) sin intentar lo único que siempre
 *     funciona: `npm run dev`;
 *   · y la elección se basaba en si `dist/` EXISTE, no en si está A TIEMPO — o sea
 *     que un `dist/server.mjs` de otra era podía gobernar la apertura mientras el
 *     log contaba lo que hizo el binario viejo.
 *
 * Esta suite no prueba gusto: prueba que el repliegue existe, que es de UNA vez
 * (un lazo de reintentos sobre un puerto ocupado es el infierno), que la guarda de
 * antigüedad solo puede BAJAR de categoría (nunca subir), y que el diagnóstico
 * ejecuta y nombra los SIETE puertos.
 *
 * CORRECCIÓN DE LA PROPIA VALLA (v2.3.12): esta suite exigía SEIS y estaba bien
 * escrita contra un informe que ya era corto. `PORTS` declara siete desde v2.0
 * (:5103 entró con el motor del cerebro) y la valla lo fijó en seis porque copió
 * la lista del script en vez de copiarla de la fuente. Es la lección del turno:
 * una valla que lee una lista a mano certifica la lista, no la verdad. Ahora se
 * exige el cruce del script contra `src/constants.ts` y el conteo sale de ahí.
 */
import { existsSync, readFileSync as _r, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath as _f, fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos = [];
const c = (que, ok, detalle) => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const bat = leer("iniciar_todo_windows.bat");
const diag = leer("scripts/arranque-diagnostico.mjs");
const pkg = leer("package.json");

console.log("\n1) La guarda de antigüedad: un dist viejo no gobierna la apertura\n");
c("existe la comparación por fecha contra server.ts", /dir \/b \/o-d/.test(bat) && /dist\\server\.mjs" "%~dp0server\.ts/.test(bat));
c("★ el único cambio que hace es BAJAR de categoría (start → dev:sin-vite), nunca subir",
  /if not "%CN_ABRIR%"=="start" goto :dist_a_tiempo/.test(bat) && /set "CN_ABRIR=sin-vite"/.test(bat) && !/set "CN_ABRIR=start"/.test(bat.split(":dist_a_tiempo")[1] || ""));
c("y se DICE en el log por qué se bajó (no es un cambio silencioso)", /el paquete rapido esta/.test(bat) && /que recompila antes de abrir/.test(bat));
c("hay salida explícita para el desarrollador que sabe que su dist está bien", /CN_FORCAR_START/.test(bat));

console.log("\n2) El repliegue: una vez, y anunciado\n");
const iReint = bat.indexOf(":abrir_reintento");
c("★ existe la etiqueta de repliegue", iReint > 0);
c("los dos modos rápidos caen ahí en vez de morir directo", (bat.match(/goto :abrir_reintento/g) || []).length === 2);
c("★ el modo lento NO se reintenta a sí mismo (sería un lazo sobre :3000 ocupado)",
  /if "%CN_ABRIR%"=="dev" goto :dev_fallo/.test(bat));
c("el reintento anuncia el código con el que falló el modo elegido", /fallo con codigo %errorlevel%/.test(bat));
c("y fija el modo a dev ANTES de volver a llamar (una sola pasada)", /set "CN_ABRIR=dev"\r?\nset "CN_ABRIR_SCRIPT=dev"/.test(bat));
c("`call npm run dev` sigue existiendo (la valla del server en :3000 depende de esa cadena)", /call npm run dev\r?\n/.test(bat));
c("el mensaje de cierre sigue nombrando el script que de verdad corrió", /"npm run %CN_ABRIR_SCRIPT%" termino/.test(bat));

console.log("\n3) El diagnóstico: los SIETE puertos, verificados contra la fuente\n");
c("★ el script existe y está declarado en package.json", existsSync(path.join(RAIZ, "scripts/arranque-diagnostico.mjs")) && /arranque:diagnostico/.test(pkg));
// La lista de referencia NO se copia del script: se lee de `src/constants.ts`, que
// es la semilla. Si mañana `PORTS` declara ocho puertos, esta valla pide ocho.
const puertosSemilla = (() => {
  const src = leer("src/constants.ts");
  const bloque = src.match(/export const PORTS\s*=\s*\{([\s\S]*?)\n\}\s*as const/);
  // `CLAVE: número` solo, de inicio a fin de línea. Un `:\s*(\d{3,5})` suelto
  // también se tragaba el «:5100» que aparece dentro del comentario del motor del
  // cerebro y devolvía ocho puertos: una valla con el conteo inflado aprueba
  // cualquier cosa. Mismo criterio que `scripts/arranque-diagnostico.mjs`.
  return bloque ? [...bloque[1].matchAll(/^[ \t]*[A-Z][A-Z0-9_]*[ \t]*:[ \t]*(\d{3,5})[ \t]*,?[ \t]*$/gm)].map((m) => Number(m[1])) : [];
})();
c("★ src/constants.ts declara SIETE puertos", puertosSemilla.length === 7, `declara ${puertosSemilla.length}: ${puertosSemilla.join(",")}`);
for (const p of puertosSemilla) {
  c("  puerto :" + p + " listado con su rol", new RegExp("\\{\\s*p:\\s*" + p + ",\\s*rol:").test(diag));
}
c("★ el informe lista exactamente los de la semilla: ni uno más ni uno menos",
  (diag.match(/\{\s*p:\s*\d{4,5},\s*rol:/g) || []).length === puertosSemilla.length,
  `el script lista ${(diag.match(/\{\s*p:\s*\d{4,5},\s*rol:/g) || []).length} · la semilla ${puertosSemilla.length}`);
c("★ y el script se AUTO-CRUZA contra `PORTS` al correr (la lista ya no puede envejecer sola)",
  /function puertosDeConstants/.test(diag) && /src\/constants\.ts/.test(diag) && /ESTÁ VIEJA/.test(diag));
c("el título dice «LOS SIETE PUERTOS»: un título corto también es deriva",
  /LOS SIETE PUERTOS/.test(diag) && !/LOS SEIS PUERTOS/.test(diag));
c("chequea que package.json y VERSION_SEMVER coincidan (la prueba de la entrega vieja)", /VERSION_SEMVER/.test(diag) && /DISTINTAS/.test(diag));
c("dice si dist/ está a tiempo y qué haría el lanzador HOY", /EL PAQUETE RÁPIDO ESTÁ VIEJO/.test(diag) && /QUÉ HARÍA EL LANZADOR/.test(diag));
c("no escribe nada en disco (es un espejo, no un instalador)", !/writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync/.test(diag));
c("la suite está registrada en la valla maestra", leer("scripts/validar.mjs").includes("lanzadorRepliegue.test.ts"));

console.log("\n" + "─".repeat(56));
console.log(`LANZADOR Y REPLIEGUE (v2.3.7): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
