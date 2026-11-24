/**
 * colaVoces.test.ts — v1.99.9 · LA LISTA DE VOCES NO QUEDA VACÍA PARA SIEMPRE
 * ===========================================================================
 * «La función de TTS no abre el cambiador de voces» tuvo dos causas distintas y sólo una estaba
 * arreglada: la tarjeta se recortaba al otro lado de la pantalla (v1.97.0/v1.98.0) y, además, la
 * lista venía VACÍA porque el componente sólo escuchaba `voiceschanged`. Si el navegador ya había
 * publicado las voces antes de montar —o directamente no dispara el evento en esa sesión— el
 * usuario veía un cambiador sin cambiador y sin una sola palabra que lo explicara.
 *
 * Se congela la forma del reintento (escalera corta, con techo y con retiro dicho en voz alta) y el
 * cable: que se sondea, que se limpia el temporizador, y que NUNCA se sondea en segundo plano.
 */
import {
  decidirReintentoVoces, rotuloEstadoVoces, escaleraCreciente, ESPERAS_REINTENTO_MS,
} from "../src/engine/colaVoces";
import { readFileSync } from "node:fs";

let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " -> " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};
const leer = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n1) La escalera: corta, creciente y con fondo\n");
c("\u2605 hay sondeos pero tiene techo (no se martilla al navegador para siempre)",
  ESPERAS_REINTENTO_MS.length >= 2 && ESPERAS_REINTENTO_MS.length <= 6, String(ESPERAS_REINTENTO_MS.length));
c("son crecientes: el último es el más espaciado", escaleraCreciente());
c("y ninguno se pasa de tres segundos (la tarjeta no puede quedar 'pensando' una eternidad)",
  ESPERAS_REINTENTO_MS.every((ms) => ms > 0 && ms <= 3000));

console.log("\n2) Cuándo NO se hace nada (y por qué eso también es una decisión)\n");
const conVoces = decidirReintentoVoces({ voces: 12, intentosHechos: 0, abierto: true, soporta: true });
c("\u2605 con voces publicadas no se sondea ni se molesta al usuario", conVoces.accion === "nada" && rotuloEstadoVoces(conVoces, 12) === "");
const cerrado = decidirReintentoVoces({ voces: 0, intentosHechos: 0, abierto: false, soporta: true });
c("con la tarjeta CERRADA no se sondea en segundo plano (esa es la clase de ruido que mata el teclado)",
  cerrado.accion === "nada" && /cerrada/.test(cerrado.motivo), cerrado.motivo);
const sinApi = decidirReintentoVoces({ voces: 0, intentosHechos: 0, abierto: true, soporta: false });
c("si el navegador no expone la API se desiste de una, no cuatro veces",
  sinApi.accion === "desistir" && /s\u00edntesis de voz/.test(sinApi.motivo), sinApi.motivo);

console.log("\n3) Cuándo se busca, y hasta cuándo\n");
const primero = decidirReintentoVoces({ voces: 0, intentosHechos: 0, abierto: true, soporta: true });
c("\u2605 abierta y vacía: reintentar con la primera espera de la escalera",
  primero.accion === "reintentar" && primero.esperaMs === ESPERAS_REINTENTO_MS[0] && primero.intento === 1);
c("cada intento usa su propio escalón (no se repite el mismo intervalo)",
  ESPERAS_REINTENTO_MS.every((ms, i) => decidirReintentoVoces({ voces: 0, intentosHechos: i, abierto: true, soporta: true }).esperaMs === ms));
const ultimo = decidirReintentoVoces({ voces: 0, intentosHechos: ESPERAS_REINTENTO_MS.length - 1, abierto: true, soporta: true });
c("el último escalón es el más largo y aún así avisa que es el último",
  ultimo.esperaMs === ESPERAS_REINTENTO_MS[ESPERAS_REINTENTO_MS.length - 1] && ultimo.intento === ESPERAS_REINTENTO_MS.length);
const agotado = decidirReintentoVoces({ voces: 0, intentosHechos: ESPERAS_REINTENTO_MS.length, abierto: true, soporta: true });
c("\u2605 agotada la escalera: desistir CON MOTIVO y número de sondeos (el retiro se dice)",
  agotado.accion === "desistir" && agotado.motivo.includes(String(ESPERAS_REINTENTO_MS.length)), agotado.motivo);

console.log("\n4) Lo que ve el usuario\n");
c("mientras busca: cuántas veces buscó, no un spinner mudo",
  /sondeo 1\/\d/.test(rotuloEstadoVoces(primero, 0)), rotuloEstadoVoces(primero, 0));
c("cuando desiste: dice que la automática habla igual (no deja la sensación de botón roto)",
  /autom\u00e1tica/.test(rotuloEstadoVoces(agotado, 0)), rotuloEstadoVoces(agotado, 0));
c("y si el navegador no soporta, el rótulo es el motivo, no una promesa de búsqueda",
  /s\u00edntesis de voz/.test(rotuloEstadoVoces(sinApi, 0)));

console.log("\n5) Forma y cable\n");
// Pureza medida SOBRE EL CÓDIGO: la explicación de qué NO hace el módulo menciona a los
// temporizadores a propósito, y una valla que se prende contra la prosa termina apagada por
// alguien que no tenía nada que ver con el asunto. Se sacan los comentarios y recién se cuenta.
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const organo = sinComentarios(leer("src/engine/colaVoces.ts"));
c("órgano puro: sin fs, sin red, sin reloj y sin temporizadores (quien programa el timeout es el cable)",
  !/node:fs|node:http|Date\.now|new Date\(|setTimeout|setInterval/.test(organo), organo.match(/setTimeout|setInterval|Date\./g)?.join(",") || "");
const sel = leer("src/components/TtsSelector.tsx");
c("\u2605 el cable consulta el criterio en vez de re-inventar la escalera",
  /decidirReintentoVoces\(\{/.test(sel) && !/ESPERAS_REINTENTO_MS\[/.test(sel));
c("\u2605 el timeout se limpia: desmontar o cambiar de estado no deja un sondeo huérfano",
  /clearTimeout\(id\)/.test(sel));
c("no hay reintento con setInterval para las voces (eso sería un lazo sin fondo)",
  !/setInterval\([^)]*getVoices/.test(sel));
c("el rótulo se pinta: la tarjeta habla cuando no tiene nada para mostrar",
  /rotuloEstadoVoces\(decisionVoces, vocesSistema\.length\)/.test(sel));

const veredicto = `\n=== COLA DE VOCES (v1.99.9): ${ok} correctas - ${mal.length} fallidas ===`;
console.log(veredicto);
if (mal.length) {
  console.log("");
  console.log("FALLOS:");
  for (const f of mal) console.log("  FALLO -> " + f);
  process.exit(1);
}
