/**
 * hojaDeRuta.test.ts — v2.3.26 · LA HOJA DE TRES COSAS, PROBADA DE VERDAD
 * ============================================================================
 * `engine/hojaDeRuta.ts` es puro: no hay React, ni red, ni disco. Por eso se
 * puede ejecutar la lógica tal cual y comprobar qué devuelve, en vez de leer
 * texto con expresiones regulares. Esto es lo que Mario ve en la hoja.
 *
 * Se prueban las cuatro cosas que pueden romperse en silencio:
 *   1) el orden de las tres secciones (reconexión → pasos → entregable);
 *   2) que un puerto arriba NO ocupe la hoja y uno abajo SÍ diga qué se pierde;
 *   3) que los pasos salgan desde el primero del plan vigente, con su clase;
 *   4) que el entregable NO se ofrezca antes de cerrar la obra.
 */
import {
  claseDeEstado,
  pasosDeLaTarea,
  reconexionDePuertos,
  entregableFinal,
  armarHoja,
  SECCIONES_DE_LA_HOJA,
  MARCA,
  TONO,
  type LineaDePuerto,
} from "../src/engine/hojaDeRuta";

let correctas = 0;
const fallidas: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas.push(nombre); console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}
console.log("\n═══ HOJA DE RUTA (pura) · TRES COSAS ═══");

// ── 1) EL ESTADO CRUDO → LA CLASE QUE SE PINTA ─────────────────────────────
console.log("\n1) clase de estado");
comprobar("hecha/hecho/lista/ok → hecho",
  ["hecha", "hecho", "lista", "ok"].every((e) => claseDeEstado(e) === "hecho"));
comprobar("en_curso/running → en-curso", ["en_curso", "running"].every((e) => claseDeEstado(e) === "en-curso"));
comprobar("fallida/bloqueada/error → roto", ["fallida", "bloqueada", "error"].every((e) => claseDeEstado(e) === "roto"));
comprobar("un estado desconocido cae en pendiente (no se inventa un verde)",
  claseDeEstado("zzz") === "pendiente" && claseDeEstado("") === "pendiente");
comprobar("una marca por clase: ✓ ▶ ✗ ·",
  MARCA.hecho === "✓" && MARCA["en-curso"] === "▶" && MARCA.roto === "✗" && MARCA.pendiente === "·");
comprobar("el tono de una falla es de falla", TONO.roto === "falla" && TONO["en-curso"] === "trabajo");

// ── 2) RECONEXIÓN DE PUERTOS ───────────────────────────────────────────────
console.log("\n2) reconexión de puertos");
const puertos: LineaDePuerto[] = [
  { puerto: 3000, quien: "IDE", vivo: true },
  { puerto: 5100, quien: "sandbox", vivo: false, para: "la caja de trabajo", sePierde: "el agente no puede ejecutar lo que escribe" },
];
const recon = reconexionDePuertos(puertos);
comprobar("sólo se pintan los puertos caídos", recon.length === 1);
comprobar("el puerto caído dice su número y quién es", /:5100/.test(recon[0].texto) && /sandbox/.test(recon[0].texto));
comprobar("y dice qué se pierde", /se pierde: el agente no puede ejecutar/.test(recon[0].texto));
comprobar("la marca de una caída es ⚠ y el tono falla", recon[0].marca === "⚠" && recon[0].tono === "falla");
comprobar("reintentando se dice en la misma línea", /reintentando/.test(reconexionDePuertos(puertos, true)[0].texto));
const todosArriba = reconexionDePuertos(puertos.map((p) => ({ ...p, vivo: true })));
comprobar("con todo arriba hay UNA línea corta, no seis verdes",
  todosArriba.length === 1 && /2 puertos están arriba/.test(todosArriba[0].texto));
comprobar("sin muestra de puertos no se inventa nada", reconexionDePuertos([]).length === 0);

// ── 3) PASOS DE LA TAREA ───────────────────────────────────────────────────
console.log("\n3) pasos de la tarea");
const planes = [
  { id: "p0", objetivo: "plan viejo", estado: "cerrado", vivo: false, tareas: [{ id: "a", titulo: "viejo", estado: "hecha" }] },
  { id: "p2", objetivo: "reconectar puertos y probar el motor", vivo: true, estado: "en_curso", tareas: [
    { id: "t1", titulo: "leer el diagnóstico", estado: "hecha" },
    { id: "t2", titulo: "cablear las correcciones", estado: "en_curso" },
    { id: "t3", titulo: "probar con el modelo de pago", estado: "bloqueada", motivoEspera: "falta la clave" },
    { id: "t4", titulo: "empaquetar", estado: "pendiente" },
  ] },
];
const tarea = pasosDeLaTarea(planes);
comprobar("se toma el plan VIVO, no el último de la lista", tarea.titulo === "reconectar puertos y probar el motor");
comprobar("los pasos salen desde el primero del plan",
  tarea.pasos.length === 4 && tarea.pasos[0].titulo === "leer el diagnóstico" && tarea.pasos[0].clase === "hecho");
comprobar("el que está en curso se marca como tal", tarea.pasos[1].clase === "en-curso");
comprobar("una tarea bloqueada es rota y trae su motivo",
  tarea.pasos[2].clase === "roto" && tarea.pasos[2].motivo === "falta la clave");
comprobar("el plan vivo no se da por cerrado", tarea.cerrado === false);
comprobar("sin planes no hay pasos ni texto inventado",
  pasosDeLaTarea([]).pasos.length === 0 && pasosDeLaTarea([]).titulo === "");
comprobar("sin plan vivo se muestra el último y se dice que está cerrado",
  pasosDeLaTarea([planes[0]]).cerrado === true && pasosDeLaTarea([planes[0]]).pasos.length === 1);
comprobar("el tope de pasos se respeta (una hoja no es un registro)",
  pasosDeLaTarea(planes, 2).pasos.length === 2);

// ── 4) ENTREGABLE FINAL ────────────────────────────────────────────────────
console.log("\n4) entregable final");
const zip = { nombre: "proyecto-final.zip", peso: "540 KB", archivos: 61, listo: true };
comprobar("a medias NO hay entregable final (se dice, no se ofrece)",
  entregableFinal(zip, false)[0].texto.includes("todavía no hay entregable final"));
comprobar("a medias no hay marca de descarga", entregableFinal(zip, false)[0].marca !== "⬇");
const cerrado = entregableFinal(zip, true);
comprobar("cerrado y empacado: nombre, peso y archivos",
  /proyecto-final\.zip/.test(cerrado[0].texto) && /540 KB/.test(cerrado[0].texto) && /61 archivo/.test(cerrado[0].texto));
comprobar("y marca de descarga con tono de entrega", cerrado[0].marca === "⬇" && cerrado[0].tono === "entrega");
comprobar("sin nombre no hay nada que entregar", entregableFinal(null, true).length === 0);
comprobar("con nombre pero sin empaquetar, tampoco", entregableFinal({ ...zip, listo: false }, true)[0].marca !== "⬇");

// ── 5) LA HOJA ARMADA ──────────────────────────────────────────────────────
console.log("\n5) la hoja armada");
comprobar("las tres secciones y en ese orden",
  SECCIONES_DE_LA_HOJA.length === 3 && SECCIONES_DE_LA_HOJA[0] === "reconexion" &&
  SECCIONES_DE_LA_HOJA[1] === "paso" && SECCIONES_DE_LA_HOJA[2] === "entregable");
const h = armarHoja({ puertos, planes, entregable: zip, obraCerrada: false });
comprobar("cabeceras: tres, en el orden pedido",
  h.filas.filter((f) => f.cabecera).map((f) => f.texto).join("|") ===
  "Reconexión de puertos|Pasos de la tarea: reconectar puertos y probar el motor|Entregable final");
comprobar("cuenta los pasos por clase", h.cuenta.hecho === 1 && h.cuenta["en-curso"] === 1 && h.cuenta.roto === 1 && h.cuenta.pendiente === 1);
comprobar("el resumen dice cuántos puertos hay abajo y cuántos pasos hechos",
  h.cabecera.reconexion === "1 abajo" && h.cabecera.pasos === "1/4");
comprobar("mientras la obra no cierre, el entregable dice «en obra»", h.cabecera.entregable === "en obra");
const h2 = armarHoja({ puertos: [], planes: [], entregable: zip, obraCerrada: true });
comprobar("con la obra cerrada el entregable dice «listo»", h2.cabecera.entregable === "listo");
comprobar("una hoja vacía sigue teniendo sus tres cabeceras (nunca una caja en blanco)",
  h2.filas.filter((f) => f.cabecera).length === 3);
comprobar("ninguna fila de la hoja es de un cuarto tipo",
  h.filas.every((f) => (SECCIONES_DE_LA_HOJA as string[]).includes(f.tipo)));

console.log(`\n${fallidas.length === 0 ? "VEREDICTO: TODO CORRECTO" : "VEREDICTO: HAY FALLAS"}`);
console.log(`${correctas} correctas · ${fallidas.length} fallidas`);
if (fallidas.length) process.exitCode = 1;
