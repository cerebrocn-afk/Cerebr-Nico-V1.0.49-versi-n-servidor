// tests/reformuladorConsultas.test.ts — v1.0.28
// «¿Se puede reformular en el sandbox y mandar UNA sola petición?» — sí, y esta
// suite fija qué significa exactamente: plegar, ordenar, recortar y DECIR qué
// quedó afuera. Sin red, sin modelo, sin claves.

import assert from "node:assert";
import {
  MAX_LARGO_CONSULTA,
  MAX_PREGUNTAS,
  claveDePlegado,
  limpiarPregunta,
  reformular,
  sinTildes,
  valorDeBusqueda,
} from "../src/engine/reformuladorConsultas";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

prueba("limpiar: comillas tipográficas, saltos de línea y signos de sobra", () => {
  assert.strictEqual(limpiarPregunta("¿Qué es   MCP?\n\t "), "Qué es MCP");
  assert.strictEqual(limpiarPregunta("“mcp” y «stdio»"), '"mcp" y "stdio"');
  assert.strictEqual(limpiarPregunta("   "), "");
  assert.strictEqual(limpiarPregunta(undefined as any), "");
});

prueba("sinTildes compara igual: código = codigo", () => {
  assert.strictEqual(sinTildes("código ñandú"), "codigo nandu");
});

prueba("clave de plegado: mayúsculas, tildes, artículos y ORDEN de palabras no importan", () => {
  const a = claveDePlegado("¿Qué es el MCP?");
  const b = claveDePlegado("mcp es que");
  const c = claveDePlegado("MCP: qué es");
  assert.strictEqual(a, b, `${a} ≠ ${b}`);
  assert.strictEqual(a, c, `${a} ≠ ${c}`);
  assert.notStrictEqual(claveDePlegado("mcp stdio"), claveDePlegado("mcp http"));
});

prueba("valor de búsqueda: lo específico vale más que lo vago", () => {
  const especifica = valorDeBusqueda('"ERR_MODULE_NOT_FOUND" node 16 tsx');
  const vaga = valorDeBusqueda("error cosa");
  assert.ok(especifica > vaga, `${especifica} debía ser > ${vaga}`);
  assert.ok(valorDeBusqueda("server.ts") > valorDeBusqueda("cosa"), "un nombre de archivo vale más que una palabra común");
  assert.ok(valorDeBusqueda("x") < valorDeBusqueda("x y"), "una sola palabra vale menos sola");
});

prueba("el caso de Mario: 4 preguntas casi iguales → UNA consulta y las 3 plegadas", () => {
  const r = reformular(["¿Qué es el MCP?", "que es mcp", "MCP: qué es", "Qué es el protocolo MCP stdio"]);
  assert.deepStrictEqual(r.incluidas, ["Qué es el protocolo MCP stdio", "Qué es el MCP"], r.incluidas.join(" | "));
  assert.strictEqual(r.plegadas.length, 2, JSON.stringify(r.plegadas));
  assert.ok(r.consulta.includes(" OR "), r.consulta);
  assert.strictEqual(r.consulta, r.incluidas.join(" OR "));
});

prueba("el plegado DICE en quién se plegó, no borra en silencio", () => {
  const r = reformular(["mcp stdio", "MCP: stdio"]);
  assert.deepStrictEqual(r.plegadas, [{ pregunta: "MCP: stdio", en: "mcp stdio" }]);
});

prueba("ordena por valor: la específica va primero aunque llegue última", () => {
  const r = reformular(["error", "cómo arreglar el error ERR_MODULE_NOT_FOUND tsx node 16"]);
  assert.ok(r.incluidas[0].includes("ERR_MODULE_NOT_FOUND"), r.incluidas.join(" | "));
});

prueba("tope de preguntas: lo que sobra va a `fuera`, no se pierde", () => {
  const preguntas = ["a1 alpha", "b2 beta", "c3 gamma", "d4 delta", "e5 epsilon", "f6 zeta", "g7 eta"];
  const r = reformular(preguntas, { maxPreguntas: 3 });
  assert.strictEqual(r.incluidas.length, 3);
  assert.strictEqual(r.fuera.length, 4, JSON.stringify(r.fuera));
  assert.strictEqual(MAX_PREGUNTAS, 6);
});

prueba("tope de largo: ninguna consulta excede el máximo (un 414 no es una búsqueda)", () => {
  const largas = Array.from({ length: 6 }, (_, i) => `pregunta ${i} ` + "palabra ".repeat(20).trim());
  const r = reformular(largas, { maxLargo: 200 });
  assert.ok(r.consulta.length <= 200, `${r.consulta.length}`);
  assert.ok(r.fuera.length > 0);
  assert.strictEqual(MAX_LARGO_CONSULTA, 380);
});

prueba("una sola pregunta enorme: se recorta en borde de palabra y se dice", () => {
  const enorme = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(" ");
  const r = reformular([enorme], { maxLargo: 120 });
  assert.ok(r.consulta.length <= 120, `${r.consulta.length}`);
  assert.ok(!r.consulta.endsWith("palab"), "no se corta a mitad de palabra: " + r.consulta);
  assert.ok(r.fuera.includes(enorme), "la original completa se declara fuera");
});

prueba("vacías y signos: no se cuentan como preguntas, pero se informan", () => {
  const r = reformular(["", "   ", "???", "mcp real"]);
  assert.deepStrictEqual(r.incluidas, ["mcp real"]);
  assert.deepStrictEqual(r.vacias, ["???"]);
});

prueba("lista vacía o sin argumentos: consulta vacía, sin excepciones", () => {
  assert.strictEqual(reformular([]).consulta, "");
  assert.strictEqual(reformular(undefined as any).consulta, "");
  assert.strictEqual(reformular(["", " "]).consulta, "");
});

prueba("operador espacio: para buscadores que no entienden OR", () => {
  const r = reformular(["mcp stdio", "mcp http"], { operador: " " });
  assert.ok(!r.consulta.includes("OR"), r.consulta);
  assert.strictEqual(r.consulta, r.incluidas.join(" "));
});

prueba("estable: dos preguntas de igual valor conservan el orden del usuario", () => {
  const r = reformular(["alfa beta", "gama delta"]);
  // Mismo valor → el usuario manda.
  assert.deepStrictEqual(r.incluidas, ["alfa beta", "gama delta"], r.incluidas.join(" | "));
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nreformuladorConsultas: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
