export type ModelProvider =
  | "ollama"
  | "gemini"
  | "openrouter"
  | "custom"
  | "openai"
  // v1.1 — Cloud servers with free tiers (dedicated providers, not "custom" templates):
  | "zai"        // Z.ai — GLM-4.5-Flash & GLM-4-Flash (FREE)
  | "groq"       // Groq — Llama 3.3 70B, Gemma 2 (FREE)
  | "cerebras"   // Cerebras — Llama 3.1 8B/70B (FREE beta)
  | "together"   // Together AI — $5 free credit
  | "mistral"    // Mistral AI — Small/Medium/Codestral (FREE tier)
  | "deepseek"   // DeepSeek — V3, R1 (very cheap, almost free)
  | "fireworks"  // Fireworks AI — $1 free credit
  // v1.80.0 · LA VOZ DE LA CASA: `cerebro/auto` no es un proveedor externo, es
  // el ENJAMBRE — un prompt que se manda a varias voces y vuelve con veredicto
  // (src/engine/enjambreEclectico.ts). Vive en el selector como un modelo más
  // para que elegirlo sea elegir un modelo, no aprenderse un botón nuevo.
  | "cerebro";

export interface ModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModelItem {
  name: string;
  model?: string;
  size?: number;
  digest?: string;
  details?: ModelDetails;
  modified_at?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  category: "chat" | "code" | "vision" | "reasoning" | "small" | "agent";
  description: string;
  size: string;
  contextWindow: string;
  isInstalled: boolean;
  manifestPath?: string;
  recommendedFor?: "chat" | "agent" | "both";
  isVisionCapable?: boolean;
}

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  // Extracted plain-text / decoded content for LLMs and Editor
  extractedText?: string;
  // Base64 data URL for images (for vision models like smolvlm2, glm-ocr)
  // v1.58.0 — también se reutiliza para AUDIO (data:audio/…;base64,…) cuando
  // isAudio===true: el modelo multimodal lo recibe como inlineData.
  base64Data?: string;
  /**
   * v8.0.3 — MINIATURA: data URL reducido (≤96 px de lado) SOLO para pintar el
   * chip del adjunto.
   *
   * Por qué no se usa `base64Data` directamente en el `<img>` del chip: el
   * navegador decodifica la imagen COMPLETA para dibujarla a 32 px. Con tres
   * adjuntos da igual; con treinta capturas 4K son cientos de MB de mapas de
   * bits en memoria y la interfaz se arrastra. La miniatura es lo que hace que
   * «cuando sean muchas» siga siendo usable.
   *
   * `base64Data` NO se toca: sigue siendo la imagen íntegra que se manda al
   * modelo. La miniatura es solo de la vista, y no sustituye a nada.
   */
  thumbData?: string;
  isImage?: boolean;
  // v1.58.0 — ENTRADA DE AUDIO (wav/mp3/…). El contenido va en `base64Data`
  // como data URL `data:audio/…;base64,…`. Solo los modelos con oído real
  // (Gemini nativo) lo procesan; el resto recibe un aviso de texto honesto.
  isAudio?: boolean;
  isZip?: boolean;
  isDocx?: boolean;
  isPdf?: boolean;
  isBinary?: boolean;
  // Extracted files list if it was a compressed container
  unpackedFiles?: { path: string; size: number; content: string; isText: boolean }[];
  error?: string;
}

export interface QueuedMessageItem {
  id: string;
  text: string;
  attachments: AttachmentItem[];
  timestamp: number;
  /**
   * v1.0.20 · cuándo el usuario pulsó «lanzar» en esta fila. undefined = llegó a
   * la cola y espera su turno, como siempre. Con marca, la fila lo dice («lanzado
   * · sale al terminar») y el mensaje viaja al modelo con la nota de juntarse con
   * el trabajo del turno anterior en lugar de rehacerlo. Ver `engine/lanzarEnCola.ts`.
   */
  lanzadoEn?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelUsed?: string;
  durationMs?: number;
  attachments?: AttachmentItem[];
  tokensPerSecond?: number;
  status?: "streaming" | "done" | "error";
  reasoningSteps?: string[];
}

// Chat guardado en la "carpeta de chats": historial completo con título editable
export interface SavedChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  size: number;
  modified?: boolean;
  isReadOnly?: boolean;
  isBinary?: boolean;
  // v1.60.5 — DOBLE ÁRBOL VISIBLE: refleja en la UI el mismo concepto que el
  // motor usa internamente (src/gestorArboles.ts). "entrada" = material que el
  // usuario aportó como contexto/referencia (el motor NO lo pisa hasta que se
  // promueva); "sandbox" = parte de la obra que el motor puede leer/escribir.
  // Si no viene, se infiere "sandbox" (ver src/utils/arbolWorkspace.ts).
  arbol?: "entrada" | "sandbox";
}

export interface PortTelemetry {
  port3000: boolean;
  port3500: boolean;
  port5000: boolean;
  port5100: boolean;
  port5102: boolean;
  /**
   * v2.3.9 · EL SÉPTIMO PUERTO: el motor del cerebro (:5103).
   *
   * `cerebro_motor.py` guarda hechos y páginas en `.cerebro-db/`. Es un órgano
   * DISTINTO del daemon :5100 (memoria consultiva, que no guarda nada) y hasta
   * hoy nadie lo sondeaba: `PORTS.CEREBRO` existía en `src/constants.ts` pero no
   * había ni una sonda que lo mirara, así que la cabecera no podía mostrarlo
   * aunque quisiera.
   *
   * OPCIONAL a propósito: una muestra vieja (o un servidor sin esta versión)
   * no trae la clave, y `undefined` NO es `false`. La cabecera lo trata como
   * «sin medir» (—) en vez de inventar un OFF, que es la regla de la casa.
   */
  port5103?: boolean;
  port11434: boolean;
  /**
   * v2.3.1 · ¿llegó de verdad una lectura de `/api/telemetry/ports`? Sin esto, el
   * estado inicial de `App.tsx` (que tiene que poner algo) afirmaba `true` en
   * :3000 y :11434 antes de la primera medición: la cabecera mentía en los dos
   * sentidos. El criterio único vive en `src/engine/indicadorServicios.ts`.
   */
  medido?: boolean;
  lastChecked: number;
  ollamaModelCount?: number;
  /**
   * v1.0.2 · LO QUE LA RUTA YA CONTESTABA Y EL TIPO NO CONOCIA.
   *
   * `server/routers/telemetria.ts` arma la muestra con `armarMuestra(ahora,
   * incompleto)` y devuelve `motivos`, `heredados`, `incompleto` y
   * `presupuestoMs`; `App.tsx` los guarda todos con el `...data`. Pero
   * `PortTelemetry` no los declaraba, así que la única manera de leerlos era
   * un `as any` — y por eso la cabecera nunca los mostró: con la máquina al
   * 100 % de CPU una tanda de sondeos se pierde y el chip sigue pintando el
   * último valor **heredado** como si fuera recién medido.
   *
   *   · `motivos`    → por puerto, qué pasó («sin respuesta en N ms»).
   *   · `heredados`  → qué puertos están mostrando el valor anterior.
   *   · `incompleto` → la tanda perdió o le venció alguna sonda.
   *
   * Opcionales: una muestra vieja o un server anterior no los trae, y la casa
   * no convierte «no lo sé» en `false`.
   */
  motivos?: Record<string, string>;
  heredados?: string[];
  incompleto?: boolean;
  presupuestoMs?: number;
}

export interface AgentTask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
}

export interface AgentAction {
  tool: string;
  detail: string;
  ok: boolean;
  /** v1.88.1 · POR QUÉ falló, en una línea, tal como lo dijo la herramienta.
   *  Sin esto el panel solo muestra una ✗ roja y el usuario no sabe si falló
   *  un paso o la tarea entera. */
  motivo?: string | null;
  ts?: number;
}

export type AgentTaskEvent =
  | { type: "plan"; tasks: AgentTask[] }
  | { type: "update"; taskId: string; status: AgentTask["status"] }
  | { type: "action"; action: AgentAction }
  /** v1.70.6 — imágenes del adjunto que el motor YA escribió en el proyecto (rutas relativas). */
  | { type: "imagenes-subidas"; paths: string[] };

export interface SubagentItem {
  id: string;
  name: string;
  port?: number | null;
  url?: string;
  path?: string;
  role: string;
  status: "online" | "offline" | string;
}
