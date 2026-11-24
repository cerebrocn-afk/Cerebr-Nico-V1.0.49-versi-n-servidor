/**
 * contratoDeTurno.test.ts — TURNO = TAREA = ENTREGA (v1.69.0)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/contratoDeTurno.test.ts
 *
 * RAÍZ (pedido de Mario, 24/10): «en el Planificador se ejecuta el contrato,
 * plan y hoja de ruta con la tarea escrita por etapas y tachando la ya hecha;
 * hasta que no termine no se corta o se auto pregunta para continuar el turno».
 * El juez local (decidirBucle) ya lo hacía; el ciclo OpenAI-compat —once
 * proveedores de nube— cerraba con etapas colgando. Este test fija la lógica
 * PURA del cable nuevo:
 *
 *   1. `directivaDePlanPendiente` — la auto-pregunta: enumera las etapas con su
 *      marca [ ]/[x], manda cerrarlas con update_task y en el último intento
 *      pasa a ultimátum honesto. Sin pendientes → null (no molesta).
 *   2. Tope finito (MAX_CONTINUIDAD_PLAN): el motor se auto-pregunta y se
 *      cansa — exigir sin tope sería el otro defecto, el turno que no muere.
 *   3. Contrato de aceptación (planAdaptativo): criterios sin evidencia ⇒ el
 *      cierre NO procede; con evidencia registrada ⇒ libera. Sin criterios ⇒
 *      nunca bloquea (cero regresión para la charla normal).
 */
import {
  directivaDePlanPendiente,
  etapasDelPlan,
  MAX_CONTINUIDAD_PLAN,
} from "../server/continuidadPlan";
import {
  estadoContrato,
  registrarContratoDesdeTareas,
  registrarEvidenciaContrato,
  actualizarEstadoContrato,
  reiniciarContrato,
  verContrato,
} from "../src/engine/planAdaptativo";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] SIN PENDIENTES NO HAY QUEJA: turnos libres y planes cerrados");
{
  comprobar("plan vacío => null", directivaDePlanPendiente([], 0) === null);
  const cerrado = [
    { id: "t1", description: "unificar", status: "done" as const },
    { id: "t2", description: "tachar", status: "failed" as const },
  ];
  comprobar("todo tachado/fallido => null", directivaDePlanPendiente(cerrado, 0) === null);
}

console.log("\n[2] LA AUTO-PREGUNTA: enumera etapas abiertas con su marca");
{
  const plan = [
    { id: "t1", description: "Unificar papeleo", status: "done" as const },
    { id: "t2", description: "Cablear planificador", status: "pending" as const },
    { id: "t3", description: "Validar", status: "running" as const },
  ];
  const d = directivaDePlanPendiente(plan, 0);
  comprobar("hay directiva", !!d, String(d));
  comprobar("tachada la hecha", !!d && d.includes("[x] #t1 Unificar papeleo"), d);
  comprobar("abierta la pendiente", !!d && d.includes("[ ] #t2 Cablear planificador"), d);
  comprobar("en curso con su marca", !!d && d.includes("[▶] #t3 Validar"), d);
  comprobar("manda update_task con evidencia", !!d && d.includes("update_task") && d.includes("evidencia"), d);
  comprobar("aún no es ultimátum", !!d && !d.includes("ÚLTIMA EXIGENCIA"), d);
}

console.log("\n[3] EL ÚLTIMO INTENTO ES HONESTO, NO UN BUCLE");
{
  const plan = [{ id: "t1", description: "seguir", status: "pending" as const }];
  const d = directivaDePlanPendiente(plan, MAX_CONTINUIDAD_PLAN - 1);
  comprobar("ultimátum declarado", !!d && d.includes("ÚLTIMA EXIGENCIA"), d);
  comprobar("ofrece informe honesto", !!d && d.includes("informe honesto"), d);
  comprobar("tope finito y chico", MAX_CONTINUIDAD_PLAN >= 2 && MAX_CONTINUIDAD_PLAN <= 5, String(MAX_CONTINUIDAD_PLAN));
}

console.log("\n[4] ETAPAS DEL PLAN: la hoja que ve el modelo es la del panel");
{
  const marca = etapasDelPlan([{ id: "a", description: "x", status: "done" as const }]);
  comprobar("una línea por etapa", marca.split("\n").length === 1, marca);
  comprobar("hecha con equis", marca.startsWith("[x] #a"), marca);
}

console.log("\n[5] CONTRATO ABIERTO: criterios sin evidencia NO dejan cerrar");
{
  reiniciarContrato();
  registrarContratoDesdeTareas([
    { id: "t1", description: "obra", criterios_aceptacion: ["compila", "test en verde"] },
  ]);
  comprobar("recien declarada (abierta) no molesta aun", estadoContrato().abierto === false);
  actualizarEstadoContrato("t1", "in_progress");
  const c = estadoContrato();
  comprobar("en curso con criterios sin probar = ABIERTO", c.abierto === true, JSON.stringify(c));
  comprobar("nombra lo que falta", (c.pendientes[0]?.sinVerificar.length || 0) === 2, JSON.stringify(c.pendientes));
  // Cantar «completed» sin evidencia: la puerta sigue roja (cerrada_sin_verificar).
  actualizarEstadoContrato("t1", "completed");
  comprobar("cerrada sin evidencia sigue bloqueando", estadoContrato().abierto === true, JSON.stringify(estadoContrato()));
}

console.log("\n[6] SIN CRITERIOS NO HAY CONTRATO QUE CIERRE (cero regresión)");
{
  reiniciarContrato();
  registrarContratoDesdeTareas([{ id: "t1", description: "charla" }]);
  comprobar("no bloquea", estadoContrato().abierto === false);
}

console.log("\n[7] EVIDENCIA LIBERA: prueba ⇒ criterio cerrado ⇒ cierre libre");
{
  reiniciarContrato();
  registrarContratoDesdeTareas([{ id: "t1", description: "obra", criterios_aceptacion: ["compila"] }]);
  registrarEvidenciaContrato("t1", "tsc exit 0");
  const v = verContrato();
  comprobar("criterio con evidencia", v[0]?.criterios[0]?.evidencia === "tsc exit 0", JSON.stringify(v));
  comprobar("estado verificada", v[0]?.estado === "verificada", v[0]?.estado);
  comprobar("ya no bloquea", estadoContrato().abierto === false);
}

console.log(`\n${fallan === 0 ? "TODOS PASAN" : "HAY FALLOS"}: ${pasan} \u2713 / ${fallan} \u2717`);
if (fallan > 0) {
  console.log("Fallos:", fallos.join(" | "));
  process.exit(1);
}
