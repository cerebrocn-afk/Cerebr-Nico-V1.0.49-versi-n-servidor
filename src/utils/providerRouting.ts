import type { ModelProvider } from "../types";

/**
 * providerRouting.ts — ENRUTAMIENTO DE PROVEEDOR POR NOMBRE DE MODELO (v1.6.22)
 * ============================================================================
 * Decidir el proveedor SOLO por el nombre del modelo era un defecto: un modelo
 * LOCAL instalado en Ollama puede llamarse `glm-ocr:latest`, `gemini-x`,
 * `gpt-algo`, `mistral-mio`, `deepseek-cosa`… y el prefijo lo mandaba al
 * proveedor cloud que «suena» igual, donde ese modelo no existe.
 *
 * El caso real: `glm-ocr:latest` (modelo OCR local de Ollama, 2.2 GB) se
 * enrutaba a Z.ai porque empieza por `glm-`, y Z.ai respondía «Unknown Model».
 *
 * La regla corregida es de dos pasos y en este orden:
 *   1. Si el nombre está en la lista de modelos locales de Ollama → `ollama`.
 *   2. Solo si NO es local, se deduce el proveedor cloud por el prefijo.
 */

export function proveedorParaModelo(modelName: string, modelosLocales: string[]): ModelProvider {
  const n = String(modelName || "").trim();
  if (!n) return "ollama";

  // LOCAL PRIMERO: la lista que devuelve `/api/tags` de Ollama es la fuente de
  // verdad. Si el modelo está instalado, es local aunque el nombre diga lo contrario.
  if (modelosLocales.includes(n)) return "ollama";

  if (n.startsWith("glm-")) return "zai";
  if (n.startsWith("gemini")) return "gemini";
  if (n.startsWith("gpt") || n.startsWith("o1") || n.startsWith("o3")) return "openai";
  // Fireworks se comprueba ANTES que «/»: sus nombres son
  // «accounts/fireworks/models/...» y el «/» los atrapaba como OpenRouter.
  if (n.startsWith("accounts/fireworks")) return "fireworks";
  // v1.43.0 — Modelos Groq con prefijo "openai/" o "qwen/" en su catálogo.
  // ⚠️ DEBE IR ANTES del check genérico de "/" (OpenRouter) porque estos modelos
  // tienen "/" en su nombre pero son de Groq, no de OpenRouter.
  if (n.startsWith("openai/gpt-oss") || n.startsWith("qwen/qwen") || n.startsWith("meta-llama/llama-prompt-guard")) return "groq";
  // v1.43.0 — Together usa "meta-llama/" y "deepseek-ai/" pero NO son Groq.
  // El check de OpenRouter (includes "/")) los atrapa correctamente.
  if (n.includes("/")) return "openrouter";
  if (n.startsWith("llama-3.") || n.startsWith("gemma2") || n.startsWith("mixtral")) return "groq";
  if (n.startsWith("llama3.1") || n.startsWith("qwen-2.5")) return "cerebras";
  if (n.startsWith("mistral") || n.startsWith("codestral") || n.startsWith("open-mistral")) return "mistral";
  if (n.startsWith("deepseek")) return "deepseek";
  return "ollama";
}

/**
 * v1.57.21 — CAMBIAR DE MOTOR CAMBIA TAMBIÉN EL MODELO (la otra mitad del bug)
 * ─────────────────────────────────────────────────────────────────────────────
 * El guard del servidor (v1.56.2) cubría el caso «elegí un modelo local pero el
 * motor sigue en la nube». El log de Mario (v1.57.20, 16/10) mostraba la
 * simetría opuesta, y era la que pasaba de verdad: el usuario tocaba el botón
 * del MOTOR (LeftSidebar «Proveedor de Inferencia», o las ranuras de
 * ApiKeyModal) y el modelo SE QUEDABA en `gemma4:31b-cloud`. Cada turno llegaba
 * despareado, el servidor lo corregía y el aviso 🧩 salía siete veces seguidas.
 *
 * La regla de la interfaz es la misma que ya regía al revés:
 * MOTOR Y MODELO SON UNA SOLA DECISIÓN. Al cambiar el motor:
 *   · si el modelo actual ya pertenece a ese motor → no se toca nada;
 *   · si hay modelos detectados para el motor nuevo → se pasa al primero
 *     (los `detected*Models` son la fuente: lo que el motor realmente tiene);
 *   · si no hay ninguno detectado → se deja el modelo, pero `pertenece=false`
 *     avisa al llamante para que lo diga en la consola de la IDE. La guarda
 *     del servidor sigue siendo el cinturón: si el turno llega mal casado,
 *     manda el modelo.
 */
export interface ListasModelosPorMotor {
  /** Modelos instalados en Ollama (`/api/tags`). */
  ollama: string[];
  gemini?: string[];
  zai?: string[];
  groq?: string[];
  openrouter?: string[];
  openai?: string[];
  // v1.58.3 — motores cloud OpenAI-compatibles que faltaban en el selector:
  cerebras?: string[];
  mistral?: string[];
  together?: string[];
  deepseek?: string[];
  fireworks?: string[];
}

export function modeloAlCambiarMotor(
  nuevoMotor: string,
  modeloActual: string,
  listas: ListasModelosPorMotor
): { modelo: string | null; pertenece: boolean } {
  const locales = Array.isArray(listas.ollama) ? listas.ollama : [];
  if (proveedorParaModelo(modeloActual, locales) === nuevoMotor) {
    return { modelo: null, pertenece: true };
  }
  const candidatas: string[] | undefined =
    nuevoMotor === "ollama" ? listas.ollama :
    nuevoMotor === "gemini" ? listas.gemini :
    nuevoMotor === "zai" ? listas.zai :
    nuevoMotor === "groq" ? listas.groq :
    nuevoMotor === "openrouter" ? listas.openrouter :
    nuevoMotor === "openai" ? listas.openai :
    nuevoMotor === "cerebras" ? listas.cerebras :
    nuevoMotor === "mistral" ? listas.mistral :
    nuevoMotor === "together" ? listas.together :
    nuevoMotor === "deepseek" ? listas.deepseek :
    nuevoMotor === "fireworks" ? listas.fireworks :
    undefined;
  const primero = (candidatas || []).find((m) => typeof m === "string" && m.trim());
  return { modelo: primero || null, pertenece: false };
}

/**
 * v1.68.0 · EL MODELO AL QUE SE LE HABLA ES UNO SOLO (defecto 4 del manual).
 * ─────────────────────────────────────────────────────────────────────────
 * Cada rama de proveedor resolvía su modelo por su cuenta:
 *   openrouter → `model || "deepseek/deepseek-r1"`
 *   custom     → `model || "default"`
 *   zai/groq/cerebras/together/mistral/deepseek/fireworks →
 *              `model && model !== "stablelm2:latest" ? model : "<su defecto>"`
 *   ollama     → `model.replace(/\.ollama$/, "")`
 * Mientras el manual del turno se armaba con `model` a secas. Con el selector
 * vacío — o con el viejo `stablelm2:latest` — el proveedor recibía el catálogo de
 * UN modelo y la documentación de OTRO: de ahí que «unos proveedores encuentran
 * las rutas y otros no». La tabla está aquí, junto al enrutado por nombre, para
 * que el perfil, el esquema `tools` y el manual salgan del MISMO nombre.
 */
export const MODELO_POR_DEFECTO_PROVEEDOR: Record<string, string> = {
  openrouter: "deepseek/deepseek-r1",
  custom: "default",
  zai: "glm-4.5-flash",
  groq: "llama-3.3-70b-versatile",
  cerebras: "llama3.1-8b",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  mistral: "mistral-small-latest",
  deepseek: "deepseek-chat",
  fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
};

export function resolverModeloEfectivo(provider: string, model: string): string {
  const prov = String(provider || "").toLowerCase();
  const m = String(model || "");
  if (prov === "ollama") return m.replace(/\.ollama$/, "");
  const defecto = MODELO_POR_DEFECTO_PROVEEDOR[prov];
  if (!defecto) return m; // gemini / openai / los que llaman con el nombre tal cual
  // openrouter y custom solo miraban si venía vacío; las otras siete OpenAI-compat
  // trataban además `stablelm2:latest` como «sin modelo elegido».
  const ibaVacia = prov === "openrouter" || prov === "custom" ? !m : !m || m === "stablelm2:latest";
  return ibaVacia ? defecto : m;
}
