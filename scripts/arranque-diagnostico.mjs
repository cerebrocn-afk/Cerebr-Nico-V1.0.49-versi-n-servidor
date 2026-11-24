/*
 * scripts/arranque-diagnostico.mjs — LO QUE EL LANZADOR VE, EN UNA PANTALLADA
 * =========================================================================
 * Nace del pedido del 4/11: «he tenido problemas con el iniciar_todo_windows, se
 * cae y tengo que usar npm run dev». Mientras el diagnóstico sea «mirá la ventana
 * que se cerró», cada caída es inreportable: el usuario no puede decir qué vio y
 * quien arregla no puede reproducirlo.
 *
 * Esto imprime, en el mismo orden en que el `.bat` decide, las cuatro cosas que
 * producen el 90 % de las aperturas lentas o rotas:
 *
 *   1 · la versión instalada (package.json y VERSION_SEMVER tienen que coincidir —
 *       es la comprobación que discrimina "estoy sobre una entrega vieja")
 *   2 · qué hay en dist/ y si está A TIEMPO respecto de server.ts (un dist viejo
 *       hace que el log cuente lo que hizo un binario de otra era)
 *   3 · los SIETE puertos de la casa, escuchando o no
 *   4 · el script que el lanzador elegiría HOY, con el motivo, y qué variable lo
 *       cambiaría (CN_USAR_VITE / CN_FORCAR_START)
 *
 * Sin dependencias, sin redes contra servicios que pueden no estar, sin escribir
 * nada en disco. Se corre con:  npm run arranque:diagnostico
 */
import { existsSync as _no, existsSync, readFileSync as _no2, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath as _no3, fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Los SIETE puertos de la casa. No son cuatro, ni seis: son los que declara
 * `src/constants.ts`, y este script se verifica contra esa fuente abajo
 * (`puertosDeConstants`). La lista vivía en seis lugares escritos a mano y cada
 * uno envejecía por su lado — el defecto que Mario reportó el 6/11 («el arranque
 * no muestra los 7 puertos») era exactamente eso, pintado en la pantalla que se
 * ve primero.
 */
const PUERTOS = [
  { p: 3000, rol: "Front — la propia IDE (este proceso)" },
  { p: 3500, rol: "Backend de agentes / sandbox" },
  { p: 5000, rol: "Agente PC / puente" },
  { p: 5100, rol: "Memoria (hindsight)" },
  { p: 5102, rol: "Creador de sitios web" },
  { p: 5103, rol: "Motor del cerebro (cerebro_motor.py)" },
  { p: 11434, rol: "Ollama" },
];

/**
 * Lee `PORTS` de `src/constants.ts` sin importar TypeScript: este script corre con
 * `node` pelado, sin tsx y sin build. Devuelve los números declarados, o `[]` si
 * el archivo no está (y entonces la comprobación dice que no pudo comprobar, en
 * vez de fingir un verde).
 *
 * El patrón exige `CLAVE: número` al inicio de línea y hasta el fin de línea. No
 * vale un `matchAll(/:\s*(\d{3,5})/)` a secas: el propio bloque tiene un comentario
 * que dice «es un órgano DISTINTO del daemon :5100» y ese número lo leía como si
 * fuera una declaración — el analizador contaba ocho puertos y el ocho se veía
 * plausible. Medir con ruido es peor que no medir: da número.
 */
function puertosDeConstants() {
  try {
    const src = readFileSync(path.join(RAIZ, "src/constants.ts"), "utf8");
    const bloque = src.match(/export const PORTS\s*=\s*\{([\s\S]*?)\n\}\s*as const/);
    if (!bloque) return [];
    return [...bloque[1].matchAll(/^[ \t]*[A-Z][A-Z0-9_]*[ \t]*:[ \t]*(\d{3,5})[ \t]*,?[ \t]*$/gm)].map((m) => Number(m[1]));
  } catch {
    return [];
  }
}

const linea = (t) => console.log(t);
const titulo = (t) => linea("\n\u2550\u2550 " + t);

function version() {
  titulo("1 · VERSIÓN INSTALADA");
  let pkg = null, sem = null;
  try { pkg = JSON.parse(readFileSync(path.join(RAIZ, "package.json" ? "package.json" : "package.json"), "utf8")).version; } catch { }
  try { sem = (readFileSync(path.join(RAIZ, "src/constants.ts"), "utf8").match(/VERSION_SEMVER\s*=\s*"([^"]+)"/) || [])[1] || null; } catch { }
  linea("  package.json     : " + (pkg || "\u2014"));
  linea("  VERSION_SEMVER   : " + (sem || "\u2014"));
  if (pkg && sem && pkg !== sem) linea("  ✗ DISTINTAS: la entrega está a medias. No sigas: reinstalá el paquete.");
  else if (pkg && sem) linea("  ✓ coinciden");
  return { pkg, sem };
}

function estadoDist() {
  titulo("2 · CLIENTE Y SERVER COMPILADOS (dist/)");
  const idx = path.join(RAIZ, "dist", "index.html");
  const srv = path.join(RAIZ, "dist", "server.mjs");
  const fuente = path.join(RAIZ, "server.ts");
  const hay = (f) => existsSync(f);
  let tIdx = 0, tSrv = 0, tSrc = 0;
  try { tIdx = hay(idx) ? statSync(idx).mtimeMs : 0; } catch { }
  try { tSrv = hay(srv) ? statSync(srv).mtimeMs : 0; } catch { }
  try { tSrc = hay(fuente) ? statSync(fuente).mtimeMs : 0; } catch { }
  const f = (t) => (t ? new Date(t).toLocaleString() : "ausente");
  linea("  dist/index.html   : " + f(tIdx));
  linea("  dist/server.mjs   : " + f(tSrv));
  linea("  server.ts         : " + f(tSrc));
  const aTiempo = tSrv > 0 && tIdx > 0 && tSrv >= tSrc;
  if (!tIdx && !tSrv) linea("  → no hay nada compilado: el lanzador abre con Vite en el proceso (lento).");
  else if (!aTiempo) linea("  ✗ EL PAQUETE RÁPIDO ESTÁ VIEJO (server.ts es más nuevo que dist/server.mjs).");
  else linea("  ✓ a tiempo: se puede servir dist/ tal cual");
  return { hayDist: tIdx > 0, hayServer: tSrv > 0, aTiempo };
}

function puertos() {
  return new Promise((res) => {
    titulo("3 · LOS SIETE PUERTOS");
    const declarados = puertosDeConstants();
    if (declarados.length === 0) {
      linea("  ? no se pudo leer `PORTS` de src/constants.ts: la lista de abajo NO está verificada.");
    } else {
      const sobran = PUERTOS.map((s) => s.p).filter((p) => !declarados.includes(p));
      const faltan = declarados.filter((p) => !PUERTOS.some((s) => s.p === p));
      if (sobran.length || faltan.length) {
        linea("  ✗ LA LISTA DE ESTE SCRIPT ESTÁ VIEJA frente a src/constants.ts:");
        if (faltan.length) linea("     faltan : " + faltan.join(", "));
        if (sobran.length) linea("     sobran : " + sobran.join(", "));
      } else {
        linea("  ✓ los " + PUERTOS.length + " coinciden con `PORTS` de src/constants.ts");
      }
    }
    let falta = PUERTOS.length;
    const abiertos = [];
    for (const s of PUERTOS) {
      const sock = net.connect({ host: "127.0.0.1", port: s.p, timeout: 350 });
      const fin = (abierto) => {
        try { sock.destroy(); } catch { }
        linea("  " + (abierto ? "●" : "○") + " :" + String(s.p).padEnd(6) + (abierto ? "escuchando  " : "sin nada    ") + "· " + s.rol);
        if (abierto) abiertos.push(s.p);
        if (--falta === 0) res(abiertos);
      };
      sock.once("connect", () => fin(true));
      sock.once("timeout", () => fin(false));
      sock.once("error", () => fin(false));
    }
  });
}

function eleccion(dist, abiertos) {
  titulo("4 · QUÉ HARÍA EL LANZADOR AHORA");
  const forzarVite = process.env.CN_USAR_VITE === "1";
  const forzarStart = process.env.CN_FORCAR_START === "1";
  let script = "dev", porque = "no hay cliente ni server compilados: Vite transforma en el proceso";
  if (dist.hayDist) { script = "dev:sin-vite"; porque = "hay dist/index.html (ojo: este modo recompila el frente antes de abrir)"; }
  if (dist.hayDist && dist.hayServer && (dist.aTiempo || forzarStart)) { script = "start"; porque = "dist/ está a tiempo: node puro, sin tsx y sin Vite"; }
  if (dist.hayDist && dist.hayServer && !dist.aTiempo && !forzarStart) { script = "dev:sin-vite"; porque = "dist/ existe pero está VIEJO: se recompila antes de abrir"; }
  if (forzarVite) { script = "dev"; porque = "CN_USAR_VITE=1 (modo desarrollo, recarga en caliente)"; }
  linea("  npm run " + script + "  ← " + porque);
  if (!abiertos.includes(3000)) linea("  nota: :3000 está libre, así que la apertura no va a chocar con otra instancia.");
  else linea("  ✗ :3000 YA está ocupado: hay otra instancia de la IDE abierta. Cerrala antes de insistir.");
  if (!abiertos.includes(11434)) linea("  nota: Ollama (:11434) no responde — la interfaz abre igual, el vectorizador se difiere.");
  return script;
}

linea("\u2550\u2550 ARRANQUE · DIAGNÓSTICO \u2550\u2550 " + new Date().toLocaleString());
const v = version();
const dist = estadoDist();
const abiertos = await puertos();
const script = eleccion(dist, abiertos);
titulo("FIN");
linea("  Si algo de arriba no coincide con lo que viste en la ventana que se cerró,");
linea("  pegá ESTE informe completo: es exactamente lo que faltaba para diagnosticar.");
