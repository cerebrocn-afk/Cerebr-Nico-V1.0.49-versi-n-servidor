/**
 * tests/presupuestoReparacion.test.ts — TOPE DURO + PRESUPUESTO DE TOKENS (v1.53.3 · Paso A)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/presupuestoReparacion.test.ts
 */
import {
  crearPresupuestoNodo, decidirReparacion, registrarIntento, congelarNodo,
  saldoTokens, intentosRestantes, pideIntervencionHumana,
  MAX_INTENTOS_POR_NODO, PRESUPUESTO_TOKENS_POR_NODO,
} from "../src/engine/presupuestoReparacion";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` \u2014 ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` \u2014 ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. Nodo nuevo: puede reparar");
{
  const e = crearPresupuestoNodo("backend/api.ts");
  comprobar("defaults correctos", e.maxIntentos === MAX_INTENTOS_POR_NODO && e.presupuestoTokens === PRESUPUESTO_TOKENS_POR_NODO);
  const v = decidirReparacion(e);
  comprobar("primer veredicto = reparar", v.accion === "reparar" && !v.intervencionHumana);
  comprobar("saldo e intentos completos", saldoTokens(e) === PRESUPUESTO_TOKENS_POR_NODO && intentosRestantes(e) === MAX_INTENTOS_POR_NODO);
}

seccion("2. Tope DURO de intentos");
{
  const e = crearPresupuestoNodo("n", 3, 1_000_000);
  registrarIntento(e, 10); registrarIntento(e, 10);
  comprobar("tras 2 intentos a\u00fan repara", decidirReparacion(e).accion === "reparar");
  const v = registrarIntento(e, 10); // 3er intento
  comprobar("al 3er intento se congela", v.accion === "congelar" && v.intervencionHumana);
  comprobar("queda marcado congelado", pideIntervencionHumana(e));
}

seccion("3. Presupuesto de tokens: un intento caro pesa m\u00e1s que varios cortos");
{
  const e = crearPresupuestoNodo("n", 10, 50_000);
  const v = registrarIntento(e, 60_000); // un solo intento enorme
  comprobar("se congela por tokens aunque sobren intentos", v.accion === "congelar" && v.intervencionHumana);
  comprobar("motivo menciona presupuesto", /presupuesto|tokens/.test(v.motivo));
}

seccion("4. Corte PREVIO: el pr\u00f3ximo intento estimado no cabe");
{
  const e = crearPresupuestoNodo("n", 10, 50_000);
  registrarIntento(e, 40_000); // quedan 10k
  const v = decidirReparacion(e, 20_000); // estimado 20k > 10k
  comprobar("no dispara una llamada que reventar\u00eda el saldo", v.accion === "congelar");
  const v2 = decidirReparacion(e, 5_000);
  comprobar("s\u00ed permite un intento que cabe", v2.accion === "reparar");
}

seccion("5. Congelar a mano es idempotente");
{
  const e = crearPresupuestoNodo("n");
  congelarNodo(e, "fallo cr\u00edtico");
  const motivo1 = e.motivoCongelado;
  congelarNodo(e, "otro motivo");
  comprobar("no pisa el primer motivo", e.motivoCongelado === motivo1);
  comprobar("decidir devuelve congelar", decidirReparacion(e).accion === "congelar");
}

console.log(`\n\u2014\u2014 presupuestoReparacion: ${correctas} correctas, ${fallos.length} en rojo \u2014\u2014`);
if (fallos.length) { for (const f of fallos) console.log("  \u2717 " + f); process.exit(1); }
