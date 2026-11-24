/**
 * modelos.ts — v1.46.0 · LAS RUTAS DE DESCUBRIMIENTO DE MODELOS SALEN DEL MONOLITO
 * ==============================================================================
 * MOVIMIENTO, NO MEJORA. Este bloque eran 327 líneas dentro de `server.ts`, que
 * tiene un TRINQUETE: `tests/superficieRutas.test.ts` y `tests/certezaModelo.test.ts`
 * exigen menos de 11.800 líneas, y `contrato-rutas.json` fija un presupuesto.
 * En la 1.45.5 el monolito iba por 12.108 y el trinquete viajaba roto.
 *
 * POR QUÉ ESTE Y NO OTRO: ya estaba escrito como función autónoma que recibe
 * `app` (`registerModelDiscoveryRoutes(app)`), así que no hay que desenredar
 * cierres ni variables del arranque — es la clase de bloque que la Fase 2 pide
 * mover primero. El CUERPO va tal cual: no se reescribe una línea de lógica.
 *
 * ORDEN: la llamada se deja EXACTAMENTE donde estaba dentro de `startServer`.
 * En Express el orden de registro decide qué ruta casa primero; mover la
 * llamada de sitio cambiaría el comportamiento sin que ningún test lo note.
 */
import express from "express";
// Los tipos de Express hay que importarlos: sin esto, `Request` y `Response`
// resuelven a los del DOM y `req.query` no existe (tsc lo caza al instante).
import type { Request, Response } from "express";
// Módulo hoja compartido con server.ts (evita la importación circular).
import { fetchCloud } from "../fetchCloud";
import { validarUrlServidorCustom } from "../../src/engine/aduanaModelos";
import { esDestinoLocal } from "../../src/engine/guardaEgreso";
import { limpiarClave, diagnosticoCatalogo, respuestaCatalogo } from "../../src/engine/catalogoNube"; // v1.0.34 · el catálogo que cae en silencio

// ============================================================
// v1.46.4 — RESOLUCIÓN DE MODELOS GEMINI «EN VIVO»
// ------------------------------------------------------------
// POR QUÉ: la cadena de reserva de `server.ts` usaba una lista FIJA de IDs.
// Si Google renombra/retira un ID, o la cuenta del usuario no tiene acceso a
// ése, todos los intentos dan 404 aunque la clave sea válida — justo lo que
// le pasaba al usuario (404 «model is not found for API version v1beta» hasta
// con gemini-1.5-flash). ListModels SÍ devuelve lo que esta clave puede usar,
// así que el motor pregunta y ordena esos IDs reales (flash primero), y solo
// cae a la lista fija si la consulta falla. Pequeña caché para no repetir la
// llamada en cada mensaje.
/**
 * v2.1.6 — UN CATÁLOGO DE MODELOS NO ES UNA GENERACIÓN.
 *
 * El techo de `fetchCloud` es 120 s porque un modelo puede tardar 50-90 s en
 * escribir el primer token. Listar modelos es otra cosa: si el proveedor no
 * contesta en 8 s, no está lento, está caído o bloqueado.
 *
 * Con 120 s por lista y doce listas a la vez, el navegador agota sus 6
 * conexiones por origen y el latido de `/api/coreo` —que caduca a los 2,8 s— no
 * consigue ni un socket: la pantalla declara «servidor local caído» con el
 * servidor sano (captura del 02/11, 12:05).
 */
const PLAZO_CATALOGO_MS = 8000;

const CACHE_GEMINI_MS = 5 * 60 * 1000;
let cacheGeminiModelos: { key: string; at: number; ids: string[] } | null = null;

/** Peso de orden: menor = se prueba antes. Flash de texto primero; se excluyen
 *  los modelos que no sirven para chat (tts, embeddings, imagen, aqa…). */
function rangoModeloGemini(id: string): number {
  const s = id.toLowerCase();
  if (/(tts|embedding|aqa|imagen|image|vision-only|learnlm)/.test(s)) return 999;
  if (!/generat|flash|pro|gemini/.test(s)) return 900;
  if (/flash-lite/.test(s)) return 20;
  if (/2\.5-flash|2\.0-flash|1\.5-flash|flash/.test(s)) return 10;
  if (/pro/.test(s)) return 40;
  return 60;
}

/**
 * Devuelve los IDs de modelos Gemini que ESTA clave puede usar para
 * generateContent, ordenados por preferencia (flash primero). `null` si la
 * consulta falla (el llamador cae entonces a su lista fija).
 */
export async function resolverModelosGeminiVigentes(apiKey?: string): Promise<string[] | null> {
  const key = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || "";
  if (!key) return null;
  const ahora = Date.now();
  if (cacheGeminiModelos && cacheGeminiModelos.key === key && ahora - cacheGeminiModelos.at < CACHE_GEMINI_MS) {
    return cacheGeminiModelos.ids;
  }
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!r.ok) return null;
    const data: any = await r.json();
    const all = Array.isArray(data?.models) ? data.models : [];
    const ids: string[] = all
      .filter((m: any) =>
        !Array.isArray(m?.supportedGenerationMethods) ||
        m.supportedGenerationMethods.includes("generateContent")
      )
      .map((m: any) => String(m?.name || "").replace(/^models\//, ""))
      .filter((id: string) => id && rangoModeloGemini(id) < 900)
      .sort((a: string, b: string) => rangoModeloGemini(a) - rangoModeloGemini(b));
    if (ids.length === 0) return null;
    cacheGeminiModelos = { key, at: ahora, ids };
    return ids;
  } catch {
    return null;
  }
}

export function registerModelDiscoveryRoutes(app: express.Application) {
  /**
   * Llama a https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
   * y devuelve los modelos flash disponibles para generateContent.
   */
  app.get("/api/gemini/models", async (req: Request, res: Response) => {
    const apiKey = (req.query.key as string) || (req.headers["x-gemini-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Falta API key de Gemini (parámetro ?key= o header x-gemini-key)." });
    }
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `Google devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      const all = Array.isArray(data?.models) ? data.models : [];
      // 🔧 Devolver TODOS los modelos que soportan generateContent (no solo flash).
      // Esto incluye: flash, flash-lite, pro, experimental, etc.
      const usable = all
        .filter((m: any) => {
          const supported = Array.isArray(m?.supportedGenerationMethods)
            ? m.supportedGenerationMethods.includes("generateContent")
            : true;
          return supported;
        })
        .map((m: any) => ({
          // El nombre viene como "models/gemini-2.5-flash" — recortamos el prefijo
          id: String(m.name).replace(/^models\//, ""),
          name: String(m.name).replace(/^models\//, ""),
          description: m.description || `Modelo Gemini (${m.displayName || m.name}).`,
          contextWindow: m.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}k` : "1M",
          provider: "gemini",
        }));
      return res.json({ models: usable, total: usable.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * 🔧 Lista TODOS los modelos del catálogo público de OpenRouter (no solo los :free).
   * El usuario puede filtrar en la UI. Incluye modelos gratuitos y de pago.
   * No requiere API key (catálogo público).
   */
  app.get("/api/openrouter/models", async (req: Request, res: Response) => {
    try {
      // 🔧 Si se pasa ?free=1, devolver solo los gratuitos (comportamiento legacy)
      const onlyFree = req.query.free === "1" || req.query.free === "true";
      const r = await fetchCloud(
        "https://openrouter.ai/api/v1/models",
        { headers: { "Content-Type": "application/json" } },
        { plazoMs: PLAZO_CATALOGO_MS, catalogo: true }, // v2.1.6 · catálogo, no generación
      );
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `OpenRouter devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      const all = Array.isArray(data?.data) ? data.data : [];
      // 🔧 Devolver TODOS los modelos por defecto (no solo :free).
      // Marcar con `isFree: true` los que terminan en :free para que la UI los distinga.
      const models = all
        .filter((m: any) => typeof m?.id === "string")
        .filter((m: any) => !onlyFree || m.id.endsWith(":free"))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          description: m.name || m.id,
          contextWindow: m.context_length ? `${Math.round(m.context_length / 1000)}k` : "—",
          provider: "openrouter",
          isFree: m.id.endsWith(":free"),
          pricing: m.pricing || null,
        }));
      // Modelo virtual "openrouter/free" siempre al principio (enruta al mejor gratuito)
      const virtualEntry = {
        id: "openrouter/free",
        name: "openrouter/free",
        description: "Enrutador automático de OpenRouter: selecciona el mejor modelo gratuito disponible con soporte de tool-calling.",
        contextWindow: "auto",
        provider: "openrouter",
        isVirtual: true,
        isFree: true,
      };
      return res.json({ models: [virtualEntry, ...models], total: models.length + 1 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * 🔧 Autodetección de modelos OpenAI para la API key del usuario.
   * Llama a https://api.openai.com/v1/models con Authorization: Bearer <KEY>
   * y devuelve TODOS los modelos del catálogo (gpt-*, o1, o3, o4, chatgpt-*,
   * gemini-* si estuvieran, etc.), excluyendo los de embeddings/audio/tts
   * que no sirven para chat.
   */
  app.get("/api/openai/models", async (req: Request, res: Response) => {
    const apiKey =
      (req.headers["x-openai-key"] as string) ||
      (req.query.key as string) ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Falta API key de OpenAI (header x-openai-key o variable OPENAI_API_KEY)." });
    }
    try {
      const r = await fetchCloud(
        "https://api.openai.com/v1/models",
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
        { plazoMs: PLAZO_CATALOGO_MS, catalogo: true }, // v2.1.6 · catálogo, no generación
      );
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `OpenAI devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      const all = Array.isArray(data?.data) ? data.data : [];
      // 🔧 Devolver TODOS los modelos útiles para chat/razonamiento, no solo gpt-4.
      // Filtrar SOLO los que claramente no son de chat: embeddings, audio, tts,
      // whisper, moderation, dall-e, realtime, etc.
      const chatModels = all
        .filter((m: any) => {
          const id: string = String(m?.id || "");
          if (!id) return false;
          // Excluir categorías que no son chat
          // v1.60.20 — FIM (autocompletado) NO es chat: mistral-code-fim-latest degeneró en 262 KB.
          if (/(^|[-_.])fim([-_.]|$)/i.test(id)) return false;
          return !/^(text-embedding|embed|tts|whisper|moderation|dall-e|audio|realtime|text-search|code-search|text-similarity|curie|davinci|babbage|ada-002|text-davinci|text-curie)/i.test(id);
        })
        .map((m: any) => ({
          id: String(m.id),
          name: String(m.id),
          description: `Modelo OpenAI disponible en tu cuenta. Propietario: ${m.owned_by || "openai"}. Creado: ${m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : "n/d"}.`,
          contextWindow: "auto",
          provider: "openai",
        }))
        // Ordenar: gpt-4o primero, luego gpt-4o-mini, luego el resto
        .sort((a: any, b: any) => {
          const order = (id: string) => {
            if (id === "gpt-4o") return 0;
            if (id === "gpt-4o-mini") return 1;
            if (id.startsWith("gpt-4o")) return 2;
            if (id.startsWith("o3")) return 3;
            if (id.startsWith("o1")) return 4;
            if (id.startsWith("o4")) return 5;
            if (id.startsWith("chatgpt")) return 6;
            if (id.startsWith("gpt-4")) return 7;
            if (id.startsWith("gpt-3.5")) return 8;
            if (id.startsWith("gpt-5")) return 9;
            return 99;
          };
          return order(a.id) - order(b.id);
        });
      return res.json({ models: chatModels, total: chatModels.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * v1.1 — Z.AI (GLM) — Catálogo de modelos gratuitos.
   * Z.ai cambia su endpoint /models con frecuencia y a veces requiere invitación,
   * por eso devolvemos un catálogo estático de los modelos gratuitos estables.
   * Si el usuario pegó API key, también intentamos listar en vivo para complementar.
   */
  app.get("/api/zai/models", async (req: Request, res: Response) => {
    const apiKey = (req.headers["x-zai-key"] as string) || (req.query.key as string) || process.env.ZAI_API_KEY;
    // Catálogo estático (siempre disponible, no requiere key):
    const STATIC_FREE = [
      { id: "glm-4.5-flash",  name: "GLM-4.5-Flash",  description: "Modelo gratuito estrella de Z.ai. Veloz y capaz. Ideal para code + chat.", contextWindow: "128K", provider: "zai" },
      { id: "glm-4-flash",    name: "GLM-4-Flash",    description: "Hermano menor de GLM-4.5-Flash. Gratis y muy rápido.",                     contextWindow: "128K", provider: "zai" },
      { id: "glm-4-air",      name: "GLM-4-Air",      description: "Variante liviana de GLM-4. Gratis para uso personal.",                    contextWindow: "128K", provider: "zai" },
      { id: "glm-4-flashx",  name: "GLM-4-FlashX",   description: "GLM-4 ultra-rápido. Gratis.",                                            contextWindow: "128K", provider: "zai" },
      { id: "glm-4.5v-flash", name: "GLM-4.5V-Flash", description: "Modelo vision (multimodal) gratuito de Z.ai.",                          contextWindow: "64K",  provider: "zai" },
    ];
    if (!apiKey) {
      return res.json({ models: STATIC_FREE, total: STATIC_FREE.length, source: "static" });
    }
    // Si hay API key, intentamos listar en vivo (best-effort). Si falla, devolvemos el estático.
    try {
      const r = await fetchCloud(
        "https://api.z.ai/api/paas/v4/models",
        { headers: { Authorization: `Bearer ${apiKey}` } },
        { plazoMs: PLAZO_CATALOGO_MS, catalogo: true }, // v2.1.6 · catálogo, no generación
      );
      if (r.ok) {
        const data: any = await r.json();
        const all = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
        const live = all.map((m: any) => ({
          id: String(m.id || m.name),
          name: String(m.id || m.name),
          description: `Modelo Z.ai (en vivo): ${m.description || m.owned_by || "n/d"}`,
          contextWindow: "auto",
          provider: "zai",
        })).filter((m: any) => m.id);
        // Combinar: catálogo estático + modelos en vivo (sin duplicar)
        const seen = new Set(STATIC_FREE.map((s) => s.id));
        const merged = [...STATIC_FREE, ...live.filter((m: any) => !seen.has(m.id))];
        return res.json({ models: merged, total: merged.length, source: "live+static" });
      }
    } catch {}
    return res.json({ models: STATIC_FREE, total: STATIC_FREE.length, source: "static-fallback" });
  });

  /**
   * v1.1 — Generic cloud models endpoint: lista modelos de cualquier proveedor OpenAI-compatible
   * conocido (Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks). Reusa /api/custom/models
   * internamente con la URL correcta según el proveedor.
   */
  app.get("/api/cloud/models", async (req: Request, res: Response) => {
    const provider = String(req.query.provider || req.headers["x-provider"] || "");
    // v1.0.34 · la clave viaja sin «Bearer», sin comillas y sin el salto de línea
    // que deja copiar-pegar: un `\n` al final producía un 401 que se leía como
    // «clave inválida» con la clave perfecta.
    const apiKey = limpiarClave((req.headers["x-cloud-key"] as string) || (req.query.key as string) || "");
    const CLOUD_URLS: Record<string, string> = {
      groq: "https://api.groq.com/openai/v1",
      cerebras: "https://api.cerebras.ai/v1",
      together: "https://api.together.xyz/v1",
      mistral: "https://api.mistral.ai/v1",
      deepseek: "https://api.deepseek.com/v1",
      fireworks: "https://api.fireworks.ai/inference/v1",
    };
    if (!provider || !CLOUD_URLS[provider]) {
      return res.status(400).json({ error: `Provider inválido. Valores válidos: ${Object.keys(CLOUD_URLS).join(", ")}` });
    }
    const url = CLOUD_URLS[provider];
    // Si no hay API key, devolvemos catálogo estático conocido (algunos servicios requieren key):
    const STATIC: Record<string, any[]> = {
      groq:     [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", description: "Modelo gratuito estrella de Groq. 128K ctx.", contextWindow: "128K", provider: "groq" },
                 { id: "llama-3.1-8b-instant",   name: "Llama 3.1 8B",   description: "Llama 3.1 8B instantáneo en Groq.",                contextWindow: "128K", provider: "groq" },
                 { id: "gemma2-9b-it",            name: "Gemma 2 9B",     description: "Gemma 2 9B instruct en Groq.",                     contextWindow: "8K",   provider: "groq" },
                 { id: "mixtral-8x7b-32768",      name: "Mixtral 8x7B",   description: "Mixtral 8x7B en Groq (32K context).",              contextWindow: "32K",  provider: "groq" },
                 { id: "openai/gpt-oss-120b",    name: "GPT-OSS 120B",   description: "v1.43: modelo open-source 120B en Groq. 131K ctx.", contextWindow: "131K", provider: "groq" },
                 { id: "openai/gpt-oss-20b",     name: "GPT-OSS 20B",    description: "v1.43: modelo open-source 20B en Groq. Rápido.",   contextWindow: "131K", provider: "groq" },
                 { id: "qwen/qwen3.8-27b",       name: "Qwen 3.8 27B",   description: "v1.43: Qwen 3.8 27B en Groq. 131K ctx.",         contextWindow: "131K", provider: "groq" },
                 { id: "whisper-large-v3",       name: "Whisper Large V3", description: "v1.43: transcripción de audio en Groq.",           contextWindow: "—",    provider: "groq", category: "small" },
                 { id: "meta-llama/llama-prompt-guard-2-22m", name: "Prompt Guard 22M", description: "v1.43: seguridad de prompts (22M).", contextWindow: "—", provider: "groq", category: "small" },
                 { id: "meta-llama/llama-prompt-guard-2-86m", name: "Prompt Guard 86M", description: "v1.43: seguridad de prompts (86M).", contextWindow: "—", provider: "groq", category: "small" }],
      cerebras: [{ id: "llama3.1-8b",                       name: "Llama 3.1 8B",       description: "Llama 3.1 8B en Cerebras (ultra-rápido).", contextWindow: "128K", provider: "cerebras" },
                  { id: "llama3.1-70b",                     name: "Llama 3.1 70B",      description: "Llama 3.1 70B en Cerebras.",                contextWindow: "128K", provider: "cerebras" },
                  { id: "qwen-2.5-coder-32b-instruct",      name: "Qwen 2.5 Coder 32B", description: "Qwen 2.5 Coder 32B en Cerebras.",           contextWindow: "128K", provider: "cerebras" }],
      together:  [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",       name: "Llama 3.3 70B Turbo Free",   description: "Llama 3.3 70B gratis en Together (turbo).", contextWindow: "128K", provider: "together" },
                   { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",       name: "Llama 3.1 8B Turbo",        description: "Llama 3.1 8B Turbo en Together.",           contextWindow: "128K", provider: "together" },
                   { id: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",    name: "DeepSeek R1 Distill 70B",   description: "DeepSeek R1 Distill Llama 70B free.",       contextWindow: "128K", provider: "together" }],
      mistral:  [{ id: "mistral-small-latest", name: "Mistral Small",   description: "Mistral Small (última versión). Gratis.", contextWindow: "32K",  provider: "mistral" },
                 { id: "mistral-medium-latest", name: "Mistral Medium",  description: "Mistral Medium (última versión).",        contextWindow: "32K",  provider: "mistral" },
                 { id: "codestral-latest",      name: "Codestral",       description: "Codestral — especializado en código.",    contextWindow: "32K",  provider: "mistral" },
                 { id: "open-mistral-nemo",     name: "Mistral Nemo",    description: "Mistral Nemo open-source.",                contextWindow: "128K", provider: "mistral" }],
      deepseek: [{ id: "deepseek-chat",     name: "DeepSeek V3",     description: "DeepSeek Chat (V3).", contextWindow: "64K", provider: "deepseek" },
                 { id: "deepseek-reasoner", name: "DeepSeek R1",     description: "DeepSeek Reasoner (R1).", contextWindow: "64K", provider: "deepseek" },
                 { id: "deepseek-coder",   name: "DeepSeek Coder", description: "DeepSeek Coder (especializado en código).", contextWindow: "64K", provider: "deepseek" }],
      fireworks:[{ id: "accounts/fireworks/models/llama-v3p1-8b-instruct",            name: "Llama 3.1 8B",                 description: "Llama 3.1 8B en Fireworks.",                  contextWindow: "128K", provider: "fireworks" },
                  { id: "accounts/fireworks/models/llama-v3p1-70b-instruct",           name: "Llama 3.1 70B",                description: "Llama 3.1 70B en Fireworks.",                 contextWindow: "128K", provider: "fireworks" },
                  { id: "accounts/fireworks/models/deepseek-r1-distill-llama-70b",     name: "DeepSeek R1 Distill 70B",      description: "DeepSeek R1 Distill Llama 70B en Fireworks.", contextWindow: "128K", provider: "fireworks" }],
    };
    if (!apiKey) {
      const list = STATIC[provider] || [];
      return res.json({ models: list, total: list.length, source: "static" });
    }
    // v1.0.34 · SI LA CLAVE NO SIRVE, SE DICE. Antes esta rama devolvía el catálogo
    // estático con HTTP 200 y sin motivo: la interfaz escribía «3 modelos
    // detectados» y el usuario no sabía que su clave había sido rechazada
    // («puse la clave de un modelo pago y ni cargaron los modelos», DeepSeek).
    let diagnostico = null;
    try {
      const r = await fetchCloud(`${url}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, { plazoMs: PLAZO_CATALOGO_MS, catalogo: true });
      if (r.ok) {
        const data: any = await r.json();
        const all = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
        const live = all.map((m: any) => ({
          id: String(m.id || m.name || ""),
          name: String(m.id || m.name || ""),
          description: `Modelo en vivo de ${provider}.`,
          contextWindow: "auto",
          provider,
        })).filter((m: any) => m.id);
        return res.json(respuestaCatalogo({
          provider,
          estaticos: STATIC[provider] || [],
          enVivo: live,
          diagnostico: live.length === 0 ? diagnosticoCatalogo({ provider, status: r.status, cuerpo: data, conClave: true }) : null,
        }));
      }
      const cuerpo = await r.text().catch(() => "");
      diagnostico = diagnosticoCatalogo({ provider, status: r.status, cuerpo, conClave: true });
    } catch (err: any) {
      diagnostico = diagnosticoCatalogo({ provider, errorRed: String(err?.message || err), plazoMs: PLAZO_CATALOGO_MS, conClave: true });
    }
    return res.json(respuestaCatalogo({ provider, estaticos: STATIC[provider] || [], diagnostico }));
  });

  /**
   * 🔧 Lista los modelos disponibles en CUALQUIER endpoint OpenAI-compatible.
   * Útil para Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks, etc.
   * Recibe la URL base y la API key por headers (x-custom-url, x-custom-key).
   * Esto permite al usuario "Cargar modelos" del servidor Custom elegido.
   */
  app.get("/api/custom/models", async (req: Request, res: Response) => {
    const customUrlBruta = (req.headers["x-custom-url"] as string) || (req.query.url as string);
    const customKey = (req.headers["x-custom-key"] as string) || (req.query.key as string);
    // v1.77.0 · ADUANA DE LA RANURA (queja de Mario 26/10: «en el selector no
    // hay ninguna carpeta de modelos custom» — la ranura tenía una RUTA y el error
    // crudo de fetch llegaba sin decir que una carpeta no es un endpoint).
    // Validación pura y nombrada en src/engine/aduanaModelos.ts; el fetch no se toca.
    const valUrl = validarUrlServidorCustom(customUrlBruta);
    if (!valUrl.ok) {
      return res.status(400).json({ error: valUrl.error });
    }
    const customUrl = valUrl.url!;
    try {
      const cleanUrl = customUrl.replace(/\/$/, "");
      // Aceptar tanto "https://api.groq.com/openai/v1" como "https://api.groq.com/openai/v1/models"
      const endpoint = cleanUrl.endsWith("/models")
        ? cleanUrl
        : cleanUrl.endsWith("/v1")
        ? `${cleanUrl}/models`
        : `${cleanUrl}/v1/models`;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }

      // v1.94.1 · UNA SONDA DE CATÁLOGO LOCAL NO ES UN PROVEEDOR DE NUBE.
      // `fetchCloud` mide el primer byte y, si el intento falla, mete al ANFITRIÓN en
      // cuarentena con backoff (ventana de 12 min, pausa que se duplica). Para la API
      // unificada de Mario —un servidor en 127.0.0.1:3001 que suele nacer DESPUÉS de la
      // IDE— eso resultaba letal y silencioso: el sondeo automático de arranque fallaba
      // una vez porque el router todavía no estaba arriba, y a partir de ahí cada
      // reintento, incluido el del botón manual, quedaba rechazado por el fusible antes
      // de gastar un byte («⛔ EN CUARENTENA»). El fusible existe para cuota y latencia
      // de la nube; pedirle `/v1/models` a mi propia máquina no es ninguna de las dos.
      // La casa ya distingue lo local dentro del propio guardián («A la máquina no se
      // le censura nada»): la misma distinción se aplica ahora al sondeo de catálogo.
      // La nube real sigue pasando por `fetchCloud`, intacta.
      let r: globalThis.Response;
      if (esDestinoLocal(endpoint)) {
        const ctrl = new AbortController();
        const temporizador = setTimeout(() => ctrl.abort(), 8000);
        try {
          r = await fetch(endpoint, { headers, signal: ctrl.signal });
        } catch (e: any) {
          const causa = e?.name === "AbortError"
            ? "no respondió en 8 s — ¿el endpoint unificado está arriba en esa URL?"
            : String(e?.cause?.message || e?.message || e).slice(0, 200);
          return res.status(502).json({
            error: `El endpoint unificado local no contestó (${causa}). Esto NO pone en cuarentena a tu máquina: volvé a intentar apenas levante.`,
            endpoint,
          });
        } finally {
          clearTimeout(temporizador);
        }
      } else {
        r = await fetchCloud(endpoint, { headers }, { plazoMs: PLAZO_CATALOGO_MS, catalogo: true }); // v2.1.6 · catálogo, no generación
      }
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        return res.status(r.status).json({ error: `Servidor Custom devolvió HTTP ${r.status}: ${errTxt.slice(0, 300)}` });
      }
      const data: any = await r.json();
      // La respuesta puede venir como { data: [...] } (estilo OpenAI) o como { models: [...] } (algunos proxies)
      const all = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
      const models = all
        .map((m: any) => ({
          id: String(m.id || m.name || m.model || ""),
          name: String(m.id || m.name || m.model || ""),
          description: m.description || m.owned_by || `Modelo del servidor Custom`,
          contextWindow: m.context_length ? `${Math.round(m.context_length / 1000)}k` : (m.context_window ? `${Math.round(m.context_window / 1000)}k` : "auto"),
          provider: "custom",
        }))
        .filter((m: any) => m.id);
      return res.json({ models, total: models.length, endpoint });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
