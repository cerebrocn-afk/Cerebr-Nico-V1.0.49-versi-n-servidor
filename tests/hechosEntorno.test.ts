/**
 * tests/hechosEntorno.test.ts — v1.62.0
 * ============================================================================
 * El mensaje 3 de la sesión `1792793541672` decía, sin una sola llamada a
 * herramienta en todo el historial:
 *
 *   «Motor v1.51.0 activo. Entorno con 799 archivos indexados, sandbox operativo
 *     en puerto 3500 y puente PC en puerto 5000… 97 herramientas… Ollama apagado.»
 *
 * Real y medido en el árbol: `VERSION_SEMVER = 1.61.0` (1.51.0 no existe en
 * ningún archivo), 37 herramientas nativas en 7 packs (`getAllToolNames()` tras
 * `registerBuiltinPacks()`), 19 archivos en el editor. La cadena «archivos
 * indexados» no aparece en ningún prompt inyectado del repo: el modelo no la
 * podía haber leído. Donde el prompt calla, el modelo completa.
 *
 * Este test fija el contrato del bloque `[HECHOS DEL ENTORNO]`: sólo dice lo que
 * el motor midió, calla lo que no, y la regla prohíbe afirmar lo que no está.
 */
import { bloqueDeHechos, REGLA_DE_ESTADO } from "../src/engine/conciencia";

let ok = 0;
let fail = 0;
const af = (nombre: string, cond: boolean) => {
  if (cond) { ok++; console.log("  ✓ " + nombre); }
  else { fail++; console.log("  ✗ " + nombre); }
};

// ── Con datos medidos ────────────────────────────────────────────────────────
const bloque = bloqueDeHechos({ version: "1.62.0", herramientas: 37, archivos: 19, sandbox: "arriba", herramientasExternas: 60 });
console.log("  · bloque generado:\n" + bloque.split("\n").map((l) => "      " + l).join("\n"));
af("declara la versión leída", bloque.includes("Versión del motor: 1.62.0"));
af("declara el conteo real de herramientas", bloque.includes("Herramientas registradas ahora: 37"));
af("declara los archivos del editor", bloque.includes("Archivos en el editor: 19"));
af("declara el puerto del sandbox medido", bloque.includes("Sandbox (:3500): arriba"));
af("diferencia herramientas propias de las de puentes", bloque.includes("puentes externos: 60"));
af("encabeza como leído, no como suposición", bloque.startsWith("[HECHOS DEL ENTORNO"));

// ── La regla anti-afirmación viaja con el bloque ────────────────────────────
af("la regla va DENTRO del bloque (no es un consejo aparte)", bloque.includes(REGLA_DE_ESTADO));
af("  prohíbe inventar versión/archivos/puertos", /NO LO AFIRMES/.test(REGLA_DE_ESTADO) && /versi/.test(REGLA_DE_ESTADO) && /puertos/.test(REGLA_DE_ESTADO));
af("  y ofrece la salida honesta: consultar o decir que no se verificó", /consultá la herramienta|decí explícitamente/i.test(REGLA_DE_ESTADO));

// ── Sin datos: no hay bloque ────────────────────────────────────────────────
af("sin ningún dato medido NO emite bloque", bloqueDeHechos({}) === "");
af("  ni con todo null", bloqueDeHechos({ version: null, herramientas: null, archivos: null, sandbox: null }) === "");
af("un sandbox no medido no se afirma", bloqueDeHechos({ sandbox: "desconocido" }) === "");
af("  pero 'abajo' sí es un dato medido", bloqueDeHechos({ sandbox: "abajo" }).includes("abajo"));

// ── Cero no es «sin dato» ───────────────────────────────────────────────────
const cero = bloqueDeHechos({ herramientas: 0, archivos: 0 });
af("cero herramientas se dice cero (no se omite)", cero.includes("Herramientas registradas ahora: 0") && cero.includes("Archivos en el editor: 0"));
af("  y el bloque no se inventa una versión que nadie pasó", !cero.includes("Versión"));

// ── Lo que este bloque NO promete ───────────────────────────────────────────
const hechos = bloque.split("\n").filter((l) => l.startsWith("• ")).join("\n");
af("los HECHOS no mencionan Ollama (eso lo mide otra sonda)", !/ollama/i.test(hechos));
af("  Ollama sólo aparece en la prohibición, nombrado para no afirmarlo", /ollama/i.test(REGLA_DE_ESTADO));
af("no habla de RAG ni de índices: no se midió acá", !/indexados|RAG/i.test(hechos));

console.log(`\n  resultados: ${ok} correctas, ${fail} fallidas`);
if (fail > 0) process.exit(1);
