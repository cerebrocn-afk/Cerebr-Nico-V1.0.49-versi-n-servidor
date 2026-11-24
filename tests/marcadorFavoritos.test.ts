/**
 * marcadorFavoritos.test.ts — LA COLA DEL MARCADOR MUESTA LA VERDAD (v1.78.0)
 * ===========================================================================
 * Queja medida de Mario 26/10: «el marcador automático funciona pero con los
 * modelos incorrectos… sale el modelo fav-model-1792662099324-zlh7 y no debe
 * de ser seleccionado, no existe».
 *
 * El defecto: la cola se armaba con `f.model || f.id`. `model` nunca existió
 * (los favoritos guardan `modelId`), así que el marcador terminaba marcando al
 * IDENTIFICADOR INTERNO — un número de teléfono inventado. Esta suite congela
 * la cura:
 *   · la cola usa `modelId` y jamás un id interno;
 *   · quedan afuera: locales, embedders, proveedores sin clave, fantasmas;
 *   · el orden de la carpeta ⭐ manda (el usuario ya eligió su primero/segundo);
 *   · PLAGA sembrada: si el patrón `f.model || f.id` renace en App.tsx, rojo.
 */
import { readFileSync } from "node:fs";
import { colaDeMarcado } from "../src/utils/marcador";

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean) {
  if (cond) correctas++;
  else fallos.push(msg);
}

const claves = {
  gemini: true, zai: true, openrouter: true, openai: false, groq: true,
  cerebras: false, together: false, mistral: false, deepseek: false,
  fireworks: false, custom: true,
};

// — El estado real de la carpeta ⭐ (estructura de FavoriteModel) —
const favoritos = [
  { modelId: "glm-4.7-flash", name: "GLM-4.7-Flash (Z.ai)", provider: "zai" },
  { modelId: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Groq)", provider: "groq" },
  { modelId: "qwen2.5:0.5b", name: "qwen2.5:0.5b · ultrarrápido", provider: "ollama" },
  { modelId: "embeddinggemma-2-240m", name: "EmbeddingGemma", provider: "ollama" },
  { modelId: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
  { modelId: "deepseek-v3-free", name: "DeepSeek vía API Unificada", provider: "custom" },
  // Fantasma de versiones viejas: un id interno disfrazado de modelId.
  { modelId: "fav-model-1792662099324-zlh7", name: "fav-model-1792662099324-zlh7", provider: "zai" },
  // Sin clave cargada: marcarlo es garantizar un 401.
  { modelId: "cerebras-chat", name: "Cerebras", provider: "cerebras" },
];

const cola = colaDeMarcado(favoritos as any, claves);

comprobar("usa modelId (nombre real), nunca el id interno", cola.every((c) => !/^(fav-model|cat-|msg-|queue-)-/.test(c.modelo)));
comprobar("el fantasma fav-model-… NO entra a la cola", !cola.some((c) => c.modelo.includes("fav-model")));
comprobar("locales fuera: el hardware mudo no despierta re-marcándolo", !cola.some((c) => c.provider === "ollama" || c.provider === "local"));
comprobar("embedders fuera: un modelo de vectores no responde chat", !cola.some((c) => /embedding/i.test(c.modelo)));
comprobar("proveedor sin clave cargada queda afuera", !cola.some((c) => c.provider === "cerebras" || c.provider === "openai"));
comprobar("custom (API unificada) entra SOLO con URL cargada", cola.some((c) => c.provider === "custom" && c.modelo === "deepseek-v3-free"));
comprobar("el orden de la carpeta ⭐ manda", cola[0]?.modelo === "glm-4.7-flash" && cola[1]?.modelo === "llama-3.3-70b-versatile");
comprobar("gemini con clave entra", cola.some((c) => c.provider === "gemini" && c.modelo === "gemini-2.5-flash"));

// — PLAGA: el patrón de la lectura torcida no puede renacer en App —
const appSrc = readFileSync("src/App.tsx", "utf-8");
comprobar(
  "App.tsx construye la cola SOLO vía colaDeMarcado (plaga: `f.model || f.id` prohibido)",
  !/modelo:\s*String\(\s*f\.model\s*\|\|/.test(appSrc) && /colaDeMarcado\(/.test(appSrc)
);

console.log(`\n═══ MARCADOR FAVORITOS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
