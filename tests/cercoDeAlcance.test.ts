/**
 * cercoDeAlcance.test.ts — EL MODELO YA NO INVENTA TAREAS FUERA DEL PEDIDO (v1.0.14)
 * ================================================================================
 * Verifica en seco el criterio del cerco:
 *   · una tarea alineada con el objetivo (comparte palabras clave) NO se toca;
 *   · una tarea inventada (sin solape con el pedido) se marca y su directiva re-ancla;
 *   · el conservatismo manda: sin objetivo o sin tareas no hay cerco (hayDesvio false);
 *   · los STOPWORDS no cuentan como solape (el umbral es de términos significativos).
 */
import { terminosDe, tareaDentroDeAlcance, evaluarCercoDeAlcance } from "../src/engine/cercoDeAlcance";

let ok = 0;
let falla = 0;
const c = (nombre: string, cond: boolean, detalle = "") => {
  if (cond) { ok++; console.log("  PASS  " + nombre); }
  else { falla++; console.log("  FALLO " + nombre + (detalle ? " :: " + detalle : "")); }
};

const OBJETIVO = "crear una web de una tienda de zapatos con carrito y pagos";

console.log("== cercoDeAlcance (v1.0.14) ==\n");

// 1 · terminosDe: normaliza, quita acentos y stopwords
c("términos quita acentos y stopwords", terminosDe("Crear una WEB de zapatos").includes("zapatos") && terminosDe("Crear una WEB de zapatos").includes("web"));
c("stopword no cuenta como término", !terminosDe("hacer una tarea").includes("hacer") && !terminosDe("hacer una tarea").includes("tarea"));
c("terminosDe devuelve arreglo único y estable", terminosDe("zapato zapato zapato").length === 1);

// 2 · tareaDentroDeAlcance
c("tarea que sí está en el objetivo → dentro", tareaDentroDeAlcance(OBJETIVO, "maquetar la sección de zapatos") === true);
c("tarea de la misma familia (carrito) → dentro", tareaDentroDeAlcance(OBJETIVO, "diseñar el carrito de compras") === true);
c("tarea ajena (optimizar base de datos de facturas) → FUERA", tareaDentroDeAlcance(OBJETIVO, "optimizar la base de datos de facturas") === false);
c("tarea ajena (migrar a docker) → FUERA", tareaDentroDeAlcance(OBJETIVO, "migrar el proyecto a docker y kubernetes") === false);
c("sin objetivo → siempre dentro (sin cerco)", tareaDentroDeAlcance("", "cualquier tarea") === true);

// 3 · evaluarCercoDeAlcance
const r = evaluarCercoDeAlcance({
  objetivo: OBJETIVO,
  tareas: [
    { id: "t1", description: "estructurar el html de la tienda de zapatos" }, // dentro
    { id: "t2", description: "implementar el carrito de compras" },           // dentro
    { id: "t3", description: "configurar kubernetes para el deploy" },        // FUERA (inventada)
  ],
});
c("detecta la tarea inventada", r.hayDesvio === true && r.desviadas.length === 1 && r.desviadas[0].id === "t3");
c("la directiva nombra la tarea inventada", r.hayDesvio && r.directiva.includes("t3"));

// todas dentro → sin desvío
const r2 = evaluarCercoDeAlcance({
  objetivo: "agregar un buscador con filtros",
  tareas: [
    { id: "x1", description: "crear el campo de búsqueda con filtros" },
    { id: "x2", description: "probar el buscador con filtros" },
  ],
});
c("todo dentro del objetivo → sin desvío", r2.hayDesvio === false);

// sin objetivo o sin tareas → sin cerco
c("sin objetivo → hayDesvio false", evaluarCercoDeAlcance({ objetivo: "", tareas: [{ id: "a", description: "x" }] }).hayDesvio === false);
c("sin tareas abiertas → hayDesvio false", evaluarCercoDeAlcance({ objetivo: OBJETIVO, tareas: [] }).hayDesvio === false);
c("objetivo vacío y sin tareas → inócuo", evaluarCercoDeAlcance({ objetivo: "", tareas: [] }).hayDesvio === false);

console.log(`\n═══ CERCEDERO DE ALCANCE: ${ok} correctas · ${falla} fallidas ═══`);
process.exit(falla ? 1 : 0);