/**
 * tableroParalelo.test.ts — EL TABLERO DE TAREAS PARALELAS (v1.28.0 · Tarea 2)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/tableroParalelo.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * La aritmética del monitor: que los conteos por estado sumen bien sobre varios
 * planes, que la ocupación de cada carril nunca sea NaN (límite 0), que el
 * filtro por estado devuelva lo que debe, y — lo importante — que el diagnóstico
 * distinga "atascado" (promete trabajo y no avanza) de "saturado" (lleno pero
 * sano) y de "inactivo".
 */
import {
  construirTablero,
  diagnosticar,
  filtrarPorEstado,
  barraOcupacion,
  type PlanPanel,
  type EstadoSemaforo,
} from "../src/engine/tableroParalelo";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}

const PLANES: PlanPanel[] = [
  {
    id: "p1", objetivo: "convertir", estado: "en_curso",
    tareas: [
      { id: "1", titulo: "a", peso: "io", estado: "en_curso", ms: 1200 },
      { id: "2", titulo: "b", peso: "io", estado: "lista" },
      { id: "3", titulo: "c", peso: "cpu", estado: "hecha" },
    ],
  },
  {
    id: "p2", objetivo: "imágenes", estado: "en_curso",
    tareas: [
      { id: "1", titulo: "d", peso: "io", estado: "en_curso", ms: 800 },
      { id: "2", titulo: "e", peso: "io", estado: "bloqueada", motivoEspera: "dep rota" },
    ],
  },
];

const SEM: EstadoSemaforo = {
  io: { enUso: 2, limite: 4, esperando: 1 },
  cpu: { enUso: 0, limite: 2, esperando: 0 },
};

console.log("\n[1] Conteos por estado y en curso");
const t = construirTablero(PLANES, SEM);
comprobar("total 5 tareas", t.totalTareas === 5, `${t.totalTareas}`);
comprobar("2 en_curso", t.porEstado.en_curso === 2, `${t.porEstado.en_curso}`);
comprobar("1 lista", t.porEstado.lista === 1);
comprobar("1 hecha", t.porEstado.hecha === 1);
comprobar("1 bloqueada", t.porEstado.bloqueada === 1);
comprobar("en curso por peso: 2 io, 0 cpu", t.enCursoPorPeso.io === 2 && t.enCursoPorPeso.cpu === 0);
comprobar("lista de en curso tiene 2 con su plan", t.enCurso.length === 2 && t.enCurso[0].planId === "p1");
comprobar("2 planes activos", t.planesActivos === 2);

console.log("\n[2] Ocupación de carriles");
comprobar("io a la mitad (2/4 = 50%)", t.ocupacion.io.porcentaje === 50, `${t.ocupacion.io.porcentaje}`);
comprobar("cpu vacío (0/2 = 0%)", t.ocupacion.cpu.porcentaje === 0);
comprobar("barra io legible", /2\/4/.test(barraOcupacion(t.ocupacion.io)), barraOcupacion(t.ocupacion.io));

console.log("\n[3] Límite 0 no produce NaN");
const tCero = construirTablero([], { io: { enUso: 0, limite: 0, esperando: 0 }, cpu: { enUso: 0, limite: 0, esperando: 0 } });
comprobar("fracción 0 con límite 0", tCero.ocupacion.io.fraccion === 0 && !Number.isNaN(tCero.ocupacion.io.fraccion));
comprobar("tablero vacío => inactivo", tCero.salud === "inactivo", tCero.salud);

console.log("\n[4] Diagnóstico: atascado vs saturado vs sano");
comprobar("sano: corre con hueco", diagnosticar({ enCurso: 2, esperando: 0, bloqueadas: 0, listas: 0, pendientes: 0, io: t.ocupacion.io, cpu: t.ocupacion.cpu, planesActivos: 2 }).salud === "sano");
const carrilLleno = { peso: "io" as const, enUso: 4, limite: 4, esperando: 2, fraccion: 1, porcentaje: 100 };
comprobar("saturado: lleno y con cola",
  diagnosticar({ enCurso: 4, esperando: 2, bloqueadas: 0, listas: 0, pendientes: 0, io: carrilLleno, cpu: t.ocupacion.cpu, planesActivos: 1 }).salud === "saturado");
const carrilCero = { peso: "io" as const, enUso: 0, limite: 0, esperando: 0, fraccion: 0, porcentaje: 0 };
comprobar("atascado: hay listas pero nada corre ni espera",
  diagnosticar({ enCurso: 0, esperando: 0, bloqueadas: 0, listas: 3, pendientes: 0, io: carrilCero, cpu: carrilCero, planesActivos: 1 }).salud === "atascado");
comprobar("atascado: solo bloqueadas",
  diagnosticar({ enCurso: 0, esperando: 0, bloqueadas: 2, listas: 0, pendientes: 0, io: carrilCero, cpu: carrilCero, planesActivos: 1 }).salud === "atascado");

console.log("\n[5] Filtro por estado");
const enCurso = filtrarPorEstado(PLANES, "en_curso");
comprobar("filtro en_curso trae 2", enCurso.length === 2, `${enCurso.length}`);
comprobar("cada resultado lleva su plan", enCurso.every((x) => x.planId && x.objetivo));
comprobar("filtro bloqueada trae 1 con motivo",
  filtrarPorEstado(PLANES, "bloqueada").length === 1);

console.log(`\n─── tableroParalelo: ${pasan} ✓  ${fallan} ✗ ───`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
