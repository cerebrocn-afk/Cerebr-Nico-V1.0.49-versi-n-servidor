import React, { useEffect, useState } from "react";
import {
  Bot,
  Brain,
  Check,
  Code,
  Cpu,
  Eye,
  Layers,
  Radio,
  Search,
  Sparkles,
  Zap,
  X,
  Globe,
  RefreshCw,
  Server,
  Star,
  Plus,
  Trash2,
} from "lucide-react";
import { ModelInfo } from "../types";
import {
  loadFavoriteModels,
  toggleFavoriteModel,
  restoreCatalog,
  QUOTA_LABEL,
  FREE_MODEL_CATALOG,
  type FavoriteModel,
} from "../utils/favoriteModels";
import { EspejosSelector } from "./EspejosSelector";
import { esModeloEmbeds } from "../engine/ollamaPugil"; // PUGIL v1 /*PUGIL*/
import { clasificarModeloOllama } from "../engine/aduanaModelos"; // v1.77.0 · aduana única
// v1.80.0 · LA VOZ DE LA CASA Y SU CARPETA. `cerebro/auto` (el enjambre de
// respuesta ecléctica) y la etiqueta de la carpeta de la API unificada salen de
// una fuente pura: si el selector inventara otro nombre, habría DOS nombres
// para la misma cosa — y eso esta casa no lo permite.
import {
  MODELO_CEREBRO_AUTO,
  PROVEEDOR_CEREBRO,
  DESCRIPCION_CEREBRO_AUTO,
} from "../engine/enjambreEclectico";
import { ETIQUETA_CARPETA_MODELOS, DESCRIPCION_CARPETA } from "../engine/ranuraUnificada";
// v1.98.0 · «las ranuras de [la app externa] siguen estando, al igual que la carpeta
// unificada»: el dueño de la respuesta es engine/selectorModelos.ts (puro, probado).
import {
  CLAVE_PREFERENCIA_RUTA,
  PREFERENCIA_POR_DEFECTO,
  claveDeModelo,
  cortarDuplicados,
  etiquetaDeRuta,
  normalizarPreferencia,
  type PreferenciaRuta,
} from "../engine/selectorModelos";
// v1.95.2 · el dictamen de la carpeta vive en un módulo puro y probado, no en la UI.
import { dictamenCarpetaUnificada } from "../engine/estadoUnificada";

const CATALOG_MODELS: ModelInfo[] = [
  // LOCAL & CLOUD OLLAMA
  {
    id: "qwen2.5-coder:1.5b",
    name: "qwen2.5-coder:1.5b",
    provider: "ollama",
    category: "code",
    description: "Especialista en código ligero. Máxima velocidad y bajo consumo en máquinas con memoria moderada.",
    size: "986 MB",
    contextWindow: "32k",
    isInstalled: true,
  },
  {
    id: "qwen2.5-coder:7b",
    name: "qwen2.5-coder:7b",
    provider: "ollama",
    category: "code",
    description: "Generación de código profesional con alta precisión en refactorización y depuración TypeScript/Python.",
    size: "4.7 GB",
    contextWindow: "32k",
    isInstalled: true,
  },
  {
    id: "qwen2.5-coder:32b",
    name: "qwen2.5-coder:32b",
    provider: "ollama",
    category: "code",
    description: "Motor insignia para arquitectura de software completa y sistemas full-stack masivos.",
    size: "19 GB",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "deepseek-r1:7b",
    name: "deepseek-r1:7b",
    provider: "ollama",
    category: "reasoning",
    description: "Razonamiento paso a paso y resolución de algoritmos complejos con cadena de pensamiento estructurada.",
    size: "4.7 GB",
    contextWindow: "32k",
    isInstalled: true,
  },
  {
    id: "deepseek-r1:14b",
    name: "deepseek-r1:14b",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo de razonamiento matemático y lógico avanzado con balance óptimo de VRAM.",
    size: "9.0 GB",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "stablelm2:latest",
    name: "stablelm2:latest",
    provider: "ollama",
    category: "chat",
    description: "Modelo ligero de Stability AI para seguimiento directo de instrucciones y respuestas inmediatas.",
    size: "982 MB",
    contextWindow: "16k",
    isInstalled: true,
  },
  {
    id: "glm-ocr:q8_0",
    name: "glm-ocr:q8_0",
    provider: "ollama",
    category: "vision",
    description: "Especialista en extracción OCR, lectura de capturas, documentos y diagramas técnicos.",
    size: "1.6 GB",
    contextWindow: "16k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "smolvlm2-500m-video:q8",
    name: "smolvlm2-500m-video:q8",
    provider: "ollama",
    category: "vision",
    description: "Inferencia visual y análisis de video/imágenes local en GPU/CPU con cuantización Q8.",
    size: "500 MB",
    contextWindow: "8k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "llama3.3:latest",
    name: "llama3.3:latest",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo general de Meta Llama 3.3 optimizado para desarrollo y orquestación técnica.",
    size: "8.0 GB",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "kimi-k3:cloud",
    name: "kimi-k3:cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Modelo Kimi K3 Cloud con contexto ultra-extenso de 128k tokens.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },
  {
    id: "gemma4:31b-cloud",
    name: "gemma4:31b-cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Google Gemma 4 31B Cloud vía proxy Ollama para razonamiento avanzado.",
    size: "Cloud",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "qwen3.5:cloud",
    name: "qwen3.5:cloud",
    provider: "ollama",
    category: "reasoning",
    description: "Qwen 3.5 Cloud para arquitectura de software y razonamiento complejo.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },
  {
    id: "deepseek-v4-flash:cloud",
    name: "deepseek-v4-flash:cloud",
    provider: "ollama",
    category: "code",
    description: "DeepSeek V4 Flash Cloud con ultra-baja latencia para generación veloz.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },
  {
    id: "smollm2:135m",
    name: "smollm2:135m",
    provider: "ollama",
    category: "small",
    description: "Nano-modelo SmolLM2 de 135M parámetros. Inferencia instantánea para tareas atómicas.",
    size: "270 MB",
    contextWindow: "8k",
    isInstalled: true,
  },
  {
    id: "tinyllama:latest",
    name: "tinyllama:latest",
    provider: "ollama",
    category: "small",
    description: "TinyLlama 1.1B optimizado para bajo consumo de memoria RAM y CPU pura.",
    size: "637 MB",
    contextWindow: "8k",
    isInstalled: true,
  },

  // ============================================================
  // GOOGLE GEMINI — v1.46.3
  // ------------------------------------------------------------
  // 🐞 EL CATÁLOGO OFRECÍA MODELOS INEXISTENTES.
  //
  // Esta lista es lo que el usuario PULSA en el selector, así que un nombre
  // que no existe en la API no es una nota desactualizada: es un 404
  // garantizado en cuanto se elige, porque el modelo seleccionado se prueba
  // PRIMERO y ni la reserva del servidor lo salva.
  //
  // Lo que había (gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash,
  // gemini-1.5-flash) está apagado o da 404 con la clave gratuita. Los IDs
  // validados en campo (Mario) que SÍ responden hoy son la familia 3.x —
  // flash y mini — y es la que va aquí.
  // ============================================================
  {
    id: "gemini-4-hydrogen",
    name: "gemini-4-hydrogen",
    provider: "gemini",
    category: "reasoning",
    description: "Gemini 4 Hydrogen: velocidad Flash de nueva generación con razonamiento profundo adaptativo y 1M de contexto.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-4-neon",
    name: "gemini-4-neon",
    provider: "gemini",
    category: "code",
    description: "Gemini 4 Neon (Pro): máxima precisión en arquitectura, ingeniería de software, STEM y razonamiento XHIGH.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-4-carbon",
    name: "gemini-4-carbon",
    provider: "gemini",
    category: "reasoning",
    description: "Gemini 4 Carbon: especialista en análisis profundo, seguridad, auditoría y depuración de causa raíz.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-4-argon",
    name: "gemini-4-argon",
    provider: "gemini",
    category: "reasoning",
    description: "Gemini 4 Argon: modelo equilibrado de serie 4 para síntesis extensa y agentes de múltiples pasos.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "gemini-3.1-flash-lite",
    provider: "gemini",
    category: "chat",
    description: "Flash Lite 3.1: ultra-ligero y de mínima latencia para respuestas rápidas y tareas de alto volumen.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.8-flash",
    name: "gemini-3.8-flash",
    provider: "gemini",
    category: "reasoning",
    description: "Flash de última generación (3.8): máxima calidad a velocidad Flash, con visión y 1M de contexto.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.7-flash",
    name: "gemini-3.7-flash",
    provider: "gemini",
    category: "reasoning",
    description: "Flash 3.7: gran equilibrio entre calidad y velocidad, con visión y 1M de contexto.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.6-flash",
    name: "gemini-3.6-flash",
    provider: "gemini",
    category: "chat",
    description: "Flash 3.6: rápido y económico, con visión nativa y 1M de contexto.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.5-flash",
    name: "gemini-3.5-flash",
    provider: "gemini",
    category: "chat",
    description: "Flash 3.5: ligero y veloz, buena opción por defecto para chat.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gemini-3.5-mini",
    name: "gemini-3.5-mini",
    provider: "gemini",
    category: "chat",
    description: "Mini 3.5: el más económico de la familia 3.x, para tareas cortas y de bajo coste.",
    size: "Cloud",
    contextWindow: "1M",
    isInstalled: true,
    isVisionCapable: true,
  },

  // OPENROUTER CLOUD
  {
    id: "deepseek/deepseek-r1",
    name: "deepseek/deepseek-r1",
    provider: "openrouter",
    category: "reasoning",
    description: "DeepSeek R1 671B completo en la nube vía OpenRouter para razonamiento del más alto nivel.",
    size: "Cloud",
    contextWindow: "64k",
    isInstalled: true,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "anthropic/claude-3.5-sonnet",
    provider: "openrouter",
    category: "code",
    description: "Claude 3.5 Sonnet líder en generación de frontend, diseño de sistemas y testing unitario.",
    size: "Cloud",
    contextWindow: "200k",
    isInstalled: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
    category: "reasoning",
    description: "Meta Llama 3.3 70B Instruct en la nube para análisis general y síntesis técnica.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
  },

  // OPENAI DIRECT (GPT family)
  {
    id: "gpt-4o",
    name: "gpt-4o",
    provider: "openai",
    category: "reasoning",
    description: "GPT-4o de OpenAI: modelo multimodal insignia con visión, razonamiento avanzado y contexto de 128k tokens.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "gpt-4o-mini",
    name: "gpt-4o-mini",
    provider: "openai",
    category: "chat",
    description: "GPT-4o-mini: velocidad extrema y bajo costo, ideal para iteración rápida y tareas de chat.",
    size: "Cloud",
    contextWindow: "128k",
    isInstalled: true,
    isVisionCapable: true,
  },
  {
    id: "o1",
    name: "o1",
    provider: "openai",
    category: "reasoning",
    description: "OpenAI o1: razonamiento profundo encadenado para problemas complejos, matemáticas y código.",
    size: "Cloud",
    contextWindow: "200k",
    isInstalled: true,
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    category: "reasoning",
    description: "OpenAI o3-mini: razonamiento optimizado y veloz, balance entre costo y capacidad de planificación.",
    size: "Cloud",
    contextWindow: "200k",
    isInstalled: true,
  },
];

interface ModelSelectorModalProps {
  /**
   * v2.3.0 · texto corto del último sondeo de catálogo que NO contestó
   * («Z.ai: no respondió a tiempo después de 8 s»). Vacío = no hay aviso.
   * Sirve para no volver a mostrar una lista vacía mudita, que en la captura
   * del 03/11 se leía como «Z.ai no tiene modelos» cuando en realidad el
   * request había muerto en la cola del navegador.
   */
  avisoCatalogo?: string;
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  // v1.78.0 · el segundo argumento dice el MOTOR real de la tarjeta (custom/
  // unificada, zai, groq…). Sin él, App deduce el proveedor por nombre y los
  // modelos que no siguen ningún prefijo conocido terminan en Ollama.
  onSelectModel: (modelName: string, provider?: string) => void;
  installedOllamaModels?: string[];
  detectedGeminiModels?: string[];
  detectedOpenRouterModels?: string[];
  detectedOpenaiModels?: string[];
  // v1.1 — Z.ai (GLM) free models:
  detectedZaiModels?: string[];
  detectedGroqModels?: string[];
  // v1.58.3 — motores cloud OpenAI-compatibles que faltaban en el selector:
  detectedCerebrasModels?: string[];
  detectedMistralModels?: string[];
  detectedTogetherModels?: string[];
  detectedDeepseekModels?: string[];
  detectedFireworksModels?: string[];
  // v1.78.0 · modelos de la ranura Custom / API Unificada (OpenAI-compatible).
  // Antes venían disfrazados de OpenAI con prefijo `custom:`; ahora son su
  // propia carpeta «🧩 Unificada» con proveedor real `custom`.
  detectedCustomModels?: string[];
  onRefreshModels?: () => void;
  onRefreshGeminiModels?: () => void;
  onRefreshOpenRouterModels?: () => void;
  onRefreshOpenaiModels?: () => void;
  onRefreshZaiModels?: () => void;
  onRefreshGroqModels?: () => void;
  onRefreshCerebrasModels?: () => void;
  onRefreshMistralModels?: () => void;
  onRefreshTogetherModels?: () => void;
  onRefreshDeepseekModels?: () => void;
  onRefreshFireworksModels?: () => void;
  onRefreshCustomModels?: () => void;
  /** v1.95.2 · estado de la última sonda al endpoint unificado (ver src/engine/estadoUnificada.ts). */
  sondaUnificada?: { total: number; error: string | null; endpoint: string | null; cuando: number };
  /** Si la ranura tiene URL guardada: sin esto, «carpeta vacía» no se puede explicar. */
  hayUrlUnificada?: boolean;
  intentoUnificada?: number;
  maxIntentosUnificada?: number;
  onRedetectAll?: () => void;
  isRefreshing?: boolean;
  isDetectingGemini?: boolean;
  isDetectingOpenRouter?: boolean;
  isDetectingOpenai?: boolean;
  isDetectingZai?: boolean;
  isDetectingGroq?: boolean;
  isDetectingCerebras?: boolean;
  isDetectingMistral?: boolean;
  isDetectingTogether?: boolean;
  isDetectingDeepseek?: boolean;
  isDetectingFireworks?: boolean;
  isRedetectingAll?: boolean;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onSelectModel,
  installedOllamaModels = [],
  detectedGeminiModels = [],
  detectedOpenRouterModels = [],
  detectedOpenaiModels = [],
  detectedZaiModels = [],
  detectedGroqModels = [],
  detectedCerebrasModels = [],
  detectedMistralModels = [],
  detectedTogetherModels = [],
  detectedDeepseekModels = [],
  detectedFireworksModels = [],
  detectedCustomModels = [],
  onRefreshModels,
  onRefreshGeminiModels,
  onRefreshOpenRouterModels,
  onRefreshOpenaiModels,
  onRefreshZaiModels,
  avisoCatalogo = "",
  onRefreshGroqModels,
  onRefreshCerebrasModels,
  onRefreshMistralModels,
  onRefreshTogetherModels,
  onRefreshDeepseekModels,
  onRefreshFireworksModels,
  onRefreshCustomModels,
  sondaUnificada,
  hayUrlUnificada = false,
  intentoUnificada = 0,
  maxIntentosUnificada = 6,
  onRedetectAll,
  isRefreshing = false,
  isDetectingGemini = false,
  isDetectingOpenRouter = false,
  isDetectingOpenai = false,
  isDetectingZai = false,
  isDetectingGroq = false,
  isDetectingCerebras = false,
  isDetectingMistral = false,
  isDetectingTogether = false,
  isDetectingDeepseek = false,
  isDetectingFireworks = false,
  isRedetectingAll = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  /* v1.98.0 · A QUÉ RUTA LE DAMOS LA FILA cuando el mismo modelo tiene dos caminos
     (la ranura del proveedor, con su clave; o el endpoint unificado, con la suya).
     Es una preferencia del usuario, no un capricho del momento: se guarda. Y la
     alternativa nunca se borra — el interruptor la devuelve. */
  const [preferenciaRuta, setPreferenciaRuta] = useState<PreferenciaRuta>(() => {
    try {
      return normalizarPreferencia(localStorage.getItem(CLAVE_PREFERENCIA_RUTA));
    } catch {
      return PREFERENCIA_POR_DEFECTO;
    }
  });
  const mudarPreferenciaRuta = (p: PreferenciaRuta) => {
    setPreferenciaRuta(p);
    try {
      localStorage.setItem(CLAVE_PREFERENCIA_RUTA, p);
    } catch {
      /* sin localStorage la preferencia vive igual: es cosmética, no de estado */
    }
  };
  // v1.95.2 · ABRIR EL SELECTOR CUENTA COMO PEDIR LA LISTA. El reintento automático del
  // arranque se agota en ~30 s; el router unificado es un proceso que el usuario levanta
  // cuando quiere. Si al abrir la carpeta no hay nada y sí hay URL, se sondea una vez.
  // El guardia es `cuando`: en cuanto hay un sondeo (éxito o error) deja de disparar, así
  // que esto no puede entrar en bucle.
  useEffect(() => {
    if (selectedFilter !== "custom") return;
    if (!hayUrlUnificada) return;
    if ((sondaUnificada?.total ?? 0) > 0) return;
    if (sondaUnificada?.cuando) return;
    onRefreshCustomModels?.();
  }, [selectedFilter, hayUrlUnificada, sondaUnificada, onRefreshCustomModels]);
  const [favoriteModels, setFavoriteModels] = useState<FavoriteModel[]>(loadFavoriteModels());

  const refreshFavorites = () => setFavoriteModels(loadFavoriteModels());

  const handleToggleFavorite = (
    modelId: string,
    name: string,
    provider: FavoriteModel["provider"],
    // v2.1 — Aquí decía `{ category?: string }`, más ancho que lo que
    // `toggleFavoriteModel` acepta (`FavoriteModel["category"]` es una unión de
    // valores, no cualquier texto). Se usa el mismo tipo que el destino: así el
    // que llama queda comprobado de verdad, en vez de colar un texto suelto.
    options: Partial<Omit<FavoriteModel, "name" | "id" | "provider" | "modelId" | "addedAt">> = {}
  ) => {
    toggleFavoriteModel(modelId, name, provider, options);
    refreshFavorites();
  };

  if (!isOpen) return null;

  // Merge static catalog with any dynamically detected models from Ollama /api/tags
  const dynamicModels: ModelInfo[] = [...CATALOG_MODELS];

  // ══════════════════════════════════════════════════════════════════════
  // v1.80.0 · LA PRIMERA TARJETA ES LA CASA: `cerebro/auto`
  // (pedido de Mario 27/10: «hacé un modelo en el selector que diga
  // cerebro/auto por defecto y que enlace con esa función de respuesta
  // ecléctica»). Es un modelo del selector, no un botón suelto: se elige como
  // cualquier otro, aparece en ⭐ Favoritos, y al hablarle el turno NO va a una
  // máquina — va a varias y vuelve con veredicto. Por eso SIEMPRE está, aunque
  // no haya claves: si no hay voces, la IDE lo dice en vez de fingir consenso.
  // ══════════════════════════════════════════════════════════════════════
  if (!dynamicModels.some((m) => m.id === MODELO_CEREBRO_AUTO)) {
    dynamicModels.unshift({
      id: MODELO_CEREBRO_AUTO,
      name: MODELO_CEREBRO_AUTO,
      provider: PROVEEDOR_CEREBRO as any,
      category: "reasoning",
      description: DESCRIPCION_CEREBRO_AUTO,
      size: "Enjambre",
      contextWindow: "auto",
      isInstalled: true,
    });
  }

  // 🔧 Insertar el modelo virtual "openrouter/free" al inicio del catálogo si no existe ya
  if (!dynamicModels.some((m) => m.id === "openrouter/free")) {
    dynamicModels.unshift({
      id: "openrouter/free",
      name: "openrouter/free",
      provider: "openrouter",
      category: "reasoning",
      description:
        "Enrutador automático de OpenRouter: enruta la petición al mejor modelo gratuito disponible en cada momento con soporte de tool-calling. No requiere elegir un modelo concreto — la plataforma lo hace por ti.",
      size: "Cloud",
      contextWindow: "auto",
      isInstalled: true,
    });
  }

  // Merge Ollama models (autodetect local)
  if (installedOllamaModels && installedOllamaModels.length > 0) {
    installedOllamaModels.forEach((name) => {
      // 🔧 CORRECCIÓN: comparar el nombre base (sin tag) para detectar coincidencias
      // parciales. Ej: si el catálogo tiene "qwen2.5-coder:1.5b" pero Ollama devuelve
      // "qwen2.5-coder:1.5b.ollama", deben considerarse el mismo modelo y usar el nombre
      // EXACTO que Ollama devuelve.
      const nameBase = name.split(":")[0].toLowerCase();
      const exists = dynamicModels.some((m) => {
        const mBase = m.name.split(":")[0].toLowerCase();
        return m.name.toLowerCase() === name.toLowerCase()
          || m.id.toLowerCase() === name.toLowerCase()
          || mBase === nameBase;
      });
      // v1.77.0 · la etiqueta honesta reemplaza a la desaparición (aduana única
      // src/engine/aduanaModelos.ts): un embed ya no se borra del selector, se
      // MUESTRA diciendo qué es — «no aparece» era la queja medida de Mario 26/10.
      const rol = clasificarModeloOllama(name).rol;
      const rolNota = rol !== "chat" ? `⚠ ${rol.toUpperCase()} — ${clasificarModeloOllama(name).motivo}. ` : "";
      if (!exists) {
        dynamicModels.unshift({
          id: name,
          name: name,
          provider: "ollama",
          category: name.includes("code") ? "code" : name.includes("ocr") || name.includes("vision") || name.includes("vlm") ? "vision" : "chat",
          description: `${rolNota}Modelo autodetectado en tu servidor local Ollama (127.0.0.1:11434).`,
          size: "Local",
          contextWindow: "Auto",
          isInstalled: true,
          isVisionCapable: name.includes("ocr") || name.includes("vision") || name.includes("vlm") || name.includes("smolvlm"),
        });
      } else {
        // 🔧 Si el modelo del catálogo coincide por nombre base con uno instalado,
        // actualizar el name/id al nombre EXACTO que Ollama devuelve, para que al
        // seleccionarlo se envíe el nombre correcto al server.
        const catModel = dynamicModels.find((m) => {
          const mBase = m.name.split(":")[0].toLowerCase();
          return mBase === nameBase && m.provider === "ollama";
        });
        if (catModel && catModel.name !== name) {
          catModel.name = name;
          catModel.id = name;
          catModel.isInstalled = true;
        }
      }
    });
  }

  // 🔧 Merge Gemini flash models autodetectados vía /api/gemini/models
  if (detectedGeminiModels && detectedGeminiModels.length > 0) {
    detectedGeminiModels.forEach((name) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === name.toLowerCase() || m.id.toLowerCase() === name.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: name,
          name: name,
          provider: "gemini",
          category: "reasoning",
          description: `Modelo flash gratuito autodetectado para tu API Key de Google AI Studio. Ventana de 1M tokens.`,
          size: "Cloud",
          contextWindow: "1M",
          isInstalled: true,
          isVisionCapable: true,
        });
      } else {
        // Marcar como detectado (isInstalled) para que aparezca como disponible
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === name.toLowerCase() || m.id.toLowerCase() === name.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // 🔧 Merge OpenRouter :free models autodetectados vía /api/openrouter/models
  if (detectedOpenRouterModels && detectedOpenRouterModels.length > 0) {
    detectedOpenRouterModels.forEach((id) => {
      // Saltar el virtual "openrouter/free" — ya está agregado arriba
      if (id === "openrouter/free") return;
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "openrouter",
          category: "reasoning",
          description: `Modelo gratuito de OpenRouter autodetectado (termina en :free). Soporta tool-calling.`,
          size: "Cloud",
          contextWindow: "auto",
          isInstalled: true,
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // 🔧 Merge OpenAI models autodetectados vía /api/openai/models
  if (detectedOpenaiModels && detectedOpenaiModels.length > 0) {
    detectedOpenaiModels.forEach((id) => {
      // v1.78.0 — los servidores custom/API unificada ya no se disfrazan de
      // OpenAI con prefijo `custom:`: tienen su carpeta abajo. Si alguien
      // trae la lista vieja, se ignora aquí en vez de pintarla mentirosa.
      if (id.startsWith("custom:")) return;
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "openai",
          category: id.includes("mini") ? "chat" : "reasoning",
          description: `Modelo OpenAI autodetectado en tu cuenta (api.openai.com/v1/models).`,
          size: "Cloud",
          contextWindow: "auto",
          isInstalled: true,
          isVisionCapable: /gpt-4o|gpt-4-vision|vision/i.test(id),
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // v1.1 — Merge Z.ai (GLM) free models. Siempre se inyectan al iniciar (catálogo estático).
  //   Estos modelos son 100% gratuitos y no requieren API key para mostrarse.
  if (detectedZaiModels && detectedZaiModels.length > 0) {
    detectedZaiModels.forEach((id) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "zai",
          category: id.includes("v") && /glm-4\.5v|vision/i.test(id) ? "vision" : "chat",
          description: `Modelo GLM GRATUITO de Z.ai (api.z.ai/api/paas/v4). Ideal para programar y chatear en español.`,
          size: "Cloud",
          contextWindow: id.includes("v") ? "64K" : "128K",
          isInstalled: true,
          isVisionCapable: /glm-4\.5v|glm-4v|vision/i.test(id),
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // v1.43.0 — Merge Groq free models (detectados vía /api/cloud/models?provider=groq).
  //   Requieren API key para funcionar pero se muestran si se detectan.
  if (detectedGroqModels && detectedGroqModels.length > 0) {
    detectedGroqModels.forEach((id) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: "groq",
          category: /whisper|tts|guard/i.test(id) ? "small" : /vision|image/i.test(id) ? "vision" : "chat",
          description: `Modelo ${id} en Groq (api.groq.com). Rendimiento ultra-rápido.`,
          size: "Cloud",
          contextWindow: /70b|120b/i.test(id) ? "128K" : /8b|20b|27b/i.test(id) ? "32K" : "8K",
          isInstalled: true,
          isVisionCapable: /vision|image/i.test(id),
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  }

  // v1.58.3 — Merge de los motores cloud OpenAI-compatibles que antes NO se
  //   surfaceaban en el selector: Cerebras, Mistral, Together, DeepSeek y
  //   Fireworks. El backend /api/cloud/models devuelve su catálogo (estático
  //   sin key, live+static con key) y App.tsx los autocarga al arranque igual
  //   que Z.ai, así Mario puede ELEGIR el modelo, no sólo el motor.
  const mergeCloudModels = (
    ids: string[],
    provider: string,
    describe: (id: string) => string,
    ctx: (id: string) => string,
  ) => {
    if (!ids || ids.length === 0) return;
    ids.forEach((id) => {
      const exists = dynamicModels.some(
        (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
      );
      if (!exists) {
        dynamicModels.unshift({
          id: id,
          name: id,
          provider: provider as any,
          category: /whisper|tts|guard|embed/i.test(id)
            ? "small"
            : /vision|image|ocr/i.test(id)
            ? "vision"
            : /coder|code|codestral/i.test(id)
            ? "code"
            : /reason|r1|think/i.test(id)
            ? "reasoning"
            : "chat",
          description: describe(id),
          size: "Cloud",
          contextWindow: ctx(id),
          isInstalled: true,
          isVisionCapable: /vision|image|ocr/i.test(id),
        });
      } else {
        const catModel = dynamicModels.find(
          (m) => m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase()
        );
        if (catModel) catModel.isInstalled = true;
      }
    });
  };

  mergeCloudModels(
    detectedCerebrasModels,
    "cerebras",
    (id) => `Modelo ${id} en Cerebras (api.cerebras.ai). Inferencia ultra-rápida.`,
    () => "128K",
  );
  mergeCloudModels(
    detectedMistralModels,
    "mistral",
    (id) => `Modelo ${id} de Mistral (api.mistral.ai).`,
    (id) => (/nemo/i.test(id) ? "128K" : "32K"),
  );
  mergeCloudModels(
    detectedTogetherModels,
    "together",
    (id) => `Modelo ${id} en Together AI (api.together.xyz).`,
    () => "128K",
  );
  mergeCloudModels(
    detectedDeepseekModels,
    "deepseek",
    (id) => `Modelo ${id} de DeepSeek (api.deepseek.com).`,
    () => "64K",
  );
  mergeCloudModels(
    detectedFireworksModels,
    "fireworks",
    (id) => `Modelo ${id} en Fireworks (api.fireworks.ai).`,
    () => "128K",
  );

  // v1.78.0 · LA CARPETA DE LA API UNIFICADA — la queja medida de Mario 26/10:
  // «no existe la carpeta para seleccionar los modelos». Los modelos que
  // responde el endpoint unificado (o cualquier servidor OpenAI-compatible de la
  // ranura «URL») se fusionan con su PROVEEDOR REAL (`custom`) y tienen pestaña
  // propia. Al elegirlos, el selector dice el motor a App, así el modelo ya no
  // se va a Ollama por deducción de nombre.
  // v1.80.0 · la carpeta se llama como la llama la casa (`ETIQUETA_CARPETA_MODELOS`,
  // fuente única en src/engine/ranuraUnificada.ts): la marca de un producto
  // tercero ya no aparece en CerebroNico, pero su funcionamiento —un endpoint,
  // muchos proveedores— queda y se elige desde acá.
  if (detectedCustomModels && detectedCustomModels.length > 0) {
    detectedCustomModels.forEach((id) => {
      const existe = dynamicModels.some(
        (m) => m.provider === "custom" && (m.name.toLowerCase() === id.toLowerCase() || m.id.toLowerCase() === id.toLowerCase())
      );
      if (!existe) {
        dynamicModels.unshift({
          id: `custom::${id}`,
          name: id,
          provider: "custom" as any,
          category: /coder|code/i.test(id) ? "code" : /embed/i.test(id) ? "small" : "chat",
          description: `${DESCRIPCION_CARPETA} Al elegirlas, el selector dice el motor real: nada se va a Ollama por deducción de nombre.`,
          size: "Cloud",
          contextWindow: "auto",
          isInstalled: true,
          isVisionCapable: /vision|image|ocr/i.test(id),
        });
      }
    });
  }

  /* v1.98.0 · UNA FILA POR MODELO. Se corta ACÁ y no en cada pestaña porque el
     duplicado se veía en todas (`Todos`, la del proveedor y 🧩 Unificada a la vez):
     una sola decisión arriba las ordena a todas. `alternativas` es el mapa de los
     modelos que tienen un segundo camino, para ponerles el distintivo. */
  const corteRutas = cortarDuplicados(dynamicModels, preferenciaRuta);
  const rutasAlternativas = corteRutas.alternativas;
  const filteredModels = corteRutas.visibles.map((m) => {
    // Check if it is detected in local ollama
    const isDetectedLocally =
      m.provider === "ollama" &&
      installedOllamaModels.some((name) => name.toLowerCase() === m.name.toLowerCase() || name.toLowerCase() === m.id.toLowerCase());
    return {
      ...m,
      isInstalled: isDetectedLocally || m.provider !== "ollama",
    };
  }).filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.provider.toLowerCase().includes(searchTerm.toLowerCase());
    // 🔧 Filtro "favorites": mostrar solo los modelos guardados como favoritos
    if (selectedFilter === "favorites") {
      const isFav = favoriteModels.some(
        (fm) => fm.modelId === m.name && fm.provider === m.provider
      );
      return matchesSearch && isFav;
    }
    const matchesFilter =
      selectedFilter === "all" ||
      (selectedFilter === "installed" && m.isInstalled && m.provider === "ollama") ||
      m.category === selectedFilter ||
      m.provider === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  // 🔧 Si el filtro es "favorites" y no hay modelos favoritos en el catálogo,
  // construir entradas a partir de los favoritos guardados (modelos de cualquier servidor).
  const displayModels = selectedFilter === "favorites" && filteredModels.length === 0
    ? favoriteModels
        // v1.78.0 · dos reglas honestas en la carpeta ⭐:
        //  1. los modelos que sí tienen nombre real se muestran CON su nombre
        //     (antes se pintaba el modelId a secas y una entrada interna
        //     «fav-model-…» podía parecer un modelo seleccionable que no existe);
        //  2. las entradas podadas por la aduana de favoriteModels nunca llegan
        //     acá, pero por si el localStorage vino viejo: filtro defensivo.
        .filter((fm) => !/^(fav-model|cat-|msg-|queue-)-/.test(fm.modelId))
        .filter((fm) =>
          (fm.name || fm.modelId).toLowerCase().includes(searchTerm.toLowerCase()) ||
          fm.modelId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fm.provider.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map((fm) => ({
          id: `${fm.provider}::${fm.modelId}`,
          name: fm.modelId,
          provider: fm.provider as any,
          category: (fm.category as any) || "chat",
          description: `${fm.name && fm.name !== fm.modelId ? fm.name + " — " : ""}${fm.description || `Modelo favorito de ${fm.provider}`}`,
          size: fm.provider === "ollama" ? "Local" : "Cloud",
          contextWindow: "auto",
          isInstalled: true,
          isVisionCapable: false,
        }))
    : filteredModels;

  // v1.60.4 — PERFECCIÓN de rendimiento. Con OpenRouter detectando cientos de
  // modelos `:free`, pintar TODAS las tarjetas de golpe satura el reconciliado
  // de React; y en una máquina ya al 99% de CPU (45 modelos de Ollama vivos)
  // eso se nota justo al abrir la ventana o al cambiar de proveedor —el
  // síntoma que reportó Mario—. Capamos el render a un máximo sensato: la
  // búsqueda y los filtros siguen operando sobre la lista COMPLETA, así que
  // ningún modelo queda inaccesible (basta escribir para alcanzarlo). No se
  // oculta nada; solo se pinta por tandas para que la ventana abra fluida.
  const RENDER_CAP = 60;
  const totalModels = displayModels.length;
  const isCapped = totalModels > RENDER_CAP;
  const cappedModels = isCapped ? displayModels.slice(0, RENDER_CAP) : displayModels;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none">
      {/* v1.6.5 — «la ventana de los proveedores se ve cortada»: era el propio
          `overflow-hidden` de esta tarjeta recortando los botones de detección,
          que iban en una fila sin `flex-wrap` (Redetectar · Ollama · OpenAI …
          quedaban fuera y desaparecían sin scroll ni aviso). Ahora la fila
          envuelve, la tarjeta es más ancha y más alta: nada se recorta y caben
          más modelos en la lista. */}
      <div className="cn-modal w-full bg-[#0e1320] border border-cyan-500/40 rounded-2xl shadow-2xl text-xs">
        {/* Header */}
        <div className="cn-modal-head bg-[#111728] border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Radio className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {/* v1.6.15 — antes esto era `text-sm`, el MISMO tamaño que el
                    párrafo de debajo: el título de la ventana pesaba igual que
                    su contenido. Ahora es un título de verdad. */}
                <h3 className="cn-title text-zinc-100">Autodetección y Catálogo de Modelos</h3>
                {installedOllamaModels.length > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] rounded-full font-semibold">
                    {installedOllamaModels.length} detectados en Ollama
                  </span>
                )}
              </div>
              <p className="text-zinc-400 text-[11px]">
                Selecciona tu motor activo: Ollama local, Google Gemini o OpenRouter
              </p>
            </div>
          </div>
          {/* v1.6.14 — 🐞 «la ventana del catálogo está inaccesible: solo un
              espacio chiquito para ver los modelos».
              Estos ocho botones envolvían en TRES filas (~100 px) y se comían la
              altura que necesita la lista. En una sola fila con desplazamiento
              horizontal no se pierde ninguno y se recupera el espacio. */}
          {/* Ojo: SIN `justify-end`. Con desplazamiento horizontal, alinear al
              final empuja el desbordamiento hacia la IZQUIERDA, que no se puede
              alcanzar con la barra: el botón «Redetectar» quedaría inaccesible. */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto custom-scrollbar pb-1">
            {/* Botón REDetectar TODOS los modelos (re-escanea Ollama + Gemini + OpenRouter + OpenAI en paralelo) */}
            {onRedetectAll && (
              <button
                onClick={onRedetectAll}
                disabled={isRedetectingAll}
                title="Redetectar todos los modelos: Ollama + Gemini + OpenRouter + OpenAI en paralelo"
                className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRedetectingAll ? "animate-spin" : "text-amber-400"}`} />
                <span>{isRedetectingAll ? "Detectando..." : "🔄 Redetectar"}</span>
              </button>
            )}
            {onRefreshModels && (
              <button
                onClick={onRefreshModels}
                disabled={isRefreshing}
                title="Escanear y autodetectar modelos locales en Ollama"
                className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Zap className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-amber-400" : "text-cyan-400"}`} />
                <span>{isRefreshing ? "Ollama..." : "🦙 Ollama"}</span>
              </button>
            )}
            {onRefreshOpenaiModels && (
              <button
                onClick={onRefreshOpenaiModels}
                disabled={isDetectingOpenai}
                title="Autodetectar modelos disponibles en tu cuenta de OpenAI (requiere API Key)"
                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Zap className={`w-3.5 h-3.5 ${isDetectingOpenai ? "animate-spin text-amber-400" : "text-emerald-400"}`} />
                <span>{isDetectingOpenai ? "OpenAI..." : "⚡ OpenAI"}</span>
              </button>
            )}
            {/* ============================================================
                v2.0 — CARPETA DE MODELOS FAVORITOS: catálogo curado de modelos
                GRATUITOS con su tipo de cuota indicado (local = sin límite,
                sin-cuota = nube gratis, sesion = límite por sesión).
                Un clic los añade a la carpeta; luego el filtro "Favoritos" los
                muestra y la ⭐ permite quitarlos.
                ============================================================ */}
            <button
              onClick={() => {
                // Carga el catálogo curado en la carpeta de favoritos y
                // refresca la lista para que el filtro "⭐ Favoritos" la muestre.
                restoreCatalog();
                refreshFavorites();
              }}
              title="Cargar el catálogo curado de modelos GRATUITOS sin cuota diaria: GLM-4.7-Flash / GLM-4.5-Flash y visión GLM-4.6V-Flash (Z.ai), Ollama Cloud y modelos locales de 0,4-2,5 GB para 8 GB de RAM"
              className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
            >
              <Star className="w-3.5 h-3.5 text-emerald-400" />
              <span>⭐ Catálogo gratis</span>
            </button>
            {/* v1.1 — Z.ai (GLM) free models refresh button. NO requiere API key. */}
            {onRefreshZaiModels && (
              <button
                onClick={onRefreshZaiModels}
                disabled={isDetectingZai}
                title="Cargar modelos GLM GRATUITOS de Z.ai (glm-4.5-flash, glm-4-flash, etc.)"
                className="p-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDetectingZai ? "animate-spin text-amber-400" : "text-violet-400"}`} />
                <span>{isDetectingZai ? "Z.ai..." : "🧠 Z.ai free"}</span>
              </button>
            )}
            {onRefreshGroqModels && (
              <button
                onClick={onRefreshGroqModels}
                disabled={isDetectingGroq}
                title="Autodetectar modelos Groq (llama, gpt-oss, qwen, etc.) con tu API Key de Groq"
                className="p-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Zap className={`w-3.5 h-3.5 ${isDetectingGroq ? "animate-spin text-amber-400" : "text-orange-400"}`} />
                <span>{isDetectingGroq ? "Groq..." : "⚡ Groq"}</span>
              </button>
            )}
            {onRefreshCustomModels && (
              <button
                onClick={onRefreshCustomModels}
                disabled={isDetectingOpenai}
                title="Cargar modelos del Servidor Personalizado (Groq, Cerebras, Together, Mistral, etc.)"
                className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Server className={`w-3.5 h-3.5 ${isDetectingOpenai ? "animate-spin text-amber-400" : "text-amber-400"}`} />
                <span>{isDetectingOpenai ? "Custom..." : "🌐 Custom"}</span>
              </button>
            )}
            {onRefreshGeminiModels && (
              <button
                onClick={onRefreshGeminiModels}
                disabled={isDetectingGemini}
                title="Autodetectar modelos Gemini flash gratuitos para tu API Key de Google AI Studio"
                className="p-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDetectingGemini ? "animate-spin text-amber-400" : "text-purple-400"}`} />
                <span>{isDetectingGemini ? "Gemini..." : "⚡ Gemini free"}</span>
              </button>
            )}
            {onRefreshOpenRouterModels && (
              <button
                onClick={onRefreshOpenRouterModels}
                disabled={isDetectingOpenRouter}
                title="Autodetectar modelos gratuitos de OpenRouter (incluye openrouter/free)"
                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Globe className={`w-3.5 h-3.5 ${isDetectingOpenRouter ? "animate-spin text-amber-400" : "text-emerald-400"}`} />
                <span>{isDetectingOpenRouter ? "OpenRouter..." : "🌐 OR :free"}</span>
              </button>
            )}
            {/* v1.58.4 — Botones de carga para los motores cloud OpenAI-compat que
                antes NO tenían refresco en la UI (sus props llegaban pero nunca se
                renderizaban): Cerebras, Mistral, Together, DeepSeek y Fireworks.
                Sin key muestran el catálogo estático; con key piden el live+static. */}
            {onRefreshCerebrasModels && (
              <button
                onClick={onRefreshCerebrasModels}
                disabled={isDetectingCerebras}
                title="Cargar modelos de Cerebras (llama3.1-8b/70b, qwen coder). Con tu API Key trae el catálogo en vivo."
                className="p-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Zap className={`w-3.5 h-3.5 ${isDetectingCerebras ? "animate-spin text-amber-400" : "text-sky-400"}`} />
                <span>{isDetectingCerebras ? "Cerebras..." : "⚡ Cerebras"}</span>
              </button>
            )}
            {onRefreshMistralModels && (
              <button
                onClick={onRefreshMistralModels}
                disabled={isDetectingMistral}
                title="Cargar modelos de Mistral (mistral-small/medium, codestral, nemo). Con tu API Key trae el catálogo en vivo."
                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDetectingMistral ? "animate-spin text-amber-400" : "text-rose-400"}`} />
                <span>{isDetectingMistral ? "Mistral..." : "🌬️ Mistral"}</span>
              </button>
            )}
            {onRefreshTogetherModels && (
              <button
                onClick={onRefreshTogetherModels}
                disabled={isDetectingTogether}
                title="Cargar modelos de Together AI (Llama 3.3 70B Turbo Free, DeepSeek R1 Distill). Con tu API Key trae el catálogo en vivo."
                className="p-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Globe className={`w-3.5 h-3.5 ${isDetectingTogether ? "animate-spin text-amber-400" : "text-teal-400"}`} />
                <span>{isDetectingTogether ? "Together..." : "🤝 Together"}</span>
              </button>
            )}
            {onRefreshDeepseekModels && (
              <button
                onClick={onRefreshDeepseekModels}
                disabled={isDetectingDeepseek}
                title="Cargar modelos de DeepSeek (deepseek-chat V3, deepseek-reasoner R1, deepseek-coder). Con tu API Key trae el catálogo en vivo."
                className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Search className={`w-3.5 h-3.5 ${isDetectingDeepseek ? "animate-spin text-amber-400" : "text-indigo-400"}`} />
                <span>{isDetectingDeepseek ? "DeepSeek..." : "🔍 DeepSeek"}</span>
              </button>
            )}
            {onRefreshFireworksModels && (
              <button
                onClick={onRefreshFireworksModels}
                disabled={isDetectingFireworks}
                title="Cargar modelos de Fireworks (Llama 3.1 8B/70B, DeepSeek R1 Distill). Con tu API Key trae el catálogo en vivo."
                className="p-1.5 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              >
                <Star className={`w-3.5 h-3.5 ${isDetectingFireworks ? "animate-spin text-amber-400" : "text-fuchsia-400"}`} />
                <span>{isDetectingFireworks ? "Fireworks..." : "🎆 Fireworks"}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="p-3 bg-[#0d121c] border-b border-[#1e293b] space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre (openrouter/free, gemini-2.5-flash, qwen, deepseek-r1:free, claude)..."
              className="w-full bg-[#141b2b] border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-zinc-200 placeholder-zinc-500 outline-none focus:border-cyan-500 font-mono text-xs"
            />
          </div>

          {/* v1.6.5 — «la ventana se ve cortada»: los filtros finales quedaban
              fuera de vista sin ninguna pista de que había más.
              v1.6.14 — pero envolverlos costaba CUATRO filas (~120 px) que se
              comían la lista. Una sola fila con desplazamiento horizontal deja
              los catorce accesibles y devuelve el espacio a los modelos. */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto custom-scrollbar pb-1">
            {[
              { id: "all", label: `Todos (${dynamicModels.length})` },
              { id: "favorites", label: `⭐ Favoritos (${favoriteModels.length})` },
              { id: "installed", label: `🦙 Ollama (${installedOllamaModels.length})` },
              { id: "openai", label: `⚡ OpenAI (${detectedOpenaiModels.length || "4+"})` },
              { id: "gemini", label: `⚡ Gemini (${detectedGeminiModels.length || "3+"})` },
              { id: "openrouter", label: `🌐 OpenRouter (${detectedOpenRouterModels.length || "1+"})` },
              { id: "zai", label: `🔮 Z.ai (${detectedZaiModels.length || "4+"})` },
              { id: "groq", label: `⚡ Groq (${detectedGroqModels.length || "10+"})` },
              { id: "cerebras", label: `⚡ Cerebras (${detectedCerebrasModels.length || "3+"})` },
              { id: "mistral", label: `🌬️ Mistral (${detectedMistralModels.length || "4+"})` },
              { id: "together", label: `🤝 Together (${detectedTogetherModels.length || "3+"})` },
              { id: "deepseek", label: `🔍 DeepSeek (${detectedDeepseekModels.length || "3+"})` },
              { id: "fireworks", label: `🎆 Fireworks (${detectedFireworksModels.length || "3+"})` },
              { id: PROVEEDOR_CEREBRO, label: `🎭 Ecléctico (${MODELO_CEREBRO_AUTO})` },
              { id: "custom", label: `${ETIQUETA_CARPETA_MODELOS} (${detectedCustomModels.length})` },
              { id: "code", label: "💻 Código" },
              { id: "reasoning", label: "🧠 Razonamiento" },
              { id: "vision", label: "👁️ Visión / OCR" },
              { id: "small", label: "⚡ Nano / Ligeros" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 ${
                  selectedFilter === f.id
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* v1.98.0 · EL INTERRUPTOR DE RUTA. Con el JSON de claves importado en
            ranuras Y el endpoint unificado activo, el mismo modelo aparecía dos
            veces (queja del 31/10). Se colapsa, pero la decisión de a quién le damos
            la fila es del usuario: la ranura habla al proveedor con su clave; la
            unificada habla al proxy con la suya — precio y límite distintos. Y sobre
            todo: lo colapsado no se perdió, este mismo botón lo devuelve. */}
        {corteRutas.ocultas.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/70 bg-zinc-950/40 text-[10px] flex-wrap">
            <span className="text-zinc-500">
              {corteRutas.ocultas.length} modelo(s) con dos caminos — mostrandone uno por modelo:
            </span>
            {(["unificada", "ranuras"] as PreferenciaRuta[]).map((p) => (
              <button
                key={p}
                onClick={() => mudarPreferenciaRuta(p)}
                className={`px-2 py-0.5 rounded border font-mono transition-colors ${
                  preferenciaRuta === p
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                    : "bg-zinc-900/60 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
                title={
                  p === "unificada"
                    ? `Mostrar la versión que sirve tu endpoint unificado (${ETIQUETA_CARPETA_MODELOS})`
                    : "Mostrar la versión que sirve cada proveedor con su propia clave (las ranuras)"
                }
              >
                {p === "unificada" ? ETIQUETA_CARPETA_MODELOS : "🔑 ranuras por proveedor"}
              </button>
            ))}
          </div>
        )}

        <EspejosSelector />

        {/* Models Grid List */}
        {/* v1.6.15 — «solo tiene un espacio chiquito para ver los modelos».
            Con la ventana ya a 1500 px, apilar las tarjetas en una sola
            columna desaprovechaba todo el ancho: seguían cabiendo cuatro.
            En rejilla, ese mismo ancho muestra dos o tres columnas. */}
        <div className="cn-modal-body custom-scrollbar p-3 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2 content-start bg-[#090d16]">
          {displayModels.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 space-y-2">
              {/* v1.80.0 · la carpeta de la API unificada existe SIEMPRE, y cuando
                  está vacía dice POR QUÉ y trae el botón que la llena. La queja
                  medida no era «no hay modelos»: era «no existe la carpeta», y una
                  carpeta que desaparece cuando no tiene nada vuelve a ser la
                  misma queja con otro número. */}
              {selectedFilter === "custom" ? (
                <>
                  {(() => {
                    const d = dictamenCarpetaUnificada({
                      hayUrl: hayUrlUnificada,
                      sondeando: false,
                      total: sondaUnificada?.total ?? 0,
                      intentos: intentoUnificada,
                      maxIntentos: maxIntentosUnificada,
                      ultimoError: sondaUnificada?.error ?? null,
                      endpoint: sondaUnificada?.endpoint ?? null,
                      ultimoIntentoEn: sondaUnificada?.cuando || null,
                    });
                    const tonoClase = d.tono === "error" ? "text-rose-300" : d.tono === "aviso" ? "text-amber-300" : d.tono === "espera" ? "text-zinc-400" : "text-emerald-300";
                    return (
                      <div className="space-y-2">
                        <p className={`font-mono text-[12px] ${tonoClase}`}>{d.titulo}</p>
                        <p className="text-[11px] max-w-xl mx-auto leading-relaxed whitespace-pre-line break-words">{d.detalle}</p>
                        <p className="text-[11px] max-w-xl mx-auto leading-relaxed text-zinc-500">{DESCRIPCION_CARPETA}</p>
                      </div>
                    );
                  })()
                }
                  {onRefreshCustomModels && (
                    <button
                      onClick={onRefreshCustomModels}
                      className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg font-mono text-xs hover:bg-emerald-500/30 transition-all border border-emerald-500/40"
                    >
                      ⚡ Cargar modelos de la API unificada
                    </button>
                  )}
                </>
              ) : (
                <>
                  {avisoCatalogo ? (
                    <p className="text-amber-300 font-mono text-xs">
                      ⚠ El catálogo no contestó: {avisoCatalogo}. No es que no haya
                      modelos: la consulta no se completó. Probá «Redetectar».
                    </p>
                  ) : (
                    <p>No se encontraron modelos con el filtro seleccionado.</p>
                  )}
                  {onRefreshModels && (
                    <button
                      onClick={onRefreshModels}
                      className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg font-mono text-xs hover:bg-cyan-500/30 transition-all border border-cyan-500/40"
                    >
                      ⚡ Re-escanear Ollama Local
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            cappedModels.map((model) => {
              const isSelected = currentModel === model.name;
              const esEmbed = esModeloEmbeds(model.name || model.id || ""); /*PUGIL*/
              const isFav = favoriteModels.some(
                (fm) => fm.modelId === model.name && fm.provider === model.provider
              );
              return (
                <div
                  key={model.id}
                  onClick={() => {
                    if (esEmbed) return; // PUGIL v1: un embedder no se elige para conversar
                    onSelectModel(model.name, model.provider);
                    onClose();
                  }}
                  /* v1.6.5 — «los modelos muy grandes»: la tarjeta gastaba 12px de
                     relleno por lado y 4px entre líneas para tres renglones, así
                     que en pantalla cabían cuatro modelos. Ahora es compacta. */
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-[#142036] border-cyan-500/60 text-cyan-50 shadow-md"
                      : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850"
                  }`}
                >
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs text-zinc-100">{model.name}</span>
                      {esEmbed && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-600/40"
                          title="Genera vectores para búsqueda/RAG; Ollama lo rechaza con 400 en /api/chat. No sirve para conversar."
                        >
                          📎 embeddings
                        </span>
                      )}

                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          model.provider === "gemini"
                            ? "bg-blue-900/40 text-blue-300 border border-blue-600/40"
                            : model.provider === "openrouter"
                            ? "bg-emerald-900/40 text-emerald-300 border border-emerald-600/40"
                            : model.provider === "openai"
                            ? "bg-teal-900/40 text-teal-300 border border-teal-600/40"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {model.provider.toUpperCase()}
                      </span>
                      {/* v1.98.0 · «este modelo también está del otro lado»: se dice, no
                          se esconde. Al pasar el mouse, el nombre exacto de la otra ruta. */}
                      {!!rutasAlternativas[claveDeModelo(model.name)] && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-300 border border-amber-700/40"
                          title={`También servido por ${etiquetaDeRuta(rutasAlternativas[claveDeModelo(model.name)], ETIQUETA_CARPETA_MODELOS)} (${rutasAlternativas[claveDeModelo(model.name)].provider}). Se muestra uno solo para no duplicar la lista; el interruptor de arriba cambia cuál.`}
                        >
                          2 caminos
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded font-mono">
                        {model.size}
                      </span>
                      {model.isVisionCapable && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                          Visión/OCR
                        </span>
                      )}
                      {model.provider === "ollama" && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                            model.isInstalled
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-zinc-800/80 text-zinc-500 border-zinc-700/50"
                          }`}
                        >
                          {model.isInstalled ? "✓ Detectado Local" : "Catálogo"}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-snug line-clamp-2" title={model.description}>{model.description}</p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {/* 🔧 Botón estrella para añadir/quitar de favoritos */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(model.name, model.name, model.provider, {
                          category: model.category,
                          description: model.description,
                        });
                      }}
                      className={`p-1.5 rounded-md transition-colors ${
                        isFav
                          ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                          : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-amber-400"
                      }`}
                      title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
                    </button>
                    {isSelected ? (
                      <div className="flex items-center gap-1 text-cyan-400 font-semibold text-[11px]">
                        <Check className="w-4 h-4" />
                        <span>Activo</span>
                      </div>
                    ) : (
                      <button className="px-3 py-1.5 bg-zinc-800 hover:bg-cyan-600 hover:text-white text-zinc-300 rounded-lg text-xs font-medium transition-colors">
                        Seleccionar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {isCapped && (
            <div className="col-span-full px-3 py-2 text-center text-[11px] text-amber-300/80 bg-amber-500/5 border border-amber-500/20 rounded-lg font-mono">
              Mostrando {RENDER_CAP} de {totalModels} modelos. Escribe en el buscador para afinar y ver el resto — se pinta por tandas para que la ventana abra fluida.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
