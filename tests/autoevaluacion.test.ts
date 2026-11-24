/**
 * autoevaluacion.test.ts — la suite del cierre que se juzga a sí mismo.
 * Verifica los cinco ejes, los tres veredictos, la redacción de lecciones y la
 * idempotencia del guardado. Sin disco real: el guardado se prueba con un io
 * en memoria, que es exactamente el contrato de `guardarLeccion`.
 */
import {
  evaluarCierre,
  evaluarVerificacion,
  evaluarLimpiezaCierre,
  evaluarDocumentacion,
  evaluarRegistro,
  evaluarHonestidadCierre,
  redactarLecciones,
  formatearLeccion,
  guardarLeccion,
  evaluarAutoevaluacion,
  parteAutoevaluacion,
  EJES_CIERRE,
  AUTOEVALUACION_KB_ENTRIES,
  type EntradaCierre,
} from "../src/engine/autoevaluacion";

let ok = 0;
let fail = 0;
const fallos: string[] = [];

function check(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    ok++;
  } else {
    fail++;
    fallos.push(`✗ ${nombre}${detalle ? ` :: ${detalle}` : ""}`);
  }
}

// ── 1. Los cinco ejes existen y son cinco ──────────────────────
check("hay exactamente 5 ejes", EJES_CIERRE.length === 5, `son ${EJES_CIERRE.length}`);
check("los ejes son los esperados", EJES_CIERRE.join(",") === "verificacion,limpieza,documentacion,registro,honestidad");

// ── 2. Eje verificación ────────────────────────────────────────
check("verificación: ejecutó → verde", evaluarVerificacion({ seEjecutoAlgo: true }).estado === "verde");
check("verificación: no ejecutó → roja", evaluarVerificacion({ seEjecutoAlgo: false }).estado === "roja");
check("verificación: sin dato → sinProbar", evaluarVerificacion({}).estado === "sinProbar");

// ── 3. Eje limpieza ────────────────────────────────────────────
check("limpieza: sin rutas declaradas → sinProbar", evaluarLimpiezaCierre({}).estado === "sinProbar");
check("limpieza: cero rutas → verde", evaluarLimpiezaCierre({ rutasCreadas: [] }).estado === "verde");
check(
  "limpieza: rutas que son obra → verde",
  evaluarLimpiezaCierre({ rutasCreadas: ["src/a.ts"], archivosNuevos: ["src/a.ts"] }).estado === "verde",
);
check(
  "limpieza: temporal vivo → roja",
  evaluarLimpiezaCierre({ rutasCreadas: ["_tmp.cjs"], archivosNuevos: [] }).estado === "roja",
);
check(
  "limpieza: mezcla obra+temporal → roja y nombra el temporal",
  (() => {
    const r = evaluarLimpiezaCierre({ rutasCreadas: ["src/a.ts", "_tmp.cjs"], archivosNuevos: ["src/a.ts"] });
    return r.estado === "roja" && r.motivo.includes("_tmp.cjs") && !r.motivo.includes("src/a.ts");
  })(),
);

// ── 4. Eje documentación ───────────────────────────────────────
check("documentación: sin archivos nuevos → sinProbar", evaluarDocumentacion({}).estado === "sinProbar");
check("documentación: cero nuevos → verde", evaluarDocumentacion({ archivosNuevos: [] }).estado === "verde");
check(
  "documentación: nuevo sin .md → roja",
  evaluarDocumentacion({ archivosNuevos: ["src/x.ts"], documentosTocados: [] }).estado === "roja",
);
check(
  "documentación: nuevo con .md → verde",
  evaluarDocumentacion({ archivosNuevos: ["src/x.ts"], documentosTocados: ["X.md"] }).estado === "verde",
);

// ── 5. Eje registro ────────────────────────────────────────────
check("registro: sin suites nuevas → sinProbar", evaluarRegistro({}).estado === "sinProbar");
check("registro: cero nuevas → verde", evaluarRegistro({ suitesNuevas: [] }).estado === "verde");
check(
  "registro: suite fuera del catálogo → roja",
  evaluarRegistro({ suitesNuevas: ["tests/a.test.ts"], suitesRegistradas: [] }).estado === "roja",
);
check(
  "registro: suite registrada → verde",
  evaluarRegistro({ suitesNuevas: ["tests/a.test.ts"], suitesRegistradas: ["tests/a.test.ts"] }).estado === "verde",
);
check(
  "registro: comparación sin distinguir mayúsculas",
  evaluarRegistro({ suitesNuevas: ["Tests/A.test.ts"], suitesRegistradas: ["tests/a.test.ts"] }).estado === "verde",
);

// ── 6. Eje honestidad ──────────────────────────────────────────
check("honestidad: sin dato → sinProbar", evaluarHonestidadCierre({}).estado === "sinProbar");
check("honestidad: no afirma → verde", evaluarHonestidadCierre({ afirmaCierre: false }).estado === "verde");
check(
  "honestidad: afirma con evidencia → verde",
  evaluarHonestidadCierre({ afirmaCierre: true, hayEvidencia: true }).estado === "verde",
);
check(
  "honestidad: afirma sin evidencia → roja",
  evaluarHonestidadCierre({ afirmaCierre: true, hayEvidencia: false }).estado === "roja",
);

// ── 7. Los tres veredictos ─────────────────────────────────────
const limpio: EntradaCierre = {
  seEjecutoAlgo: true,
  rutasCreadas: [],
  archivosNuevos: [],
  documentosTocados: [],
  suitesNuevas: [],
  suitesRegistradas: [],
  afirmaCierre: true,
  hayEvidencia: true,
};
check("veredicto LIMPIO con todo verde", evaluarCierre(limpio).veredicto === "LIMPIO");

const unaRoja: EntradaCierre = { ...limpio, seEjecutoAlgo: false };
check("veredicto CON_OBSERVACIONES con 1 rojo", evaluarCierre(unaRoja).veredicto === "CON_OBSERVACIONES");

const dosRojas: EntradaCierre = { ...limpio, seEjecutoAlgo: false, afirmaCierre: true, hayEvidencia: false };
check("veredicto SUCIO con 2 rojos", evaluarCierre(dosRojas).veredicto === "SUCIO");

check("todo sinProbar NO es LIMPIO", evaluarCierre({}).veredicto === "CON_OBSERVACIONES");

// ── 8. Conteos honestos ────────────────────────────────────────
const r = evaluarCierre(limpio);
check("conteo: 5 verdes", r.verdes === 5, `son ${r.verdes}`);
check("conteo: 0 rojos", r.rojos === 0);
check("conteo: 0 sin probar", r.sinProbar === 0);
check("conteo: suma 5", r.verdes + r.rojos + r.sinProbar === 5);

// ── 9. Lecciones ───────────────────────────────────────────────
const conRojos = evaluarCierre(dosRojas);
check("lecciones: una por eje rojo", conRojos.lecciones.length === 2, `son ${conRojos.lecciones.length}`);
check("lecciones: cada una tiene etiqueta", conRojos.lecciones.every((l) => l.etiqueta.length > 0));
check("lecciones: cada una tiene regla", conRojos.lecciones.every((l) => l.regla.length > 10));
check("lecciones: el síntoma nombra el motivo", conRojos.lecciones.every((l) => l.sintoma.includes("(")));
check("lecciones: cierre limpio no produce lecciones", evaluarCierre(limpio).lecciones.length === 0);

const lec = redactarLecciones([{ eje: "registro", estado: "roja", motivo: "suite huérfana" }]);
check("redactarLecciones: mapea el eje a su lección", lec.length === 1 && lec[0].etiqueta === "registro");
check("redactarLecciones: ignora los verdes", redactarLecciones([{ eje: "registro", estado: "verde", motivo: "" }]).length === 0);

const linea = formatearLeccion({ etiqueta: "puente", sintoma: "bloquea &&", regla: "script a disco" }, "2026-11-04");
check("formatearLeccion: empieza con guion y etiqueta", linea.startsWith("- **[puente]**"));
check("formatearLeccion: incluye la fecha", linea.includes("2026-11-04"));
check("formatearLeccion: incluye la regla", linea.includes("Regla: script a disco"));

// ── 10. Guardado idempotente (io en memoria) ───────────────────
let almacen: Record<string, string> = { "memoria.md": "# MEMORIA\n\n## 3. Lecciones\n" };
const io = {
  leer: (p: string) => {
    if (!(p in almacen)) throw new Error("no existe");
    return almacen[p];
  },
  escribir: (p: string, c: string) => {
    almacen[p] = c;
  },
};

const g1 = guardarLeccion(
  [{ etiqueta: "puente", sintoma: "bloquea &&", regla: "script a disco" }],
  "memoria.md",
  "2026-11-04",
  io,
);
check("guardar: añade 1", g1.añadidas === 1, `añadió ${g1.añadidas}`);
check("guardar: el texto quedó en el archivo", almacen["memoria.md"].includes("**[puente]**"));

const g2 = guardarLeccion(
  [{ etiqueta: "puente", sintoma: "bloquea &&", regla: "script a disco" }],
  "memoria.md",
  "2026-11-04",
  io,
);
check("guardar: la segunda vez NO duplica", g2.añadidas === 0 && g2.saltadas === 1, `añadió ${g2.añadidas}, saltó ${g2.saltadas}`);
check(
  "guardar: el archivo tiene una sola ocurrencia",
  almacen["memoria.md"].split("**[puente]**").length - 1 === 1,
);

const g3 = guardarLeccion(
  [{ etiqueta: "sandbox", sintoma: "edit_file sobre vacío", regla: "fs_write" }],
  "memoria.md",
  "2026-11-04",
  io,
);
check("guardar: una lección distinta sí entra", g3.añadidas === 1);
check("guardar: sin lecciones no toca el archivo", guardarLeccion([], "memoria.md", "x", io).añadidas === 0);

// ── 11. La casilla del fiscal ──────────────────────────────────
check("casilla: sin entrada → sinProbar", evaluarAutoevaluacion(null).estado === "sinProbar");
check("casilla: cierre limpio → verde", evaluarAutoevaluacion(limpio).estado === "verde");
check("casilla: cierre sucio → roja", evaluarAutoevaluacion(dosRojas).estado === "roja");
check("casilla: con observaciones → verde pero con motivo", (() => {
  const c = evaluarAutoevaluacion(unaRoja);
  return c.estado === "verde" && c.motivo.includes("observaciones");
})());
check("casilla: la roja trae directiva", evaluarAutoevaluacion(dosRojas).directiva.length > 10);
check("casilla: el token es autoevaluacion", evaluarAutoevaluacion(limpio).casilla === "autoevaluacion");

// ── 12. El parte ───────────────────────────────────────────────
check("parte: nombra el veredicto", parteAutoevaluacion(evaluarCierre(limpio)).includes("LIMPIO"));
check("parte: nombra SUCIO", parteAutoevaluacion(evaluarCierre(dosRojas)).includes("SUCIO"));
check("parte: vacío si no hay autoevaluación", parteAutoevaluacion(null) === "");

// ── 13. Las entradas de KB ─────────────────────────────────────
check("KB: hay 2 entradas", AUTOEVALUACION_KB_ENTRIES.length === 2);
check("KB: ids únicos", new Set(AUTOEVALUACION_KB_ENTRIES.map((e) => e.id)).size === 2);
check("KB: todas tienen body", AUTOEVALUACION_KB_ENTRIES.every((e) => e.body.length > 100));
check("KB: todas tienen keys", AUTOEVALUACION_KB_ENTRIES.every((e) => e.keys.length >= 3));

// ── Informe ────────────────────────────────────────────────────
console.log(`\n═══ autoevaluacion: ${ok} correctas · ${fail} fallidas ═══`);
if (fallos.length) {
  console.log("\nDETALLE DE FALLOS:");
  for (const f of fallos) console.log("  " + f);
}
process.exit(fail === 0 ? 0 : 1);
