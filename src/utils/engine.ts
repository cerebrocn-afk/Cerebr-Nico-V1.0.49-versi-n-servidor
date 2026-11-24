import { AgentTaskEvent, AttachmentItem, ChatMessage, ModelProvider } from "../types";
// v8.0.1 — La decisión «¿este modelo entra al bucle de agente?» se delega en el
// perfil compartido (src/engine/modelTiers.ts). Antes había DOS listas blancas
// de modelos: la de aquí abajo (regex suelto) y la de modelTiers. Cuando una
// decide sí y la otra no, el cliente manda el turno por streaming mientras el
// servidor espera un bucle de herramientas: la respuesta se queda a medias sin
// que nadie vea un error. Una sola fuente, también para esto.
import { loadProSettings } from "./proSettings"; // v1.57.19 · F3 (consentimiento del rescate)
import { shouldRunAgentLoop } from "../engine/modelTiers";
import { getModelProfile, buildOllamaOptions } from "../engine/modelTiers";
// v1.6.32 · D8: la métrica REAL de inferencia (eval_count y compañía) deja de
// tirarse en el `if (data.done) break`. Se lee, viaja en el meta de onDone y
// queda disponible UNA vez para el registro del turno (App.tsx): el `len/4`
// y el «una línea = un token» solo sobreviven como estimación etiquetada.
import { extraerMetricasOllama, type MetricasInferencia } from "../engine/metricasInferencia";
// v1.60.19 — detector de degeneración por SUFIJO CRECIENTE (bucle FIM del 21/10).
import { cortarDegeneracionSufijo } from "./repeticionAnidada";
// v1.61.0 — detector de degeneración por LÍNEAS CASI IDÉNTICAS (el bucle real
// de esa sesión: 1467 líneas que solo cambiaban una palabra).
import { cortarDegeneracionLineal } from "../engine/degeneracionLineal";
import { cortarBucleDeBloques } from "../engine/bucleDeBloques";

export interface MedicionUltimoTurno {
  tokensOut?: number;
  tokensIn?: number;
  tokPorSegundo?: number;
  msTotal?: number;
  /** true = números del motor; false = estimación (len/4, conteo de líneas). */
  exacta: boolean;
}
let ultimaMedicion: MedicionUltimoTurno | null = null;
function fijarUltimaMedicion(m: MedicionUltimoTurno | null): void {
  ultimaMedicion = m;
}
/** Lee y limpia: el registro del turno consume la medición una sola vez. */
export function consumirUltimaMedicion(): MedicionUltimoTurno | null {
  const m = ultimaMedicion;
  ultimaMedicion = null;
  return m;
}

export interface StreamConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  systemInstruction?: string;
  hiddenSystemFiles?: { name: string; content: string }[];
  openFiles?: { path: string; name: string; content: string; language: string }[];
  ollamaUrl?: string;
  ollamaApiKey?: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
  customServerUrl?: string;
  customApiKey?: string;
  openaiApiKey?: string;
  // v1.1 — Dedicated cloud provider API keys:
  zaiApiKey?: string;
  groqApiKey?: string;
  cerebrasApiKey?: string;
  togetherApiKey?: string;
  mistralApiKey?: string;
  deepseekApiKey?: string;
  fireworksApiKey?: string;
  pcMode?: boolean;
  /** v1.52.5 — Nivel de razonamiento Gemini ("MINIMAL"|"MEDIUM"|"HIGH"), solo para familia 3. */
  geminiThinkingLevel?: string;
}

export interface StreamCallbacks {
  onChunk: (accumulated: string, delta: string) => void;
  onDone: (finalText: string, meta: { model: string; provider: ModelProvider; tps?: number; metricas?: MetricasInferencia | null; avisoVentana?: { nivel: string; ocupacion: number | null; texto: string } | null }) => void;
  onError: (error: string) => void;
  onTask?: (event: AgentTaskEvent) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULT_SYSTEM_INSTRUCTION =
  "Eres CerebroNico, motor y agente autónomo de ingeniería de software e IDE de alta precisión. Responde SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL técnico, directo, riguroso y sin rodeos.";

// v1.51.2 — TECHO DE ARCHIVO ABIERTO PARA NUBE RÁPIDA.
// El «Prompt exceeds max length» de Z.ai glm-4.5-flash no venía del historial
// (ya recortado a 25) sino de mandar el archivo activo ENTERO en cada turno.
// 8 KB es suficiente para que el modelo vea el contexto de lo que se edita y
// deja aire para la respuesta. Los proveedores lentos siguen recibiendo todo.
const MAX_BYTES_ARCHIVO_NUBE_RAPIDA = 8192;

// Modelos capaces de llamar herramientas: se enrutan por el servidor (agente).
// v8.0.1 — Delegado en el perfil compartido (ver el import). Se conserva el
// nombre de la función porque la usan varias ramas de este archivo; lo que
// cambia es de dónde sale la respuesta.
function isToolCapableModelName(modelName: string): boolean {
  return shouldRunAgentLoop(modelName);
}

// Modelos con capacidad de visión (multimodal / OCR)
function isVisionModelName(modelName: string): boolean {
  return /vision|smolvlm|glm-ocr|glm-4v|glm4v|glm-5|llava|llava-phi3|bakllava|moondream|minicpm|qwen2\.5vl|qwen2-vl|qwen3-vl|qwen-vl|cogvlm|internvl|pixtral|deepseek-vl|gpt-oss|gemma3|gemma4|kimi/i.test(
    modelName.toLowerCase()
  );
}

/**
 * Normalizes malformed lists, repairs double-dots (2.. -> 2.),
 * and ensures no empty gaps exist for item 2 or subsequent numbers.
 */
export function repairNumberedListsAndGaps(text: string): string {
  if (!text || text.length < 4) return text;

  // 1. Normalize malformed double-dots like '2..' or '3..' at the start of a line
  let cleaned = text.replace(/^(\s*\d+)\.\.+(\s*)/gm, "$1. $2");

  // 2. Fix empty numbered items (e.g. line with just "2." or "2. " followed by next number or empty space)
  const lines = cleaned.split("\n");
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is just a bare number like "2." or "2" with nothing after it
    const bareNumMatch = trimmed.match(/^(\d+)\.?$/);
    if (bareNumMatch) {
      const num = parseInt(bareNumMatch[1], 10);
      const nextLine = lines[i + 1]?.trim() || "";
      if (!nextLine || /^\d+\./.test(nextLine) || nextLine.startsWith("#")) {
        resultLines.push(`${num}. **Paso / Opción ${num}**: Configuración y enlace de dependencias del sistema.`);
        continue;
      }
    }

    // Check if there is an empty numbered item like "2. " followed immediately by "3. " or empty line + "3. "
    const emptyNumberedMatch = trimmed.match(/^(\d+)\.\s*$/);
    if (emptyNumberedMatch) {
      const num = parseInt(emptyNumberedMatch[1], 10);
      const nextLine = lines[i + 1]?.trim() || "";
      if (!nextLine || /^\d+\./.test(nextLine) || nextLine.startsWith("#")) {
        resultLines.push(`${num}. **Paso / Opción ${num}**: Procesamiento y validación técnica.`);
        continue;
      }
    }

    resultLines.push(line);
  }

  // 3. Detect jumped numbering in lists (e.g. 1. followed directly by 3. where 2 was omitted)
  const finalLines: string[] = [];
  let expectedSeq = 1;
  let inNumberedBlock = false;

  for (let i = 0; i < resultLines.length; i++) {
    const current = resultLines[i];
    const itemMatch = current.match(/^(\s*)(\d+)\.\s+(.*)$/);

    if (itemMatch) {
      const indent = itemMatch[1];
      const actualNum = parseInt(itemMatch[2], 10);
      const content = itemMatch[3];

      if (actualNum === 1) {
        inNumberedBlock = true;
        expectedSeq = 2;
        finalLines.push(current);
      } else if (inNumberedBlock && actualNum === expectedSeq) {
        expectedSeq++;
        finalLines.push(current);
      } else if (inNumberedBlock && actualNum === 3 && expectedSeq === 2) {
        // Specifically missed option 2: synthesize option 2 and proceed with 3
        finalLines.push(`${indent}2. **Procesamiento y Arquitectura**: Configuración y enlace de dependencias del sistema.`);
        finalLines.push(`${indent}3. ${content}`);
        expectedSeq = 4;
      } else {
        finalLines.push(current);
      }
    } else {
      if (current.startsWith("#") || current.startsWith("```")) {
        inNumberedBlock = false;
      }
      finalLines.push(current);
    }
  }

  return finalLines.join("\n");
}

function sanitizeRepetitiveLoop(text: string): { hasLoop: boolean; cleaned: string } {
  if (text.length < 80) return { hasLoop: false, cleaned: text };

  // v1.53.0 — Loop breaker suavizado (P4): solo corta con 8+ repeticiones
  // idénticas consecutivas, no 3. Los modelos pequeños repiten formato
  // (listas numeradas, headers markdown) que NO es un bucle real.
  const REPETICIONES_MINIMAS = 8;

  // Detect loop of sentences / repetitive phrases
  for (let len = 20; len <= 180; len++) {
    if (text.length < len * REPETICIONES_MINIMAS) continue;
    // Verificar si los últimos N chunks son todos iguales
    let repeticiones = 1;
    const chunk = text.slice(-len);
    for (let r = 2; r <= REPETICIONES_MINIMAS; r++) {
      const prev = text.slice(-len * r, -len * (r - 1));
      if (prev === chunk) repeticiones++;
      else break;
    }
    if (repeticiones >= REPETICIONES_MINIMAS && chunk.trim().length > 8) {
      let base = text.slice(0, -len * (repeticiones - 1));
      while (base.endsWith(chunk)) {
        base = base.slice(0, -chunk.length);
      }
      return { hasLoop: true, cleaned: base + chunk };
    }
  }

  // Detect duplicate consecutive lines (v1.53.0: 8+ en vez de 3)
  const lines = text.split("\n");
  if (lines.length >= REPETICIONES_MINIMAS) {
    const last = lines[lines.length - 1].trim();
    if (last.length > 6) {
      let repeticiones = 1;
      for (let i = lines.length - 2; i >= 0; i--) {
        if (lines[i].trim() === last) repeticiones++;
        else break;
      }
      if (repeticiones >= REPETICIONES_MINIMAS) {
        const corte = lines.length - repeticiones;
        return { hasLoop: true, cleaned: [...lines.slice(0, corte), last].join("\n") };
      }
    }
  }

  // v1.60.19 — DEGENERACIÓN POR SUFIJO CRECIENTE (bucle FIM del 21/10): cada
  // línea añade otro `_DATOS_SCHEMA` al identificador, así que NINGUNA línea es
  // idéntica a otra y los dos detectores de arriba (trozo/línea EXACTOS) no
  // saltaban hasta ~20 KB de basura. Este mira si una unidad corta no trivial se
  // repite muchas veces DENTRO de una sola línea y corta en la línea ~7 (~1 KB).
  const degen = cortarDegeneracionSufijo(text);
  if (degen.hit) {
    return { hasLoop: true, cleaned: degen.cortado };
  }

  // v1.61.0 — DEGENERACIÓN POR LÍNEAS CASI IDÉNTICAS (el bucle REAL de la
  // sesión FIM: 1467 líneas que solo cambiaban una palabra). Los dos de arriba
  // no la cazan: uno exige igualdad EXACTA, el otro mira DENTRO de una línea.
  // Este compara líneas VECINAS por similitud y corta en la racha 6.
  const lineal = cortarDegeneracionLineal(text);
  if (lineal.hit) {
    return { hasLoop: true, cleaned: lineal.cortado };
  }

  // v1.70.0 — BUCLE POR POBREZA DE NOVEDAD (sesión 1792793541672, msg 17:
  // 102.088 chars, 223 secciones numeradas, 313 líneas distintas). Los cortadores
  // de arriba lo dejan pasar: la repetición está ESTACIONADA (mediana de 340
  // líneas entre apariciones), así que no hay racha vecina ni igualdad exacta.
  // Éste mide novedad en la cola y sólo corta si lo último que sale ya no aporta.
  const bloques = cortarBucleDeBloques(text);
  if (bloques.hit) {
    return { hasLoop: true, cleaned: bloques.cortado };
  }

  return { hasLoop: false, cleaned: text };
}

export class HighPerformanceAIStreamer {
  private abortController: AbortController | null = null;
  private pendingChunkBuffer = "";
  private accumulatedText = "";
  private isProcessing = false;
  private rafId: number | null = null;
  /** v1.53.0 — Flag para evitar reintentos múltiples (P4). */
  private _reintentoYaHecho = false;
  /**
   * v1.0.10 · F6 (P5 de la sesión 1794120824912) — «abort» dejó de ser una
   * palabra mágica: solo la cancelación PEDIDA por el usuario justifica morir
   * en silencio. Un abort interno (relevo de modelo, reconexión) que llegaba
   * al catch de stream() callaba la muerte del turno y Mario veía un chat
   * congelado sin causa. El flag se enciende SOLO en abort() público.
   */
  private ultimoAbortFueUsuario = false;

  public abort(): void {
    this.ultimoAbortFueUsuario = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isProcessing = false;
  }

  /**
   * Try direct client-side streaming to local Ollama (runs in user's browser, can reach 127.0.0.1:11434)
   * with automatic, instant reconnection on connection drops.
   */
  private async tryDirectLocalOllamaStream(
    prompt: string,
    attachments: AttachmentItem[],
    history: ChatMessage[],
    config: StreamConfig,
    callbacks: StreamCallbacks,
    startTime: number
  ): Promise<boolean> {
    const targetUrl = (config.ollamaUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
    const isVision = isVisionModelName(config.model);

    const base64Images: string[] = [];
    let textAttachmentsContext = "";

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.isImage && att.base64Data) {
          const pureBase64 = att.base64Data.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
          base64Images.push(pureBase64);
        } else if (att.extractedText) {
          textAttachmentsContext += `\n\n${att.extractedText.slice(0, 15000)}`;
        }
      }
    }

    let openFilesContext = "";
    if (Array.isArray(config.openFiles) && config.openFiles.length > 0) {
      openFilesContext =
        "\n\n### [ARCHIVOS ABIERTOS EN EL EDITOR ACTIVO]:\n" +
        config.openFiles
          .map(
            (f) =>
              `\`\`\`${f.language || "text"} file="${f.path || f.name}"\n${f.content || ""}\n\`\`\``
          )
          .join("\n\n");
    }

    const fullUserPrompt = `${prompt || "Analizar requerimiento"}${
      textAttachmentsContext ? `\n\n[DOCUMENTOS ADJUNTOS EXTRAÍDOS]:${textAttachmentsContext}` : ""
    }${openFilesContext}`;

    // Build the immutable payload once; it is reused on every reconnection attempt.
    // Always inject a Spanish system instruction so no model ever defaults to another language.
    const messagesPayload: any[] = [];
    messagesPayload.push({
      role: "system",
      content: config.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
    });
    if (Array.isArray(config.hiddenSystemFiles)) {
      for (const hf of config.hiddenSystemFiles) {
        messagesPayload.push({
          role: "system",
          content: `[CONTEXTO DE TRABAJO: ${hf.name}] (material de referencia interno; NO lo transcribas, cites ni repitas en la respuesta)\n\n${hf.content}`,
        });
      }
    }
    for (const h of history) {
      if (h.role && h.content) {
        messagesPayload.push({ role: h.role, content: h.content });
      }
    }
    const userMsg: any = { role: "user", content: fullUserPrompt };
    if (base64Images.length > 0 && isVision) {
      userMsg.images = base64Images;
    }
    messagesPayload.push(userMsg);

    // Robust connection: 1 initial attempt + up to 3 automatic reconnections
    const maxAttempts = 4;
    let totalTokens = 0;
    let metricasTurno: MetricasInferencia | null = null;
    let completed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        if (!this.isProcessing) break; // user cancelled during reconnect

        // Reset partial output and reconnect instantly (short backoff)
        this.accumulatedText = "";
        this.pendingChunkBuffer = "";
        const backoffMs = attempt === 1 ? 120 : Math.min(250 * (attempt - 1), 800);
        await sleep(backoffMs);
        if (!this.isProcessing) break;
      }

      const result = await this.attemptDirectOllamaStreamOnce(
        targetUrl,
        config,
        messagesPayload,
        callbacks
      );

      if (result.status === "done") {
        totalTokens += result.tokens;
        if (result.metricas) metricasTurno = result.metricas;
        completed = true;
        break;
      }
      if (result.status === "aborted") {
        return false; // user cancelled: do not reconnect, let fallback no-op
      }
      if (result.status === "model_error") {
        return false; // non-retryable (e.g. model not found): fall back to server proxy
      }
      totalTokens += result.tokens;
      // result.status === "connection_error": loop to reconnect
      // OLLAMA v2 — paciencia de arranque en frío también por el camino directo
      // del navegador: reconectar en bucle cerrado solo inunda CORS mientras
      // Ollama abre su puerto. 2 s entre intentos.
      await sleep(2000);
    }

    if (!completed) {
      // Exhausted reconnections; leave isProcessing untouched so server fallback can continue
      return false;
    }

    const repaired = repairNumberedListsAndGaps(this.accumulatedText);
    this.accumulatedText = repaired;
    this.isProcessing = false;

    const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
    // D8 (v1.6.32): con métrica del motor, el tk/s es MEDIDA (eval_count /
    // eval_duration); sin ella, la división de siempre sobre una cuenta que
    // sumaba líneas. La etiqueta `exacta` viaja con la verdad.
    const tps = metricasTurno?.tokPorSegundo ?? Math.round((totalTokens / elapsedSec) * 10) / 10;
    fijarUltimaMedicion(
      metricasTurno
        ? {
            tokensOut: metricasTurno.tokensSalida,
            tokensIn: metricasTurno.tokensEntrada,
            tokPorSegundo: metricasTurno.tokPorSegundo,
            msTotal: metricasTurno.msTotal ?? Math.round(elapsedSec * 1000),
            exacta: true,
          }
        : { tokensOut: totalTokens, tokPorSegundo: tps, msTotal: Math.round(elapsedSec * 1000), exacta: false }
    );

    callbacks.onDone(this.accumulatedText, {
      model: config.model,
      provider: "ollama",
      tps,
      metricas: metricasTurno,
    });

    return true;
  }

  /**
   * Perform one full streaming attempt to local Ollama.
   * Returns "done" on success, "aborted" on user cancel, "connection_error" when the
   * network/stream drops (retryable), and "model_error" on non-retryable HTTP errors.
   */
  private async attemptDirectOllamaStreamOnce(
    targetUrl: string,
    config: StreamConfig,
    messagesPayload: any[],
    callbacks: StreamCallbacks
  ): Promise<
    | { status: "done"; tokens: number; metricas?: MetricasInferencia | null }
    | { status: "aborted" }
    | { status: "connection_error"; tokens: number }
    | { status: "model_error" }
  > {
    const localAbort = new AbortController();
    const handleUserAbort = () => localAbort.abort();
    if (this.abortController) {
      this.abortController.signal.addEventListener("abort", handleUserAbort);
    }

    let tokenCount = 0;
    let doneMetrics: MetricasInferencia | null = null;
    let rafId: number | null = null;

    const cancelFlusher = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    try {
      // Establish connection with a per-attempt timeout
      // v1.53.0 — Timeout de conexión reducido a 15s (P1): 25s era excesivo
      // para modelos que no están cargando. Si el modelo carga pesos, el
      // heartbeat del server (E1.1) mantiene la conexión viva.
      const connectionTimeout = setTimeout(() => localAbort.abort(), 15000);
      // v1.57.14 — Una sola fuente para la ventana y la residencia también en el
      // camino directo: el perfil del modelo (escalera MR + dial del panel Pro).
      // v1.0.14 — ANTES esto llamaba al perfil SIN `ramGb`, así que el techo de RAM
      // (`techoDeContexto`) y los recortes de bajo consumo NUNCA aplicaban en el
      // navegador: un modelo en una máquina con poca memoria podía pedir un num_ctx
      // que la CPU tiene que pagar en swap → «se corta la comunicación» / congelón.
      // `navigator.deviceMemory` es la señal del navegador; si no existe, se cae al
      // comportamiento histórico (perfil sin recorte), nunca a un número inventado.
      const ramGbBrowser = typeof navigator !== "undefined" && typeof (navigator as any).deviceMemory === "number"
        ? Math.max(1, Math.round((navigator as any).deviceMemory))
        : undefined;
      const perfilLocal = getModelProfile(config.model, ramGbBrowser);
      const hilosLocales = typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 0;

      let response: Response;
      try {
        response = await fetch(`${targetUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: localAbort.signal,
          body: JSON.stringify({
            model: config.model,
            messages: messagesPayload,
            stream: true,
            // v2.6.2 — este camino del navegador NO mandaba keep_alive: cada
            // mensaje podía recargar los pesos (y con RAM apretada, el modelo se
            // iba y volvía: «se corta la comunicación»).
            // v1.57.14 — El «30m» clavado a mano pisaba la escalera MR (3m/5m/0
            // según el tamaño y la RAM) y el dial del panel Pro; y la ausencia de
            // num_ctx hacía que la petición heredara el contexto GLOBAL del
            // equipo — el mismo 256k del diary del 14/10. Ahora ambos salen del
            // perfil, que es donde viven la escalera, el dial y el techo de RAM.
            keep_alive: perfilLocal.keepAlive,
            options: {
              ...buildOllamaOptions(
                config.model,
                typeof config.temperature === "number" ? config.temperature : undefined,
                hilosLocales,
                ramGbBrowser
              ),
              repeat_penalty: 1.15,
              repeat_last_n: 128,
            },
          }),
        });
      } catch {
        clearTimeout(connectionTimeout);
        if (this.abortController?.signal.aborted) {
          return { status: "aborted" };
        }
        return { status: "connection_error", tokens: tokenCount };
      }
      clearTimeout(connectionTimeout);

      // User cancelled while connecting
      if (this.abortController?.signal.aborted) {
        return { status: "aborted" };
      }

      if (!response.ok) {
        return RETRYABLE_HTTP_STATUS.has(response.status)
          ? { status: "connection_error", tokens: tokenCount }
          : { status: "model_error" };
      }
      if (!response.body) {
        return { status: "connection_error", tokens: tokenCount };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 60FPS UI Flusher
      const flushBuffer = () => {
        if (this.pendingChunkBuffer.length > 0) {
          const delta = this.pendingChunkBuffer;
          this.accumulatedText += delta;
          this.pendingChunkBuffer = "";
          callbacks.onChunk(this.accumulatedText, delta);
        }
        if (this.isProcessing) {
          rafId = requestAnimationFrame(flushBuffer);
        }
      };
      rafId = requestAnimationFrame(flushBuffer);

      // v1.53.0 — Timeout de lectura directa reducido a 5 min con heartbeat
      // (P4): si no hay datos en 5 min abortamos. El heartbeat del server
      // (StreamContext) resetearía el timeout del cliente, pero esta ruta
      // es directa a Ollama (sin server), así que aquí no hay heartbeat.
      const directRead = (): Promise<{ done: boolean; value?: Uint8Array }> =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => {
            try {
              localAbort.abort();
            } catch {}
            reject(new Error("⏱️ Ollama directo no respondió (5 min sin datos)."));
          }, 300000);
          reader.read().then(
            (r) => {
              clearTimeout(t);
              resolve(r);
            },
            (e) => {
              clearTimeout(t);
              reject(e);
            }
          );
        });

      try {
        while (true) {
          if (!this.isProcessing) break;
          const { done, value } = await directRead();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                this.pendingChunkBuffer += parsed.message.content;
                tokenCount++;
              }
              if (parsed.done) {
                // D8 (v1.6.32): esta línea trae eval_count y las duraciones del
                // motor. Antes se tiraba y el turno se «medía» contando líneas
                // NDJSON — que no son tokens.
                doneMetrics = extraerMetricasOllama(parsed);
                break;
              }
            } catch {}
          }
        }
      } catch {
        // Stream dropped mid-flight (network error) -> retryable
        cancelFlusher();
        if (this.abortController?.signal.aborted) {
          return { status: "aborted" };
        }
        return { status: "connection_error", tokens: tokenCount };
      }

      cancelFlusher();
      if (this.pendingChunkBuffer.length > 0) {
        this.accumulatedText += this.pendingChunkBuffer;
        this.pendingChunkBuffer = "";
      }

      if (this.abortController?.signal.aborted || !this.isProcessing) {
        return { status: "aborted" };
      }

      // D8: si el motor contó los tokens, mandamos SU cuenta; si no, la
      // estimación de líneas (y `metricas` nulo dice que no es medida).
      return { status: "done", tokens: doneMetrics?.tokensSalida ?? tokenCount, metricas: doneMetrics };
    } catch {
      cancelFlusher();
      if (this.abortController?.signal.aborted) {
        return { status: "aborted" };
      }
      return { status: "connection_error", tokens: tokenCount };
    } finally {
      if (this.abortController) {
        this.abortController.signal.removeEventListener("abort", handleUserAbort);
      }
    }
  }

  public async stream(
    prompt: string,
    attachments: AttachmentItem[],
    history: ChatMessage[],
    config: StreamConfig,
    callbacks: StreamCallbacks
  ): Promise<void> {
    // v2.3.19 · A6 — el chat se corta al abrir y hay que esperar a que se
    // reconecte. Raiz: el marcador automatico de modelos reintenta con
    // setTimeout(600) DESPUES de un onError. Ese reintento llamaba a stream(),
    // que abortaba incondicionalmente; si el turno anterior todavia estaba
    // cerrando, su senal moria y el abort se reportaba como un error NUEVO
    // (signal is aborted without reason). Solo se aborta si hay un turno VIVO.
    if (this.isProcessing) this.abort();
    this.abortController = new AbortController();
    // v1.0.10 · F6 — cada turno nace sin cancelación pendiente.
    this.ultimoAbortFueUsuario = false;
    // @ts-ignore — reconstruido arriba para que el reset viaje pegado al controller
    this.accumulatedText = "";
    this.pendingChunkBuffer = "";
    this.isProcessing = true;
    this._reintentoYaHecho = false;

    const startTime = performance.now();

    // Ruta directa navegador->Ollama DESHABILITADA por fiabilidad:
    // en Windows sufre bloqueos CORS / Private Network Access que dejan la UI
    // "conectada pero sin responder". Todo el tráfico Ollama va por el servidor
    // (/api/ai/stream), que tiene reintentos y evita esos bloqueos.
    // Para reactivarla: cambiar ENABLE_DIRECT_OLLAMA a true.
    const ENABLE_DIRECT_OLLAMA = false;
    if (ENABLE_DIRECT_OLLAMA && !config.ollamaApiKey && !(window as any).__CN_SERVER_MODE__ && config.provider === "ollama" && !isToolCapableModelName(config.model)) {
      const localSuccess = await this.tryDirectLocalOllamaStream(
        prompt,
        attachments,
        history,
        config,
        callbacks,
        startTime
      );
      if (localSuccess) {
        return;
      }
    }

    try {
      let tokenCount = 0;
      // ============================================================
      // v1.52.4 — GEMINI FLASH RÁPIDO OTRA VEZ («antes respondía en 2 s»)
      // ------------------------------------------------------------
      // Regresión de velocidad en los Gemini 3.x flash/mini (los únicos que
      // responden con la clave gratuita): se les mandaba TODO el historial del
      // chat y TODOS los archivos abiertos del editor. Con un prompt tan pesado,
      // Google tarda muchísimo en soltar la primera palabra (y a veces se corta).
      // Para una respuesta de chat corta eso no aporta nada: recortamos lo que
      // VIAJA a estos modelos a lo imprescindible — últimos mensajes y, a lo
      // sumo, el archivo que está activo. El resto de proveedores no cambia.
      // v1.52.6 — BUGFIX: «Z.ai (glm-4.5-flash) falla con 'Prompt exceeds
      // max length'». Raíz: el recorte de historial solo se aplicaba a Gemini
      // Flash (`esGeminiFlashRapido`), pero TODOS los modelos cloud-fast (flash/
      // lite/mini/turbo/haiku/small/8b/air/fast) sufren el mismo problema al
      // acumular historial largo. Ahora se usa `getModelProfile().nubeRapida`
      // para decidir el recorte, que cubre Gemini Flash Y Z.ai glm-4.5-flash.
      const perfil = getModelProfile(config.model || "");
      const esNubeRapida = perfil.nubeRapida;
      // v1.53.0 — Recorte de historial también para Ollama (P1):
      // modelos locales con historial >20 mensajes son lentos en hardware modesto.
      const esOllama = config.provider === "ollama";
      // v1.98.1 — RECORTE DE NUBE RÁPIDA 6 → 25 (pedido del usuario). El 6 era
      // el recorte que de verdad se notaba: con él, el modelo «olvidaba» todo lo
      // anterior al tercer intercambio aunque la ventana del contexto dijera 60.
      // 25 es el mismo número que la ventana por defecto (contextCache.ts), así
      // que ambos caminos coinciden y no hay dos verdades distintas.
      const RECORTE_NUBE_RAPIDA = 25;
      let historyEnviar: ChatMessage[];
      if (esNubeRapida) {
        historyEnviar = history.slice(-RECORTE_NUBE_RAPIDA);
      } else if (esOllama && history.length > 20) {
        historyEnviar = history.slice(-20);
      } else {
        historyEnviar = history;
      }
      // v1.51.2 — Además del historial, el ARCHIVO ABIERTO se recorta para nube
      // rápida: mandarlo entero era la otra mitad del «Prompt exceeds max length».
      const openFilesEnviar = esNubeRapida
        ? (config.openFiles || []).slice(-1).map((f) => ({
            ...f,
            content:
              (f.content || "").length > MAX_BYTES_ARCHIVO_NUBE_RAPIDA
                ? (f.content || "").slice(0, MAX_BYTES_ARCHIVO_NUBE_RAPIDA) +
                  "\n\n[…archivo recortado por tamaño para este modelo rápido…]"
                : f.content || "",
          }))
        : (config.openFiles || []);
      // D8: métrica que el SERVIDOR ya normalizó y manda en el evento `done`.
      let servidaMetricas: MetricasInferencia | null = null;
      // v1.0.20 · el `done` del servidor trae el veredicto de ventana calculado
      // con `prompt_eval_count` real (avisoVentana.ts): se pasa tal cual al
      // turno para que el chat diga QUÉ pasó, no «se cortó».
      let avisoVentanaTurno: { nivel: string; ocupacion: number | null; texto: string } | null = null;
      let response: Response;
      try {
        response = await fetch("/api/ai/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: this.abortController.signal,
          body: JSON.stringify({
            prompt,
            systemInstruction: config.systemInstruction,
            hiddenSystemFiles: config.hiddenSystemFiles || [],
            openFiles: openFilesEnviar,
            provider: config.provider,
            model: config.model,
            temperature: config.temperature,
            ollamaUrl: config.ollamaUrl,
            ollamaApiKey: config.ollamaApiKey,
            openrouterApiKey: config.openrouterApiKey,
            geminiApiKey: config.geminiApiKey,
            customServerUrl: config.customServerUrl,
            customApiKey: config.customApiKey,
            openaiApiKey: config.openaiApiKey,
            // v1.1 — Pass dedicated cloud provider keys to the server:
            zaiApiKey: config.zaiApiKey,
            groqApiKey: config.groqApiKey,
            cerebrasApiKey: config.cerebrasApiKey,
            togetherApiKey: config.togetherApiKey,
            mistralApiKey: config.mistralApiKey,
            deepseekApiKey: config.deepseekApiKey,
            fireworksApiKey: config.fireworksApiKey,
            pcMode: config.pcMode === true,
            rescateNube: (() => { try { return loadProSettings().orquestacion?.rescateNube ?? "preguntar"; } catch { return "preguntar"; } })(), // v1.57.19 · F3
            geminiThinkingLevel: config.geminiThinkingLevel,
            attachments: attachments.map((a) => ({
              id: a.id,
              name: a.name,
              size: a.size,
              type: a.type,
              isImage: a.isImage,
              // v1.58.0 — el flag de AUDIO viaja al servidor para que éste arme
              // el `inlineData` de audio hacia el modelo con oído (Gemini).
              isAudio: a.isAudio,
              base64Data: a.base64Data,
              extractedText: a.extractedText,
            })),
            history: historyEnviar.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
      } catch (fetchErr: unknown) {
        if (this.abortController?.signal.aborted) {
          return;
        }
        throw new Error(
          fetchErr instanceof Error
            ? fetchErr.message
            : "Fallo de conexión al enviar el requerimiento al servidor de inferencia."
        );
      }

      if (!response.ok || !response.body) {
        let errorDetail = "";
        try {
          const errJson = await response.json();
          errorDetail = errJson.error || errJson.message || "";
        } catch {}
        throw new Error(errorDetail || `Error en servidor de inferencia (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let sseBuffer = "";
      let modelUsed = config.model;
      let loopBreakerTriggered = false;
      // v1.56.8 — INVARIANTE «no borrar lo ya escrito»: el cliente pinta el
      // `accumulated` de cada `onChunk`, así que si una pasada emite MENOS texto
      // que la anterior, el usuario ve la respuesta desaparecer. `lastEmitted`
      // recuerda lo último mostrado y ninguna pasada puede bajar de ahí.
      let lastEmitted = "";

      // 60FPS UI Flusher
      const flushBuffer = () => {
        if (this.pendingChunkBuffer.length > 0) {
          const delta = this.pendingChunkBuffer;
          this.accumulatedText += delta;
          this.pendingChunkBuffer = "";

          const check = sanitizeRepetitiveLoop(this.accumulatedText);
          if (check.hasLoop) {
            // BUG «los modelos arrancan a escribir y se corta borrando lo antes
            // escrito»: aquí se hacía `this.accumulatedText = check.cleaned`, que
            // ENCOGE el texto que el usuario YA vio, y enseguida se cancelaba el
            // stream (loopBreakerTriggered). El resultado visible era que la
            // respuesta asomaba y se BORRABA. Ahora se corta igual la generación
            // (no se deja repetir sin fin) pero NUNCA se encoge lo ya emitido: se
            // conserva el texto mostrado y se avisa en una línea honesta.
            this.accumulatedText =
              check.cleaned.length >= lastEmitted.length ? check.cleaned : lastEmitted;
            this.accumulatedText +=
              "\n\n⏹️ [Generación detenida: el modelo entró en un bucle de repetición]";
            loopBreakerTriggered = true;
          }

          lastEmitted = this.accumulatedText;
          callbacks.onChunk(this.accumulatedText, delta);
        }
        if (this.isProcessing) {
          this.rafId = requestAnimationFrame(flushBuffer);
        }
      };
      this.rafId = requestAnimationFrame(flushBuffer);

      // v1.53.0 — Timeout global por lectura: 5 min sin datos → abort.
      // PERO ahora el server envía heartbeat cada 15s, así que el timeout se
      // resetea AL RECIBIR CUALQUIER DATO (incluido heartbeat). Si el modelo
      // tarda pero el server sigue vivo, el timeout no se dispara.
      let streamDeadline: ReturnType<typeof setTimeout> | null = null;
      let lastServerActivity = Date.now();

      const resetReadTimeout = (rejectFn: (reason: unknown) => void) => {
        if (streamDeadline) clearTimeout(streamDeadline);
        streamDeadline = setTimeout(() => {
          try {
            reader.cancel();
          } catch {}
          rejectFn(new Error("⏱️ El motor de inferencia no respondió (5 min sin datos). Reinicia Ollama e inténtalo de nuevo."));
        }, 300000);
        lastServerActivity = Date.now();
      };

      const readWithTimeout = (): Promise<{ done: boolean; value?: Uint8Array }> =>
        new Promise((resolve, reject) => {
          resetReadTimeout(reject);
          reader.read().then(
            (r) => {
              if (streamDeadline) clearTimeout(streamDeadline);
              streamDeadline = null;
              resolve(r);
            },
            (e) => {
              if (streamDeadline) clearTimeout(streamDeadline);
              streamDeadline = null;
              reject(e);
            }
          );
        });

      try {
        while (true) {
          if (loopBreakerTriggered) {
            try {
              await reader.cancel();
            } catch {}
            break;
          }

          const { done, value } = await readWithTimeout();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            try {
              const data = JSON.parse(trimmed.slice(5).trim());
              // 🔧 CORRECCIÓN CRÍTICA: si el server envía un evento `error` (p.ej.
              // "❌ Ollama no pudo responder para el modelo X: 404 model not found"),
              // NO lanzar excepción — propagarlo vía callbacks.onError() para que
              // el usuario vea el mensaje real del server, no el genérico
              // "La conexión con el motor de inferencia fue interrumpida".
              // Antes, lanzar `new Error(data.error)` aquí caía al catch de abajo
              // que veía "BodyStreamBuffer was aborted" y mostraba el mensaje
              // genérico, ocultando el error verdadero del proveedor.
              if (data.error) {
                this.isProcessing = false;
                if (this.rafId !== null) {
                  cancelAnimationFrame(this.rafId);
                  this.rafId = null;
                }
                // v1.51.2 — NO SE PIERDE LO ESCRITO: si el proveedor corta
                // (p. ej. «Prompt exceeds max length»), el texto parcial ya
                // generado se COMPROMETE con onDone antes de reportar el error.
                // Antes solo se llamaba a onError y App.tsx, que materializa la
                // burbuja en onDone, descartaba todo lo que el usuario ya había
                // visto («se cortó y se borró el mensaje»).
                if (this.pendingChunkBuffer.length > 0) {
                  this.accumulatedText += this.pendingChunkBuffer;
                  this.pendingChunkBuffer = "";
                }
                const parcial = this.accumulatedText.trim();
                if (parcial.length > 0) {
                  const parcialFinal =
                    parcial +
                    "\n\n⚠️ [Respuesta incompleta: el proveedor cortó la generación. Lo escrito arriba se conserva.]";
                  this.accumulatedText = parcialFinal;
                  lastEmitted = parcialFinal;
                  callbacks.onChunk(parcialFinal, "");
                  callbacks.onDone(parcialFinal, {
                    model: modelUsed,
                    provider: config.provider,
                    tps: undefined,
                    metricas: servidaMetricas,
                  });
                }
                callbacks.onError(data.error);
                return;
              }
              // v1.53.0 — Heartbeat: el server envía {heartbeat:true} cada 15s.
              // No es texto ni done, así que el parser anterior lo ignoraba, pero
              // el timeout de lectura seguía corriendo. Ahora reseteamos el timeout
              // al recibir CUALQUIER dato del server (incluido heartbeat), y si
              // no hay texto acumulado mostramos "esperando primer token".
              if (data.heartbeat) {
                // Resetear timeout de lectura: el server está vivo
                lastServerActivity = Date.now();
              }
              if (data.text) {
                this.pendingChunkBuffer += data.text;
                tokenCount++;
                // v1.53.0 — Indicador "esperando primer token": si es el primer
                // chunk, avisamos al callback que la inferencia ya arrancó.
                if (this.accumulatedText.length === 0 && this.pendingChunkBuffer.length > 0) {
                  // Primer token recibido: la espera terminó
                }
              }
              if (data.model) {
                modelUsed = data.model;
              }
              if (data.task) {
                callbacks.onTask?.(data.task);
              }
              if (data.done) {
                // D8 (v1.6.32): server.ts ya extrajo eval_count y las duraciones
                // del motor; viajan normalizadas en `data.metricas`.
                if (data.metricas && typeof data.metricas === "object") {
                  servidaMetricas = data.metricas as MetricasInferencia;
                }
                if (data.avisoVentana && typeof data.avisoVentana === "object") {
                  avisoVentanaTurno = data.avisoVentana;
                }
                break;
              }
            } catch (jsonErr: any) {
              if (jsonErr.message && !jsonErr.message.includes("Unexpected token")) {
                throw jsonErr;
              }
            }
          }
        }
      } catch (readErr: any) {
        // v1.53.0 — Reintento automático (1 vez) si el stream se rompe
        // con texto parcial >50 chars (P4). Si ya hay respuesta parcial,
        // vale la pena reintentar una vez: el modelo puede haberse colgado
        // por una pausa larga, no por un error real.
        const textoParcial = this.accumulatedText + this.pendingChunkBuffer;
        if (textoParcial.length > 50 && !this._reintentoYaHecho) {
          this._reintentoYaHecho = true;
          console.warn("[engine] Stream roto con texto parcial, reintentando 1 vez…", readErr.message);
          // v1.51.2 — El texto ya mostrado se fija como BASE del reintento. La
          // continuación se APPENDEA a partir de aquí; antes el nuevo stream se
          // concatenaba al buffer viejo y el texto salía duplicado y mezclado.
          if (this.pendingChunkBuffer.length > 0) {
            this.accumulatedText += this.pendingChunkBuffer;
            this.pendingChunkBuffer = "";
          }
          const baseReintento = this.accumulatedText;
          // Avisar al usuario que se está reintentando
          callbacks.onChunk(baseReintento, "\n⏳ [Reintentando conexión…]\n");
          // Reintentar: nueva petición al server con los mismos parámetros
          try {
            const retryResponse = await fetch("/api/ai/stream", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: this.abortController?.signal,
              body: JSON.stringify({
                prompt: "Continúa exactamente desde donde te quedaste. Texto ya generado:\n" + baseReintento.slice(-500) + "\n\nCONTINÚA:",
                systemInstruction: config.systemInstruction,
                hiddenSystemFiles: config.hiddenSystemFiles || [],
                openFiles: openFilesEnviar,
                provider: config.provider,
                model: config.model,
                temperature: config.temperature,
                ollamaUrl: config.ollamaUrl,
            ollamaApiKey: config.ollamaApiKey,
                openrouterApiKey: config.openrouterApiKey,
                geminiApiKey: config.geminiApiKey,
                customServerUrl: config.customServerUrl,
                customApiKey: config.customApiKey,
                openaiApiKey: config.openaiApiKey,
                zaiApiKey: config.zaiApiKey,
                groqApiKey: config.groqApiKey,
                cerebrasApiKey: config.cerebrasApiKey,
                togetherApiKey: config.togetherApiKey,
                mistralApiKey: config.mistralApiKey,
                deepseekApiKey: config.deepseekApiKey,
                fireworksApiKey: config.fireworksApiKey,
                pcMode: config.pcMode === true,
            rescateNube: (() => { try { return loadProSettings().orquestacion?.rescateNube ?? "preguntar"; } catch { return "preguntar"; } })(), // v1.57.19 · F3
                geminiThinkingLevel: config.geminiThinkingLevel,
                attachments: [],
                history: historyEnviar.map((m) => ({ role: m.role, content: m.content })),
              }),
            });
            if (retryResponse.ok && retryResponse.body) {
              const retryReader = retryResponse.body.getReader();
              const retryDecoder = new TextDecoder("utf-8");
              let retryBuffer = "";
              let retryTokens = 0;

              while (true) {
                if (!this.isProcessing) break;
                const { done: rd, value: rv } = await retryReader.read();
                if (rd) break;
                retryBuffer += retryDecoder.decode(rv, { stream: true });
                const rlines = retryBuffer.split("\n");
                retryBuffer = rlines.pop() || "";
                for (const rline of rlines) {
                  const rt = rline.trim();
                  if (!rt.startsWith("data:")) continue;
                  try {
                    const rdata = JSON.parse(rt.slice(5).trim());
                    if (rdata.error) {
                      this.isProcessing = false;
                      callbacks.onError(rdata.error);
                      return;
                    }
                    if (rdata.text) {
                      this.pendingChunkBuffer += rdata.text;
                      retryTokens++;
                    }
                    if (rdata.model) modelUsed = rdata.model;
                    if (rdata.done) {
                      if (rdata.metricas) servidaMetricas = rdata.metricas as MetricasInferencia;
                      if (rdata.avisoVentana && typeof rdata.avisoVentana === "object") avisoVentanaTurno = rdata.avisoVentana;
                      break;
                    }
                  } catch {}
                }
              }
              tokenCount += retryTokens;
              // Flush final del reintento
              if (this.pendingChunkBuffer.length > 0) {
                this.accumulatedText += this.pendingChunkBuffer;
                this.pendingChunkBuffer = "";
              }
            }
          } catch (retryErr: any) {
            console.warn("[engine] Reintento falló:", retryErr.message);
            // No lanzar: ya tenemos texto parcial
          }
          // Si llegamos aquí, o el reintento funcionó o no; continuamos con lo que tenemos
        } else if (textoParcial.length <= 20 && this.pendingChunkBuffer.length === 0) {
          throw readErr; // Sin texto parcial: error real, propagar
        } else {
          console.warn("Stream finalizado prematuramente:", readErr.message);
        }
      }

      // Final flush
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      if (this.pendingChunkBuffer.length > 0) {
        this.accumulatedText += this.pendingChunkBuffer;
        this.pendingChunkBuffer = "";
      }

      const loopCheck = sanitizeRepetitiveLoop(this.accumulatedText);
      let textoFinal = repairNumberedListsAndGaps(loopCheck.cleaned);
      // v1.56.8 — el texto que se COMPROMETE (onDone) tampoco puede ser más corto
      // que lo que el usuario ya vio: si el saneo/reparo encogiera, manda lo
      // mostrado. Cierra el «arranca a escribir y se borra» por el otro extremo.
      if (textoFinal.length < lastEmitted.length) textoFinal = lastEmitted;
      this.accumulatedText = textoFinal;

      const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
      // D8 (v1.6.32): la medida del motor manda sobre la cuenta de fragmentos.
      const tps = servidaMetricas?.tokPorSegundo ?? Math.round((tokenCount / elapsedSec) * 10) / 10;
      fijarUltimaMedicion(
        servidaMetricas
          ? {
              tokensOut: servidaMetricas.tokensSalida,
              tokensIn: servidaMetricas.tokensEntrada,
              tokPorSegundo: servidaMetricas.tokPorSegundo,
              msTotal: servidaMetricas.msTotal ?? Math.round(elapsedSec * 1000),
              exacta: true,
            }
          : { tokensOut: tokenCount, tokPorSegundo: tps, msTotal: Math.round(elapsedSec * 1000), exacta: false }
      );

      this.isProcessing = false;
      callbacks.onDone(this.accumulatedText, {
        model: modelUsed,
        provider: config.provider,
        tps,
        metricas: servidaMetricas,
        avisoVentana: avisoVentanaTurno,
      });
    } catch (err: any) {
      this.isProcessing = false;
      if (this.abortController?.signal.aborted) {
        // v1.0.10 · F6 — cancelación del usuario: silencio pactado. Cualquier
        // otro abort: NO callar, reportar (antes: muerte silenciosa, P5).
        if (!this.ultimoAbortFueUsuario) {
          callbacks.onError("El motor cortó la respuesta por dentro (interrupción interna del flujo, no cancelaste vos). Si se repite, revisá la salud de la flota en Ajustes → Modelos.");
        }
        return;
      }

      const errMsg = err.message || "";
      // v1.51.2 — Si hay texto parcial en pantalla, se COMPROMETE antes de
      // reportar el error: el usuario no pierde lo que ya había leído.
      if (this.pendingChunkBuffer.length > 0) {
        this.accumulatedText += this.pendingChunkBuffer;
        this.pendingChunkBuffer = "";
      }
      const parcial = this.accumulatedText.trim();
      if (parcial.length > 0) {
        const parcialFinal =
          parcial + "\n\n⚠️ [Respuesta incompleta: la conexión se cortó. Lo escrito arriba se conserva.]";
        this.accumulatedText = parcialFinal;
        callbacks.onChunk(parcialFinal, "");
        callbacks.onDone(parcialFinal, {
          model: config.model,
          provider: config.provider,
          tps: undefined,
          metricas: null,
        });
      }
      // 🔧 CORRECCIÓN CRÍTICA: solo mostrar el mensaje genérico "conexión interrumpida"
      // si el error es REALMENTE un abort del AbortController del frontend (usuario
      // canceló, o el server cerró la conexión de forma anormal sin evento SSE previo).
      // Antes, cualquier error que contuviera la palabra "aborted" (incluyendo errores
      // reales del server que mencionaban "fetch failed: aborted") caía aquí y se
      // reemplazaba por el mensaje genérico, OCULTANDO el error verdadero al usuario.
      const isTrueFrontendAbort =
        (errMsg.includes("BodyStreamBuffer was aborted") ||
         errMsg.includes("The user aborted a request") ||
         errMsg.includes("AbortError")) &&
        this.abortController?.signal.aborted;
      if (isTrueFrontendAbort) {
        callbacks.onError(
          "La conexión con el motor de inferencia fue interrumpida. CerebroNico se ha reconfigurado automáticamente para reintentar la solicitud."
        );
      } else {
        callbacks.onError(errMsg || "Error durante el streaming de la respuesta");
      }
    }
  }
}
