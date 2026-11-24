/**
 * cuerpoPlegado.test.ts — v1.99.0 · EL CUERPO DE LA BURBUJA NO ES EL TALLER
 * =========================================================================
 * Pedido del 31/10: «implementar RESUMIR y DEJAR PENSAMIENTO EN VENTANA DEBAJO,
 * mencionar pasos, explicaciones o preguntas, pero TODO el pensamiento que quede en
 * segundo plano con el DESPLEGABLE». Las dos capturas del 31/10 mostraban en el cuerpo
 * del chat cosas como «Hay 7 procesos node, pero ninguno es hijo claro de la
 * validación… Cambio de enfoque: mato ese proceso muerto…» o «La consola es cp1252 y el
 * log tiene UTF-8. Fuerzo la salida a ASCII seguro.».
 *
 * Lo que NO hice: un clasificador nuevo de «esto es pensamiento». `dividirVozSimple`
 * (v1.92.0) ya parte el mensaje en {resumen, pensamiento} para las dos bocas de voz,
 * con umbral honesto (280 caracteres) y reglas de no-desdoblar (ecléctico y denso ya
 * tienen las suyas). La pantalla se sienta DETRÁS de ese mismo corte: si mañana el
 * criterio cambia, cambian juntas la voz y la pantalla. Una verdad, una función.
 *
 * Y el plegado dice CUÁNTO guarda («▸ el paso a paso (1.204 caracteres)»): esconder
 * historial sin número — o sin reemplazo — es la mentira por omisión que la casa viene
 * persiguiendo desde v1.84.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dividirVozSimple, esMensajeDenso, LARGO_MINIMO_DOS_BOCAS } from "../src/utils/chatResultados";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf8") : "");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

// ── 1 · el criterio, con la bañera REAL de la captura del 31/10 ──────────────
const bano = [
  "Hay 7 procesos node, pero ninguno es hijo claro de la validación. El `cmd /c npm` probablemente quedó esperando entrada o `npm` no resolvió. Cambio de enfoque: mato ese proceso muerto y lanzo la validación con `node` directo, capturando salida en tiempo real.",
  "Lanzado con `node` directo (PID 3564). Espero y mido el log, que ahora sí debería crecer.",
  "Ahora sí escribe: 563 bytes. Leo lo que lleva.",
  "La consola es cp1252 y el log tiene UTF-8. Fuerzo la salida a ASCII seguro.",
  "La validación arrancó y está en la fase tipos (tsc). Es la más lenta. Espero y vuelvo a medir.",
  "Resumen: el ritual quedó verde con 9908 comprobaciones y 0 fallos; el árbol está sano para seguir construyendo encima.",
].join("\n\n");

console.log("\n1) El corte: el cuerpo se queda con lo que el modelo cerró\n");
const corte = dividirVozSimple(bano);
c("\u2605 de la bañera de la captura, el cuerpo pasa a ser el cierre", !!corte && corte.resumen.startsWith("Resumen: el ritual"), (corte?.resumen || "").slice(0, 60));
c("\u2605 el proceso queda ÍNTEGRO en el pliegue (no se borra ni se reescribe una línea)",
  !!corte && corte.pensamiento.includes("cp1252") && corte.pensamiento.includes("PID 3564"));
c("el pensamiento es textualmente todo lo anterior (la interfaz no resume por las dudas)",
  /^Hay 7 procesos node/.test(corte?.pensamiento || ""));
c("la suma de las dos piezas es el mensaje, sin huecos",
  (corte?.pensamiento.length || 0) + (corte?.resumen.length || 0) >= bano.replace(/\n\n/g, "").length - 4);

console.log("\n2) Cuándo NO se pliega (plegar lo que no es proceso es decorado)\n");
c("charla corta: sin plegado, sin botón fantasma", dividirVozSimple("Listo, quedó verde el ritual.") === null);
c("el umbral es el mismo que usa la voz (una sola regla para las dos bocas y la pantalla)",
  LARGO_MINIMO_DOS_BOCAS === 280 && dividirVozSimple("a".repeat(LARGO_MINIMO_DOS_BOCAS - 1)) === null);
const denso = "```ts\nconst ritual = true;\n```\n\n" + "x".repeat(400) + "\n\nY con esto el ritual quedó verde.";
c("informe DENSO sigue con su propio plegado de vallas (no se le encima un segundo criterio)",
  esMensajeDenso(denso) ? dividirVozSimple(denso) === null : true);

console.log("\n3) El cable: `CuerpoMensaje` es la puerta única y se sienta sobre el corte\n");
const cc = leer("src/components/ChatCenter.tsx");
const i = cc.indexOf("const CuerpoMensaje");
// (v1.99.3) antes esto era `cc.slice(i, i + 3200)`: una ventana fija que cualquier
// comentario nuevo empujaba fuera y ponía roja una guarda que estaba bien. La ventana
// ahora es el propio componente, de ancla a ancla.
const puerta = i > 0 ? cc.slice(i, cc.indexOf("const ToolRow", i) > i ? cc.indexOf("const ToolRow", i) : i + 9000) : "";
c("existe la puerta única del cuerpo y es la que decide el plegado", i > 0 && /dividirVozSimple\(cuerpo\)/.test(puerta));
c("el cuerpo visible es el CIERRE", /<ProsaLegible texto=\{dosBocas\.resumen\}/.test(puerta));
// v2.3.3 · la valla estaba clavada a la FRASE «el paso a paso (…)». Lo que defiende
// es la PROPIEDAD: que lo plegado declare CUÁNTOS caracteres esconde, para que
// esconder no pueda convertirse en desaparecer. El usuario pidió además que el
// rótulo diga QUÉ es el bloque («pensamiento en detalle»), así que el conteo se
// exige literal y el rótulo se admite en cualquiera de las dos formas vivas.
c("\u2605 lo plegado queda tras un <details> que dice CUÁNTOS caracteres guarda",
  /<details/.test(puerta) && /\$\{dosBocas\.pensamiento\.length\} caracteres/.test(puerta));
c("\u2605 v2.3.3 · y el rótulo dice QUÉ es el bloque plegado, no solo cuánto mide",
  /pensamiento en detalle/.test(puerta));
c("\u2605 durante el streaming NO se pliega: el texto está naciendo y plegarlo lo haría saltar",
  /if \(dosBocas && !streaming\)/.test(puerta));
c("el denso no se lo roba antes (el corte se pregunta sólo si no hay vallas)",
  /denso \? null : dividirVozSimple\(cuerpo\)/.test(puerta));
c("y lo que no es proceso sigue pintándose ENTERO, sin botón que prometa un pliegue vacío",
  /if \(!segmentos\) \{[\s\S]{0,900}<ProsaLegible texto=\{cuerpo\}/.test(cc));

console.log(`\n\u2550\u2550\u2550 CUERPO PLEGADO (v1.99.0): ${correctas} correctas \u00b7 ${fallos.length} fallidas \u2550\u2550\u2550`);
if (fallos.length) { console.log("\nFALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
