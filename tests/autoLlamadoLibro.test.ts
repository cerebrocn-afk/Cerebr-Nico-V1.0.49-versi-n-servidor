/**
 * tests/colaAutoLlamado.test.ts — EL LIBRO DEL LAZO (v2.3.4)
 * =========================================================
 * Se ejecuta con:  npx tsx tests/colaAutoLlamado.test.ts
 *
 * `autoLlamado.test.ts` prueba el CRITERIO (si hay que re-entrar o no). Esta suite
 * prueba el ESTADO que ese criterio necesita para no mentir: el contador por
 * conversación, las huellas del estancamiento, el interruptor persistido, la cola
 * cancelable y el techo de tiempo. Son las cuatro cosas que, si faltan, convierten
 * un "seguí automático" en un bucle sin libro.
 */
import {
  estadoInicial, registrarCierre, cancelarCola, setInterruptor, presupuestoAgotado,
  colaDe, cuentaDe, resumen, paraDisco, desdeDisco,
  PRESUPUESTO_CORRIDA_MS, MAX_CONVERSACIONES_MEMORIA, type EstadoCola,
} from "../src/engine/autoLlamado";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: unknown, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const LLAMAR = { accion: "llamar" as const, motivo: "quedan 2 tareas", mensaje: "seguí con la hoja de ruta", sello: "s1" };
const CALLAR = { accion: "callar" as const, motivo: "no hay trabajo pendiente", mensaje: null, sello: "s0" };

console.log("\n1) La voluntad: nadie enciende un lazo que quema crédito\n");
const e0 = estadoInicial();
c("el estado inicial está APAGADO", e0.activado === false);
c("y sin cuentas abiertas", Object.keys(e0.conversaciones).length === 0);
c("el tope viene del órgano, no se duplica acá", e0.tope > 0 && e0.tope <= 3);
c("apagar despeja lo encolado (la orden es «no gastes»)", (() => {
  let e = setInterruptor(e0, true, 10);
  e = registrarCierre(e, "c1", LLAMAR, 20);
  e = setInterruptor(e, false, 30);
  return cuentaDe(e, "c1")?.enCola === null && e.activado === false;
})());
c("apagar NO borra los llamados hechos (el tope no se evade apagando)", (() => {
  let e = setInterruptor(e0, true, 10);
  e = registrarCierre(e, "c1", LLAMAR, 20);
  e = setInterruptor(e, false, 30);
  return cuentaDe(e, "c1")?.llamados === 1;
})());

console.log("\n2) El costo: el contador cuenta re-entradas REALES\n");
let e = setInterruptor(e0, true, 0);
e = registrarCierre(e, "c1", LLAMAR, 10);
c("★ una decisión «llamar» sube el contador y encola el mensaje", cuentaDe(e, "c1")?.llamados === 1 && colaDe(e, "c1") === LLAMAR.mensaje);
c("y guarda la huella del trabajo (la materia prima del estancamiento)", cuentaDe(e, "c1")?.sellos.join(",") === "s1");
const antes = e;
e = registrarCierre(e, "c1", CALLAR, 20);
c("★ un «callar» NO gasta tope (si contara, una charla normal agotaría el lazo)", cuentaDe(e, "c1")?.llamados === 1);
c("el estado anterior no se mutó (dos requests, dos fotos distintas)", antes !== e && cuentaDe(antes, "c1")?.enCola?.mensaje === LLAMAR.mensaje);
e = registrarCierre(e, "c1", { ...LLAMAR, sello: "s2" }, 30);
c("la segunda huella se acumula en orden", cuentaDe(e, "c1")?.sellos.join(",") === "s1,s2");
c("conversaciones separadas no se pisan el contador", (() => {
  const con = registrarCierre(e, "c2", LLAMAR, 40);
  return cuentaDe(con, "c2")?.llamados === 1 && cuentaDe(con, "c1")?.llamados === 2;
})());

console.log("\n3) La cancelación: visible y cortable, pero cara\n");
let x = setInterruptor(e0, true, 0);
x = registrarCierre(x, "c1", LLAMAR, 10);
x = cancelarCola(x, "c1", 20);
c("★ cancelar saca el mensaje de la cola", colaDe(x, "c1") === null);
c("★ y NO perdona el llamado: si se perdonara, el tope se evade con un clic", cuentaDe(x, "c1")?.llamados === 1);
c("cancelar dos veces no hace nada raro", cancelarCola(x, "c1", 30) === x);
const baseVacia = setInterruptor(e0, true, 0);
c("cancelar una conversación inexistente no inventa estado", cancelarCola(baseVacia, "fantasma", 5) === baseVacia);

console.log("\n4) El presupuesto de tiempo (precedente: ouroboros, 15 min secuestrados)\n");
c("a los 9 min la corrida sigue viva", presupuestoAgotado(x, "c1", 9 * 60_000) === false);
c("★ pasado el presupuesto se agotó: el lazo se rinde con causa", presupuestoAgotado(x, "c1", PRESUPUESTO_CORRIDA_MS + 5_000) === true);
c("un «callar» reinicia la corrida (el reloj no se arrastra de la tarea anterior)", (() => {
  const y = registrarCierre(x, "c1", CALLAR, 11 * 60_000);
  return presupuestoAgotado(y, "c1", 11 * 60_000 + 1000) === false;
})());
c("el techo es explícito, no un número suelto", PRESUPUESTO_CORRIDA_MS === 600_000);

console.log("\n5) El disco: se escribe, se lee, y la basura no contamina\n");
const roundtrip = desdeDisco(paraDisco(x));
c("ida y vuelta conserva interruptor, contador y cola", roundtrip.activado === x.activado && cuentaDe(roundtrip, "c1")?.llamados === 1);
c("el JSON escrito vuelve a leerse IGUAL (no hay estado que solo existe en RAM)", paraDisco(roundtrip) === paraDisco(desdeDisco(paraDisco(roundtrip))));
c("texto basura → estado inicial, no un lazo a medias", desdeDisco("no era json {{{").activado === false && Object.keys(desdeDisco("{{{").conversaciones).length === 0);
c("null / vacío → estado inicial", desdeDisco(null).activado === false && desdeDisco("").tope > 0);
c("un entero en el contador se limpia (entrada hostil: `\"llamados\": \"muchos\"`)", (() => {
  const sucio = desdeDisco(JSON.stringify({ activado: true, conversaciones: { a: { llamados: "muchos", sellos: "no-array" } } }));
  return cuentaDe(sucio, "a")?.llamados === 0 && cuentaDe(sucio, "a")?.sellos.length === 0;
})());
c("el resumen del panel solo lista lo que tiene algo que decir", resumen(x).length === 1 && resumen(estadoInicial()).length === 0);

console.log("\n6) Memoria acotada (el lazo no es un archivo que crece forever)\n");
{
  let grande: EstadoCola = setInterruptor(e0, true, 0);
  for (let i = 0; i < MAX_CONVERSACIONES_MEMORIA + 25; i++) grande = registrarCierre(grande, `c${i}`, LLAMAR, i);
  c("★ no pasa el techo de conversaciones recordadas", Object.keys(grande.conversaciones).length <= MAX_CONVERSACIONES_MEMORIA, String(Object.keys(grande.conversaciones).length));
  c("la conversación recién tocada sobrevive al podado", !!cuentaDe(grande, `c${MAX_CONVERSACIONES_MEMORIA + 24}`));
}

console.log("\n" + "─".repeat(56));
console.log(`═══ COLA DEL AUTOLLAMADO (v2.3.4): ${correctas} correctas · ${fallos.length} fallos ═══`);
console.log("─".repeat(56));
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }
