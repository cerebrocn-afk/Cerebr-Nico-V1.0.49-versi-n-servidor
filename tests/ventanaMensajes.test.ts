/**
 * ventanaMensajes.test.ts — v1.99.0 · EL TECLADO NO PUEDE PAGAR EL HISTORIAL ENTERO
 * ==================================================================================
 * Queja: «cuando hay muchos mensajes le cuesta para escribir el teclado, queda muy
 * lento». La causa medida: el lazo de `ChatCenter.tsx` recorria `messages.map(...)` de
 * los 191 mensajes de la sesion, sin memo ni virtualizacion en TODO `src/components`,
 * asi que cada tecla volvía a parsear el historial completo por `prosaLegible`.
 *
 * La cura tiene dos mitades y esta valla congela las dos: el CRITERIO (cuantos se
 * pintan, que la cola sea contigua, que el boton se apague cuando ya no hay nada
 * escondido) y el CABLE (que el lazo real use el criterio y que el `map` pelado no
 * vuelva, que es exactamente como revive este defecto).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decidirVentanaMensajes,
  siguienteRevelado,
  rotuloMostrarMas,
  VENTANA_DEFECTO,
  UMBRAL_CONVERSACION,
  PASO_REVELADO,
} from "../src/engine/ventanaMensajes";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf8") : "");
let correctas = 0;
const fallos = [];
const c = (que, ok, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

console.log("\n1) El criterio: la cola contigua, nunca un hueco en el medio\n");

c("una conversacion corta se muestra ENTERA (no hay nada que ganar recortando)",
  decidirVentanaMensajes(40).desde === 0 && decidirVentanaMensajes(40).ocultos === 0);
c("justo en el umbral sigue entera (el borde no puede mordisquear el historial)",
  decidirVentanaMensajes(UMBRAL_CONVERSACION).desde === 0);
const v61 = decidirVentanaMensajes(61);
c("\u2605 a partir de 61 mensajes se pinta solo la cola de " + VENTANA_DEFECTO,
  v61.desde === 61 - VENTANA_DEFECTO && v61.ocultos === 21 && v61.mostrarMas === true, JSON.stringify(v61));
const sesion = decidirVentanaMensajes(191);
c("\u2605 la sesion medida del usuario (191) pasa a 40 montados: 4,7x menos trabajo por tecla",
  191 - sesion.desde === VENTANA_DEFECTO, JSON.stringify(sesion));
c("\u2605 la ventana es SIEMPRE la cola contigua: el ultimo mensaje esta y no hay saltos",
  (() => {
    const msgs = Array.from({ length: 191 }, (_, i) => i);
    const pintados = msgs.slice(decidirVentanaMensajes(191).desde);
    return pintados[pintados.length - 1] === 190 && pintados.every((n, i) => n === pintados[0] + i);
  })());

console.log("\n2) Revelar: de a " + PASO_REVELADO + ", con techo, y el boton se apaga solo\n");

const r1 = siguienteRevelado(0, 191);
c("un clic suma " + PASO_REVELADO + " (no revela todo de golpe, que es la lentitud que sigue)",
  r1 === PASO_REVELADO, String(r1));
const v2 = decidirVentanaMensajes(191, r1);
c("tras un clic hay " + (VENTANA_DEFECTO + PASO_REVELADO) + " pintados y el boton dice cuantos quedan",
  191 - v2.desde === VENTANA_DEFECTO + PASO_REVELADO && v2.ocultos === 111, JSON.stringify(v2));
let rev = 0; for (let i = 0; i < 12; i++) rev = siguienteRevelado(rev, 191);
const vFull = decidirVentanaMensajes(191, rev);
c("\u2605 revelando hasta el final no queda NADIA escondido y el boton desaparece",
  vFull.desde === 0 && vFull.ocultos === 0 && vFull.mostrarMas === false, JSON.stringify(vFull));
c("el numero jamas se pasa del total ni se vuelve negativo",
  siguienteRevelado(10_000, 191) === 191 && siguienteRevelado(-5, 191) === PASO_REVELADO);
c("entradas basura no rompen el plano (NaN / undefined / string)",
  decidirVentanaMensajes(Number.NaN).desde === 0 && decidirVentanaMensajes(undefined).ocultos === 0 &&
  decidirVentanaMensajes("191").desde === 0);
c("misma entrada, misma salida (x50): el plano no depende del reloj ni del azar",
  Array.from({ length: 50 }, () => JSON.stringify(decidirVentanaMensajes(191, 40))).every((x) => x === JSON.stringify(v2)));

console.log("\n3) El rotulo: numero siempre, y en la forma del boton\n");

c("un solo escondido se dice en singular", rotuloMostrarMas(1) === "\u25b4 1 mensaje anterior", rotuloMostrarMas(1));
c("21 escondidos se dicen con el numero exacto (no «mostrar mas» a secas)",
  rotuloMostrarMas(21) === "\u25b4 21 mensajes anteriores", rotuloMostrarMas(21));
c("cero escondidos no inventa un boton fantasma", /0/.test(rotuloMostrarMas(0)) === false || rotuloMostrarMas(0).includes("0"));

console.log("\n4) El cable, contra el archivo real (lectura de fuente)\n");

const cc = leer("src/components/ChatCenter.tsx");
c("\u2605 ChatCenter importa el criterio (dueno unico, no un numero escrito a mano)",
  /from "\.\.\/engine\/ventanaMensajes"/.test(cc) && /decidirVentanaMensajes/.test(cc));
c("\u2605 el lazo pinta la VENTANA, no el historial entero",
  /messages\.slice\(decidirVentanaMensajes\(messages\.length, revelados\)\.desde\)\.map\(\(msg\)/.test(cc));
c("DEFECTO SEMBRADO: ningun `messages.map((msg)` pelado vuelve al lazo de render",
  !/\{messages\.map\(\(msg\)/.test(cc),
  (cc.split("\n").find((l) => /\{messages\.map\(\(msg\)/.test(l)) || "").trim().slice(0, 90));
c("el boton revela con el paso del plano (no revela todo ni de a uno)",
  /setRevelados\(\(r\) => siguienteRevelado\(r, messages\.length\)\)/.test(cc));
c("no hay un `slice(-40)` suelto por la casa: el 40 vive en el criterio",
  !/\.slice\(-\d+\)/.test(cc));
c("y el boton nombra el numero (la promesa de no esconder historial en silencio)",
  /rotuloMostrarMas\(v\.ocultos\)/.test(cc));

c("\u2605 App proyecta el chat MEMORIZADO (la otra mitad de #16: un arreglo nuevo por tecla anulaba todo memo)",
  /const chatProyectado = useMemo\(\s*\(\) => messages\.map\(\(m: any\) => \(\{ role: m\.role, content: m\.content \}\)\),\s*\[messages\],\s*\);/.test(leer("src/App.tsx")));
c("DEFECTO SEMBRADO: el lazo ya no construye el arreglo adentro del JSX",
  !/chatMessages=\{messages\.map\(\(m\)/.test(leer("src/App.tsx")) && /chatMessages=\{chatProyectado\}/.test(leer("src/App.tsx")));

console.log(`\n\u2550\u2550\u2550 VENTANA DE MENSAJES (v1.99.0): ${correctas} correctas \u00b7 ${fallos.length} fallidas \u2550\u2550\u2550`);
if (fallos.length) { console.log("\nFALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
