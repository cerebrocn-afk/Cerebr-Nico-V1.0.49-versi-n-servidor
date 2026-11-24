/**
 * parteAbordaje.test.ts — v1.94.2 · EL PARTE DEL MANUAL SE PUEDE LEER SIN ADIVINAR
 * ===============================================================================
 * Mario (30/10), señalando una línea de su propio log: «esto no sé qué es». La línea
 * decía, toda junta:
 *
 *   · INVARIANTE: con presupuesto 800 entran 102/102 nombres → OK · enviado 6085 chars (excedido: true)
 *
 * El `OK` hablaba del invariante real (apretar el presupuesto NO recorta herramientas);
 * el `excedido: true` del tamaño contra una SONDA de 800 que nunca fue el presupuesto de
 * envío. Dos afirmaciones distintas usando la misma palabra: un informe que no sirve
 * para decidir, porque parece que falló algo y a la vez que no falló nada.
 *
 * Se congela COMPORTANDO, no con grep de prosa: se llama al auditor real y se mira el
 * parte que devuelve.
 */
import { auditarManuales } from "../src/engine/abordaje";
import { TOOL_MANUALS } from "../src/engine/manuals";

let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};

const nombres = Object.keys(TOOL_MANUALS).slice(0, 40);
const aud = auditarManuales(nombres, {});
const partes = aud.parte.split("\n");
const lineaInvariante = partes.find((l) => l.includes("INVARIANTE")) || "";
const lineaPresupuesto = partes.find((l) => l.includes("PRESUPUESTO")) || "";

console.log("\n── §1 · LAS DOS AFIRMACIONES VIAJAN SEPARADAS");
c("el parte sigue nombrando el invariante y el catálogo", /INVARIANTE/.test(aud.parte) && /CATÁLOGO/.test(aud.parte));
c("★ la presión de presupuesto tiene su propia línea", lineaPresupuesto.length > 0);
c("★ la contradicción anterior ya no existe: `→ OK · enviado N chars (excedido: true)` en una sola frase", !/\(excedido: true\)/.test(lineaInvariante), lineaInvariante.slice(0, 180));
c("la línea del invariante dice lo que sostiene (no recortar herramientas)", /no recorta/.test(lineaInvariante) && /(OK|ROTO)/.test(lineaInvariante));
c("la línea de presupuesto explicita que exceder es la conducta elegida", /Exceder es la conducta elegida/.test(lineaPresupuesto));
c("y la magnitud se lee como razón, no como bool desnudo", /\d+(\.\d+)?×/.test(lineaPresupuesto), lineaPresupuesto.slice(0, 200));

console.log("\n── §2 · EL CAMPO QUE MENTÍA");
c("★ `charsIndice` mide el índice que se envía, no el de la sonda de 800", aud.charsIndice === Number((aud.parte.match(/índice (\d+) chars/) || [0, "0"])[1]), `${aud.charsIndice}`);
c("el invariante real sigue siendo el que era (nada recortado)", aud.invarianteOk === true);

console.log(`\n═══ parteAbordaje: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);
