/**
 * tests/reescrituraIdenticaCircuito.test.ts — npx tsx tests/reescrituraIdenticaCircuito.test.ts
 *
 * v1.60.17 — CIRCUITO DE REESCRITURA IDÉNTICA (regresión del BUCLE RUNAWAY
 * real, sesión pacman del 20/10). El modelo reescribía index.html / style.css /
 * script.js byte-a-byte IGUALES a disco; el Quirófano los rechazaba con
 * «REESCRITURA IDÉNTICA», pero como el modelo ROTABA entre los tres archivos,
 * el lazo suave (que solo cuenta la MISMA clave name:args CONSECUTIVA) nunca
 * llegaba al umbral: el turno giraba hasta que el watchdog cortaba a los 180 s,
 * los mensajes se apilaban y el audio de ambiente sonaba en bucle.
 *
 * Garantías (puras: sin red, sin fs):
 *  1) esRechazoReescrituraIdentica() reconoce el rechazo del Quirófano.
 *  2) El contador POR TURNO cuenta esos rechazos en CUALQUIER archivo (no
 *     consecutivos) y corta al llegar a TOPE_REESCRITURA_IDENTICA.
 *  3) El lazo suave CONSECUTIVO no habría cortado la rotación (por eso hace
 *     falta este circuito).
 *  4) cierrePorReescrituraIdentica() nombra los archivos y pide qué cambiar.
 */
import {
  esRechazoReescrituraIdentica,
  cierrePorReescrituraIdentica,
  TOPE_REESCRITURA_IDENTICA,
} from "../src/engine/cicloHerramientasOpenAICompat";

let ok = 0;
let fail = 0;
function af(nombre: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${nombre}`); }
  else { fail++; console.error(`  \u2717 ${nombre}`); }
}

console.log("reescrituraIdenticaCircuito \u2014 el bucle de reescritura id\u00e9ntica se corta");

// Rechazo REAL del Quir\u00f3fano tal como llega envuelto en el resultado de la herramienta.
const rechazoQf = JSON.stringify({
  ok: false,
  error:
    "REESCRITURA ID\u00c9NTICA: lo que quer\u00edas escribir es byte a byte lo que YA est\u00e1 en disco. " +
    "El cambio no cambi\u00f3 nada y el error del usuario sigue intacto.",
});
const exitoNormal = JSON.stringify({ ok: true, bytes: 1234 });

// 1) Detecci\u00f3n
af("detecta el rechazo del Quir\u00f3fano", esRechazoReescrituraIdentica(rechazoQf) === true);
af("tolera acentos y may\u00fasculas (REESCRITURA IDENTICA)", esRechazoReescrituraIdentica("algo REESCRITURA IDENTICA algo") === true);
af("un \u00e9xito normal NO es rechazo", esRechazoReescrituraIdentica(exitoNormal) === false);
af("una entrada no-string no rompe", esRechazoReescrituraIdentica(undefined as any) === false);

// 2) El circuito POR TURNO: mismo cableado que server/cicloOpenAICompat.ts.
//    El modelo ROTA entre tres archivos, cada uno rechazado una vez por vuelta.
const rotacion = ["index.html", "style.css", "script.js", "index.html", "style.css", "script.js"];
let reescrituras = 0;
const rutas: string[] = [];
let corteEn = -1;
for (let i = 0; i < rotacion.length; i++) {
  // cada paso devuelve el rechazo del Quir\u00f3fano para ESE archivo
  if (esRechazoReescrituraIdentica(rechazoQf)) {
    reescrituras++;
    rutas.push(rotacion[i]);
    if (reescrituras >= TOPE_REESCRITURA_IDENTICA) { corteEn = i; break; }
  }
}
af("el tope por defecto es 3", TOPE_REESCRITURA_IDENTICA === 3);
af("corta en el 3\u00ba rechazo aunque sean archivos DISTINTOS", corteEn === TOPE_REESCRITURA_IDENTICA - 1);
af("no deja girar hasta el watchdog (no recorre toda la rotaci\u00f3n)", corteEn < rotacion.length - 1);

// 3) El lazo suave CONSECUTIVO (clave name:args) NO habr\u00eda cortado la rotaci\u00f3n:
//    cada clave cambia en cada paso, as\u00ed que el contador consecutivo se reinicia.
let maxConsecutivo = 1;
let consec = 1;
for (let i = 1; i < rotacion.length; i++) {
  if (rotacion[i] === rotacion[i - 1]) { consec++; maxConsecutivo = Math.max(maxConsecutivo, consec); }
  else consec = 1;
}
af("el lazo suave consecutivo nunca habr\u00eda llegado al umbral (por eso hace falta el circuito)", maxConsecutivo < TOPE_REESCRITURA_IDENTICA);

// 4) El cierre honesto
const cierre = cierrePorReescrituraIdentica(rutas);
af("el cierre nombra al menos un archivo", /index\.html|style\.css|script\.js/.test(cierre));
af("el cierre pide se\u00f1alar qu\u00e9 cambiar o cambiar de modelo", /cambiar|se\u00f1al|modelo/i.test(cierre));
af("el cierre deduplica rutas repetidas", (() => {
  const c = cierrePorReescrituraIdentica(["a.ts", "a.ts", "a.ts"]);
  return (c.match(/a\.ts/g) || []).length === 1;
})());
af("el cierre acota la lista a 5 archivos", (() => {
  const muchas = ["1", "2", "3", "4", "5", "6", "7"].map((n) => `f${n}.ts`);
  const c = cierrePorReescrituraIdentica(muchas);
  return !/f6\.ts|f7\.ts/.test(c);
})());

console.log(`\nResultado: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
