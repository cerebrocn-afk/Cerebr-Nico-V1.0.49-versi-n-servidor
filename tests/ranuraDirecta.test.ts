// tests/ranuraDirecta.test.ts — v1.0.28
// La ranura DIRECTA: los ids que el proveedor publica SIN prefijo de proveedor
// (Groq, Cerebras) y Workers AI de Cloudflare (@cf/...). Nada de red: nombres.

import assert from "node:assert";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PREFIJO_WORKERS_AI,
  RANURA_WORKERS_AI,
  URL_WORKERS_AI,
  endpointWorkersAI,
  familiaConHerramientas,
  ranuraDirectaDe,
} from "../src/engine/ranuraDirecta";
import { leerExportDeClaves } from "../src/engine/ranuraUnificada";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });
const lee = (rel: string) => fs.readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

prueba("Workers AI: el prefijo @cf/ la declara NUBE y compatible con OpenAI", () => {
  const r = ranuraDirectaDe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.ok(r, "el id de Workers AI tiene que reconocerse");
  assert.strictEqual(r!.proveedor, "cloudflare-workers-ai");
  assert.strictEqual(r!.familia, "llama");
  assert.strictEqual(r!.compatibleOpenAI, true);
  assert.strictEqual(PREFIJO_WORKERS_AI, "@cf/");
});

prueba("Workers AI: familias qwen / mistral / gemma / deepseek / gpt-oss se nombran por su familia", () => {
  const esperado: Array<[string, string]> = [
    ["@cf/qwen/qwen2.5-coder-32b-instruct", "qwen"],
    ["@cf/mistralai/mistral-small-3.1-24b-instruct", "mistral"],
    ["@cf/google/gemma-3-12b-it", "gemma"],
    ["@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "deepseek"],
    ["@cf/openai/gpt-oss-120b", "gpt-oss"],
  ];
  for (const [id, fam] of esperado) {
    const r = ranuraDirectaDe(id);
    assert.strictEqual(r?.familia, fam, `${id} debía dar familia ${fam}`);
    assert.strictEqual(r?.proveedor, "cloudflare-workers-ai", id);
  }
});

prueba("Workers AI: un @cf/ de familia desconocida sigue siendo nube (workers-ai), no se pierde", () => {
  const r = ranuraDirectaDe("@cf/black-forest-labs/flux-1-schnell");
  assert.strictEqual(r?.proveedor, "cloudflare-workers-ai");
  assert.strictEqual(r?.familia, "workers-ai");
  assert.ok(r?.motivo.includes("@cf/"), r?.motivo);
});

prueba("Groq: el id pelado se reconoce y NO se confunde con un modelo local", () => {
  for (const id of ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gpt-oss-120b", "moonshotai/kimi-k2-instruct", "gemma2-9b-it"]) {
    const r = ranuraDirectaDe(id);
    // gpt-oss-120b lo publican Groq y Cerebras: lo importante es que sea NUBE.
    assert.ok(r, `${id} tenía que reconocerse`);
    assert.ok(r!.proveedor === "groq" || r!.proveedor === "cerebras", `${id} → ${r!.proveedor}`);
    assert.strictEqual(r!.compatibleOpenAI, true);
  }
  assert.strictEqual(ranuraDirectaDe("llama-3.3-70b-versatile")!.proveedor, "groq");
});

prueba("Cerebras: llama-3.3-70b / qwen-3-32b por id pelado son NUBE Cerebras", () => {
  assert.strictEqual(ranuraDirectaDe("llama-3.3-70b")!.proveedor, "cerebras");
  assert.strictEqual(ranuraDirectaDe("qwen-3-32b")!.proveedor, "cerebras");
  assert.strictEqual(ranuraDirectaDe("llama3.1-8b")!.proveedor, "cerebras");
});

prueba("Desconocido NO es local: un id que no casa devuelve null", () => {
  for (const id of ["llamativo:latest", "mi-modelo-de-casa", "qwen2.5-coder:7b", ""]) {
    assert.strictEqual(ranuraDirectaDe(id), null, `${id} no debía reconocerse`);
  }
  assert.strictEqual(ranuraDirectaDe(undefined as any), null);
});

prueba("La regex no se come ids locales con prefijo parecido (@cf sin barra, cf/ sin arroba)", () => {
  assert.strictEqual(ranuraDirectaDe("@cf"), null);
  assert.strictEqual(ranuraDirectaDe("cf/llama-3.3-70b"), null);
  assert.strictEqual(ranuraDirectaDe("@cfmeta/llama"), null);
});

prueba("familiaConHerramientas: las familias de nube sí, las vacías no", () => {
  for (const f of ["llama", "qwen", "mistral", "gemma", "deepseek", "gpt-oss", "workers-ai"]) {
    assert.strictEqual(familiaConHerramientas(f), true, f);
  }
  assert.strictEqual(familiaConHerramientas(""), false);
  assert.strictEqual(familiaConHerramientas("embed"), false);
});

prueba("endpointWorkersAI: sin cuenta válida devuelve null (no una URL rota)", () => {
  assert.strictEqual(endpointWorkersAI(""), null);
  assert.strictEqual(endpointWorkersAI("   "), null);
  assert.strictEqual(endpointWorkersAI("no es una cuenta"), null);
  assert.strictEqual(endpointWorkersAI("abc"), null);
  const cuenta = "0123456789abcdef0123456789abcdef";
  const url = endpointWorkersAI(cuenta);
  assert.ok(url && url.includes(cuenta), String(url));
  assert.ok(!url!.includes("{ACCOUNT_ID}"), "la plantilla tiene que quedar resuelta");
  assert.ok(url!.startsWith("https://api.cloudflare.com/client/v4/accounts/"), url!);
  assert.ok(url!.endsWith("/ai/v1"), url!);
  assert.strictEqual(URL_WORKERS_AI.includes("{ACCOUNT_ID}"), true);
});

prueba("Una sola ranura de clave para Workers AI; la cuenta viaja en la URL", () => {
  assert.strictEqual(RANURA_WORKERS_AI.ranura, "Cloudflare Workers AI");
  assert.strictEqual(RANURA_WORKERS_AI.necesitaCuenta, true);
  assert.ok(RANURA_WORKERS_AI.nota.includes("ACCOUNT_ID"), RANURA_WORKERS_AI.nota);
  assert.strictEqual(RANURA_WORKERS_AI.urlPlantilla, URL_WORKERS_AI);
});

prueba("La ranura de clave existe en el export: cloudflare no se pierde en silencio", () => {
  const r = leerExportDeClaves({ keys: [{ platform: "cloudflare", key: "cf-token-largo-0123456789" }] });
  assert.strictEqual(r.entradas[0].estado, "carga", r.entradas[0].aviso);
  assert.strictEqual(r.entradas[0].ranura, RANURA_WORKERS_AI.ranura);
  assert.strictEqual(r.entradas[0].proveedor, "cloudflare");
});

prueba("Módulo puro: no abre red, no lee claves, no importa otros módulos del motor", () => {
  const src = lee("src/engine/ranuraDirecta.ts");
  assert.ok(!/\bfetch\s*\(/.test(src), "el módulo no puede llamar a fetch");
  assert.ok(!/from\s+["'][^"']*supabase/i.test(src), "no importa clientes de clave");
  // La lista de familias es explícita: ninguna regex suelta tipo /llama/ sobre el id.
  assert.ok(!/test\(id\)/.test(src.split("FAMILIAS_WORKERS_AI")[0]), "no se adivina familia antes de la tabla");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nranuraDirecta: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
