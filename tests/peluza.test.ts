/**
 * peluza.test.ts — v1.99.0 · ORDEN EN LA CASA
 * ============================================
 * Pedido del 1/11: «QUITEMOS LA PELUSA, ORDEN EN LA CASA». Medido en el ZIP que yo
 * mismo le entregué a Mario el 31/10: **25 archivos de basura adentro** — mis logs de
 * corrida (`build-v197.log`, `gate-v197*.log`, `entregar-v196*.log`), el residuo de
 * pruebas `.vigilante/*.log`, y `__pycache__/*.pyc`. El embalador no tenía exclusión:
 * caminaba el árbol y metía todo.
 *
 * La valla no confía en la buena voluntad: (1) congela el criterio puro, (2) congela
 * que el `walk` y el `zip -x` comparten UN solo criterio (si filtraran distintos, el
 * control de `faltantes` pelearía con un fantasma — la misma clase de mentira que
 * `entregar.ts` ya documenta para `node_modules` como symlink), (3) congela que el
 * embalador SE NIEGA a firmar si la pelusa aparece dentro del zip, y (4) barre el
 * disco real: si mañana dejo un `gate-v2.0.log` en la raíz, esto se pone rojo.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esPelusa, esPelusaDeSesion, exclusionesZip, contarPelusa, CARPETAS_PELUZA } from "../src/engine/peluza";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf8") : "");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

console.log("\n1) El criterio: qué es residuo y qué es fuente\n");

for (const [rel, debe] of [
  ["build-v197.log", true],
  ["gate-final-v1863.log", true],
  [".tsc2.log", true],
  [".vigilante/roto.log", true],
  ["__pycache__/agent_bridge_5000.cpython-312.pyc", true],
  ["scripts/__pycache__/creador_daemon.cpython-312.pyc", true],
  // v1.99.0 · LA LECCIÓN DEL PAQUETE QUE NO QUISO SALIR: `dist` en la raíz es mi
  // build; `dist` adentro de `vendor/` es el producto de un SDK y tiene que viajar.
  // Mi primera lista lo trató igual en cualquier profundidad y la entrega se frenó.
  ["src/engine/peluza.ts.bak", false],
  ["agent_bridge_5000.py", false],
  ["package.json", false],
  ["CHANGELOG.md", false],
  ["iniciar_todo_windows.bat", false],
  ["tests/peluza.test.ts", false],
  ["vendor/hindsight-agent-sdk/package.json", false],
  ["vendor/hindsight-agent-sdk/dist/index.js", false],
  ["vendor/hindsight-agent-sdk/dist/index.d.ts", false],
  ["dist/server.mjs", true],
] as Array<[string, boolean]>) {
  c(`\u2605 ${rel} ${debe ? "es" : "NO es"} pelusa`, esPelusa(rel) === debe, `dijo ${esPelusa(rel)}`);
}
c("una ruta con backslashes de Windows se juzga igual", esPelusa("app\\__pycache__\\x.pyc") || esPelusa("__pycache__\\x.pyc"));
c("contarPelusa devuelve los nombres, no un n\u00famero m\u00e1gico (para poder nombrarlos en el error)",
  contarPelusa(["a.log", "b.ts", "__pycache__/c.pyc"]).length === 2);

console.log("\n2) Un solo criterio para los dos caminos (walk y zip)\n");

const emb = leer("scripts/entregar.ts");
const xs = exclusionesZip();
c("las carpetas prohibidas salen del mismo listado que filtra el walk",
  ["__pycache__", "node_modules"].every((d) => xs.includes(`app/${d}/*`) && xs.includes(`app/*/${d}/*`)) &&
  ["dist", ".cerebro-db"].every((d) => xs.includes(`app/${d}/*`) && !xs.includes(`app/*/${d}/*`)),
  xs.join(" "));
c("\u2605 el walk salta la pelusa ANTES de contarla como esperada (si no, `faltantes` pelea con un fantasma)",
  /if \(esPelusa\(rel\)\) \{ pelusa\.add\(rel\); continue; \}/.test(emb));
c("y el `zip` recibe las exclusiones derivadas del MISMO m\u00f3dulo, no literales sueltos",
  /exclusionesZip\(\)\.map/.test(emb) && /import \{ esPelusa, exclusionesZip, contarPelusa \} from "\.\.\/src\/engine\/peluza"/.test(emb));
c("\u2605 el embalador se NIEGA a firmar si la pelusa aparece dentro del zip",
  /la pelusa volvi\u00f3 al zip/.test(emb) && /salir\(/.test(emb));

console.log("\n3) El disco real, barrido (ac\u00e1 es donde se nota el desorden)\n");

const raizAbs = path.join(RAIZ);
const sobrantes: string[] = [];
const walk = (dir: string, pref = "") => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = pref ? `${pref}/${e.name}` : e.name;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (e.isDirectory()) {
      if (["node_modules", ".git", ".cerebro-db", "dist", ".proyectos"].includes(e.name)) continue;
      // Las carpetas de residuo (__) se saltean, no se contabilizan: Python las
      // vuelve a crear en cuanto corre una suite, y contarlas era el flaky que el
      // ritual del 1/11 me mostró en rojo. Lo que sí garantizamos es que no viajan
      // en el ZIP (exclusionesZip), y eso esta valla lo mira aparte.
      if (CARPETAS_PELUZA.includes(e.name)) continue;
      walk(path.join(dir, e.name), rel);
    } else if (e.isFile() && esPelusaDeSesion(rel)) sobrantes.push(rel);
  }
};
walk(raizAbs);
c("\u2605 en el \u00e1rbol no queda NINGUNA pelusa de sesi\u00f3n m\u00eda (logs de build/gate/entregar)", sobrantes.length === 0, sobrantes.slice(0, 6).join(", "));
c("★ el `__pycache__` se garantiza en el ZIP, no en el disco: las suites de Python lo vuelven a crear y una guarda que depende del ORDEN de las suites es un flaky disfrazado",
  exclusionesZip().includes("app/__pycache__/*") && esPelusa("__pycache__/x.pyc") && esPelusaDeSesion("__pycache__/x.pyc") === false);
c("la papelera est\u00e1 FUERA del \u00e1rbol empaquetable (nada se borr\u00f3 a sangre)",
  !existsSync(path.join(RAIZ, "papelera-peluza")));
c("los .log de mi sesi\u00f3n no est\u00e1n en la ra\u00edz", !existsSync(path.join(RAIZ, "build-v197.log")) && !existsSync(path.join(RAIZ, "gate-v1971.log")));

console.log(`\n\u2550\u2550\u2550 PELUZA (v1.99.0): ${correctas} correctas \u00b7 ${fallos.length} fallidas \u2550\u2550\u2550`);
if (fallos.length) { console.log("\nFALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
