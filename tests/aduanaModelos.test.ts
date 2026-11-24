/**
 * tests/aduanaModelos.test.ts — LA ADUANA ÚNICA DE MODELOS (v1.77.0)
 * ==================================================================
 * Congela la cura de la queja medida de Mario 26/10 («muchos modelos de
 * ollama no aparecen» — 47 instalados, 42 en el selector). Controles:
 *   · FALSO POSITIVO HISTÓRICO: la regex vieja `/embed/i` comía cualquier
 *     palabra con «embed» dentro — «combine-70b» o «member-large» morían
 *     filtradas. Acá esos nombres sobreviven y «embeddinggemma» (prefijo
 *     real, sin separador) sí se marca: anclado al inicio o a [-_.:];
 *   · la regla FIM de v1.60.20 sigue viva (el duplicado del front la había
 *     PERDIDO — la divergencia medida);
 *   · auditoría honesta: total = chat + embeddings + fim, orden de `ollama
 *     ls` conservado, cada excluido NOMBRADO con su motivo;
 *   · entrada hostil: ["", null, "x"] no revienta ni inventa nombres;
 *   · DEFECTO SEMBRADO por lectura de fuente: (a) el cable — el proxy y el
 *     front deben llamar a auditarListaOllama; (b) la plaga — el patrón
 *     `/embed/i` suelto no puede volver a vivir fuera de la aduana, si un
 *     duplicado renace en App.tsx o diagnostico.ts esta suite se pone roja;
 *   · la ranura Custom: una carpeta no es un endpoint (una ruta de Documents,
 *     queja 26/10) y localhost:8000/v1 sí pasa.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import {
  clasificarModeloOllama,
  auditarListaOllama,
  validarUrlServidorCustom,
} from "../src/engine/aduanaModelos";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

prueba("los seis embeds del ollama ls real se marcan (incl. embeddinggemma sin separador)", () => {
  for (const n of ["embeddinggemma-2:440m", "qwen3-embedding:0.6b", "snowflake-arctic-embed:33m", "snowflake-arctic-embed:22m", "all-minilm:33m", "all-minilm:22m"])
    assert.strictEqual(clasificarModeloOllama(n).rol, "embeddings", n);
});

prueba("FALSO POSITIVO HISTÓRICO: combine/member/ambient NO mueren por la subcadena 'embed'", () => {
  for (const n of ["combine-70b:latest", "member-large:v1", "AmbientCoder:latest", "remembrance:2b"])
    assert.strictEqual(clasificarModeloOllama(n).rol, "chat", n);
});

prueba("la regla FIM de v1.60.20 sigue viva en la aduana (el duplicado del front la había perdido)", () => {
  assert.strictEqual(clasificarModeloOllama("mistral-code-fim-latest").rol, "fim");
  assert.strictEqual(clasificarModeloOllama("mymodel:fim").rol, "fim");
  assert.strictEqual(clasificarModeloOllama("fimix-chat:latest").rol, "chat", "fim como substring de otra palabra no cuenta");
});

prueba("auditoría: total=chat+embed+fim, orden conservado, excluidos nombrados", () => {
  const a = auditarListaOllama(["llama3.2:1b", "all-minilm:22m", "gemma3:270m", "mistral-code-fim-latest"]);
  assert.strictEqual(a.conteo.total, 4);
  assert.strictEqual(a.conteo.chat, 2);
  assert.strictEqual(a.conteo.embeddings, 1);
  assert.strictEqual(a.conteo.fim, 1);
  assert.deepStrictEqual(a.todos.map((t) => t.name), ["llama3.2:1b", "all-minilm:22m", "gemma3:270m", "mistral-code-fim-latest"]);
  assert.deepStrictEqual(a.chat, ["llama3.2:1b", "gemma3:270m"]);
  assert.strictEqual(a.excluidos.length, 2);
  assert.ok(a.excluidos.every((e) => e.name && e.motivo), "ningún excluido sin nombre ni motivo — cero desapariciones");
});

prueba("entrada hostil: vacíos y null no revientan ni inventan", () => {
  const a = auditarListaOllama(["", null, "  ", "qwen3:0.6b", undefined]);
  assert.strictEqual(a.conteo.total, 1);
  assert.deepStrictEqual(a.chat, ["qwen3:0.6b"]);
});

prueba("DEFECTO SEMBRADO (cable): proxy y front llaman a la aduana; el patrón duplicado /embed/i no renace", () => {
  const proxy = fs.readFileSync(new URL("../server/routers/diagnostico.ts", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(/auditarListaOllama\(/.test(proxy), "el proxy debe auditar con la aduana");
  assert.ok(/auditarListaOllama\(/.test(app), "el front debe auditar con la aduana");
  // la plaga que causó el bug fue el duplicado: nadie más puede llevar la lista
  assert.ok(!/NON_CHAT_PATTERNS/.test(proxy), "NON_CHAT_PATTERNS duplicado volvió al proxy");
  assert.ok(!/NON_CHAT_PATTERNS/.test(app), "NON_CHAT_PATTERNS duplicado volvió al front");
  assert.ok(!/\/embed\/i/.test(proxy.replace(/aduanaModelos/g, "")), "un regex /embed/i suelto volvió al proxy");
  assert.ok(!/\/embed\/i/.test(app), "un regex /embed/i suelto volvió al front");
});

prueba("ranura Custom: una carpeta no es un endpoint (queja de ruta) y http sí", () => {
  const carpeta = validarUrlServidorCustom("C:\\Users\\BirdBox\\Documents\\mis-modelos");
  assert.strictEqual(carpeta.ok, false);
  assert.ok(/carpeta|ruta/i.test(carpeta.error || ""), "el error debe nombrar el error de forma: " + carpeta.error);
  assert.ok(/http/.test(carpeta.error || ""), "y debe enseñar la forma correcta");
  assert.strictEqual(validarUrlServidorCustom("http://127.0.0.1:8000/v1").ok, true);
  assert.strictEqual(validarUrlServidorCustom("https://api.groq.com/openai/v1").ok, true);
  assert.strictEqual(validarUrlServidorCustom("api.groq.com/openai/v1").ok, false, "sin protocolo no pasa");
  assert.strictEqual(validarUrlServidorCustom("").ok, false);
  assert.strictEqual(validarUrlServidorCustom("  http://localhost:1234/v1/  ").url, "http://localhost:1234/v1", "sana sin barra final");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\naduanaModelos: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
