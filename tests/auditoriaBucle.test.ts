/**
 * auditoriaBucle.test.ts — EL LIBRO DE ACTAS DEL BUCLE (v1.28.0 · Tarea 3)
 * ========================================================================
 * Se ejecuta con:  npx tsx tests/auditoriaBucle.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * Que cada `Decision` del juez del bucle quede anotada, que el resumen cuente
 * bien continuaciones/cierres/fases/escalones, que distinga una reparación de
 * verdad de una continuación normal, que registre qué herramienta falló, que el
 * tope de entradas no reviente la memoria y que el acta formateada sea
 * determinista (con el `ts` inyectado, sin depender del reloj).
 */
import {
  crearRegistro,
  registrarDecision,
  resumenAuditoria,
  huboReparacion,
  formatearAuditoria,
  MAX_ENTRADAS,
} from "../src/engine/auditoriaBucle";
import type { Decision } from "../src/engine/bucleAutonomo";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}

const cont = (fase: any, escalon: number, motivo = "m"): Decision =>
  ({ accion: "continuar", motivo, directiva: "d", fase, escalon } as Decision);
const cerrar = (motivo = "fin"): Decision => ({ accion: "cerrar", motivo, informe: "i" } as Decision);

console.log("\n[1] Anotar y contar");
const reg = crearRegistro("turno-7", 1000);
registrarDecision(reg, 0, cont("crear", 0), { ts: 1000 });
registrarDecision(reg, 1, cont("modificar", 0), { ts: 1100 });
registrarDecision(reg, 2, cont("reparar", 1), { herramientaFallo: "write_file", ts: 1300 });
registrarDecision(reg, 3, cont("reparar", 2), { herramientaFallo: "write_file", ts: 1600 });
registrarDecision(reg, 4, cerrar("todo hecho"), { ts: 2000 });

const r = resumenAuditoria(reg);
comprobar("5 pasos", r.pasos === 5, `${r.pasos}`);
comprobar("4 continuaciones", r.continuaciones === 4, `${r.continuaciones}`);
comprobar("1 cierre", r.cierres === 1);
comprobar("fases: 1 crear, 1 modificar, 2 reparar",
  r.porFase.crear === 1 && r.porFase.modificar === 1 && r.porFase.reparar === 2);
comprobar("2 reparaciones", r.reparaciones === 2, `${r.reparaciones}`);
comprobar("escalón máximo 2", r.escalonMaximo === 2, `${r.escalonMaximo}`);
comprobar("write_file falló 2 veces", r.herramientasQueFallaron.write_file === 2, JSON.stringify(r.herramientasQueFallaron));
comprobar("hubo reparación", huboReparacion(reg) === true);

console.log("\n[2] Turno sin reparación");
const limpio = crearRegistro("turno-8", 0);
registrarDecision(limpio, 0, cont("crear", 0), { ts: 0 });
registrarDecision(limpio, 1, cerrar(), { ts: 50 });
comprobar("no hubo reparación", huboReparacion(limpio) === false);
comprobar("escalón máximo 0", resumenAuditoria(limpio).escalonMaximo === 0);

console.log("\n[3] Formato determinista con ts inyectado");
const txt = formatearAuditoria(reg);
comprobar("cabecera con el id del turno", /turno-7/.test(txt));
comprobar("muestra el delta en ms del cierre (+1000ms)", /\+1000ms/.test(txt), txt);
comprobar("marca la reparación con su escalón", /escalón 2/.test(txt));
comprobar("lista las herramientas que fallaron", /write_file×2/.test(txt));
comprobar("mismo registro => misma acta", formatearAuditoria(reg) === txt);

console.log("\n[4] Tope de entradas");
const grande = crearRegistro("turno-largo", 0);
for (let i = 0; i < MAX_ENTRADAS + 50; i++) registrarDecision(grande, i, cont("reparar", 1), { ts: i });
comprobar(`no pasa de ${MAX_ENTRADAS} entradas`, grande.entradas.length === MAX_ENTRADAS, `${grande.entradas.length}`);
comprobar("conserva las MÁS RECIENTES (descarta las viejas)",
  grande.entradas[grande.entradas.length - 1].paso === MAX_ENTRADAS + 49);

console.log(`\n─── auditoriaBucle: ${pasan} ✓  ${fallan} ✗ ───`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
