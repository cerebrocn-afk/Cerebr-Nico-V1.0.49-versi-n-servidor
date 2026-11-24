/**
 * CerebroNico IDE v1 - Constantes compartidas
 * ============================================================
 * Fuente única de verdad para:
 *   - Puertos de la arquitectura (IDE / sandbox / puente PC / Ollama)
 *   - Claves de localStorage (prefijo codigo0_)
 *   - Marca y versión (CerebroNico IDE v1)
 *
 * Antes estas cadenas estaban dispersas y duplicadas entre App.tsx,
 * RightSidebar.tsx, ChatCenter.tsx, ApiKeyModal.tsx y los utils:
 * un cambio de puerto o de clave implicaba cazar strings a mano.
 */

// ------------------------------------------------------------
// Puertos oficiales de la arquitectura CerebroNico
// ------------------------------------------------------------
export const PORTS = {
  /** Interfaz de la IDE (Vite + Express server.ts) */
  IDE: 3000,
  /** Sandbox: app exportada / preview en vivo (NUNCA usar 3000 aquí) */
  SANDBOX: 3500,
  /** Puente Python hacia la PC del usuario (agent_bridge_5000.py) */
  BRIDGE: 5000,
  /** Daemon de memoria híbrida (hindsight) */
  MEMORY: 5100,
  /** Daemon creador de sitios web */
  CREATOR: 5102,
  /** Motor del cerebro (cerebro_motor.py): hechos, páginas, consolidación.
   *  Es un órgano DISTINTO del daemon :5100, que solo lo consulta por HTTP. */
  CEREBRO: 5103,
  /** Motor de inferencia local Ollama */
  OLLAMA: 11434,
} as const;

/**
 * v1.46.0 — PUERTOS RESERVADOS QUE **NO** LEVANTA LA APP.
 *
 * Origen: en la sesión del usuario el modelo «recordó» una lista de puertos que
 * incluía 5500 y 8000, y la dejó escrita en `memoria.md` como si fueran
 * servicios de la casa. Se revisó el código entero: NO existe ningún `listen`
 * en 5500 ni en 8000 — no hay preview en 5500 ni API en 8000. Aparecían porque
 * el usuario los nombró y el modelo los confirmó, que es exactamente la clase
 * de mentira que este proyecto combate («nunca inventes que una aspiracional
 * funciona»).
 *
 * Se dejan DECLARADOS y separados de `PORTS` para que la memoria del IDE tenga
 * una única fuente de verdad: estos números son del usuario (reserva suya para
 * lo que quiera montar), no servicios que el proyecto arranque. Un modelo que
 * los lea sabrá decir «eso es tuyo, la app no lo levanta» en vez de inventar
 * que están activos.
 */
export const PUERTOS_RESERVADOS_USUARIO = [5500, 8000] as const;

/**
 * El mapa de puertos en texto, para inyectar en la memoria y en el prompt.
 * Se deriva de las constantes de arriba: no se escribe a mano dos veces.
 */
/**
 * v2.3.12 · FALTABA EL MOTOR DEL CEREBRO. Este mapa — que es el texto que lee la
 * memoria del IDE y el prompt — tenía seis líneas con `PORTS` en siete: :5103 se
 * declaró en `PORTS` (v2.0), entró en `PUERTOS_CLAVE` y en la barra de estado
 * (v2.3.9), pero nunca llegó acá. Un modelo que lea este mapa y no el otro dice
 * «son seis puertos» con toda la confianza del mundo. La valla
 * `tests/puertosArranque.test.ts` cruza cada tabla contra `PORTS` para que la
 * omisión siguiente sea roja y no invisible.
 */
export const MAPA_PUERTOS = [
  `${PORTS.IDE}  · IDE (interfaz + API /api/*)`,
  `${PORTS.SANDBOX}  · Sandbox / previsualización en vivo`,
  `${PORTS.BRIDGE}  · Puente Python hacia la PC (agent_bridge_5000.py)`,
  `${PORTS.MEMORY}  · Memoria híbrida (hindsight)`,
  `${PORTS.CREATOR}  · Pack creador de sitios`,
  `${PORTS.CEREBRO}  · Motor del cerebro (cerebro_motor.py): guarda hechos y páginas`,
  `${PORTS.OLLAMA} · Ollama (inferencia local)`,
  `${PUERTOS_RESERVADOS_USUARIO.join(" / ")} · Reservados por el usuario (la app NO los levanta)`,
].join("\n");

export const IDE_URL = `http://127.0.0.1:${PORTS.IDE}`;
export const SANDBOX_URL = typeof window !== "undefined" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ? new URL("./sandbox-preview/", window.location.href).href : `http://127.0.0.1:${PORTS.SANDBOX}`;
export const BRIDGE_URL = `http://127.0.0.1:${PORTS.BRIDGE}`;
export const OLLAMA_URL = `http://127.0.0.1:${PORTS.OLLAMA}`;
export const MEMORY_URL = `http://127.0.0.1:${PORTS.MEMORY}`;
export const CREATOR_URL = `http://127.0.0.1:${PORTS.CREATOR}`;

export function resolverUrlSandbox(): string {
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.hostname !== "localhost"
  ) {
    return `${window.location.origin}/sandbox-preview/`;
  }
  return SANDBOX_URL;
}

// ------------------------------------------------------------
// Catálogo de servidores cloud con modelos gratuitos
// ------------------------------------------------------------
// Estos proveedores tienen tier gratuito con API key:
//   - Groq:      ultra-rápido (Llama 3.3 70B, Gemma 2, etc.)
//   - Cerebras:  ultra-rápido (Llama 3.1, Qwen, etc.)
//   - Together:  $5 free credit (Llama, DeepSeek, Qwen)
//   - Mistral:   tier gratuito (mistral-small, mistral-medium)
//   - Z.ai:      GLM-4-Flash gratuito (a veces requiere invitación)
// ------------------------------------------------------------
export const CLOUD_PROVIDERS = {
  openai: {
    name: "OpenAI",
    docs: "https://platform.openai.com/api-keys",
    apiBase: "https://api.openai.com/v1",
    freeTier: false,
    description: "GPT-4o, GPT-4o-mini, o1, o3-mini. Pago por uso.",
  },
  gemini: {
    name: "Google Gemini",
    docs: "https://aistudio.google.com/apikey",
    apiBase: "https://generativelanguage.googleapis.com/v1beta",
    freeTier: true,
    description: "Gemini 4 (Hydrogen, Neon, Carbon, Argon), Gemini 3.x Flash/Lite. Tier gratuito generoso.",
  },
  openrouter: {
    name: "OpenRouter",
    docs: "https://openrouter.ai/keys",
    apiBase: "https://openrouter.ai/api/v1",
    freeTier: true,
    description: "Multi-modelo (Claude, DeepSeek, Llama, etc.). Tier gratuito con modelos :free.",
  },
  // v1.1 — Z.AI as dedicated provider. GLM-4.5-Flash and GLM-4-Flash are 100% free.
  zai: {
    name: "Z.ai (GLM)",
    docs: "https://z.ai/manage/apikey",
    apiBase: "https://api.z.ai/api/paas/v4",
    freeTier: true,
    description: "GLM-4.5-Flash, GLM-4-Flash, GLM-4-Air — modelos 100% GRATUITOS. Tier free generoso sin tarjeta.",
  },
  groq: {
    name: "Groq",
    docs: "https://console.groq.com/keys",
    apiBase: "https://api.groq.com/openai/v1",
    freeTier: true,
    description: "Ultra-rápido: Llama 3.3 70B, Gemma 2 9B, Mixtral. Tier gratuito con rate limits.",
  },
  cerebras: {
    name: "Cerebras",
    docs: "https://cloud.cerebras.ai",
    apiBase: "https://api.cerebras.ai/v1",
    freeTier: true,
    description: "Ultra-rápido: Llama 3.1 8B/70B, Qwen 2.5. Tier gratuito durante la beta.",
  },
  together: {
    name: "Together AI",
    docs: "https://api.together.xyz/settings/api-keys",
    apiBase: "https://api.together.xyz/v1",
    freeTier: true,
    description: "Llama, DeepSeek, Qwen, Mistral. $5 de crédito gratuito al registrarse.",
  },
  mistral: {
    name: "Mistral AI",
    docs: "https://console.mistral.ai/api-keys",
    apiBase: "https://api.mistral.ai/v1",
    freeTier: true,
    description: "Mistral Small/Medium/Large, Codestral. Tier gratuito con rate limits.",
  },
  deepseek: {
    name: "DeepSeek",
    docs: "https://platform.deepseek.com/api_keys",
    apiBase: "https://api.deepseek.com/v1",
    freeTier: false,
    description: "DeepSeek V3, R1. Muy económico (no es free pero casi).",
  },
  fireworks: {
    name: "Fireworks AI",
    docs: "https://fireworks.ai/account/api-keys",
    apiBase: "https://api.fireworks.ai/inference/v1",
    freeTier: true,
    description: "Llama, DeepSeek, Qwen. $1 de crédito gratuito al registrarse.",
  },
} as const;

// v1.1 — Catálogo estático de modelos gratuitos de Z.ai (no requieren listar endpoint):
// Z.ai tiene un endpoint /models pero su catálogo cambia; estos son los modelos
// gratuitos estables que el IDE muestra siempre para que el usuario pueda elegir
// sin necesidad de pegar la API key primero.
// ⚠️ v2.0 — CORRECCIÓN DE PRECIOS (verificado el 18/09/2026 contra la tabla oficial
// de precios de Z.ai, https://docs.z.ai/guides/overview/pricing):
//   GRATIS (input y output a $0): GLM-4.7-Flash · GLM-4.5-Flash · GLM-4.6V-Flash (visión)
//   DE PAGO: GLM-4-Air ($0.2/$1.1 por 1M), GLM-4.7-FlashX, GLM-4.5-Air, GLM-4.6, GLM-5.x…
//   La v1.1 anunciaba "glm-4-flash", "glm-4-air" y "glm-4-flashx" como gratuitos: el
//   usuario podía comerse un error de cuota o incluso un cargo. Se quedan en el catálogo
//   pero marcados free: false para que el selector pueda avisar.
export const ZAI_FREE_MODELS = [
  { id: "glm-4.7-flash",   name: "GLM-4.7-Flash",   context: "128K", free: true,  vision: false, description: "El GLM gratuito más nuevo. Gratis confirmado en la tabla oficial. Ideal para código y chat." },
  { id: "glm-4.5-flash",   name: "GLM-4.5-Flash",   context: "128K", free: true,  vision: false, description: "Gratis confirmado. Veloz y capaz: el caballo de batalla del chat." },
  { id: "glm-4.6v-flash",  name: "GLM-4.6V-Flash",  context: "64K",  free: true,  vision: true,  description: "Visión GRATUITA: imágenes, capturas, OCR y documentos escaneados." },
  { id: "glm-4-flash",     name: "GLM-4-Flash",     context: "128K", free: false, vision: false, description: "⚠️ Ya no figura en la lista gratuita oficial: verifica tu cuenta antes de usarlo." },
  { id: "glm-4-air",       name: "GLM-4-Air",       context: "128K", free: false, vision: false, description: "⚠️ DE PAGO ($0.2 por 1M entrada / $1.1 salida). Solo referencia." },
  { id: "glm-4-flashx",    name: "GLM-4-FlashX",    context: "128K", free: false, vision: false, description: "⚠️ DE PAGO. Solo referencia." },
] as const;

// v1.1 — Catálogo estático de los demás proveedores cloud gratuitos:
export const GROQ_FREE_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "whisper-large-v3",
  "meta-llama/llama-prompt-guard-2-22m",
  "meta-llama/llama-prompt-guard-2-86m",
] as const;

export const CEREBRAS_FREE_MODELS = [
  "llama3.1-8b",
  "llama3.1-70b",
  "qwen-2.5-coder-32b-instruct",
] as const;

export const TOGETHER_FREE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
] as const;

export const MISTRAL_FREE_MODELS = [
  "mistral-small-latest",
  "mistral-medium-latest",
  "codestral-latest",
  "open-mistral-nemo",
] as const;

export const DEEPSEEK_MODELS = [
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-coder",
] as const;

export const FIREWORKS_FREE_MODELS = [
  "accounts/fireworks/models/llama-v3p1-8b-instruct",
  "accounts/fireworks/models/llama-v3p1-70b-instruct",
  "accounts/fireworks/models/deepseek-r1-distill-llama-70b",
] as const;

// ------------------------------------------------------------
// Marca y versión — fuente ÚNICA: si la cabecera no dice la versión del
// ZIP, lo que corre no es lo que instalaste (regla nacida de un bug real).
// ------------------------------------------------------------
// ============================================================
// 🐞 DEFECTO CAZADO (v8.0.1) — «la cabecera dice V8.0.0 y el menú CN dice V1.0.3»
// ------------------------------------------------------------
// La regla de hierro de la v2.3 («nadie más escribe la versión en texto
// visible») se cumplió en los textos visibles, pero dejó intacta la causa de
// fondo: `VERSION` y `FULL_NAME` eran DOS literales independientes dentro del
// mismo objeto. La cabecera lee `.VERSION` y el menú CN lee `.FULL_NAME`, así
// que basta editar uno para que la interfaz se contradiga consigo misma, sin
// que ningún compilador se queje y sin que el tsc lo note.
//
// Ahora hay UN solo literal (`VERSION_SEMVER`) y las dos formas visibles se
// derivan de él. No pueden divergir: no existen dos sitios que puedan
// olvidarse el uno del otro.
// ============================================================
const VERSION_SEMVER = "1.0.55";

/**
 * v0.9 — LA ETIQUETA VISIBLE, DERIVADA.
 *
 * La regla de hierro sigue siendo la misma —un solo literal— pero ahora hacen
 * falta DOS formas visibles de la misma semilla:
 *
 *   · `0.9.0`  → semver completa, la que exige `package.json` y quiere npm.
 *   · `V0.9`   → la que se enseña en pantalla y pide el usuario.
 *
 * v1.0.0 — EL RECORTE DEL `.0` SE RETIRA, porque cumplió su límite declarado.
 *
 * Ese recorte nació para poder enseñar «V0.9» con la semilla en «0.9.0», y el
 * propio comentario avisaba del límite: «1.0.0 produciría V1.0». Ha pasado en la
 * versión siguiente, y no era aceptable: **la versión pedida es CN v1.0.0, y el
 * recorte se comía un dígito que el usuario había escrito**. Lo cazaron las
 * pruebas del `title` y del `og:title`, que exigen que lo que se ve y lo que
 * dice la fuente sean LO MISMO.
 *
 * Lección: un truco de presentación sobre un dato con formato propio (semver)
 * acaba mintiendo en cuanto el dato cambia de forma. Ahora la etiqueta se deriva
 * directamente y no se toca ni un dígito.
 */
const VERSION_ETIQUETA = `V${VERSION_SEMVER}`;

/**
 * UMBRALES DE PRESIÓN DE CONTEXTO — FASE 13 (v2.3.14)
 * ==========================================================================
 * El plano los pide **acá**, no dentro del módulo que los usa
 * (`HOJA_DE_RUTA_EVOLUCION_v2.3.8.md`, FASE 13: «con umbrales declarados en
 * `constants.ts`»). La razón es de producto, no de estilo: 45 / 65 / 80 deciden
 * cuánto ruido se tolera en la cara del usuario, y una decisión de producto
 * enterrada en un archivo de ingeniería no se revisa nunca.
 *
 *   · debajo de `aviso`     → no se dice nada. La mayoría de los turnos no tienen
 *     problema de contexto, y un comentario cada dos pasos es basura.
 *   · `aviso`               → se declara el número, sin sugerir acción.
 *   · `sugerirCompactar`    → se sugiere explícitamente.
 *   · `forzarCompactar`     → se nombra qué pieza se descartó y cuánto volvió a
 *     quedar. Acá el silencio ya no es neutralidad: es complicidad.
 *
 * Son fracciones de la ventana del modelo (`numCtx`), no del presupuesto interno
 * del ensamble: lo que aprieta es la ventana del modelo. Quien los consume es
 * `src/engine/contextoMedido.ts`, que dejó de tener umbrales propios.
 */
export const UMBRAL_PRESION_AVISO = 0.45;
export const UMBRAL_PRESION_SUGERIR_COMPACTAR = 0.65;
export const UMBRAL_PRESION_FORZAR_COMPACTAR = 0.8;

export const IDE_BRAND = {
  NAME: "CerebróNico",
  // v2.1 — MARCA VISIBLE EN LA CABECERA (a propósito).
  // Se perdió tiempo discutiendo si un arreglo estaba instalado o no. La
  // versión se muestra en pantalla para poder confirmarlo de un vistazo: si la
  // cabecera NO dice la versión del ZIP, lo que corre no es lo que instalaste.
  // v2.3 — Regla de hierro: NADIE más escribe la versión en texto visible.
  // v8.0.1 — Y nadie la deriva dos veces: una semilla, dos formas.
  // v0.9   — Y la forma visible se deriva de la semilla, no se escribe al lado.
  VERSION: VERSION_ETIQUETA,
  FULL_NAME: `CerebróNico ${VERSION_ETIQUETA}`,
  /** Semilla cruda (sin «V»): para package.json, manifests y comparaciones. */
  SEMVER: VERSION_SEMVER,
  AUTHOR: "Mario Nicolas Quintero",
  /** Extensión personalizada para guardar/abrir archivos CerebroNico (ZIP renombrado) */
  EXTENSION: "cn",
} as const;

// ------------------------------------------------------------
// Claves de localStorage (prefijo codigo0_)
// ------------------------------------------------------------
export const LS_KEYS = {
  MESSAGES: "codigo0_messages",
  SAVED_CHATS: "codigo0_saved_chats",
  // v1.0.48 · lápidas de chats borrados (id + fecha): sin esto el borrado no viaja al disco
  CHATS_ELIMINADOS: "codigo0_chats_eliminados",
  ACTIVE_CHAT_TITLE: "codigo0_active_chat_title",
  WORKSPACE_FILES: "codigo0_workspace_files",
  /** Flag: ¿ya sembramos la plantilla base del workspace al menos una vez? */
  WORKSPACE_SEEDED: "codigo0_workspace_seeded",
  PROVIDER: "codigo0_provider",
  CURRENT_MODEL: "codigo0_current_model",
  OLLAMA_URL: "codigo0_ollama_url",
  TEMPERATURE: "codigo0_temperature",
  PC_MODE: "codigo0_pc_mode",
  RESPONSE_LANGUAGE: "codigo0_response_language",
  EXPERT_MODE: "codigo0_expert_mode",
  OPENROUTER_KEY: "codigo0_openrouter_key",
  GEMINI_API_KEY: "codigo0_gemini_api_key",
  CUSTOM_SERVER_URL: "codigo0_custom_server_url",
  CUSTOM_API_KEY: "codigo0_custom_api_key",
  OPENAI_API_KEY: "codigo0_openai_api_key",
  // v1.1 — Nuevas API keys para los proveedores cloud dedicados:
  ZAI_API_KEY: "codigo0_zai_api_key",
  GROQ_API_KEY: "codigo0_groq_api_key",
  CEREBRAS_API_KEY: "codigo0_cerebras_api_key",
  TOGETHER_API_KEY: "codigo0_together_api_key",
  MISTRAL_API_KEY: "codigo0_mistral_api_key",
  DEEPSEEK_API_KEY: "codigo0_deepseek_api_key",
  FIREWORKS_API_KEY: "codigo0_fireworks_api_key",
  // v1.1 — Flag para mostrar/ocultar el asistente de bienvenida Z.ai al arrancar:
  ZAI_WIZARD_DISMISSED: "codigo0_zai_wizard_dismissed",
  LEFT_WIDTH: "codigo0_left_width",
  RIGHT_WIDTH: "codigo0_right_width",
  SANDBOX_AUTO: "codigo0_sandbox_auto",
  MEMORY_RULES: "codigo0_memory_rules",
  LANGUAGE_MEMORY: "codigo0_language_memory_entries",
  // v1.9 — Tamaño global de fuente (14-25px) elegido desde el Header:
  APP_FONT_SIZE: "codigo0_app_font_size",
  // v2.1 — Tamaño de fuente del editor de código (11-24px) y ancho del árbol.
  // Ambos se recuerdan entre sesiones: antes se perdían al recargar y cada vez
  // volvían al mínimo, así que parecía que el cambio no se había aplicado.
  CODE_FONT_SIZE: "codigo0_code_font_size",
  EXPLORER_WIDTH: "codigo0_explorer_width",
  // v2.1 — Ancho de la columna de trabajo de la vista "Editor web" (desplazador)
  // y BORRADOR de la orden, que sobrevive al cambio de pestaña.
  // (WEB_CHAT_WIDTH se eliminó: esa columna de chat ya no existe.)
  WEB_SIDE_WIDTH: "codigo0_web_side_width",
  WEB_ORDER_DRAFT: "codigo0_web_order_draft",
  // v1.16.6 — El editor web ya NO tiene caja propia: sus órdenes salen del chat
  // central. Esta clave recuerda si el «Modo Editor» estaba ON entre sesiones.
  WEB_EDITOR_MODE: "codigo0_web_editor_mode",
  // v2.1 — Historial del sandbox. El trabajo del sandbox ocurre en el servidor y
  // sigue en segundo plano aunque cambies de vista, pero el LOG vivía en el
  // estado del componente: al desmontarse se perdía el historial entero.
  SANDBOX_LOG: "codigo0_sandbox_log",
  // v2.0 — Perfil de rendimiento: "auto" | "8gb" (Modo 8 GB: sin blur ni animaciones)
  PERF_MODE: "codigo0_perf_mode",
  // v2.0 — Carpeta de modelos favoritos (ver utils/favoriteModels.ts)
  FAVORITE_MODELS: "cerebronico_favorite_models",
  // v2.0 — Preferencias de la vista del editor web (chat visible, refresco, etc.)
  WEB_EDITOR_PREFS: "codigo0_web_editor_prefs",
} as const;

/**
 * v1.46.6 — Credenciales de nube para el PLAN (planificador/cerebro).
 * El runner de planes corre EN EL SERVIDOR y no ve el localStorage del
 * navegador, así que el panel y el chat se las reenvían al crear el plan
 * (POST /api/brain/plan → body.claves + body.provider). Así el plan usa
 * Z.ai/Gemini (nube) en vez de Ollama local.
 */
export function leerCredencialesNubePlan(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  const g = (k: string) => (localStorage.getItem(k) || "").trim();
  const creds: Record<string, string> = {
    provider: g(LS_KEYS.PROVIDER),
    zai: g(LS_KEYS.ZAI_API_KEY),
    gemini: g(LS_KEYS.GEMINI_API_KEY),
    openai: g(LS_KEYS.OPENAI_API_KEY),
    groq: g(LS_KEYS.GROQ_API_KEY),
    openrouter: g(LS_KEYS.OPENROUTER_KEY),
    deepseek: g(LS_KEYS.DEEPSEEK_API_KEY),
    mistral: g(LS_KEYS.MISTRAL_API_KEY),
    together: g(LS_KEYS.TOGETHER_API_KEY),
    cerebras: g(LS_KEYS.CEREBRAS_API_KEY),
    fireworks: g(LS_KEYS.FIREWORKS_API_KEY),
  };
  // No mandar claves vacías (ruido).
  for (const k of Object.keys(creds)) if (!creds[k]) delete creds[k];
  return creds;
}

// ------------------------------------------------------------
// v2.0 — Rangos del selector global de tamaño de texto (v1.9)
// ------------------------------------------------------------
// ============================================================
// v1.6.16 — EL SUELO DEL SELECTOR ERA EL PROBLEMA
// ------------------------------------------------------------
// El rango empezaba en 14 px. Con el control al MÍNIMO, el usuario seguía
// viendo todo grande, y tenía razón: no había nada por debajo de 14 donde
// ponerlo. El mínimo real de la interfaz era 14 px por decreto, no por
// diseño. Se extiende hasta 11 px, que es donde de verdad se puede leer en
// un monitor a 100 % de zoom sin acercarse.
//
// Nada más tocar esto: los tokens de `index.css` están en `rem`, así que
// bajar el tamaño raíz encoge TODA la interfaz de forma coherente.
// ============================================================
export const APP_FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] as const;
export const APP_FONT_SIZE_DEFAULT = 15;
/** Etiquetas marcadas en el desplegable para guiar al usuario */
export const APP_FONT_SIZE_LABELS: Record<number, string> = {
  11: "11px (mínimo)",
  12: "12px (muy compacto)",
  13: "13px (compacto)",
  14: "14px (ajustado)",
  15: "15px (def)",
  18: "18px (cómodo)",
  22: "22px (grande)",
};

// ------------------------------------------------------------
// v2.0 — Límites de los paneles redimensionables
// ------------------------------------------------------------
// El fix de pantalla de la v1.8.1 bajó los anchos por defecto (320→260 izq,
// 540→420 der) porque 860 px de paneles + centro no caben en una pantalla de
// 1366 px. Estos son los valores que usa el auto-fit al viewport de App.tsx.
export const PANEL_LIMITS = {
  LEFT_MIN: 200,
  LEFT_MAX: 550,
  LEFT_DEFAULT: 260,
  RIGHT_MIN: 260,
  RIGHT_MAX: 560,
  RIGHT_DEFAULT: 420,
  /** Ancho mínimo que el chat central necesita para ser usable */
  CENTER_MIN: 240,
  /** Los dos splitters (2px cada uno, con margen negativo) */
  SPLITTERS: 8,
  /** Colchón para barras de scroll verticales */
  SAFETY: 8,
} as const;

// ------------------------------------------------------------
// v2.1 — Límites del árbol de archivos del editor
// ------------------------------------------------------------
// La columna estaba FIJADA en 210 px, así que los nombres largos se cortaban
// ("back…", "ma…", "vit…") y no había manera de verlos porque el ancho no se
// podía mover. Ahora es arrastrable y el ancho se recuerda.
export const EXPLORER_LIMITS = {
  MIN: 140,
  MAX: 400,
  DEFAULT: 240,
} as const;

// ------------------------------------------------------------
// v1.16.6 — ETIQUETA DE LA ORDEN DEL EDITOR WEB (cadena compartida)
// ------------------------------------------------------------
// El chat central, cuando el "Modo Editor" está ON, envuelve la instrucción
// con esta etiqueta para decirle al motor: «esto es de diseño, aplícalo al
// sandbox». El servidor (server/quickParser.ts) reconoce la MISMA cadena para
// que NUNCA se confunda con una acción rápida de PC: fue justo esa confusión
// la que nacía el bug «DEL» (el parser pescaba «DEL EDITOR WEB» del envoltorio
// y lo mandaba al puente). Cambiar una sin la otra rompe tests/accionesRapidas.
export const WEB_EDITOR_ORDER_TAG = "[ORDEN DEL EDITOR WEB]";

// ------------------------------------------------------------
// v2.1 — Límites de las columnas de la vista "Editor web"
// ------------------------------------------------------------
// Tenía DOS columnas de ancho FIJO (w-64 = 256 px y w-80 = 320 px) y ninguna se
// podía mover: en una pantalla de 1366 px el previsualizador se quedaba con lo
// que sobraba y no había forma de darle sitio. Ahora las dos son arrastrables.
export const WEB_EDITOR_LIMITS = {
  // v2.1 — Esta columna es el ÚNICO sitio donde se escribe la orden, así que el
  // mínimo sube (190 → 240) y el defecto también (256 → 340): con 256 el textarea
  // quedaba estrangulado y no se leía lo escrito.
  // Ya no hay CHAT_MIN/CHAT_MAX/CHAT_DEFAULT: se eliminó la columna de chat de
  // esta vista (había DOS chats y el usuario escribía en uno creyendo que era el
  // mismo).
  SIDE_MIN: 240,
  SIDE_MAX: 520,
  SIDE_DEFAULT: 340,
} as const;

// ------------------------------------------------------------
// v2.0 — Perfiles de rendimiento (Modo 8 GB)
// ------------------------------------------------------------
export const PERF_MODES = {
  // v1.99.8 · renombrado: «Modo 8 GB» se leía como una medición del equipo. El modo se llama
  // LIVIANO, y el automático decide con la RAM que midió el server (`os.totalmem`).
  auto: { id: "auto", label: "Automático", description: "Se aligera solo si tu RAM medida está en el umbral de equipo limitado (8 GB)." },
  "8gb": { id: "8gb", label: "Modo liviano", description: "Sin desenfoques, sin animaciones de fondo y con menos capas: prioriza la inferencia local." },
} as const;
