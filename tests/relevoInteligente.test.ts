/**
 * relevoInteligente.test.ts — v1.87.0 · ETAPA 1 (ideas de OmniRoute)
 * ==================================================================
 * Lo que hay que DEMOSTRAR (todo puro, sin red, sin fs, sin reloj real):
 *   BACKOFF ADAPTATIVO (← markModelAsProblematic):
 *     · el PRIMER fallo conserva el TTL por clase (no hay regresión)
 *     · cada reincidencia DUPLICA la pausa (exponencial)
 *     · el tope no se supera por más rachas que haya (no desborda a Infinity)
 *     · el piso se respeta aunque el ttl base sea ridículo
 *     · entradas basura (NaN, negativos) no rompen: caen a valores sanos
 *   REPARTO DE VOCES (← comboResolver):
 *     · `prioridad` devuelve el primero (comportamiento histórico)
 *     · `rotacion` reparte round-robin determinista por pool
 *     · `menos-usado` elige el de menor conteo real
 *     · `ponderado` respeta el peso con azar inyectado (determinista en test)
 *     · sin candidatos → null (nada inventado)
 *   CADENA sin probados: quita lo ya intentado por id exacto.
 *
 * Se ejecuta con:  npx tsx tests/relevoInteligente.test.ts
 */

import {
  cooldownAdaptativo,
  elegirVozReparto,
  cadenaRelevoSinProbados,
  reiniciarRepartoParaPruebas,
  TOPE_COOLDOWN_MS,
  PISO_COOLDOWN_MS,
  type VozCandidata,
} from "../src/engine/relevoInteligente";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

console.log("═══ PRUEBAS DE RELEVO INTELIGENTE · CerebroNico v1.87.0 ═══\n");

// ─── BACKOFF ADAPTATIVO ──────────────────────────────────────────
const CUOTA = 900_000; // 15 min, el TTL de la clase `cuota` en fusibleProveedores

comprobar("primer fallo conserva el TTL base (sin regresión)", cooldownAdaptativo(CUOTA, 1) === CUOTA, String(cooldownAdaptativo(CUOTA, 1)));
comprobar("segundo fallo duplica", cooldownAdaptativo(CUOTA, 2) === Math.min(CUOTA * 2, TOPE_COOLDOWN_MS), String(cooldownAdaptativo(CUOTA, 2)));
comprobar("backoff respeta el tope duro", cooldownAdaptativo(CUOTA, 50) === TOPE_COOLDOWN_MS, String(cooldownAdaptativo(CUOTA, 50)));
comprobar("racha enorme no desborda a Infinity", Number.isFinite(cooldownAdaptativo(CUOTA, 1000)) && cooldownAdaptativo(CUOTA, 1000) === TOPE_COOLDOWN_MS);
comprobar("ttl base ridículo (1 ms) se eleva al piso", cooldownAdaptativo(1, 1) === PISO_COOLDOWN_MS, String(cooldownAdaptativo(1, 1)));
comprobar("ttl base NaN cae a piso", cooldownAdaptativo(NaN as any, 1) === PISO_COOLDOWN_MS);
comprobar("fallos NaN/0/neg se tratan como 1", cooldownAdaptativo(CUOTA, 0) === CUOTA && cooldownAdaptativo(CUOTA, -5) === CUOTA && cooldownAdaptativo(CUOTA, NaN as any) === CUOTA);
comprobar("tope personalizado se respeta", cooldownAdaptativo(CUOTA, 10, 1_800_000) <= 1_800_000);
// progresión estrictamente creciente hasta el tope (con TTL base chico para ver la curva)
const red = 120_000; // clase `red`
const c1 = cooldownAdaptativo(red, 1), c2 = cooldownAdaptativo(red, 2), c3 = cooldownAdaptativo(red, 3);
comprobar("curva creciente red: f1<f2<f3", c1 < c2 && c2 < c3, `${c1}/${c2}/${c3}`);

// ─── REPARTO DE VOCES ────────────────────────────────────────
reiniciarRepartoParaPruebas();
const pool: VozCandidata[] = [
  { modelo: "glm-4.5-flash", proveedor: "zai" },
  { modelo: "gemini-2.0-flash", proveedor: "gemini" },
  { modelo: "llama-3.1-8b", proveedor: "openrouter" },
];

comprobar("prioridad → primero", elegirVozReparto(pool, "prioridad")?.voz.modelo === "glm-4.5-flash");
comprobar("sin candidatos → null (nada inventado)", elegirVozReparto([], "prioridad") === null);

// rotación determinista: 3 llamadas recorren el pool en orden y vuelven a empezar
reiniciarRepartoParaPruebas();
const r0 = elegirVozReparto(pool, "rotacion", {}, "test")?.voz.modelo;
const r1 = elegirVozReparto(pool, "rotacion", {}, "test")?.voz.modelo;
const r2 = elegirVozReparto(pool, "rotacion", {}, "test")?.voz.modelo;
const r3 = elegirVozReparto(pool, "rotacion", {}, "test")?.voz.modelo;
comprobar("rotación recorre el pool", r0 === "glm-4.5-flash" && r1 === "gemini-2.0-flash" && r2 === "llama-3.1-8b", `${r0}/${r1}/${r2}`);
comprobar("rotación vuelve a empezar (round-robin)", r3 === "glm-4.5-flash");
comprobar("rotación por pool es independiente", elegirVozReparto(pool, "rotacion", {}, "otro")?.voz.modelo === "glm-4.5-flash");

// menos-usado: elige el de menor conteo real
const usos = { "glm-4.5-flash": 10, "gemini-2.0-flash": 3, "llama-3.1-8b": 7 };
comprobar("menos-usado elige el de menor conteo", elegirVozReparto(pool, "menos-usado", { usosPorModelo: usos })?.voz.modelo === "gemini-2.0-flash");
comprobar("menos-usado sin datos elige el primero (0 usos)", elegirVozReparto(pool, "menos-usado", {})?.voz.modelo === "glm-4.5-flash");

// ponderado con azar inyectado (determinista): peso alto gana cuando el azar cae en su franja
const pesos: VozCandidata[] = [
  { modelo: "a", proveedor: "p", peso: 1 },
  { modelo: "b", proveedor: "p", peso: 9 },
];
comprobar("ponderado: azar 0.5 cae en el de peso 9", elegirVozReparto(pesos, "ponderado", { aleatorio: () => 0.5 })?.voz.modelo === "b");
comprobar("ponderado: azar ~0 cae en el primero", elegirVozReparto(pesos, "ponderado", { aleatorio: () => 0 })?.voz.modelo === "a");

// ─── CADENA SIN PROBADOS ─────────────────────────────────────
const restante = cadenaRelevoSinProbados(pool, ["glm-4.5-flash"]);
comprobar("cadena quita lo probado por id exacto", restante.length === 2 && !restante.some((v) => v.modelo === "glm-4.5-flash"));
comprobar("cadena sin probados = cadena entera", cadenaRelevoSinProbados(pool, []).length === 3);

// integración de las dos piezas: repartir SOLO entre los no probados
const elegida = elegirVozReparto(cadenaRelevoSinProbados(pool, ["glm-4.5-flash"]), "menos-usado", { usosPorModelo: usos });
comprobar("reparto sobre la cadena filtrada no re-elige lo probado", elegida?.voz.modelo === "gemini-2.0-flash");

// ─── veredicto ───────────────────────────────────────────
console.log(`\n─── RESULTADO: ${pasan} PASS · ${fallan} FALLO ───`);
if (fallan > 0) {
  console.log("Fallaron: " + fallos.join(", "));
  process.exit(1);
}
console.log("TODO EN VERDE.");
