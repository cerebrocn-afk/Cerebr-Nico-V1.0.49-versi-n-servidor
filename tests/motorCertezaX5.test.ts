/**
 * tests/motorCertezaX5.test.ts — v1.59.1 · MOTOR DE CERTEZA / VALIDACIÓN /
 * BUCLE / CONTEXTO (x5)
 * ============================================================================
 * Verifica los OCHO subsistemas puros que endurecen el ciclo del agente:
 *
 *   Contexto quir\u00fargico      → calcularPresupuestoContexto
 *   Compresi\u00f3n sem\u00e1ntica     → comprimirContextoHistorico
 *   Cortafuegos de bucle      → detectarEstancamiento
 *   Memoria de estrategias    → evaluarYFiltrarEstrategias
 *   Matriz de verificaci\u00f3n   → verificarConsistenciaExportaciones
 *   Grafo de dependencias     → validarConsistenciaGrafo
 *   Autorrector de compilaci\u00f3n → parsearYConstruirParcheCompiler + directiva
 *   Auto-correcci\u00f3n limitada  → evaluarIntegridadPostEscritura (MAX=2)
 *
 * Todos los m\u00f3dulos son PUROS (sin red, sin fs, sin estado global).
 *
 * Correr:  npx tsx tests/motorCertezaX5.test.ts
 */

import { calcularPresupuestoContexto } from "../src/motorContexto";
import { detectarEstancamiento, directivaRomperBucle } from "../src/auditoriaBucle";
import { verificarConsistenciaExportaciones } from "../src/matrizVerificacion";
import { MAX_AUTORREVISION, evaluarIntegridadPostEscritura } from "../src/autorrevision";
import { comprimirContextoHistorico } from "../src/resumidorContexto";
import {
  parsearYConstruirParcheCompiler,
  generarDirectivaCorreccion,
} from "../src/autocorrectorCompilacion";
import { validarConsistenciaGrafo } from "../src/grafoDependencias";
import { evaluarYFiltrarEstrategias } from "../src/memoriaEstrategias";
// v1.59.1 — piezas que faltaban + gate orquestador que las cablea.
import { hashArgsCanonico, claveInvocacion } from "../src/engine/hashArgs";
import { diagnosticarBucle } from "../src/auditoriaBucle";
import {
  parsearTodosLosErrores,
  generarDirectivaMultiError,
} from "../src/autocorrectorCompilacion";
import { detectarTruncamiento } from "../src/autorrevision";
import {
  construirNodoDesdeFuentes,
  exportacionesDe,
  importacionesDe,
} from "../src/grafoDependencias";
import { extraerFirmas, aislarSimbolos } from "../src/extraerFirmas";
import { evaluarCierre } from "../src/engine/gateCierre";

let pasados = 0;
let fallados = 0;

function ok(cond: boolean, titulo: string, detalle = "") {
  if (cond) {
    pasados++;
    console.log(`  \x1b[32m\u2713\x1b[0m ${titulo}`);
  } else {
    fallados++;
    console.log(`  \x1b[31m\u2717\x1b[0m ${titulo}${detalle ? ` \u2014 ${detalle}` : ""}`);
  }
}

console.log("\n\u2550\u2550 EJE 1 \u00b7 Contexto quir\u00fargico y presupuesto din\u00e1mico");
{
  const bajo = calcularPresupuestoContexto(
    [{ path: "a.ts", contenido: "x".repeat(100) }],
    15000,
  );
  ok(bajo.superaLimite === false, "no marca recorte por debajo del l\u00edmite");
  ok(bajo.resumenRecorteContexto === null, "sin aviso cuando cabe");
  ok(bajo.caracteresTotales === 100, "suma determinista de caracteres", `fue ${bajo.caracteresTotales}`);

  const alto = calcularPresupuestoContexto(
    [
      { path: "a.ts", contenido: "x".repeat(9000) },
      { path: "b.ts", contenido: "y".repeat(9000) },
    ],
    15000,
  );
  ok(alto.superaLimite === true, "marca recorte al superar el techo");
  ok(alto.caracteresTotales === 18000, "total correcto 18000", `fue ${alto.caracteresTotales}`);
  ok(
    !!alto.resumenRecorteContexto && alto.resumenRecorteContexto.includes("18000/15000"),
    "el aviso declara el peso real vs el techo",
  );
}

console.log("\n\u2550\u2550 Compresi\u00f3n sem\u00e1ntica de contexto");
{
  const sin = comprimirContextoHistorico(
    [{ modulo: "core", resumenFuncional: "exporta logicaBase", caracteresOriginales: 500 }],
    11250,
    5000,
  );
  ok(sin.optimizado === false, "no comprime por debajo del 75%");

  const con = comprimirContextoHistorico(
    [{ modulo: "auth", resumenFuncional: "exporta validarToken, hashPassword", caracteresOriginales: 4500 }],
    11250,
    15000,
  );
  ok(con.optimizado === true, "comprime al superar el 75% del umbral");
  ok(con.contextoComprimido.includes("[M\u00f3dulo auth"), "emite la tarjeta funcional del m\u00f3dulo");
}

console.log("\n\u2550\u2550 EJE 2 \u00b7 Cortafuegos de bucle estancado");
{
  const sano = detectarEstancamiento(
    [
      { toolName: "read_file", argsHash: "a" },
      { toolName: "read_file", argsHash: "b" },
      { toolName: "write_file", argsHash: "c" },
    ],
    3,
  );
  ok(sano === false, "no marca estancado si cambia herramienta/args");

  const atascado = detectarEstancamiento(
    [
      { toolName: "search", argsHash: "q1" },
      { toolName: "search", argsHash: "q1" },
      { toolName: "search", argsHash: "q1" },
    ],
    3,
  );
  ok(atascado === true, "marca estancado con 3 repeticiones id\u00e9nticas");
  ok(detectarEstancamiento([{ toolName: "x", argsHash: "y" }], 3) === false, "historial corto nunca estancado");
  ok(directivaRomperBucle("search").includes("CORTAFUEGOS"), "la pista correctiva nombra el cortafuegos");
}

console.log("\n\u2550\u2550 Memoria de estrategias (callejones sin salida)");
{
  const libre = evaluarYFiltrarEstrategias(
    [{ enfoqueLogico: "iterativo", errorGenerado: "Timeout" }],
    "memoizado",
  );
  ok(libre.permitido === true, "permite un enfoque nuevo");

  const vetado = evaluarYFiltrarEstrategias(
    [{ enfoqueLogico: "usar_recursividad_profunda", errorGenerado: "Maximum call stack size exceeded" }],
    "USAR_RECURSIVIDAD_PROFUNDA",
  );
  ok(vetado.permitido === false, "proh\u00edbe un enfoque ya descartado (case-insensitive)");
  ok(
    !!vetado.directivaExclusion && vetado.directivaExclusion.includes("DIRECTIVA DE EXCLUSI\u00d3N ESTRICTA"),
    "inyecta la directiva de exclusi\u00f3n",
  );
}

console.log("\n\u2550\u2550 EJE 3 \u00b7 Matriz de verificaci\u00f3n cruzada");
{
  const con = verificarConsistenciaExportaciones(
    "export function foo() {}\nexport const bar = 1;\nexport interface Baz {}",
  );
  ok(con.exportsCount === 3, "cuenta 3 exportaciones nombradas", `fue ${con.exportsCount}`);
  ok(con.tieneExportValido === true, "archivo con exports es v\u00e1lido");

  const def = verificarConsistenciaExportaciones("const x = 1;\nexport default x;");
  ok(def.tieneExportValido === true, "acepta export default");

  const vacio = verificarConsistenciaExportaciones("const privado = 1;");
  ok(vacio.tieneExportValido === false, "sin ninguna exportaci\u00f3n es inv\u00e1lido");
}

console.log("\n\u2550\u2550 Grafo de dependencias cruzadas");
{
  const nodo = {
    path: "src/api.ts",
    exportaciones: ["procesarDatos", "conectarDB"],
    importacionesConsumidores: [{ path: "src/main.ts", imports: ["procesarDatos"] }],
  };
  const roto = validarConsistenciaGrafo(nodo, ["conectarDB"]);
  ok(roto.cambiosRotos === true, "detecta rotura al eliminar una exportaci\u00f3n consumida");
  ok(
    !!roto.reporteIncompatibilidad && roto.reporteIncompatibilidad.includes("src/main.ts"),
    "reporta al consumidor afectado",
  );

  const ok2 = validarConsistenciaGrafo(nodo, ["procesarDatos", "conectarDB"]);
  ok(ok2.cambiosRotos === false, "sin rotura si se mantienen las exportaciones");
}

console.log("\n\u2550\u2550 Autorrector de compilaci\u00f3n (self-healing)");
{
  const err = parsearYConstruirParcheCompiler(
    "src/motorContexto.ts(14,23): error TS2322: Type 'string' is not assignable to type 'number'.",
  );
  ok(err !== null, "parsea el error del compilador");
  ok(err!.archivo === "src/motorContexto.ts", "extrae el archivo", err?.archivo);
  ok(err!.linea === 14, "extrae la l\u00ednea", String(err?.linea));
  ok(err!.mensaje.includes("TS2322"), "conserva el c\u00f3digo de error TS");
  ok(parsearYConstruirParcheCompiler("todo bien, 0 errores") === null, "sin error devuelve null");
  const directiva = generarDirectivaCorreccion(err!);
  ok(directiva.includes("TS2322") && directiva.includes("src/motorContexto.ts"), "la directiva es accionable");
}

console.log("\n\u2550\u2550 EJE 4 \u00b7 Auto-correcci\u00f3n limitada y cierre at\u00f3mico");
{
  ok(MAX_AUTORREVISION === 2, "el tope estricto es 2");

  const limpio = evaluarIntegridadPostEscritura("export function x() { return 1; }", 0);
  ok(limpio.aprobado === true, "aprueba contenido completo");

  const trunc1 = evaluarIntegridadPostEscritura("function x() {\n  // ... resto igual\n}", 1);
  ok(trunc1.aprobado === false, "bloquea el cierre con relleno");
  ok(
    !!trunc1.directivaCorreccion && trunc1.directivaCorreccion.includes("AUTORREVISI\u00d3N INTENTO 1"),
    "pide corregir dentro del tope",
  );

  const tope = evaluarIntegridadPostEscritura("// TODO: implementar", MAX_AUTORREVISION);
  ok(tope.aprobado === false, "no aprueba al llegar al tope");
  ok(
    !!tope.directivaCorreccion && tope.directivaCorreccion.includes("ERROR CR\u00cdTICO"),
    "al tope declara error cr\u00edtico (sin bucle infinito)",
  );
}

console.log("\n\u2550\u2550 v1.59.1 · Huella canonica de argumentos (hashArgs)");
{
  const a = hashArgsCanonico('{"path":"a.ts","content":"x"}');
  const b = hashArgsCanonico('{ "content":"x", "path":"a.ts" }');
  ok(a === b, "mismo hash aunque cambien orden y espacios", `${a} vs ${b}`);
  ok(
    hashArgsCanonico('{"path":"a.ts"}') !== hashArgsCanonico('{"path":"b.ts"}'),
    "distinto contenido => distinto hash",
  );
  ok(hashArgsCanonico("texto no json") === hashArgsCanonico("  texto no json  "), "cae a texto normalizado");
  ok(claveInvocacion("read_file", '{"path":"a"}').startsWith("read_file\u2502"), "la clave lleva tool + separador");
}

console.log("\n\u2550\u2550 v1.59.1 · Diagnostico de bucle (ciclo A-B-A-B y saturacion)");
{
  const ciclo = diagnosticarBucle([
    { toolName: "read_file", argsHash: "A" },
    { toolName: "list_files", argsHash: "B" },
    { toolName: "read_file", argsHash: "A" },
    { toolName: "list_files", argsHash: "B" },
  ]);
  ok(ciclo.estancado && ciclo.motivo === "ciclo-alterno", "detecta ciclo alterno A-B-A-B", ciclo.motivo || "");

  const sat = diagnosticarBucle([
    { toolName: "read_file", argsHash: "a" },
    { toolName: "read_file", argsHash: "b" },
    { toolName: "read_file", argsHash: "c" },
    { toolName: "read_file", argsHash: "d" },
  ]);
  ok(sat.estancado && sat.motivo === "saturacion", "detecta saturacion de lectura sin escritura", sat.motivo || "");

  const sano = diagnosticarBucle([
    { toolName: "read_file", argsHash: "a" },
    { toolName: "write_file", argsHash: "b" },
    { toolName: "read_file", argsHash: "c" },
    { toolName: "write_file", argsHash: "d" },
  ]);
  ok(!sano.estancado, "no marca bucle si hay escrituras intercaladas");
}

console.log("\n\u2550\u2550 v1.59.1 · Autocorrector multi-error");
{
  const salida =
    "src/a.ts(3,1): error TS2322: Type X.\n" +
    "src/a.ts(9,4): error TS2345: Arg Y.\n" +
    "src/b.ts(2,2): error TS1005: ';' expected.";
  const errores = parsearTodosLosErrores(salida);
  ok(errores.length === 3, "extrae los 3 errores", String(errores.length));
  const dir = generarDirectivaMultiError(errores);
  ok(!!dir && dir!.includes("3 errores"), "la directiva declara el total");
  ok(!!dir && dir!.includes("src/a.ts") && dir!.includes("src/b.ts"), "agrupa por archivo");
  ok(parsearTodosLosErrores("sin errores").length === 0, "sin errores => lista vacia");
}

console.log("\n\u2550\u2550 v1.59.1 · Autorrevision menos fragil (deteccion anclada a linea)");
{
  ok(detectarTruncamiento("const u = 'http://x/...resto';") === false, "no hay falso positivo dentro de una cadena");
  ok(detectarTruncamiento("  // ...\n") === true, "linea que es solo // ... es relleno");
  ok(detectarTruncamiento("// mantener el resto igual") === true, "marcador de omision explicito");
}

console.log("\n\u2550\u2550 v1.59.1 · Firmas (Eje 1) + constructor de grafo");
{
  const src = "export function foo(a: number): string {\n  return '' + a;\n}\nexport interface Bar { x: number }\nconst oculto = 1;";
  const firmas = extraerFirmas(src);
  ok(firmas.length === 2, "extrae 2 firmas exportadas", String(firmas.length));
  ok(firmas.some((f) => f.nombre === "foo" && !f.firma.includes("return")), "la firma de foo no trae el cuerpo");
  const res = aislarSimbolos([{ path: "m.ts", contenido: src }]);
  ok(res[0].caracteresFirmas < res[0].caracteresOriginales, "las firmas pesan menos que el original");

  const fuentes = [
    { path: "src/api.ts", contenido: "export function procesar(){}\nexport const base = 1;" },
    { path: "src/main.ts", contenido: "import { procesar } from './api';\nprocesar();" },
  ];
  ok(exportacionesDe(fuentes[0].contenido).includes("procesar"), "exportacionesDe lee los exports");
  ok(importacionesDe(fuentes[1].contenido).includes("procesar"), "importacionesDe lee los imports nombrados");
  const nodo = construirNodoDesdeFuentes("src/api.ts", fuentes);
  ok(nodo.importacionesConsumidores.length === 1 && nodo.importacionesConsumidores[0].path === "src/main.ts", "el constructor detecta al consumidor");
}

console.log("\n\u2550\u2550 v1.59.1 · Gate de cierre unificado (orquestador que cablea los huerfanos)");
{
  const limpio = evaluarCierre({
    historialHerramientas: [{ toolName: "write_file", argsHash: "z" }],
    escrituras: [{ path: "ok.ts", contenido: "export const a = 1;", intento: 0 }],
  });
  ok(limpio.liberar === true, "libera el cierre cuando todo esta sano");

  const sucio = evaluarCierre({
    historialHerramientas: [
      { toolName: "read_file", argsHash: "A" },
      { toolName: "list_files", argsHash: "B" },
      { toolName: "read_file", argsHash: "A" },
      { toolName: "list_files", argsHash: "B" },
    ],
    escrituras: [{ path: "roto.ts", contenido: "export function x(){\n  // ... resto\n}", intento: 0 }],
  });
  ok(sucio.liberar === false, "bloquea el cierre con bucle + obra truncada");
  ok(sucio.telemetria.bucleMotivo === "ciclo-alterno", "la telemetria reporta el motivo del bucle");
  ok(sucio.telemetria.archivosConTruncamiento === 1, "la telemetria cuenta el archivo truncado");
  ok(sucio.directivas.length >= 2, "inyecta al menos 2 directivas correctivas", String(sucio.directivas.length));
}

console.log(`\n\u2550\u2550 Resultado: ${pasados} \u2713  ${fallados} \u2717\n`);
if (fallados > 0) process.exit(1);
