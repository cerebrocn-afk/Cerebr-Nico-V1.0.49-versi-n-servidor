/**
 * cerebroModelo.test.ts — v1.57.12 · SUITE DE CERTEZA: CERTEZA DE MODELO
 * =========================================================================
 * Cierra el fallo medido en consola el 15/10: `glm-ocr:latest` y `qwen3-vl:2b`
 * usados como cerebro de chat, matados por el watchdog a los 180 s TRES veces,
 * con un aviso que culpaba a la RAM o a la clave de Google. La certeza que
 * faltaba: saber qué CLASE de modelo es antes de mandarle un turno.
 * Se prueba en seco: sin red, sin Ollama, sin esperar tres minutos.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { familiaModelo, sirveComoCerebroChat, consejoSilencioLocal } from "../src/engine/cerebroModelo";
import { preflightModeloOllama } from "../src/engine/preflightLocal";

let correctas = 0, fallidas = 0;
function comprobar(t: string, c: boolean) {
  if (c) { correctas++; console.log("  ✓ " + t); }
  else { fallidas++; console.log("  ✗ " + t); }
}
function seccion(t: string) { console.log("\n· " + t); }

// ─────────────────────────────────────────────────────────────────────────────
seccion("1) familia: los nombres reales del inventario, clasificados sin cargarlos");
comprobar("glm-ocr:latest es OCR (no visión: responde texto solo con imagen)", familiaModelo("glm-ocr:latest") === "ocr");
comprobar("qwen3-vl:2b es visión", familiaModelo("qwen3-vl:2b") === "vision");
comprobar("qwen2.5vl:7b es visión", familiaModelo("qwen2.5vl:7b") === "vision");
comprobar("bge-m3 es embedding", familiaModelo("bge-m3:latest") === "embedding");
comprobar("nomic-embed-text es embedding", familiaModelo("nomic-embed-text") === "embedding");
comprobar("snowflake-arctic-rerank es rerank", familiaModelo("snowflake-arctic-rerank") === "rerank");
comprobar("qwen2.5:0.5b es lenguaje (cerebro normal)", familiaModelo("qwen2.5:0.5b") === "lenguaje");
comprobar("gemma3:270m NO cae en visión solo por el número (es chat normal)", familiaModelo("gemma3:270m") === "lenguaje");
comprobar("llama3.2:3b es lenguaje", familiaModelo("llama3.2:3b") === "lenguaje");
comprobar("llava:7b es visión", familiaModelo("llava:7b") === "vision");
comprobar("nombre vacío no explota", familiaModelo("") === "lenguaje");

// ─────────────────────────────────────────────────────────────────────────────
seccion("2) veredicto de cerebro: cortar lo mudo, dejar pasar lo lento");
{
  const ocrSinImg = sirveComoCerebroChat("glm-ocr:latest", false);
  comprobar("OCR sin imagen NO sirve (ahorro de 3×180 s)", ocrSinImg.ok === false);
  comprobar("el motivo nombra al modelo", ocrSinImg.motivo.includes("glm-ocr"));
  comprobar("el motivo da la salida (adjuntar imagen o cambiar modelo)", /imagen/.test(ocrSinImg.motivo) && /lenguaje/.test(ocrSinImg.motivo));
  const ocrConImg = sirveComoCerebroChat("glm-ocr:latest", true);
  comprobar("OCR CON imagen sí sirve (para eso existe)", ocrConImg.ok === true);
  const vl = sirveComoCerebroChat("qwen3-vl:2b", false);
  comprobar("visión SIN imagen SÍ se deja intentar (responde, lento)", vl.ok === true);
  const emb = sirveComoCerebroChat("bge-m3:latest", true);
  comprobar("embedding no sirve NUNCA, ni con imagen", emb.ok === false);
  const rr = sirveComoCerebroChat("reranker-v2", false);
  comprobar("rerank no sirve nunca", rr.ok === false);
  const leg = sirveComoCerebroChat("qwen2.5-coder:1.5b", false);
  comprobar("lenguaje siempre sirve", leg.ok === true && leg.motivo === "");
}

// ─────────────────────────────────────────────────────────────────────────────
seccion("3) el consejo del silencio habla DEL modelo, no de la nube ajena");
{
  const cOcr = consejoSilencioLocal("glm-ocr:latest");
  comprobar("OCR: el consejo dice qué es y qué hacer", /OCR/.test(cOcr) && /imagen/.test(cOcr));
  comprobar("OCR: NO menciona la clave de Google (era el mensaje viejo, mentía por omisión)", !/Google/i.test(cOcr));
  const cVl = consejoSilencioLocal("qwen3-vl:2b");
  comprobar("visión: menciona la lentitud sin imagen/CPU", /visión|vision/i.test(cVl));
  const cLeg = consejoSilencioLocal("qwen2.5:0.5b");
  comprobar("lenguaje: apunta a carga/RAM (ollama ps, Expulsar)", /ollama ps|Expulsar/i.test(cLeg));
  comprobar("lenguaje: tampoco culpa a Gemini", !/Gemini/.test(cLeg));
}

// ─────────────────────────────────────────────────────────────────────────────
seccion("4) el preflight corta ANTES de la red (el pozo de 180 s se tapa acá)");
{
  let llamoRed = 0;
  const fetchFalsa = (async () => { llamoRed++; return { ok: true, json: async () => ({ models: [{ name: "glm-ocr:latest" }, { name: "qwen2.5:0.5b" }] }) }; }) as unknown as typeof fetch;
  const r = await preflightModeloOllama("http://127.0.0.1:11434", "glm-ocr:latest", fetchFalsa, false);
  comprobar("glm-ocr sin imagen: preflight lo corta", r.ok === false);
  comprobar("el corte NO gastó ni una llamada a /api/tags", llamoRed === 0);
  if (!r.ok) comprobar("el mensaje del corte es el de cerebro (no el de 404)", /OCR/.test(r.mensaje));
  const r2 = await preflightModeloOllama("http://127.0.0.1:11434", "glm-ocr:latest", fetchFalsa, true);
  comprobar("glm-ocr CON imagen pasa a la red (existencia + SONDA DE CAPACIDADES de la v1.57.20 = 2 llamadas)", r2.ok === true && llamoRed === 2, `llamoRed=${llamoRed}`);
  const r3 = await preflightModeloOllama("http://127.0.0.1:11434", "bge-m3:latest", fetchFalsa, false);
  comprobar("embedding: cortado en seco también", r3.ok === false);
  const r4 = await preflightModeloOllama("http://127.0.0.1:11434", "qwen2.5:0.5b", fetchFalsa, false);
  comprobar("lenguaje: intacto el camino de siempre", r4.ok === true);
}

// ─────────────────────────────────────────────────────────────────────────────
seccion("5) EL CABLE (seco, leyendo el fuente): el motor usa la certeza");
{
  const raiz = path.join(__dirname, "..");
  const server = readFileSync(path.join(raiz, "server.ts"), "utf8");
  const ctx = readFileSync(path.join(raiz, "server", "streamContext.ts"), "utf8");
  comprobar("server.ts pasa tieneImagenes al preflight", /preflightModeloOllama\(targetUrl, modelForOllama, fetch, base64Images\.length > 0\)/.test(server));
  comprobar("server.ts arma el consejo del silencio por modelo", /ctx\.setAvisoSilencio\(consejoSilencioLocal\(modelForOllama\)\)/.test(server));
  comprobar("streamContext: el watchdog usa el consejo si lo hay", /this\.avisoSilencio \|\|/.test(ctx));
  comprobar("streamContext: sin consejo, el genérico sigue vivo (cero regresión)", /modelo dejó de enviar texto durante demasiado tiempo/.test(ctx));
}

seccion("5) v1.57.20 · CAPACIDAD POR CONTENIDO: la verdad la dice Ollama (/api/show)");
{
  const { capacidadesDeModelo } = await import("../src/engine/preflightLocal");
  const respuesta = (caps: any) => (async (url: string) => {
    if (String(url).endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: "gpt-oss:120b-cloud" }, { name: "qwen2.5vl:7b" }] }) } as any;
    if (String(url).endsWith("/api/show")) return { ok: true, json: async () => ({ capabilities: caps }) } as any;
    return { ok: false, json: async () => ({}) } as any;
  }) as any;
  const sinVision = await capacidadesDeModelo("http://x", "gpt-oss:120b-cloud", respuesta(["completion", "tools"]));
  comprobar("las capacidades se leen tal cual", Array.isArray(sinVision) && sinVision.includes("completion") && !sinVision.includes("vision"), String(sinVision));
  const bloqueo = await preflightModeloOllama("http://x", "gpt-oss:120b-cloud", respuesta(["completion", "tools"]), true);
  comprobar("con imagen y sin visión → bloqueo honesto ANTES de gastar la llamada", bloqueo.ok === false && /no acepta imágenes/.test(bloqueo.mensaje || ""));
  comprobar("el mensaje lista las capacidades reales y la salida", /capacidades de Ollama: completion, tools/.test(bloqueo.mensaje || "") && /modelo de visión/.test(bloqueo.mensaje || ""), bloqueo.mensaje);
  comprobar("sin imagen, el mismo modelo pasa (no se bloquea de más)", (await preflightModeloOllama("http://x", "gpt-oss:120b-cloud", respuesta(["completion", "tools"]), false)).ok === true);
  comprobar("con visión declarada, pasa", (await preflightModeloOllama("http://x", "qwen2.5vl:7b", respuesta(["completion", "vision"]), true)).ok === true);
  comprobar("ENTRADA HOSTIL: Ollama viejo sin capacidades → NO se bloquea lo que no se puede verificar", (await preflightModeloOllama("http://x", "gpt-oss:120b-cloud", respuesta(undefined), true)).ok === true);
}

console.log(`\n═══ CERTEZA DE MODELO: ${correctas} correctas · ${fallidas} fallidas ═══`);
if (fallidas > 0) process.exit(1);
