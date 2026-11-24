/**
 * ventanaContexto.test.ts — v1.55.0 · AMPLIAR LA VENTANA DE CONTEXTO DE LA NUBE
 * =============================================================================
 * RAÍZ (sesión 1791453571902 de Mario, exportada del chat): el chat se cortaba a
 * mitad de la redacción y el proveedor devolvía «Prompt exceeds max length
 * (code 1261)» con glm-4.5-flash; el usuario pidió EXPLÍCITAMENTE «ampliar la
 * ventana de contexto de los modelos». El defecto: `getModelProfile` daba a la
 * nube RÁPIDA un presupuesto FIJO de 48000 chars / 12 turnos, muy por debajo de
 * la ventana real de esos modelos (GLM-4.5 = 128K tokens, Gemini Flash = 1M).
 *
 * EL ARREGLO (modelTiers.ts): el presupuesto se DERIVA de la ventana real por
 * familia (`ventanaContextoTokens`), reservando margen para salida + imágenes y
 * con un tope duro para no disparar la latencia. Esta suite CONGELA ese
 * comportamiento: ventanas correctas, presupuesto AMPLIADO (y nunca por debajo
 * del suelo anterior), más historial, y que un modelo multimodal use su ventana
 * menor. Es lógica PURA (sin red, sin modelo): corre en Node v16 vía tsx.
 */
import {
  getModelProfile,
  ventanaContextoTokens,
  VENTANA_NUBE_DEFECTO,
} from "../src/engine/modelTiers";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => {
  if (c) correctas++;
  else fallos.push(n + (d ? " :: " + d : ""));
};

// ══════════════════════════════════════════════════════════════════
// 1 · Ventana REAL por familia (la fuente del presupuesto)
// ══════════════════════════════════════════════════════════════════
console.log("\n1) La ventana de contexto se reconoce por familia\n");

comprobar("glm-4.5-flash = 128K tokens", ventanaContextoTokens("glm-4.5-flash") === 128_000);
comprobar("glm-4.5-air = 128K tokens", ventanaContextoTokens("glm-4.5-air") === 128_000);
comprobar("glm-4.6 = 200K tokens", ventanaContextoTokens("glm-4.6") === 200_000);
comprobar("gemini-2.5-flash = 1M tokens", ventanaContextoTokens("gemini-2.5-flash") === 1_000_000);
comprobar("claude = 200K tokens", ventanaContextoTokens("claude-3.5-sonnet") === 200_000);
comprobar("deepseek = 128K tokens", ventanaContextoTokens("deepseek-chat") === 128_000);
// Lo específico gana a lo genérico: glm-4.5v NO debe heredar los 128K del de texto.
comprobar("glm-4.5v (multimodal) = 64K, no 128K", ventanaContextoTokens("glm-4.5v-flash") === 64_000);
comprobar("glm-4v (multimodal) = 64K", ventanaContextoTokens("glm-4v") === 64_000);
// Un modelo de nube no catalogado cae al defecto prudente, no a cero.
comprobar("desconocido → defecto 32768", ventanaContextoTokens("modelo-nube-raro") === VENTANA_NUBE_DEFECTO);
// Los alias heredan la ventana de su canónico (nemesis = gpt-oss:120b-cloud).
comprobar("alias nemesis hereda ventana del canónico", ventanaContextoTokens("nemesis:latest") === ventanaContextoTokens("gpt-oss:120b-cloud"));

// ══════════════════════════════════════════════════════════════════
// 2 · El presupuesto de la nube RÁPIDA se AMPLÍA (lo que pedía Mario)
// ══════════════════════════════════════════════════════════════════
console.log("\n2) El presupuesto crece respecto al 48000/12 anterior\n");

const flash = getModelProfile("glm-4.5-flash");
comprobar("glm-4.5-flash sigue siendo nube rápida", flash.tier === "cloud" && flash.nubeRapida === true);
comprobar("presupuesto AMPLIADO (> 48000 anterior)", flash.contextCharBudget > 48_000, `budget=${flash.contextCharBudget}`);
comprobar("presupuesto llega al tope de rápida (220000)", flash.contextCharBudget === 220_000, `budget=${flash.contextCharBudget}`);
comprobar("más turnos de historial (> 12 anterior)", flash.historyTurns > 12, `turnos=${flash.historyTurns}`);
comprobar("la nota explica la ampliación al usuario", flash.notes.some((n) => /AMPLIADO/.test(n)));

const gemini = getModelProfile("gemini-2.5-flash");
comprobar("gemini-flash también se amplía y topa en 220000", gemini.tier === "cloud" && gemini.contextCharBudget === 220_000);

// Un multimodal usa su ventana menor → presupuesto menor que el de 128K, pero
// aún MUY por encima del 48000 viejo (no regresa).
const v = getModelProfile("glm-4.5v-flash");
comprobar("glm-4.5v: presupuesto acorde a 64K pero > suelo 48000", v.contextCharBudget > 48_000 && v.contextCharBudget < 220_000, `budget=${v.contextCharBudget}`);

// ══════════════════════════════════════════════════════════════════
// 3 · Sin regresión: suelo, numCtx local intacto y nube grande con tope
// ══════════════════════════════════════════════════════════════════
console.log("\n3) No se rompe nada de lo que ya funcionaba\n");

// numCtx de nube se mantiene en 32768 (lo exige motor-datos.test.ts).
comprobar("numCtx de nube sigue en 32768", flash.numCtx === 32_768 && gemini.numCtx === 32_768);
comprobar("la salida de nube no se trunca (numPredict -1)", flash.numPredict === -1);

// Nube grande: nunca por debajo del suelo 128000, nunca por encima del tope.
const grande = getModelProfile("gpt-oss:120b-cloud");
comprobar("nube grande >= suelo 128000", grande.contextCharBudget >= 128_000, `budget=${grande.contextCharBudget}`);
comprobar("nube grande <= tope 400000", grande.contextCharBudget <= 400_000, `budget=${grande.contextCharBudget}`);
comprobar("nube grande con más turnos que antes (>= 20)", grande.historyTurns >= 20, `turnos=${grande.historyTurns}`);

// Un modelo LOCAL pequeño NO se toca: su ventana la fija Ollama, no esta tabla.
const local = getModelProfile("qwen2.5:3b", 8);
comprobar("local pequeño conserva su contexto moderado (no se amplía)", local.tier === "tiny" && local.contextCharBudget <= 16_000);

// ══════════════════════════════════════════════════════════════════
// 4 · v1.57.6 — el tier «small» local ya CABE las herramientas del agente
// ══════════════════════════════════════════════════════════════════
// Caso real (Mario, 16 GB, qwen3:4b): en cmd el modelo contestaba en segundos,
// pero en CerebroNico «se cortaba». Dos culpables, ambos de contexto:
//   · El bucle de agente mete superPrompt + tool-schemas + listado de archivos
//     ANTES de la charla: 8-12K tokens. Con num_ctx=8192 Ollama trunca en
//     silencio y el modelo deja de «ver» sus propias herramientas.
//   · Y si además el `Context length` de la app de Ollama está al máximo (256k),
//     la KV-cache pide ~25-38 GB en un 4B: la PC entra en swap y se congela.
// La cura del lado del IDE: 16 GB con herramientas → 16384 tokens (KV ~2.3 GB
// + pesos ~2.5 GB ≈ 5 GB de 16 GB). En ≤8 GB sigue replegado a 4096, porque ahí
// el riesgo real es el swap, no la calidad.
console.log("\n4) v1.57.6 · num_ctx del «small» local con herramientas\n");

const qwen4b_16 = getModelProfile("qwen3:4b", 16);
comprobar("★ qwen3:4b en 16 GB (con tools) → numCtx=16384 (cabe el prompt del agente)",
  qwen4b_16.tier === "small" && qwen4b_16.numCtx === 16_384,
  `tier=${qwen4b_16.tier} numCtx=${qwen4b_16.numCtx}`);

const qwen4b_8 = getModelProfile("qwen3:4b", 8);
comprobar("el mismo 4B en 8 GB (lowRam) sigue replegado a 4096 (no dispara swap)",
  qwen4b_8.numCtx === 4096,
  `numCtx(8GB)=${qwen4b_8.numCtx}`);

const llama8b_32 = getModelProfile("llama3.1:8b", 32);
comprobar("8B en 32 GB hereda el mismo 16384 (no hay razón para recortarle)",
  llama8b_32.numCtx === 16_384,
  `numCtx=${llama8b_32.numCtx}`);

comprobar("qwen3:4b en 16 GB conserva el resto del perfil small intacto",
  qwen4b_16.numPredict === 1200 && qwen4b_16.numBatch === 256 && qwen4b_16.historyTurns === 8,
  `numPredict=${qwen4b_16.numPredict} numBatch=${qwen4b_16.numBatch} turnos=${qwen4b_16.historyTurns}`);

// Un 4B a 256k pediría más RAM de la que existe en cualquier equipo de sobremesa:
// esta valla documenta por qué el IDE NO sube nunca a esos valores por su cuenta.
comprobar("ningún perfil local de ≤8B pide más de 16384 tokens",
  (["qwen3:4b", "llama3.1:8b", "gemma3:4b"] as const).every(
    (m) => getModelProfile(m, 16).numCtx <= 16_384 && getModelProfile(m, 32).numCtx <= 16_384
  ));

// ══════════════════════════════════════════════════════════════════
if (fallos.length) {
  console.error(`\n❌ ventanaContexto: ${fallos.length} fallo(s):`);
  for (const f of fallos) console.error("   · " + f);
  process.exit(1);
}
console.log(`\n✅ ventanaContexto: ${correctas}/${correctas} comprobaciones en verde.`);
