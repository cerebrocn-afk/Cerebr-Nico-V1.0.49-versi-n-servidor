/**
 * disparadorChat.test.ts — EL CHAT DISPARA TAREAS (v1.28.0 · Tarea 1)
 * ===================================================================
 * Se ejecuta con:  npx tsx tests/disparadorChat.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * El puente órdenes-del-chat → taskPlanner: que un turno con varias órdenes de
 * fondo se pueda AGRUPAR en un plan paralelo validado por el MOTOR, que cada
 * orden caiga en su canal (UI inmediata vs tarea de fondo vs plan explícito) y
 * que un plan vacío o sin objetivo NO se arme (se dice el motivo).
 *
 * NOTA de entorno: se construyen las órdenes A MANO (los mismos objetos que
 * `extraerOrdenes` devuelve) en vez de llamar a `extraerOrdenes`, porque ése
 * arrastra formatConverter→js-yaml en runtime y aquí no hay node_modules. El
 * bridge NO depende de js-yaml: por eso la prueba puede ser pura.
 */
import type { Orden } from "../src/engine/chatOrders";
import {
  clasificarOrden,
  planificarDisparos,
  ordenComoTarea,
  agruparEnPlan,
  convieneAgrupar,
  resumenDisparos,
} from "../src/engine/disparadorChat";
import { validarPlan, crearPlan } from "../src/engine/taskPlanner";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}

// Un turno con DOS conversiones independientes + un abrir (lo que devolvería
// extraerOrdenes ante ese mensaje del asistente).
const ORDENES: Orden[] = [
  { tipo: "convertir", desde: "json", hacia: "yaml", archivo: "a.json", salida: "a.yaml" } as Orden,
  { tipo: "convertir", desde: "json", hacia: "toml", archivo: "b.json", salida: "b.toml" } as Orden,
  { tipo: "abrir", ruta: "a.yaml" } as Orden,
];
const RES = { ordenes: ORDENES, avisos: [] as string[] };

console.log("\n[1] Clasificación por canal");
const plani = planificarDisparos(RES);
comprobar("2 de fondo", plani.fondo === 2, `${plani.fondo}`);
comprobar("1 de interfaz (abrir)", plani.ui === 1, `${plani.ui}`);
comprobar("0 planes explícitos", plani.planes === 0, `${plani.planes}`);
comprobar("abrir no corre en paralelo",
  plani.disparos.find((d) => d.clase === "accion-ui")!.enParalelo === false);
comprobar("convertir sí corre en paralelo",
  plani.disparos.filter((d) => d.clase === "tarea-fondo").every((d) => d.enParalelo));

console.log("\n[2] Agrupar en un plan paralelo validado por el motor");
comprobar("conviene agrupar (>=2 de fondo)", convieneAgrupar(plani));
const ag = agruparEnPlan("Convertir a.json y b.json", ORDENES);
comprobar("agrupa OK", ag.ok, ag.motivo || "");
comprobar("el plan agrupado tiene 2 tareas", !!ag.orden && ag.orden.tareas.length === 2, `${ag.orden?.tareas.length}`);
comprobar("las tareas de fondo NO dependen entre sí (paralelas)",
  !!ag.orden && ag.orden.tareas.every((t) => t.dependeDe.length === 0));
comprobar("autoLanzar por defecto", !!ag.orden && ag.orden.autoLanzar === true);
if (ag.ok && ag.orden) {
  const plan = crearPlan(ag.orden.objetivo, ag.orden.tareas as any);
  comprobar("el plan agrupado valida en el motor", validarPlan(plan).ok);
  comprobar("cada tarea de conversión lleva desde/hacia/salida",
    plan.tareas.every((t) => t.datos && (t.datos as any).desde && (t.datos as any).hacia && (t.datos as any).salida));
}

console.log("\n[3] Casos borde honestos");
const soloAbrir: Orden[] = [{ tipo: "abrir", ruta: "x.ts" } as Orden];
const agVacio = agruparEnPlan("nada", soloAbrir);
comprobar("sin órdenes de fondo NO se arma plan", agVacio.ok === false);
comprobar("y dice el motivo", !!agVacio.motivo && /fondo/i.test(agVacio.motivo));
comprobar("objetivo vacío se rechaza", agruparEnPlan("   ", ORDENES).ok === false);
comprobar("ordenComoTarea devuelve null para 'abrir'",
  ordenComoTarea({ tipo: "abrir", ruta: "x" } as any, "1") === null);

console.log("\n[4] Imagen también es tarea de fondo");
const ordenImagen: Orden = { tipo: "imagen", prompt: "un logo", salida: "img/logo.png" } as Orden;
comprobar("imagen se clasifica como fondo", clasificarOrden(ordenImagen).clase === "tarea-fondo");
const tImg = ordenComoTarea(ordenImagen, "7");
comprobar("la tarea de imagen es tipo generar_imagen con su prompt",
  !!tImg && tImg.tipo === "generar_imagen" && (tImg.datos as any).prompt === "un logo");

console.log("\n[5] Plan explícito del modelo se reconoce como su propio disparo");
const ordenPlan: Orden = { tipo: "plan", objetivo: "algo", tareas: [], autoLanzar: true } as Orden;
comprobar("un plan explícito es clase 'plan' y paralelo",
  clasificarOrden(ordenPlan).clase === "plan" && clasificarOrden(ordenPlan).enParalelo === true);

console.log("\n[6] Resumen legible");
comprobar("el resumen menciona el paralelismo cuando conviene",
  /plan paralelo/i.test(resumenDisparos(plani)), resumenDisparos(plani));

console.log(`\n─── disparadorChat: ${pasan} ✓  ${fallan} ✗ ───`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
