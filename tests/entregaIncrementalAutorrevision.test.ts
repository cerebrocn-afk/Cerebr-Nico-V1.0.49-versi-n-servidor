// ============================================================
// v1.58.4 — REGRESIÓN: B3 ENTREGA INCREMENTAL + B4 AUTO-REVISIÓN
// ------------------------------------------------------------
// QUÉ CONGELA (foco B, «que la tarea no se corte a mitad ni se pierda»):
//
//   B3 — cuando una tarea da señales de ser GRANDE (≥2 escrituras sanas o un
//        corte por tokens ya ocurrido) se activa el protocolo de entrega
//        incremental: `tareaPareceGrande` lo decide de forma determinista y
//        `DIRECTIVA_ENTREGA_INCREMENTAL` ordena entregar por partes COMPLETAS.
//
//   B4 — antes de cerrar el turno habiendo ejecutado herramientas, el gate de
//        auto-revisión relee el estado FINAL de los archivos escritos:
//        `revisarObraEscrita` (sobre `guardFile`+`problemasBloqueantes`) marca
//        los que quedaron incompletos/truncados y `directivaAutorrevision`
//        ordena terminarlos — en vez de cantar «hecho» sobre obra a medias.
//
// Ejecutar:  npx tsx tests/entregaIncrementalAutorrevision.test.ts
// ============================================================
import {
  tareaPareceGrande,
  DIRECTIVA_ENTREGA_INCREMENTAL,
  revisarObraEscrita,
  directivaAutorrevision,
  MAX_AUTORREVISION,
} from "../src/engine/cicloHerramientasOpenAICompat";

let fallos = 0;
let total = 0;
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  total++;
  if (cond) {
    console.log(`  \u2714 ${nombre}`);
  } else {
    fallos++;
    console.error(`  \u2716 ${nombre}${detalle ? ` \u2014 ${detalle}` : ""}`);
  }
}

console.log("\n1) \u2605 B3 \u2014 tareaPareceGrande: s\u00f3lo se activa cuando la tarea es grande\n");

comprobar(
  "tarea reci\u00e9n empezada (0 escrituras, 0 cortes) \u2192 NO grande",
  tareaPareceGrande(0, 0) === false
);
comprobar(
  "una sola escritura (1,0) \u2192 NO grande todav\u00eda (no grava tareas peque\u00f1as)",
  tareaPareceGrande(1, 0) === false
);
comprobar(
  "dos escrituras sanas (2,0) \u2192 GRANDE",
  tareaPareceGrande(2, 0) === true
);
comprobar(
  "un corte por tokens ya ocurrido (0,1) \u2192 GRANDE",
  tareaPareceGrande(0, 1) === true
);
comprobar(
  "valores basura (NaN) no rompen \u2192 NO grande",
  tareaPareceGrande(NaN as unknown as number, NaN as unknown as number) === false
);
comprobar(
  "la directiva de entrega incremental manda ENTREGAR POR PARTES",
  /POR PARTES/i.test(DIRECTIVA_ENTREGA_INCREMENTAL) &&
    /append_file/.test(DIRECTIVA_ENTREGA_INCREMENTAL)
);

console.log("\n2) \u2605 B4 \u2014 revisarObraEscrita: distingue obra sana de obra a medias\n");

// Archivo SANO: HTML completo y balanceado.
const sano = revisarObraEscrita([
  { path: "index.html", content: "<!DOCTYPE html>\n<html><body><h1>Hola</h1></body></html>\n" },
]);
comprobar(
  "un HTML completo no se marca como sospechoso",
  sano.length === 0,
  JSON.stringify(sano)
);

// Archivo TRUNCADO: marcador de truncamiento → bloqueante (syntaxGuard).
const truncado = revisarObraEscrita([
  { path: "src/data.ts", content: "export const x = {\n  a: 1,\n  // ...resto del c\u00f3digo\n" },
]);
comprobar(
  "un .ts con relleno/incompleto se marca como obra sospechosa",
  truncado.length >= 1 && truncado[0]?.path === "src/data.ts",
  JSON.stringify(truncado)
);

// Mezcla: sólo el malo sale en la lista; se deduplica por ruta.
const mezcla = revisarObraEscrita([
  { path: "ok.html", content: "<html><body>ok</body></html>" },
  { path: "roto.ts", content: "function f() {\n  return (\n" },
  { path: "roto.ts", content: "function f() {\n  return (\n" },
]);
comprobar(
  "s\u00f3lo el archivo roto entra y sin duplicar por ruta",
  mezcla.filter((s) => s.path === "roto.ts").length === 1 &&
    !mezcla.some((s) => s.path === "ok.html"),
  JSON.stringify(mezcla)
);

comprobar(
  "entradas sin ruta o sin contenido string se ignoran (no rompen)",
  revisarObraEscrita([
    { path: "", content: "x" },
    { path: "a.ts", content: undefined as unknown as string },
  ]).length === 0
);

console.log("\n3) \u2605 B4 \u2014 directivaAutorrevision + tope acotado\n");

const directiva = directivaAutorrevision([
  { path: "src/data.ts", motivo: "marcador de truncamiento" },
]);
comprobar(
  "la directiva nombra el archivo y pide terminarlo COMPLETO",
  directiva.includes("src/data.ts") &&
    /COMPLETO/.test(directiva) &&
    /AUTO-REVISI\u00d3N/.test(directiva),
  directiva
);
comprobar(
  "el tope de auto-revisiones es acotado (nunca bucle)",
  MAX_AUTORREVISION >= 1 && MAX_AUTORREVISION <= 3
);

if (fallos > 0) {
  console.error(`\n\u2716 ${fallos} fallidas (de ${total} comprobaciones).`);
  process.exit(1);
}
console.log(`\n\u2714 Todo verde \u2014 ${total} correctas, 0 fallidas: B3 entrega incremental + B4 auto-revisi\u00f3n quedan congelados.\n`);
