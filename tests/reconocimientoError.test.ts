/**
 * tests/reconocimientoError.test.ts — pruebas de la capa de reconocimiento de errores (v1.30.0)
 * =============================================================================================
 * Se ejecuta con:  npx tsx tests/reconocimientoError.test.ts
 * Sin framework: un mini-runner con assert. Cubre el bug REAL de la sesión
 * (flip-flop react-dom ↔ react-dom/client) y todas las clases de error.
 */

import {
  contextoError,
  paqueteRaiz,
  firmaError,
  analizarBucle,
  diagnosticoRaiz,
  directrizReconocimiento,
  directrizReconocimientoEstatica,
  resumenAprendizaje,
  type Resultado,
} from "../src/engine/reconocimientoError";

let pasados = 0;
let fallidos = 0;
function ok(cond: boolean, nombre: string): void {
  if (cond) { pasados++; console.log(`  ✓ ${nombre}`); }
  else { fallidos++; console.error(`  ✗ ${nombre}`); }
}
function eq<T>(a: T, b: T, nombre: string): void {
  ok(JSON.stringify(a) === JSON.stringify(b), `${nombre}  (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);
}

// El error EXACTO de la sesión adjunta.
const ERR_VITE =
  `[plugin:vite:import-analysis] Failed to resolve import "react-dom/client" from "src/main.tsx". Does the file exist?\n` +
  `C:/Cerebronico/src/main.tsx:2:21\n` +
  `1  |  import React from 'react'\n` +
  `2  |  import { createRoot } from 'react-dom/client'\n`;
const ERR_VITE_VARIANTE =
  `[plugin:vite:import-analysis] Failed to resolve import "react-dom" from "src/main.tsx". Does the file exist?\n` +
  `C:/Cerebronico/src/main.tsx:2:31\n`;

console.log("\n── 1. contextoError ──");
{
  const c = contextoError(ERR_VITE);
  eq(c.clase, "import-no-resuelto", "clasifica import-no-resuelto");
  eq(c.modulo, "react-dom/client", "extrae el módulo ofensor");
  eq(c.archivo, "src/main.tsx", "extrae el archivo relativo (sin C:/)");
  eq(c.linea, 2, "extrae la línea");
  eq(c.columna, 21, "extrae la columna");
  eq(c.herramienta, "vite", "detecta la herramienta vite");
  ok((c.fragmento || "").includes("createRoot"), "rescata el fragmento de código citado");

  eq(contextoError("Cannot find module 'express'").clase, "modulo-no-encontrado", "clasifica modulo-no-encontrado");
  eq(contextoError("Cannot find module 'express'").modulo, "express", "módulo de node");
  eq(contextoError("SyntaxError: Unexpected token '}'").clase, "sintaxis", "clasifica sintaxis");
  eq(contextoError("ReferenceError: foo is not defined").clase, "referencia", "clasifica referencia");
  eq(contextoError("foo is not defined").modulo, "foo", "referencia extrae el símbolo");
  eq(contextoError("error TS2322: Type 'string' is not assignable to type 'number'").clase, "tipo", "clasifica tipo");
  eq(contextoError("TypeError: cannot read properties of undefined").clase, "runtime", "clasifica runtime");
  eq(contextoError("").clase, "desconocido", "texto vacío = desconocido");
  eq(contextoError("blah blah").clase, "desconocido", "texto sin patrón = desconocido");
}

console.log("\n── 2. paqueteRaiz / firmaError ──");
{
  eq(paqueteRaiz("react-dom/client"), "react-dom", "normaliza subpath a la raíz");
  eq(paqueteRaiz("react-dom"), "react-dom", "paquete ya raíz se respeta");
  eq(paqueteRaiz("@scope/pkg/sub/x"), "@scope/pkg", "scoped: mantiene @scope/pkg");
  eq(paqueteRaiz("./local/archivo"), "./local/archivo", "ruta relativa no se toca");

  // LA CLAVE: react-dom y react-dom/client comparten firma.
  const f1 = firmaError(ERR_VITE);
  const f2 = firmaError(ERR_VITE_VARIANTE);
  eq(f1, f2, "react-dom y react-dom/client tienen la MISMA firma");
  eq(f1, "import-no-resuelto|react-dom", "firma normalizada al paquete raíz");
  ok(firmaError("Cannot find module 'express'") !== f1, "errores distintos, firmas distintas");
}

console.log("\n── 3. analizarBucle ──");
{
  eq(analizarBucle([]).enBucle, false, "historial vacío no es bucle");
  eq(analizarBucle([ERR_VITE]).enBucle, false, "un solo error no es bucle");

  // El flip-flop de la sesión: aunque el texto varíe, es el mismo error.
  const a = analizarBucle([ERR_VITE, ERR_VITE_VARIANTE]);
  eq(a.enBucle, true, "flip-flop react-dom detectado como bucle");
  eq(a.repeticiones, 2, "cuenta 2 repeticiones");
  eq(a.primeraAparicion, 0, "marca la primera aparición");
  eq(a.clase, "import-no-resuelto", "reporta la clase del último");

  // Errores distintos entremedias no disparan bucle sobre el último.
  const b = analizarBucle([ERR_VITE, "SyntaxError: Unexpected token '}'"]);
  eq(b.enBucle, false, "errores diferentes no son bucle");

  // Umbral configurable.
  eq(analizarBucle([ERR_VITE, ERR_VITE_VARIANTE], 3).enBucle, false, "minRepeticiones=3 no dispara con 2");
}

console.log("\n── 4. diagnosticoRaiz ──");
{
  const d = diagnosticoRaiz("import-no-resuelto", "react-dom/client");
  ok(d.causa.includes("react-dom") && /no está|no instalada|no declarada/.test(d.causa), "causa = dependencia faltante");
  ok(/NO reescribas/i.test(d.noHagas), "prohibe reescribir el import");
  ok(d.noHagas.includes("react-dom"), "nombra el paquete en el anti-patrón");
  ok(d.arreglos.length >= 2, "ofrece varios caminos de arreglo");

  ok(/as any|ts-ignore/i.test(diagnosticoRaiz("tipo").noHagas), "tipo: prohibe silenciar con any/ts-ignore");
  ok(/archivo|línea/i.test(diagnosticoRaiz("sintaxis").arreglos.join(" ")), "sintaxis: manda al archivo:línea");
  eq(diagnosticoRaiz("desconocido").clase, "desconocido", "desconocido devuelve su clase");
}

console.log("\n── 5. directrizReconocimiento ──");
{
  const rec = directrizReconocimiento(analizarBucle([ERR_VITE, ERR_VITE_VARIANTE]));
  ok(rec.reconocer, "en bucle: exige reconocer");
  ok(/Reconozco que estoy repitiendo/i.test(rec.mensaje), "mensaje admite el bucle en español");
  ok(rec.mensaje.includes("Causa raíz") && rec.mensaje.includes("Cambio de enfoque"), "mensaje trae causa y cambio de enfoque");
  ok(/BUCLE DETECTADO/i.test(rec.directiva), "directiva marca el bucle");

  const recNo = directrizReconocimiento(analizarBucle([ERR_VITE]));
  eq(recNo.reconocer, false, "un solo error no obliga a reconocer bucle");
  ok(recNo.directiva.includes("[ERROR]"), "aun sin bucle da directiva de causa raíz");

  const recVacio = directrizReconocimiento(analizarBucle([]));
  eq(recVacio.reconocer, false, "sin errores no reconoce");
  eq(recVacio.directiva, "", "sin errores no da directiva");

  const est = directrizReconocimientoEstatica();
  ok(/RECONOCE TUS ERRORES/i.test(est), "regla estática tiene cabecera");
  ok(est.includes("react-dom") && /mismo paquete|mismo fallo/i.test(est), "regla estática enseña el caso react-dom");
}

console.log("\n── 6. resumenAprendizaje ──");
{
  const res: Resultado[] = [
    { tipo: "acierto", que: "módulo puro + test + validar.mjs", leccion: "reglas con código, no sólo prompt" },
    { tipo: "error", que: "reescribí el import de react-dom 15 veces", leccion: "comparar firma antes de reintentar" },
    { tipo: "acierto", que: "reconocí el bucle y cambíé de enfoque" },
  ];
  const r = resumenAprendizaje(res);
  eq(r.aciertos.length, 2, "cuenta 2 aciertos");
  eq(r.errores.length, 1, "cuenta 1 error");
  eq(r.lecciones.length, 2, "recoge 2 lecciones");
  ok(r.texto.includes("Aciertos") && r.texto.includes("Errores") && r.texto.includes("Lecciones"), "texto trae las tres secciones");
  ok(r.texto.includes("✓") && r.texto.includes("✗"), "marca aciertos con ✓ y errores con ✗");

  const vacio = resumenAprendizaje([]);
  eq(vacio.texto, "", "sin resultados, texto vacío");
}

console.log(`\n═══ reconocimientoError: ${pasados} ✓ / ${fallidos} ✗ ═══`);
if (fallidos > 0) process.exit(1);
