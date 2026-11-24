/**
 * tests/reavivarServicio.test.ts — EL REANIMADO QUE NO EXISTÍA (v2.3.1)
 * =====================================================================
 * Se ejecuta con:  npx tsx tests/reavivarServicio.test.ts
 *
 * La evidencia está en el arranque real del 3/11 (`NUEVO LOG V2`), transcripta:
 *
 *   [supervisor] «front» (:3000) no contesta → reanimo, intento 1 de 3
 *   "v" no se reconoce como un comando interno o externo,
 *   programa o archivo por lotes ejecutable.
 *   [ERROR] "npm run dev" termino con codigo 9009.
 *
 * El 9009 de cmd es «no existe ese comando». El nombre reportedo es `"v"`, que es
 * lo que deja de ser `vite` cuando la línea llega a `cmd /c` CON comillas anidadas:
 * las reglas de `/s` de cmd solo limpian las comillas exteriores si la línea no
 * trae comillas adentro. Y todas las líneas que reanima el supervisor traen.
 *
 * Este archivo congela la forma del reanimado: el comando vive en un archivo, el
 * shell recibe UNA sola ruta, y ninguna línea compuesta viaja por `shell: true`.
 */
import {
  construirShimReavivado,
  extensionShim,
  interpretarComando,
  citarSiHaceFalta,
  lineaPeligrosa,
} from "../src/engine/reavivarServicio";
import { SERVICIOS_VENTANA } from "../src/engine/arranqueVentanas";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos: string[] = [];
function c(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
}

console.log("\n1) Citar: lo justo, una sola vez\n");

c("una ruta con espacio se cita", citarSiHaceFalta("C:\\Program Files\\py.exe") === '"C:\\Program Files\\py.exe"');
c("una ruta sin espacio NO se cita (cit de más también rompe)", citarSiHaceFalta("ollama") === "ollama");
c("lo que ya viene citado no se vuelve a citar", citarSiHaceFalta('"C:\\a b\\py.exe"') === '"C:\\a b\\py.exe"');
c("la cadena vacía sigue vacía", citarSiHaceFalta("") === "");

console.log("\n2) `interpretar`: el .py pelado vuelve con su intérprete\n");

{
  const IT = "C:\\Users\\BirdBox\\Downloads\\CerebroNico-IDE-v2.0.0\\app\\runtime\\python-embed\\python.exe";
  const salida = interpretarComando("scripts\\hindsight_daemon.py --port 5100", IT);
  c("★ se pone el intérprete delante del .py", salida.startsWith(IT), salida);
  c("y el .py queda citado (es lo que el .bat hacía a mano)", /"scripts\\hindsight_daemon\.py"/.test(salida), salida);
  const conEspacio = interpretarComando("scripts\\creador_daemon.py --port 5102", "C:\\Cerebro IDE\\python.exe");
  c("★ un intérprete con ESPACIO se cita: si no, el comando se parte en dos",
    conEspacio.startsWith('"C:\\Cerebro IDE\\python.exe"'), conEspacio);
  c("sin intérprete conocido, comportamiento viejo (no se inventa uno)",
    interpretarComando("scripts\\x.py", "") === "scripts\\x.py");
  c("un comando que ya arranca con el intérprete no se duplica",
    interpretarComando(IT + " scripts\\x.py", IT) === IT + " scripts\\x.py");
  c("un comando sin .py no se toca", interpretarComando("ollama serve", IT) === "ollama serve");
}

console.log("\n3) EL SHIM: el comando adentro del archivo, una sola ruta afuera\n");

for (const s of SERVICIOS_VENTANA) {
  const shim = construirShimReavivado({
    id: s.id,
    comando: interpretarComando(s.comando, "C:\\runtime\\python-embed\\python.exe"),
    carpeta: "C:\\Cerebronico\\logs\\arranque",
    raizProyecto: "C:\\Users\\BirdBox\\Downloads\\CerebroNico-IDE-v2.0.0\\app",
    plataforma: "win32",
    comSpec: "C:\\Windows\\System32\\cmd.exe",
    sep: "\\",
  });
  c(`★ «${s.id}»: argv no contiene el comando del servicio`,
    !shim.argv.some((a) => a.includes(s.comando.split(" ")[0] + " ") || a.includes("npm run dev") || a.includes("--port")),
    JSON.stringify(shim.argv));
  c(`«${s.id}»: argv es una sola ruta de shim (sin línea compuesta)`,
    shim.argv.length === 3 && shim.argv[2] === `"C:\\Cerebronico\\logs\\arranque\\reavivar-${s.id}.cmd"`,
    JSON.stringify(shim.argv));
  c(`«${s.id}»: el comando vive en el archivo, con CRLF`,
    shim.contenido.includes(s.comando.split(" ")[0]) && shim.contenido.includes("\r\n"));
  c(`«${s.id}»: la salida va al log que el aviso promete`, shim.contenido.includes(`${s.id}.log`));
  c(`★ «${s.id}»: lo que recibe cmd NO tiene comillas anidadas (el 9009)`,
    !lineaPeligrosa(shim.argv[shim.argv.length - 1]), shim.argv[2]);
  c(`«${s.id}»: el exe es cmd.exe configurable`, shim.exe === "C:\\Windows\\System32\\cmd.exe");
}

{
  const posix = construirShimReavivado({
    id: "memoria", comando: "python3 scripts/hindsight_daemon.py --port 5100",
    carpeta: "/datos/logs/arranque", raizProyecto: "/app", plataforma: "posix",
  });
  c("en POSIX el shim es un .sh ejecutable con shebang", posix.nombre === "reavivar-memoria.sh" && posix.contenido.startsWith("#!/bin/sh"));
  c("y se lo pasa por argv a /bin/sh, nunca como línea al shell", posix.exe === "/bin/sh" && posix.argv.length === 1);
  c("la extensión sigue a la plataforma", extensionShim("win32") === "cmd" && extensionShim("posix") === "sh");
  c("una carpeta con `/` al final no arma `//` en la ruta", !construirShimReavivado({
    id: "x", comando: "y", carpeta: "/datos/logs/arranque/", raizProyecto: "/app", plataforma: "posix",
  }).log.includes("//"));
}

console.log("\n4) La detección del peligro, congelada\n");

c("una línea compuesta con comillas adentro es la que rompe",
  lineaPeligrosa('"C:\\py.exe" "scripts\\x.py" --port 5100') === true);
c("una línea sin comillas es segura para el shell", lineaPeligrosa("ollama serve") === false);
c("UNA ruta sola, aunque esté citada, no es una línea compuesta",
  lineaPeligrosa('"C:\\Cerebronico\\logs\\arranque\\reavivar-memoria.cmd"') === false);

console.log("\n5) El cable: el supervisor ya no llama al shell con la línea\n");

const sup = leer("server/routers/supervisorArranque.ts");
c("★ el reanimado de fábrica usa el shim puro, no la línea cruda",
  /construirShimReavivado\(\{/.test(sup) && /spawn\(shim\.exe, shim\.argv/.test(sup));
c("★ el spawn del shim va con `shell: false` (si fuera true, el defecto vuelve)",
  /spawn\(shim\.exe, shim\.argv, \{\s*\n?\s*shell: false/.test(sup.replace(/\r/g, "")));
c("y con `windowsVerbatimArguments`, para que Node no re-escape las comillas puestas",
  /windowsVerbatimArguments: true/.test(sup));
// v1.0.23 · MÁS ESTRICTA QUE ANTES: el rescate ya no es `shell: true` (era el
// 9009 otra vez); ahora es argv con `shell: false` y el log del servicio, más la
// evidencia del intento. Se exige CERO `shell: true` en el código (los
// comentarios sí lo nombran: son la memoria del defecto).
{
  const soloCodigo = sup.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  c("★ ningún camino usa `shell: true` (el rescate pasó a argv, no a la línea)",
    (soloCodigo.match(/shell: true/g) || []).length === 0, (soloCodigo.match(/shell: true/g) || []).length + " ocurrencias");
  c("y el rescate sin shim se avisa y se lanza por argv con el log del servicio",
    /se intenta el camino viejo/.test(sup) && /lanzarPorArgv\(partirComando\(ruta\), logServicio\)/.test(sup));
}
c("los shims viven en la raíz de DATOS, junto al log prometido",
  /carpetaShims = \(\) => path\.join\(deps\.raizDatos \|\| deps\.raizProyecto, "logs", "arranque"\)/.test(sup));
c("cada reanimado identifica al servicio (un shim por servicio, no uno anónimo)",
  /reanimar\(s\.comando, s\.id\)/.test(sup) && /reanimar\(s!\.comando, s!\.id\)/.test(sup));
c("la valla no se apaga borrando la suite", leer("scripts/validar.mjs").includes("reavivarServicio.test.ts"));

console.log("\n" + "─".repeat(56));
console.log(`═══ REAVIVAR SERVICIOS (v2.3.1): ${correctas} correctas · ${fallos.length} fallos ═══`);
console.log("─".repeat(56));
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
