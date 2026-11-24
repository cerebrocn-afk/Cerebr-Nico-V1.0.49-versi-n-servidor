/**
 * manualPerfeccion.test.ts — EL MANUAL DE LA PERFECCIÓN NO MENTIRA (v1.79.0)
 * ===========================================================================
 * Pedido de Mario 26/10: los bucles de trabajo andan en sincronía con el plan
 * de ruta; al inicio de la tarea se FIJA una ruta y se RECORREN sus rutas
 * relativas; la auto-mejora, cuando actúa, ESCRIBE en perfeccion.md; y ese
 * archivo es donde quedan todas las rutas validadas y los procesos con
 * validación — el manual del motor.
 *
 * Lo que congela esta suite (todo sobre el núcleo PURO, sin disco ni reloj):
 *   · fijar ruta al crear el plan (idempotente: re-fijar no duplica);
 *   · LA REGLA QUE NO SE NEGOCIA: `validada` SOLO con evidencia de ejecución
 *     (escribir no es probar); «hecha» sin evidencia se cierra como
 *     `cerrada_sin_evidencia` y se lo ve en el render;
 *   · fallida siempre con causa (un manual que solo registra éxitos es
 *     propaganda);
 *   · la auto-mejora escribe (registrarProceso) y re-registrar el mismo
 *     proceso NO duplica (idempotencia por nombre+comando+veredicto);
 *   · DETERMINISMO: mismo estado → mismos bytes (re-render sin diferencias
 *     fantasmas);
 *   · la cara humana dice la verdad: el md renderizado muestra los estados
 *     reales, no una versión maquillada;
 *   · PLAGA sembrada: si el núcleo vuelve a permitir `validada` sin evidencia
 *     (borrando la democión), rojo.
 */
import {
  nuevoManual,
  fijarRuta,
  recorrerRuta,
  registrarProceso,
  resumenRuta,
  renderPerfeccionMd,
  cargarManual,
  type ManualPerfeccion,
} from "../src/engine/manualPerfeccion";

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean) {
  if (cond) correctas++;
  else fallos.push(msg);
}

const T0 = 1_800_000_000_000; // reloj inyectado: nada depende de la hora real

// — El escenario: un plan con 3 rutas relativas, como los que crea el chat —
const m = nuevoManual();
fijarRuta(
  m,
  {
    id: "plan-1",
    objetivo: "Generar la documentación del proyecto en PDF",
    tareas: [
      { id: "1", titulo: "Leer los archivos clave", tipo: "leer_archivo" },
      { id: "2", titulo: "Escribir el borrador", tipo: "escribir_archivo" },
      { id: "3", titulo: "Verificar el resultado en disco", tipo: "modelo" },
    ],
  },
  T0
);

comprobar("fijar crea la ruta con sus 3 rutas relativas en estado fijada", m.rutas.length === 1 && m.rutas[0].tareas.length === 3 && m.rutas[0].tareas.every((t) => t.estado === "fijada"));
comprobar("la ruta queda fijada con su objetivo", m.rutas[0].objetivo === "Generar la documentación del proyecto en PDF");

// Idempotencia: re-fijar la misma ruta (p. ej. plan reanudado) no duplica.
fijarRuta(m, { id: "plan-1", objetivo: "Generar la documentación del proyecto en PDF", tareas: [{ id: "1", titulo: "Leer los archivos clave", tipo: "leer_archivo" }] }, T0 + 1000);
comprobar("re-fijar la misma ruta no duplica tareas ni rutas", m.rutas.length === 1 && m.rutas[0].tareas.length === 3);

// — El bucle recorre sus rutas relativas —
recorrerRuta(m, "plan-1", { tareaId: "1", estado: "validada", evidencia: "3 archivos leídos: skills.md, CHANGELOG.md, contrato-rutas.json" }, T0 + 2000);
recorrerRuta(m, "plan-1", { tareaId: "2", estado: "validada", evidencia: "borrador escrito en documentacion_cerebronico.py · artefactos: documentacion_cerebronico.py" }, T0 + 3000);
recorrerRuta(m, "plan-1", { tareaId: "3", estado: "fallida", causa: "timeout: el comando no devolvió salida en 60 s" }, T0 + 4000);

const r1 = m.rutas[0].tareas.find((t) => t.id === "1")!;
const r3 = m.rutas[0].tareas.find((t) => t.id === "3")!;
comprobar("ruta recorrida con evidencia queda validada", r1.estado === "validada" && !!r1.evidencia);
comprobar("ruta fallida queda fallida CON su causa", r3.estado === "fallida" && /timeout/.test(r3.causa ?? ""));

// — LA REGLA QUE NO SE NEGOCIA: escribir no es probar —
fijarRuta(m, { id: "plan-2", objetivo: "Otro plan de prueba", tareas: [{ id: "9", titulo: "Marcar hecho sin ejecutar nada" }] }, T0 + 5000);
recorrerRuta(m, "plan-2", { tareaId: "9", estado: "validada" }, T0 + 6000); // sin evidencia
const r9 = m.rutas[1].tareas.find((t) => t.id === "9")!;
comprobar("«validada» SIN evidencia se demuele a cerrada_sin_evidencia (plaga: la democión no se puede borrar)", r9.estado === "cerrada_sin_evidencia" && r9.evidencia === undefined);

// La ruta plan-2 está completa (todo en estado terminal) → completadaEn se anota una sola vez.
recorrerRuta(m, "plan-1", { tareaId: "3", estado: "fallida", causa: "timeout de nuevo" }, T0 + 7000);
comprobar("completadaEn se anota cuando todas las rutas relativas son terminales", typeof m.rutas[0].completadaEn === "number" && typeof m.rutas[1].completadaEn === "number");

// — LA AUTO-MEJORA ESCRIBE: procesos con validación —
registrarProceso(m, { nombre: "ritual de validación", comando: "npm run validar", veredicto: "TODO CORRECTO — 8180 comprobaciones, 0 fallos", origen: "ouroboros" }, T0 + 8000);
registrarProceso(m, { nombre: "lección reforzada (3×)", veredicto: "turno ok con la lección presente (ayudó 3×) — ante timeout, revisar num_ctx primero", origen: "auto-mejora" }, T0 + 9000);
comprobar("la auto-mejora queda escrita en el manual", m.procesos.length === 2 && m.procesos[0].comando === "npm run validar");

// Idempotencia: re-registrar el mismo proceso no duplica (refresca la marca).
const antes = m.procesos.length;
registrarProceso(m, { nombre: "ritual de validación", comando: "npm run validar", veredicto: "TODO CORRECTO — 8180 comprobaciones, 0 fallos", origen: "ouroboros" }, T0 + 10000);
comprobar("re-registrar el mismo proceso no duplica (idempotencia por nombre+comando+veredicto)", m.procesos.length === antes && m.procesos[0].ts === T0 + 10000);

// — RESUMEN Y CARA HUMANA —
const resumen = resumenRuta(m, "plan-1");
comprobar("el resumen dice la verdad en una línea (validadas, fallidas, en curso/completada)", /2 validada/.test(resumen) && /1 fallida/.test(resumen) && /completada/.test(resumen));

const md = renderPerfeccionMd(m, "1.79.0");
comprobar("el md es el manual: titulado y con las reglas de la casa", md.startsWith("# PERFECIÓN — manual del motor") && md.includes("escribir no es probar"));
comprobar("el md muestra el objetivo de la ruta fijada", md.includes("«Generar la documentación del proyecto en PDF»"));
comprobar("el md muestra la evidencia de la ruta validada", md.includes("3 archivos leídos: skills.md, CHANGELOG.md, contrato-rutas.json"));
comprobar("el md muestra la causa de la ruta fallida (la última transición manda: «timeout de nuevo»)", md.includes("timeout de nuevo"));
comprobar("el md muestra la verdad incómoda (cerrada sin evidencia)", md.includes("cerrada_sin_evidencia") && md.includes("El bucle la marcó hecha sin evidencia de ejecución"));
comprobar("el md muestra el proceso con su comando exacto", md.includes("`npm run validar`") && md.includes("TODO CORRECTO — 8180 comprobaciones, 0 fallos"));
comprobar("el md muestra el proceso de la auto-mejora con su origen", md.includes("auto-mejora"));

// — DETERMINISMO: mismo estado → mismos bytes —
comprobar("render determinista: re-renderizar el mismo estado produce los mismos bytes", renderPerfeccionMd(m, "1.79.0") === md);
const mdVacio = renderPerfeccionMd(nuevoManual());
comprobar("el manual vacío se explica solo (todavía ninguna ruta / nada validado)", mdVacio.includes("Todavía ninguna ruta fijada") && mdVacio.includes("no validó nada"));

// — LA CARA MÁQUINA ES TOLERANTE —
const podrido = cargarManual("{esto no es json");
comprobar("json podrido → manual vacío (no tira el motor)", podrido.rutas.length === 0 && podrido.procesos.length === 0);
const parcial = cargarManual(JSON.stringify({ rutas: [{ id: "x", objetivo: "y", fijadaEn: 1, tareas: [{ id: "1", titulo: "t", estado: "estado-inventado" }] }], procesos: [{ id: "p", nombre: "n", veredicto: "v" }] }));
comprobar("entrada parcial: lo salvable se salva y lo raro vuelve a «fijada»", parcial.rutas.length === 1 && parcial.rutas[0].tareas[0].estado === "fijada" && parcial.procesos.length === 1);
const sinObjetivo = cargarManual(JSON.stringify({ rutas: [{ id: "x", fijadaEn: 1, tareas: [] }] }));
comprobar("ruta sin objetivo se descarta (no es una ruta, es ruido)", sinObjetivo.rutas.length === 0);

// — INVARIANTE GLOBAL (la plaga, a escala): NINGUNA ruta validada sin evidencia —
const todo: ManualPerfeccion[] = [m, parcial, podrido, nuevoManual()];
comprobar(
  "invariante: en NINGÚN manual hay una ruta `validada` sin evidencia",
  todo.every((man) => man.rutas.every((r) => r.tareas.every((t) => t.estado !== "validada" || (t.evidencia ?? "").trim().length > 0)))
);

console.log(`\n═══ MANUAL DE LA PERFECCIÓN: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
