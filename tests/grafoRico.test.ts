/**
 * tests/grafoRico.test.ts — GRAFO RICO + REGRESSION GUARDIAN (v1.36.0 · FASE 6)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/grafoRico.test.ts
 *
 * Hoja de ruta §2/§9: aristas llama/sirve/comparte-contrato/comparte-endpoint;
 * y comparación proyecto completo antes/después: export/ruta/API que desaparece
 * = FALLO. Se prueban extractores puros, el grafo rico y el guardián.
 */
import {
  exportsDe, endpointsServidos, endpointsConsumidos, importsNombrados,
  construirGrafoRico, llamadoresDe, grafoRicoAParte,
} from "../src/engine/grafoRico";
import {
  compararProyecto, directivaDeRegresion, regresionAParte, UMBRAL_REDUCCION,
} from "../src/engine/guardianRegresion";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

seccion("1. Extractores puros");
{
  comprobar("exportsDe capta function/const/{}/default", (() => {
    const e = exportsDe("export function foo(){}\nexport const bar=1\nexport { baz, qux as q }\nexport default class App{}");
    return e.includes("foo") && e.includes("bar") && e.includes("baz") && e.includes("q") && e.includes("App");
  })());
  comprobar("exportsDe capta def/class de Python", exportsDe("def handler():\n  pass\nclass Motor:\n  pass").join(",") === "Motor,handler");
  comprobar("endpointsServidos capta app.get y router.post", (() => {
    const s = endpointsServidos("app.get('/users', h)\nrouter.post(\"/users/:id\", h)");
    return s.includes("/users") && s.includes("/users/:id");
  })());
  comprobar("endpointsServidos capta decorador Python", endpointsServidos("@app.route('/api/health')\ndef h(): pass").includes("/api/health"));
  comprobar("endpointsConsumidos capta fetch y axios", (() => {
    const c = endpointsConsumidos("fetch('/users')\naxios.get('/api/health')\nfetch('https://x.com/ext?q=1')");
    return c.includes("/users") && c.includes("/api/health") && c.includes("/ext");
  })());
  comprobar("importsNombrados capta default y {}", (() => {
    const i = importsNombrados("import React, { useState, useEffect as ue } from './x'");
    return i[0].nombres.includes("React") && i[0].nombres.includes("useState") && i[0].nombres.includes("ue");
  })());
}

seccion("2. Grafo rico: llama / sirve / comparte_endpoint / comparte_contrato");
{
  const ficheros = [
    { path: "api.ts", content: "export function crearUsuario(){}\napp.get('/users', h)\napp.post('/users', h)" },
    { path: "servicio.ts", content: "import { crearUsuario } from './api'\nexport function alta(){ return crearUsuario() }" },
    { path: "cliente.tsx", content: "export function Panel(){ fetch('/users'); return null }" },
    { path: "tiposA.ts", content: "export interface Usuario { id: string; nombre: string }" },
    { path: "tiposB.ts", content: "export interface Usuario { id: string; nombre: string }" },
  ];
  const g = construirGrafoRico(ficheros);
  comprobar("servicio.ts LLAMA a api.ts (usa crearUsuario)", g.aristas.some((a) => a.tipo === "llama" && a.desde === "servicio.ts" && a.hacia === "api.ts"));
  comprobar("llamadoresDe(api.ts) incluye servicio.ts", llamadoresDe(g, "api.ts").some((a) => a.desde === "servicio.ts"));
  comprobar("api.ts SIRVE /users", g.aristas.some((a) => a.tipo === "sirve" && a.desde === "api.ts" && a.etiqueta === "/users"));
  comprobar("api.ts y cliente.tsx COMPARTEN endpoint /users", g.aristas.some((a) => a.tipo === "comparte_endpoint" && a.etiqueta === "/users" && a.hacia === "cliente.tsx"));
  comprobar("tiposA y tiposB COMPARTEN contrato Usuario", g.aristas.some((a) => a.tipo === "comparte_contrato" && a.etiqueta === "Usuario"));
  comprobar("el parte cuenta las relaciones", /llama.*sirve.*endpoint-compartido/.test(grafoRicoAParte(g)));
}

seccion("3. Regression Guardian: export/ruta/API que desaparece = alta");
{
  const antes = [
    { path: "api.ts", content: "export function crearUsuario(){}\nexport function borrarUsuario(){}\napp.get('/users', h)" },
    { path: "Panel.tsx", content: "export function Panel(){ return null }" },
    { path: "tests/api.test.ts", content: "// test de la api" },
  ];
  const despues = [
    { path: "api.ts", content: "export function crearUsuario(){}" }, // se fue borrarUsuario y /users
    // Panel.tsx eliminado; el test eliminado
  ];
  const v = compararProyecto(antes, despues);
  comprobar("detecta export desaparecido (borrarUsuario)", v.hallazgos.some((h) => h.tipo === "export_desaparecido" && /borrarUsuario/.test(h.detalle)));
  comprobar("detecta endpoint desaparecido (/users)", v.hallazgos.some((h) => h.tipo === "endpoint_desaparecido"));
  comprobar("detecta componente eliminado (Panel.tsx)", v.hallazgos.some((h) => h.tipo === "componente_eliminado"));
  comprobar("detecta test desaparecido", v.hallazgos.some((h) => h.tipo === "test_desaparecido"));
  comprobar("hay regresión de severidad alta", v.regresion === true && v.resumen.alta >= 3);
  comprobar("la directiva enumera lo roto", /REGRESSION GUARDIAN/.test(directivaDeRegresion(v)));
}

seccion("4. Reducción anormal, contrato cambiado y dependencia nueva");
{
  const grande = "export function x(){\n" + "  const a=1;\n".repeat(30) + "}";
  const antes = [
    { path: "big.ts", content: grande },
    { path: "tipos.ts", content: "export interface P { a: string; b: number; c: boolean }" },
    { path: "package.json", content: '{"dependencies":{"react":"1"}}' },
  ];
  const despues = [
    { path: "big.ts", content: "export function x(){}" },
    { path: "tipos.ts", content: "export interface P { a: string }" },
    { path: "package.json", content: '{"dependencies":{"react":"1","lodash":"4"}}' },
  ];
  const v = compararProyecto(antes, despues);
  comprobar("detecta reducción anormal ≥" + Math.round(UMBRAL_REDUCCION * 100) + "%", v.hallazgos.some((h) => h.tipo === "reduccion_anormal"));
  comprobar("detecta contrato cambiado (P perdió campos)", v.hallazgos.some((h) => h.tipo === "contrato_cambiado"));
  comprobar("detecta dependencia nueva (lodash) como baja", v.hallazgos.some((h) => h.tipo === "dependencia_nueva" && h.severidad === "baja"));
  comprobar("el parte resume por severidad", /alta.*media.*baja/.test(regresionAParte(v)));
}

seccion("5. Sin cambios dañinos: no hay regresión");
{
  const files = [{ path: "a.ts", content: "export const x = 1" }];
  const v = compararProyecto(files, [{ path: "a.ts", content: "export const x = 1\nexport const y = 2" }]);
  comprobar("agregar un export no es regresión", v.regresion === false);
  comprobar("directiva vacía sin regresión alta", directivaDeRegresion(v) === "");
}

console.log("\n" + "\u2500".repeat(58));
if (fallos.length === 0) console.log(`\u2550\u2550\u2550 GRAFO RICO + REGRESIÓN: ${correctas} correctas · 0 fallidas \u2550\u2550\u2550`);
else { console.log(`\u2550\u2550\u2550 GRAFO RICO + REGRESIÓN: ${correctas} correctas · ${fallos.length} FALLIDAS \u2550\u2550\u2550`); fallos.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
