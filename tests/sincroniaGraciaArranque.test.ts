/**
 * tests/sincroniaGraciaArranque.test.ts — EL BAT ESPERA LO MISMO QUE EL SUPERVISOR (v1.0.27)
 * =========================================================================================
 * Se ejecuta con:  npx tsx tests/sincroniaGraciaArranque.test.ts
 *
 * EL DEFECTO, medido el 17/11 en v1.0.26. Tres dueños del mismo puerto, cada uno
 * con su reloj:
 *
 *   supervisor  GRACIA_ARRANQUE_MS = 90 000 ms  (src/engine/arranqueVentanas.ts)
 *   BAT :11434  se rendía a los 20 s           (WAIT_COUNT geq 20)
 *   BAT :5103   se rendía a los 8 s            (MOTOR_WAIT geq 8)
 *
 * Ollama en frío tarda ~50 s (124 blobs). Con 20 s el lanzador declaraba «no
 * respondió» un puerto que estaba NACANDO, la IDE abría creyendo el :11434
 * muerto y, agotada la gracia del supervisor, aparecía un SEGUNDO
 * `ollama serve` sobre el mismo puerto. Eso era el «otro CMD de ollama» y el
 * «[supervisor] no contesta -> reanimo» repetido.
 *
 * LA REGLA QUE SE CONGELA ACÁ
 * ----------------------------
 *   1. la gracia es UN número, y el BAT lo lee de la misma fuente que el
 *      supervisor (GRACIA_ARRANQUE_MS / 1000), no de una constante paralela;
 *   2. el tope de los DOS sondeos del BAT es esa gracia, no un literal suelto;
 *   3. nadie se rinde antes: si el tope bajara de la gracia, el defecto vuelve;
 *   4. la casa del BAT se respeta: CRLF en todas las líneas, cero bloques `(`
 *      con echo/goto dentro, sin tildes — un lanzador que no corre no lanza nada.
 *
 * Es una VALLA DE TEXTO: no ejecuta el .bat (no hay Windows acá). Comprueba que
 * los números estén atados, que es lo que se podía desincronizar en silencio.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");
const leerCrudo = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p)) : Buffer.alloc(0));

let correctas = 0;
const fallos: string[] = [];
function c(que: string, ok: boolean, detalle = "") {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
}

const BAT = "iniciar_todo_windows.bat";
const bat = leer(BAT);
const batCrudo = leerCrudo(BAT);
const arranque = leer("src/engine/arranqueVentanas.ts");

console.log("\n1) La gracia es UN número y sale del supervisor\n");

const mGracia = arranque.match(/GRACIA_ARRANQUE_MS\s*=\s*([0-9_]+)/);
const graciaMs = mGracia ? Number(mGracia[1].replace(/_/g, "")) : NaN;
c("el supervisor declara GRACIA_ARRANQUE_MS (si se renombra, esta valla tiene que enterarse)",
  Number.isFinite(graciaMs) && graciaMs > 0, String(graciaMs));
c("★ la gracia del supervisor es de 90 s (el número que el BAT tiene que copiar)",
  graciaMs === 90000, `${graciaMs} ms`);

c("★ el BAT declara su propia gracia en SEGUNDOS y coincide con la del supervisor",
  bat.split("\r\n").some((l) => l.includes("set \"CN_GRACIA_ARRANQUE_S=") && l.includes(String(graciaMs / 1000))),
  `esperaba ${graciaMs / 1000}`);
c("★ y lo dice explícitamente: la gracia se copia de arranqueVentanas, no se elige acá",
  /GRACIA_ARRANQUE_MS = 90000/.test(bat) && /arranqueVentanas\.ts/.test(bat));
c("la gracia del BAT es movible por entorno (no hay que recompilar para subirla)",
  /if not defined CN_GRACIA_ARRANQUE_S set "CN_GRACIA_ARRANQUE_S=/.test(bat));
c("y queda en una variable de trabajo que usan los dos bucles",
  /set "GRACIA_ARRANQUE_S=%CN_GRACIA_ARRANQUE_S%"/.test(bat));

console.log("\n2) Los dos sondeos del BAT se rinden a la gracia, nunca antes\n");

const mOllama = bat.match(/if %WAIT_COUNT% geq (\S+) goto :ollama_tarde/);
const mMotor = bat.match(/if %MOTOR_WAIT% geq (\S+) goto :motor_tarde/);
c("el sondeo de :11434 tiene tope declarado (si desaparece, alguien lo desarmó)",
  !!mOllama, mOllama ? mOllama[1] : "sin tope");
c("el sondeo de :5103 tiene tope declarado", !!mMotor, mMotor ? mMotor[1] : "sin tope");
c("★ los DOS topes son la gracia del supervisor, no literales sueltos",
  mOllama?.[1] === "%GRACIA_ARRANQUE_S%" && mMotor?.[1] === "%GRACIA_ARRANQUE_S%",
  `${mOllama?.[1]} / ${mMotor?.[1]}`);
c("★ ningún sondeo se rinde antes que el supervisor (el defecto del 17/11)",
  !/geq 20 goto :ollama_tarde/.test(bat) && !/geq 8 goto :motor_tarde/.test(bat));
c("la ancla del puerto sigue siendo «:PORT » + LISTENING (no un ping a ciegas)",
  /findstr ":11434 " \| findstr "LISTENING"/.test(bat) &&
  /findstr ":%CN_MOTOR_PORT% " \| findstr "LISTENING"/.test(bat));
// v1.0.36 · el dueno unico se cuenta por `start`, no por la forma `/b` (que ya
// no se usa para el motor): UNA sola línea de arranque, y el resto de menciones
// son comentarios o el inventario de `ollama list`.
c("★ rendirse NO arranca un segundo dueño del puerto: no hay un segundo `ollama serve`",
  (bat.match(/^\s*start[^\r\n]*ollama serve/gm) || []).length === 1,
  `ollama serve: ${(bat.match(/ollama serve/g) || []).length} menciones, ${(bat.match(/^\s*start[^\r\n]*ollama serve/gm) || []).length} arranques`);
c("y el aviso final dice que el supervisor decide, con su motivo en el log",
  /gracia del supervisor/.test(bat) && /un solo dueno por puerto/.test(bat));

console.log("\n3) La casa del BAT: si no corre en Windows, la sincronía no sirve\n");

const saltos = batCrudo.filter((b) => b === 0x0a).length;
const crlf = batCrudo.toString("latin1").split("\r\n").length - 1;
c("todas las líneas terminan en CRLF (un .bat con LF puro no ejecuta)",
  crlf === saltos && crlf > 100, `LF=${saltos} CRLF=${crlf}`);
c("cero bloques `( ... )` con echo/goto dentro (regla del propio archivo)",
  !/^\s*\(/m.test(bat));
c("los comentarios nuevos no meten tildes ni eñes (cmd las rompe)",
  !/[áéíóúñÁÉÍÓÚÑ]/.test(
    bat.split("\r\n").filter((l) => /GRACIA|gracia|sondeo|Ollama no respondio|motor :/.test(l)).join("\n"),
  ));

console.log("\n" + "─".repeat(56));
console.log(`═══ SINCRONIA GRACIA/ARRANQUE (v1.0.27): ${correctas} correctas · ${fallos.length} fallos ═══`);
console.log("─".repeat(56));
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
