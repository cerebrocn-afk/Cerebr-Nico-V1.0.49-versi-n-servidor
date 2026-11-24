/**
 * modelTiers.ts — Clasificación de modelos y AJUSTES DE RENDIMIENTO (v2.0)
 * ======================================================================
 * Fuente única de verdad compartida por:
 *   - backend/server.ts      (opciones de Ollama + decisión de bucle de agente)
 *   - src/utils/contextCache.ts (presupuesto de contexto del cliente)
 *
 * POR QUÉ EXISTE ESTE ARCHIVO (el bug que arregla)
 * ------------------------------------------------
 * En la v1.1, `isToolCapableModel()` decidía si un modelo entraba al "bucle de
 * agente" (llamadas a herramientas, NO streaming) mirando SOLO el nombre:
 *
 *     /llama3\.|llama-3|qwen2\.5|qwen3|mistral|…/i
 *
 * y `qwen2.5:0.5b` (≈400 MB), `qwen2.5-coder:1.5b` (≈1 GB) y `llama3.2:1b`
 * coinciden con ese patrón. Resultado real medido en el código de la v1.1:
 *
 *   Servidor:  runOllamaAgentLoop()  → hasta 10 pasos
 *              callOllamaNonStreaming() → stream:false + timeout 120 s por intento
 *              → un modelo de 250 MB-1 GB intentando "tool calling" que no sabe
 *                hacer: no responde nada durante minutos y la interfaz parece
 *                colgada. Y cuando responde, es basura.
 *   Cliente:   engine.ts solo usa la ruta de streaming directo si el modelo NO
 *              es tool-capable → con estos modelos nunca se usaba streaming:
 *              cero tokens visibles hasta que termina TODO el bucle.
 *
 * Además, a todos los modelos locales se les daba `num_ctx: 8192` sin límite de
 * `num_predict`, sin `num_thread`/`num_batch` y con el prompt completo
 * (MEMORIA.md + skills.md + historial entero + archivos abiertos). En un equipo
 * de 8 GB, procesar ese prompt en CPU es lo que "tranca" la respuesta.
 *
 * Este módulo corrige las dos cosas: clasifica por TAMAÑO y devuelve un perfil
 * de rendimiento coherente con la RAM disponible.
 */

import { techoDeContexto } from "./techoContexto";
import { familiaConHerramientas, ranuraDirectaDe } from "./ranuraDirecta";

export type ModelTier = "micro" | "tiny" | "small" | "medium" | "large" | "cloud";

export interface ModelProfile {
  tier: ModelTier;
  /** Parámetros estimados en miles de millones (1.5 = 1.5B). null = desconocido */
  paramsB: number | null;
  /** true si el modelo corre en la nube (no consume RAM local) */
  remote: boolean;
  /**
   * v8.0.1 — Nombre canónico del que se heredó el perfil, si el modelo pedido
   * era un alias declarado (p. ej. `nemesis:latest` → `gpt-oss:120b-cloud`).
   * `null` cuando el modelo se identificó por su propio nombre.
   */
  aliasDe?: string | null;
  /**
   * ¿Merece la pena ofrecerle herramientas (bucle de agente)?
   * Los modelos diminutos NO: fallan el formato de tool-calls y bloquean la UI.
   */
  toolCapable: boolean;
  /** Ventana de contexto a pedir a Ollama (escalera + dial del usuario, topada por la RAM) */
  numCtx: number;
  /**
   * v1.57.14 — El `num_ctx` que había dictado la escalera MR ANTES del dial del
   * usuario y del techo de RAM. Se conserva para que el parte pueda decir
   * «pedías X, se manda Y» en vez de mostrar solo el número final.
   */
  ctxEscalera?: number;
  /** true si el valor final difiere de `ctxEscalera` (el techo o el dial movieron la ventana). */
  ctxRecortado?: boolean;
  /** v1.57.14 — La residencia que había dictado la escalera MR antes del dial del usuario. */
  keepAliveEscalera?: string;
  /** Tope de tokens de salida (-1 = sin tope) */
  numPredict: number;
  /** Tamaño de lote de prompt (menos = menos pico de RAM) */
  numBatch: number;
  /** Hilos de CPU recomendados (null = que Ollama decida) */
  numThreadSuggestion: (cores: number) => number | null;
  /** Tiempo que el modelo se queda cargado en RAM entre mensajes */
  keepAlive: string;
  /** Temperatura recomendada para este tamaño */
  temperature: number;
  /** Presupuesto de caracteres para todo el prompt (sistema + historial + archivos) */
  contextCharBudget: number;
  /** Turnos de historial que se conservan */
  historyTurns: number;
  /** Archivos abiertos que se inyectan en el prompt */
  maxOpenFiles: number;
  /** Caracteres máximos por archivo inyectado */
  maxFileChars: number;
  /** Explicación legible para el usuario (se muestra en el log de la IDE) */
  notes: string[];
  /**
   * v1.45.4 — true si es un modelo de NUBE RÁPIDO (flash/lite/mini/turbo/haiku…).
   * El servidor lo usa para enviar un prompt de sistema MÁS LIGERO (modo turbo):
   * menos ley, menos conocimiento del motor, menos manual de herramientas y
   * archivos de contexto más cortos → menos espera hasta la primera palabra.
   */
  nubeRapida: boolean;
}

/**
 * Patrones que declaran explícitamente un tamaño en el nombre.
 * v1.0.14 · ANTES exigía un separador `:@_-` antes del tamaño (`:0.5b`, `:7b`),
 * y un modelo CREADO CON MODELFILES con nombre propio sin ese separador
 * (`L2_01_gemma270m`, `L2_03_qwen0.5b`, `L1_arctic22m`) caía a `parseParamsB=null`
 * → tier «small» con num_ctx 16384 + 7 hilos para un modelo de 270 MB: la
 * congelación de la máquina en i5/16 GB. Ahora reconoce el tamaño embebido en
 * el nombre (270m, 0.5b, 22m…) con la MISMA semántica de unidades.
 */
const SIZE_IN_NAME = /(\d+(?:\.\d+)?)\s*([bBmM])(?!\w)/g;

/** Modelos que viven en la nube (no cuentan para la RAM del equipo) */
const REMOTE_HINTS = /(-cloud\b|:cloud\b|cloud\b)/i;

// v1.52.4 — FAMILIAS «SOLO NUBE» (modelos cerrados que NO existen en Ollama).
// RAÍZ de «Gemini antes respondía en 2 s y ahora tarda muchísimo / timeouts»:
// isRemote solo reconocía la palabra literal «cloud», así que «gemini-3.5-flash»
// NO se clasificaba como nube → caía en el perfil LOCAL «small» y, sobre todo,
// NO se le marcaba `nubeRapida`. Como esa bandera es la que le dice al servidor
// que arme un PROMPT LIVIANO, el modelo gratuito reciía el prompt pesado y se
// ahogaba («5 min sin datos»). Estas familias son cerradas y jamás corren en
// local, así que marcarlas remotas es seguro (no le roba lo «local» a ningún
// modelo de Ollama parecido — por eso NO se incluyen glm/deepseek/qwen/gemma,
// que sí pueden ser locales).
const CLOUD_ONLY_FAMILIES =
  /gemini|gpt-|chatgpt|\bo[134](?:-mini|-preview)?\b|claude|sonnet|opus|haiku|grok|sonar|perplexity|command-a\b|command-r-plus/i;

/**
 * Modelos que SÍ saben llamar herramientas de forma fiable.
 * Se mantiene la lista blanca de la v1.1 (es conservadora y evita falsos positivos)
 * pero ahora es condición NECESARIA, no suficiente: además hay que superar el
 * umbral de tamaño de abajo.
 */
// v1.57.2 — RANGO GENERACIONAL, no versión clavada. La lista era una foto de
// 2025 (`gemma3`, `qwen3`, `phi-4`…): cada salto de generación —Gemma 4, Qwen 4,
// Llama 4, Phi-5, GLM-6, Hermes 4— apagaba las herramientas EN SILENCIO (p. ej.
// `gemma4:31b-cloud`, que la propia IDE ofrece en su selector, caía a
// toolCapable=false → getToolsForModel()=[] → bloque «sin herramientas»). Se
// declara por rango para que el próximo salto pase sin tocar producción. El
// umbral de tamaño (TOOL_CAPABLE_MIN_PARAMS_B) sigue siendo condición necesaria:
// una generación nueva diminuta (`gemma4:1b`) conserva su protección.
// v1.67.0 · LA LISTA BLANCA SE LEÍA COMO «MISTRAL» Y NADIE MÁS.
// RAÍZ medida (no supuesta): `devstral-small-latest` y `codestral-latest` — los
// dos modelos más agénticos de Mistral, ambos con function-calling nativo —
// daban `toolCapable=false` porque la lista casaba la subcadena literal
// «mistral» y «co-de-stral» / «de-v-stral» NO la contienen. Consecuencia en
// cadena: getToolsForModel()=[] → el modelo recibe CERO herramientas, y hasta
// v1.67.0 tampoco el manual ni las leyes (viajaban dentro del manual). Es EXACTO
// el síntoma que Mario reporta: «Gemini podía con MCP y Mistral tuvo
// inconvenientes, y ese modelo debería saber usar esas herramientas». No era el
// modelo: era una expresión regular que no lo conocía.
// SE AÑADEN por familia declarada por el propio proveedor (mistral.ai/docs):
// devstral (agentico, tool-use nativo), codestral (fims+tools), mistral-small
// (ya entraba por «mistral», se explicita), magistral y voxtral.
const TOOL_CAPABLE_ALLOWLIST =
  /llama-?[3-9]|qwen[2-9]|mistral|devstral|codestral|magistral|voxtral|mixtral|command-r|gemma[3-9]|granite|hermes[3-9]|nemotron|functionary|phi-?[4-9]|nous-hermes|gpt-oss|deepseek|glm-?[4-9]/i;

/**
 * Por debajo de este tamaño, ofrecer herramientas empeora el resultado:
 * el modelo no respeta el esquema JSON, entra en bucle y no emite texto.
 * 4B es el umbral práctico observado con Ollama.
 */
const TOOL_CAPABLE_MIN_PARAMS_B = 4;

// v1.44.0 - RAIZ del 'modelo de nube sin manos' (sesion de Mario, msgs 8-19).
// Los modelos de nube no caian en TOOL_CAPABLE_ALLOWLIST (pensada para Ollama)
// ni en REMOTE_HINTS (solo 'cloud'): toolCapable=false -> getToolsForModel = []
// -> el modelo recibia CERO herramientas, inventaba un puente y entraba en el
// bucle 'hazlo/no puedo'. Se reconocen por FAMILIA para darles el permiso de
// herramientas. NO se marcan como remote (eso lo decide REMOTE_HINTS + el
// enrutador por proveedor; asi no se le roba lo 'local' a un Ollama parecido).
const CLOUD_TOOL_FAMILIES =
  /gemini|gpt-|chatgpt|claude|sonnet|opus|haiku|grok|sonar|perplexity|command-a|command-r-plus|qwen-max|qwen-plus|qwen-turbo|doubao|ernie|yi-large|moonshot|kimi-|minimax|glm-4|glm-5|glm-ocr|deepseek-chat|deepseek-reasoner|mistral-large|mistral-medium|pixtral-large/i;

// v1.45.2 — MODELOS DE NUBE "RÁPIDOS" (flash / lite / mini / nano / turbo /
// haiku / small / 8b / air / fast). RAÍZ medida en la sesión del usuario:
// `glm-4.5-flash` recibía el MISMO presupuesto gigante que un modelo grande
// (200000 chars, 30 turnos, nota "sin recortes agresivos"), así que el prompt
// crecía sin tope → latencia media 31 s / máx 123 s y, al acumularse el
// historial, el proveedor cortaba con «Prompt exceeds max length (code 1261)».
// A estos modelos se les da un presupuesto moderado y menos historial para que
// respondan rápido y NO desborden el límite del proveedor.
const CLOUD_FAST =
  /flash|flash-lite|\blite\b|\bmini\b|\bnano\b|\bturbo\b|haiku|\bsmall\b|[:@_-]8b\b|\bfast\b|\bair\b|o[134]-mini|gpt-4o-mini/i;

/** Pertenece a una familia de nube con function-calling fiable? */
export function esFamiliaNubeConHerramientas(modelName: string): boolean {
  return CLOUD_TOOL_FAMILIES.test(resolverAliasDeModelo(modelName));
}

// ============================================================
// v1.55.0 — VENTANA DE CONTEXTO REAL POR MODELO DE NUBE
// ------------------------------------------------------------
// RAÍZ (sesión 1791453571902 de Mario): el chat se cortaba una y otra vez
// («Prompt exceeds max length (code 1261)» con glm-4.5-flash, timeouts con
// gemini-flash) y, a la vez, el presupuesto de la nube RÁPIDA estaba clavado en
// 48000 chars / 12 turnos. Ese literal era conservador para NO desbordar, pero
// quedaba MUY por debajo de lo que estos modelos aguantan de verdad:
//   · GLM-4.5 / GLM-4.5-Flash / GLM-4.5-Air → 128K tokens de contexto
//   · GLM-4.6 / GLM-4.7                     → 200K tokens
//   · Familia Gemini Flash/Pro, GPT-4.1     → hasta 1M tokens
// Pedir solo 48000 chars (~13K tokens) a un modelo de 128K desperdiciaba más
// del 90 % de su ventana: el usuario «no podía ingresar mucho contenido».
//
// LA CURA: el presupuesto deja de ser un número a ojo y se DERIVA de la ventana
// REAL de cada familia, reservando margen para la salida y para las imágenes
// (que es lo que de verdad dispara el 1261, no el texto). Así se AMPLÍA la
// ventana de contexto utilizable sin volver a desbordar al proveedor.
//
// Fuente de los números: documentación oficial de Z.ai (GLM-4.5 = 128K,
// GLM-4.6/4.7 = 200K) y Google (Gemini 1.5/2.x = 1M). Verificado en octubre 2026.
// ============================================================

/** Ventana de contexto (en TOKENS) por familia de modelo de nube. El orden
 *  importa: lo más específico primero (glm-4.5v antes que glm-4.5). */
export const VENTANAS_CONTEXTO_NUBE: Array<[RegExp, number]> = [
  [/gemini|gpt-4\.1|gpt-5|chatgpt-4o/i, 1_000_000],
  [/glm-4\.7|glm-4\.6/i, 200_000],
  [/claude|sonnet|opus|haiku/i, 200_000],
  // Multimodales: ventana menor que su hermano de solo texto; se tratan aparte
  // ANTES de glm-4.5 para que «glm-4.5v» no herede los 128K del de texto.
  [/glm-4\.5v|glm-4v|glm-ocr|pixtral|vision/i, 64_000],
  [/glm-4\.5|glm-4\b|glm-4-|glm-5/i, 128_000],
  [/gpt-oss/i, 128_000],
  [/deepseek/i, 128_000],
  [/qwen-max|qwen-plus|qwen-turbo|qwen2\.5|qwen3/i, 128_000],
  // v1.57.2 — la ventana que la propia IDE declara en su selector para Gemma de
  // nube; sin esta línea `gemma4:31b-cloud` caía en el default prudente de 32K.
  [/gemma[3-9]/i, 64_000],
  [/gpt-4o|gpt-4\b|o[134]\b|mistral-large|mistral-medium/i, 128_000],
  [/grok/i, 128_000],
];

/** Ventana por defecto para un modelo de nube no catalogado: prudente (32K). */
export const VENTANA_NUBE_DEFECTO = 32_768;

/** Devuelve la ventana de contexto REAL (tokens) del modelo, resolviendo alias. */
export function ventanaContextoTokens(modelName: string): number {
  const efectivo = resolverAliasDeModelo(modelName);
  for (const [re, win] of VENTANAS_CONTEXTO_NUBE) {
    if (re.test(efectivo)) return win;
  }
  return VENTANA_NUBE_DEFECTO;
}

// Caracteres por token (PRUDENTE). El contenido de Mario mezcla español, código
// y logs; el ratio real ronda 3.5–4 car/token en español y baja a ~2.5 en
// código denso. JUSTIFICACIÓN DEL VALOR (v1.55.0): se usa 3.5 para quedar SIEMPRE
// por debajo del límite de tokens del proveedor aunque el contenido sea denso.
// Subirlo a 4 acercaría el prompt al borde y reabriría el «Prompt exceeds max
// length (1261)»; 3.5 deja ~12 % de colchón sobre el peor caso de la sesión.
const CARS_POR_TOKEN = 3.5;

// Fracción de la ventana reservada para la ENTRADA. El resto queda para la
// salida del modelo + system prompt + imágenes. La nube RÁPIDA reserva más
// (entrada 0.65) porque suele recibir capturas (≈1–2K tokens cada una, aun
// capadas a 1 en server.ts); la grande puede estirar más la entrada (0.72).
const FRACCION_ENTRADA_RAPIDA = 0.65;
const FRACCION_ENTRADA_GRANDE = 0.72;

// TOPE DURO del presupuesto en caracteres. JUSTIFICACIÓN DEL TOPE (v1.55.0):
// aunque Gemini declare 1M tokens, mandar 1M de chars por turno en un equipo de
// 8 GB dispara latencia y consumo sin beneficio real (Mario trabaja con logs y
// archivos, no con libros enteros). Se topa para que la ventana sea GRANDE pero
// no absurda: ~63K tokens de entrada en rápida, ~114K en grande.
const TOPE_BUDGET_RAPIDA = 220_000;
const TOPE_BUDGET_GRANDE = 400_000;

// Suelos: nunca por debajo del valor conservador anterior (evita regresión).
const SUELO_BUDGET_RAPIDA = 48_000;
const SUELO_BUDGET_GRANDE = 128_000;

// ============================================================
// v1.16.3.1 — MODO BAJO CONSUMO: keep_alive según el escalón MR
// ------------------------------------------------------------
// El informe MEJORA_MODO_BAJO_CONSUMO_v1 lo midió: con el modelo clavado en
// RAM (OLLAMA_KEEP_ALIVE=-1 del BAT) el pico sostenido de energía APAGABA el
// PC. keep_alive no es un lujo: en un equipo de 4-8 GB, un modelo residente
// 30 minutos son 30 minutos de RAM/VRAM y de vatios que nadie está usando.
//
// La escalera (fuente única, leída desde el motor en cada petición):
//   · nube                 → "10m"  (no toca la RAM local; residir es gratis)
//   · MR1/MR2 ≤1.7 B       → "3m"   (calienta poco, pero igual merece salir)
//   · hasta 7 B            → "5m"   (ventana útil de charla continua)
//   · pesado >7 B, RAM ≤8  → "0"    (NO puede quedar residente: se expulsa al
//                                     terminar; carga solo bajo demanda)
//   · pesado >7 B, RAM >8  → "5m"
// Si no se informa la RAM del equipo se asume la más conservadora para el
// escalón del usuario (8 GB): el error tolerable es expulsar de más, nunca
// dejar un 12B clavado en una máquina de 8 GB.
// ============================================================

/** Umbral de modelo pesado: por encima, la residencia se paga cara. */
export const PESADO_PARAMS_B = 7;
/** Umbral de equipo limitado (escalón MR1/MR2 de la casa). */
export const RAM_LIMITADA_GB = 8;
/** Umbral de modelo diminuto (escalón MR1/MR2 con modelo ≤1.7 B). */
export const DIMINUTO_PARAMS_B = 1.7;

/** Caducidad residente para un modelo, según el escalón MR del equipo. */
export function keepAliveBajoConsumo(paramsB: number | null, remote: boolean, ramGb?: number): string {
  if (remote) return "10m";
  const ram = typeof ramGb === "number" && ramGb > 0 ? ramGb : RAM_LIMITADA_GB;
  // v1.0.19 · EL MODELO SE DESCARGA SOLO — RAÍZ (sesión 1794607399689, 14/11):
  // Mario lo dijo tal cual: «cargastes y te descargastes de la ram barias veces».
  // Con «3m» el modelo chico se expulsaba entre turnos de una charla normal, y
  // en CPU pura cada recarga cuesta ~2 minutos de primera palabra. Con «5m» (la
  // misma ventana que un ≤7 B) la conversación deja de pagar la carga entera.
  // «0» sigue significando «descargar al terminar»: eso no se toca.
  if (paramsB !== null && paramsB <= DIMINUTO_PARAMS_B) return "5m";
  if (paramsB !== null && paramsB > PESADO_PARAMS_B) return ram <= RAM_LIMITADA_GB ? "0" : "5m";
  return "5m";
}

/**
 * La demanda EXPLÍCITA de residencia (botón Precalentar / warmup) manda sobre
 * el ahorro: si la política habría dicho "0" (no residente), el pedido activo
 * del usuario carga el modelo y lo deja 5m. Nada más se queda clavado.
 */
export function keepAliveExplicito(ahorro: string): string {
  return ahorro === "0" ? "5m" : ahorro;
}

/**
 * v1.57.1 · sin-manos-no-narras — ¿Este turno debe correr en MODO LIVIANO local?
 * ============================================================================
 * La IIFE vieja en server.ts respondía con `RAM_GB <= 8 || tier micro/tiny`, y
 * eso dejaba sin herramientas a CUALQUIER modelo Ollama en un equipo de ≤8 GB,
 * incluso a los de la nube (que no consumen RAM local). Caso real: NEMESIS:latest
 * (alias de gpt-oss:120b-cloud) en una PC de 8 GB → activeTools = [] → el bucle
 * de agente jamás corrió y el modelo se puso a NARRAR ejecuciones falsas.
 *
 * Regla nueva: un modelo REMOTO (nube) NUNCA está liviano — aunque el equipo sea
 * chico, su cómputo no toca esta máquina. El env CN_LOCAL_LIVIANO (=1/=0) sigue
 * mandando sobre todo, igual que antes. Lógica pura: el llamador pasa el perfil,
 * la RAM medida y el valor del env (si se omite `forzado`, se lee del proceso).
 */
export function modoLivianoLocal(perfil: ModelProfile, ramGb: number, forzado?: string): boolean {
  const f = String(forzado ?? process.env.CN_LOCAL_LIVIANO ?? "").trim();
  if (f === "1") return true;
  if (f === "0") return false;
  if (perfil.remote) return false;
  return ramGb <= RAM_LIMITADA_GB || perfil.tier === "micro" || perfil.tier === "tiny";
}

/** Extrae el tamaño declarado en el nombre del modelo, si lo hay. */
export function parseParamsB(modelName: string): number | null {
  if (!modelName) return null;
  // v1.0.14 — se queda con el ÚLTIMO token tipo-tamaño del nombre (más fiable
  // que el primero: `gemma3:270m` → 270m, no el "3" de la versión; y nombres
  // embebidos como `L2_01_gemma270m` ahora sí devuelven 0.27). Si no hay
  // tamaño, devuelve null tal cual (el cubo «desconocido»).
  let ultimo: RegExpMatchArray | null = null;
  for (const m of modelName.matchAll(SIZE_IN_NAME)) ultimo = m;
  if (!ultimo) return null;
  const value = parseFloat(ultimo[1]);
  if (Number.isNaN(value)) return null;
  return ultimo[2].toLowerCase() === "b" ? value : value / 1000;
}

// ============================================================
// v8.0.1 — MODELOS RENOMBRADOS: el agujero por el que se cuela un 120B
// ------------------------------------------------------------
// DEFECTO REAL, cazado revisando la idea «local para lo rápido, 120B-cloud para
// lo pesado». Toda la clasificación de arriba se apoya en el NOMBRE del modelo:
//   · `REMOTE_HINTS` busca la palabra «cloud»   → decide «no consume RAM local»
//   · `SIZE_IN_NAME` busca «:120b»              → decide el tier y num_ctx
//   · `TOOL_CAPABLE_ALLOWLIST` busca «gpt-oss»  → decide si hay bucle de agente
//
// Y Ollama permite renombrar: `ollama cp gpt-oss:120b-cloud NEMESIS:latest`, o
// un Modelfile propio con otro nombre. Ese modelo sigue siendo el 120B de la
// nube, pero el motor lo lee como «modelo local de tamaño desconocido»:
//
//   tier = "small" · num_ctx 8192 (en vez de 32768) · num_predict 1200 (¡le
//   corta la respuesta al 120B!) · keep_alive 30m · temperatura 0.45 ·
//   toolCapable = FALSE (la lista blanca no reconoce «NEMESIS»)
//
// Es decir: el usuario paga la latencia de un 120B y recibe el trato de un
// modelo diminuto, sin herramientas y con la salida truncada. Y no falla en
// silencio de forma obvia: simplemente «el modelo contesta peor de lo que
// debería», que es el peor de los síntomas porque no parece un bug.
//
// LA CURA: una tabla de alias explícita. El motor no puede adivinar qué hay
// detrás de un nombre propio, pero el usuario SÍ lo sabe, y decirlo cuesta una
// línea. `resolverAliasDeModelo()` traduce antes de clasificar, así que un
// alias hereda TODO el perfil de su canónico (nube, tamaño, herramientas,
// contexto y keep_alive) sin tocar el resto del módulo.
// ============================================================
const ALIAS_DE_MODELO: Record<string, string> = {
  // `nemesis:latest` = «un gpt-oss modificado» renombrado por el usuario.
  // Se declara aquí porque es el caso que originó el defecto; para cualquier
  // otro renombre, una línea basta (o `registrarAliasDeModelo()` en caliente).
  "nemesis:latest": "gpt-oss:120b-cloud",
  nemesis: "gpt-oss:120b-cloud",
};

/** Declara (o corrige) el canónico del que hereda perfil un modelo renombrado. */
export function registrarAliasDeModelo(alias: string, canonico: string): void {
  const a = String(alias || "").trim().toLowerCase();
  const c = String(canonico || "").trim();
  if (!a || !c) return;
  ALIAS_DE_MODELO[a] = c;
}

/**
 * Traduce un nombre a su canónico si está declarado.
 * Devuelve el MISMO nombre cuando no hay alias: la función es transparente para
 * los modelos normales, que son la inmensa mayoría.
 */
export function resolverAliasDeModelo(modelName: string): string {
  const n = String(modelName || "").trim().toLowerCase();
  if (!n) return modelName;
  if (ALIAS_DE_MODELO[n]) return ALIAS_DE_MODELO[n];
  // «nemesis» declarado, llega «nemesis:v2» → hereda por prefijo de familia.
  for (const [alias, canonico] of Object.entries(ALIAS_DE_MODELO)) {
    const base = alias.split(":")[0];
    if (base && (n === base || n.startsWith(base + ":"))) return canonico;
  }
  return modelName;
}

/** ¿Este nombre es un alias declarado? Para poder explicárselo al usuario. */
export function aliasDeModelo(modelName: string): string | null {
  const canonico = resolverAliasDeModelo(modelName);
  return canonico === modelName ? null : canonico;
}

// ════════════════════════════════════════════════════════════════════════════
// v1.92.0 · LOS ENRUTADORES VIRTUALES Y LA NUBE DE MISTRAL (pedido de Mario,
// 30/10: «revisa que todos puedan usar herramientas… los más seguros son ZAI GLM
// 4.5 FLASH, GEMINI desde el 3.5 AL 3.8 FLASH, MISTRAL los gratuitos y OPENROUTER
// AUTO Y FREE»).
// MEDIDO antes de tocar nada (perfil real de getModelProfile):
//   · glm-4.5-flash / gemini-3.5…3.8-flash → toolCapable=true, remote=true  ✔
//   · mistral-small-latest / devstral / codestral → toolCapable=true pero
//     remote=false y tier=small → recibía el presupuesto de un modelo LOCAL
//     (ventana e historial recortados) siendo una API de 128K.
//   · openrouter/auto y openrouter/free → remote=false, tier=small Y
//     toolCapable=false: ni presupuesto de nube ni manos nativas.
// LA CURA es distinta para cada defecto, y esa diferencia es el punto:
//  · La nube de Mistral (ids `-latest`/`-preview`) sí es nube: presupuesto de
//    nube. No se le toca `toolCapable`, que ya estaba bien.
//  · Un ENRUTADOR no es un modelo: `openrouter/auto` elige el destino en el
//    momento de la llamada y `openrouter/free` enruta a lo que esté libre. Su
//    capacidad de function-calling es DESCONOCIDA por construcción, no por
//    descuido. Marcarlo `toolCapable=true` sería mentirle al lazo nativo (y
//    v1.58.2 midió que justo ahí el modelo escribe la llamada como TEXTO). Así
//    que se lo declara nube a los efectos del PRESUPUESTO y se lo deja en
//    `capacidadSinVerificar`, que es el camino que ya le sirve el juego mínimo de
//    herramientas y el contrato de acción por texto. Nada de prometer una mano
//    que no se sabe tener: eso es exactamente lo que fabrica el ✔ inventado.
// ═════════════════════════════════════════════════════════════════════════════
const ENRUTADORES_VIRTUALES = /^(?:openrouter\/(?:auto|free)|openrouter\/[^/]+:free)$/i;
/** Prefijos de proveedor de nube cuando el nombre del modelo los lleva adentro
 *  (los catálogos de Together/Fireworks son `organización/Modelo-Versión`). */
const PREFIJO_NUBE = /^(?:openrouter|groq|together|fireworks|mistral|openai|anthropic|google|x-ai|cohere|deepseek)\//i;
/** Familia Mistral: sus ids de API siempre terminan en `-latest`/`-preview`;
 *  un modelo LOCAL de Ollama se llama `mistral`, `mistral:7b` (con tag) y no
 *  coincide. Por eso no basta «contiene mistral». */
const API_MISTRAL =
  /^(?:(?:mistral|devstral|codestral|pixtral|magistral|voxtral|leanstral)[a-z0-9._-]*-(?:latest|preview)|open-(?:mistral|codestral)-[a-z0-9.-]+)$/i;

/** ¿Es un ID de enrutador virtual de la nube (auto/free de OpenRouter)? */
export function esEnrutadorDeNube(modelName: string): boolean {
  return ENRUTADORES_VIRTUALES.test(String(modelName ?? "").trim());
}

function isRemote(modelName: string): boolean {
  const efectivo = resolverAliasDeModelo(modelName);
  // v1.56.6 — Los modelos glm/deepseek/qwen SIN tag («glm-4.5-flash») son del
  // API de nube (el servidor ya los enruta a Z.ai); los de Ollama viajan SIEMPRE
  // con tag («glm-ocr:latest», «qwen2.5:0.5b») y siguen siendo locales. Sin
  // esto, la nube gratuita de fábrica caía al tier «small» local (24000/8) y se
  // perdía la ampliación de ventana de v1.55.0 (raíz del rojo de ventanaContexto).
  const esApiNube = /^(glm|deepseek|qwen)\b/.test(efectivo) && !/[:@]/.test(efectivo);
  // v1.52.4 — remoto por palabra clave («…cloud») O por familia solo-nube
  // (gemini/gpt/claude/…): así un «gemini-3.5-flash» vuelve a ser tier «cloud»
  // con `nubeRapida`, y el servidor le arma el prompt liviano → responde rápido.
  // v1.92.0 · enrutadores virtuales (openrouter/auto, openrouter/free), ids con
  // prefijo de proveedor de nube (`meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`
  // de Together, `accounts/fireworks/models/…`) y la API de Mistral (`…-latest`).
  // Ninguno corre en Ollama: dejarlos en `small` les daba ventana e historial de
  // modelo local, que es el «se le corta la respuesta» que no parece un bug.
  return (
    REMOTE_HINTS.test(efectivo) ||
    CLOUD_ONLY_FAMILIES.test(efectivo) ||
    esApiNube ||
    esEnrutadorDeNube(efectivo) ||
    PREFIJO_NUBE.test(efectivo) ||
    API_MISTRAL.test(efectivo) ||
    // v1.0.28 — ids que el proveedor publica SIN prefijo (Groq `llama-3.3-70b-versatile`,
    // Cerebras `gpt-oss-120b`) y Workers AI de Cloudflare (`@cf/...`). Sin esto
    // caían en `small` local: ventana e historial de Ollama y CERO herramientas.
    ranuraDirectaDe(efectivo) !== null
  );
}

/** Clasifica por tamaño. Los "nano" reales (<1B) y hasta 1.6B son micro. */
export function getTier(paramsB: number | null, remote: boolean): ModelTier {
  if (remote) return "cloud";
  if (paramsB === null) return "small"; // desconocido: tratamos como pequeño por seguridad
  if (paramsB <= 1.6) return "micro";
  if (paramsB <= 3.5) return "tiny";
  if (paramsB <= 8) return "small";
  if (paramsB <= 34) return "medium";
  return "large";
}

/**
 * ============================================================
 * v1.57.14 — LOS DIALES DEL PANEL PRO LLEGAN AL MOTOR (y el motor los cobra)
 * ------------------------------------------------------------
 * EL HUECO, medido en el fuente y no en la memoria: `proSettings.ts` declara
 * `ai.contextSize` (default 8192) y `ai.keepAlive` (default "30m"), el panel
 * Pro los pinta con la promesa textual «num_ctx de Ollama. Más contexto = más
 * RAM.» y «keep_alive: evita recargar el modelo»… y NADIE los lee.
 * `applyProSettings` solo toca apariencia; el `StreamConfig` que arma App.tsx no
 * los incluye; y el camino directo del navegador clavaba `keep_alive: "30m"` a
 * mano, pisando la escalera MR de v1.16.3.1. Son reguladores mudos — la misma
 * enfermedad que la suite `pensamientoChat` juró no volver a tolerar, pero en
 * la pestaña Pro.
 *
 * LA CURA tiene dos mitades, y la segunda es la que hace segura la primera:
 *   1. el dial se guarda en ESTA fuente única y `getModelProfile` lo aplica, así
 *      que todas las puertas (chat, bucle de agente, warmup, medición, puente
 *      UDS, navegador directo) heredan el valor sin copiar la política; y
 *   2. el valor se topa con `techoContexto`: el slider llega a 131072, que sobre
 *      16 GB son ~19 GB de KV-cache. Un dial sin techo no es libertad: es el
 *      «se corta la comunicación» del diary del 14/10 escrito a mano por el
 *      usuario. Se recorta y se dice por qué, nunca en silencio.
 *
 * El dial SOLO manda sobre los modelos locales: la nube no paga KV en esta
 * máquina y su residencia es un número sin efecto.
 * ============================================================
 */
export interface PreferenciaMotor {
  /** `num_ctx` que pidió el usuario, ya validado. */
  numCtx?: number;
  /** `keep_alive` que pidió el usuario (texto tal cual: "5m", "30m", "-1", "0"). */
  keepAlive?: string;
  /** `top_p` del panel Pro (0-1). */
  topP?: number;
  /** `top_k` del panel Pro (entero ≥ 1). */
  topK?: number;
  /** `num_predict` del panel Pro: «Máx. tokens de salida». -1 = sin tope. */
  numPredict?: number;
}

/** Formas que Ollama acepta como duración; nada de esto se inventa aquí. */
const FORMA_KEEP_ALIVE = /^(-?\d+(\.\d+)?|[0-9]+[smh])$/;
/** Los valores que ofrece el panel Pro; se validan contra esta lista. */
export const KEEPALIVE_PANEL_PERMITIDO = ["5m", "30m", "-1", "0"] as const;

let PREFERENCIA_MOTOR: PreferenciaMotor = {};

/**
 * Guarda la preferencia del usuario. Devuelve el motivo del rechazo en vez de
 * callar: si el panel manda `num_ctx: 0` o un keep_alive con espacio, quien
 * opera tiene que ver cuál es el problema, no un dial que no hace nada.
 */
export function fijarPreferenciaMotor(p: unknown): { ok: boolean; motivo?: string } {
  if (!p || typeof p !== "object") return { ok: false, motivo: "la preferencia no es un objeto" };
  const bruto = p as Record<string, unknown>;
  const nueva: PreferenciaMotor = {};
  if (bruto.numCtx !== undefined && bruto.numCtx !== null && bruto.numCtx !== "") {
    const n = Number(bruto.numCtx);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 512 || n > 1_048_576) {
      return { ok: false, motivo: `«num_ctx» tiene que ser un entero entre 512 y 1048576 (llegó ${String(bruto.numCtx)})` };
    }
    nueva.numCtx = n;
  }
  if (bruto.keepAlive !== undefined && bruto.keepAlive !== null && bruto.keepAlive !== "") {
    const k = String(bruto.keepAlive).trim();
    if (!FORMA_KEEP_ALIVE.test(k)) {
      return { ok: false, motivo: `«keep_alive» no tiene forma de duración (llegó "${String(bruto.keepAlive)}"); se aceptan ${KEEPALIVE_PANEL_PERMITIDO.join(", ")} o segundos` };
    }
    nueva.keepAlive = k;
  }
  // Los tres diales de muestreo del panel Pro. Se validan uno por uno y se
  // rechaza con NOMBRE: un slider que no hace nada porque llegó "9" de top_p
  // y se guardó a medias es exactamente el regulador mudo que venimos a matar.
  const range = (clave: "topP" | "topK" | "numPredict", min: number, max: number, entero: boolean): string | null => {
    const v = bruto[clave];
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || (entero && !Number.isInteger(n)) || n < min || n > max) {
      return `«${clave}» fuera de rango ${min}…${max} (llegó ${String(v)})`;
    }
    (nueva as Record<string, unknown>)[clave] = n;
    return null;
  };
  for (const [clave, min, max, entero] of [
    ["topP", 0.05, 1, false],
    ["topK", 1, 2000, true],
    ["numPredict", -1, 1_048_576, true],
  ] as Array<["topP" | "topK" | "numPredict", number, number, boolean]>) {
    const mal = range(clave, min, max, entero);
    if (mal) return { ok: false, motivo: mal };
  }
  PREFERENCIA_MOTOR = nueva;
  return { ok: true };
}

export function leerPreferenciaMotor(): PreferenciaMotor {
  return { ...PREFERENCIA_MOTOR };
}

/** Devuelve el mando a la escalera de la casa (lo usa la suite de pruebas). */
export function resetearPreferenciaMotor(): void {
  PREFERENCIA_MOTOR = {};
}

export interface AplicacionPreferencia {
  numCtx: number;
  keepAlive: string;
  /** true si el resultado difiere de lo que habría dictado la escalera sola. */
  cambio: boolean;
  motivo: string;
}

/**
 * Aplica el dial y el techo de RAM sobre los números de la escalera. PURA salvo
 * por leer `PREFERENCIA_MOTOR`: no toca `os` ni la red, así que la prueba puede
 * inyectar la preferencia y verificar el recorte con la máquina fingida.
 */
export function aplicarPreferenciaMotor(
  numCtxEscalera: number,
  keepAliveEscalera: string,
  remote: boolean,
  ramGb?: number,
  preferencia?: PreferenciaMotor
): AplicacionPreferencia {
  const pref = preferencia ?? PREFERENCIA_MOTOR;
  if (remote) {
    return { numCtx: numCtxEscalera, keepAlive: keepAliveEscalera, cambio: false, motivo: "" };
  }
  const pedido = typeof pref.numCtx === "number" ? pref.numCtx : numCtxEscalera;
  const veredicto = techoDeContexto({ numCtxPedido: pedido, ramGb });
  // v1.0.17 — «Siempre» del panel entra como "-1" y Ollama contesta
  // `HTTP 400: time: missing unit in duration "-1"`. Se normaliza AQUÍ, en el
  // único punto de salida del valor, para no dejar ninguna puerta sin curar.
  const keep = traducirKeepAlive(
    typeof pref.keepAlive === "string" && pref.keepAlive ? pref.keepAlive : keepAliveEscalera
  );
  const cambio = veredicto.numCtx !== numCtxEscalera || keep !== keepAliveEscalera;
  const partes: string[] = [];
  if (typeof pref.numCtx === "number") {
    partes.push(veredicto.recortado
      ? `Tu dial de contexto pedía ${pref.numCtx} y el motor manda ${veredicto.numCtx}: ${veredicto.motivo}`
      : `Contexto según tu dial: ${veredicto.numCtx} tokens (~${veredicto.costoFinalGb ?? "?"} GB de KV-cache).`);
  } else if (veredicto.recortado) {
    partes.push(`La escalera pedía ${numCtxEscalera} y se topó a ${veredicto.numCtx}: ${veredicto.motivo}`);
  }
  if (typeof pref.keepAlive === "string" && pref.keepAlive !== keepAliveEscalera) {
    partes.push(`Residencia según tu dial: ${keep} (la escalera MR habría dicho ${keepAliveEscalera}).`);
  }
  return { numCtx: veredicto.numCtx, keepAlive: keep, cambio, motivo: partes.join(" · ") };
}

/**
 * Perfil completo de rendimiento.
 * @param modelName nombre tal cual lo envía el usuario a Ollama
 * @param ramGb RAM total del equipo (opcional; si es <=8 se aplican recortes extra)
 */
export function getModelProfile(modelName: string, ramGb?: number): ModelProfile {
  // v8.0.1 — Se clasifica por el CANÓNICO, no por el nombre pintado. Todo lo que
  // sigue (nube, tamaño, lista blanca, notas) usa `efectivo`, así que un alias
  // hereda el perfil completo y no hay dos caminos que puedan divergir.
  const efectivo = resolverAliasDeModelo(modelName);
  const alias = efectivo === modelName ? null : efectivo;

  const remote = isRemote(efectivo);
  const paramsB = parseParamsB(efectivo);
  const tier = getTier(paramsB, remote);
  const lowRam = typeof ramGb === "number" && ramGb > 0 && ramGb <= 8;

  // ¿Herramientas? Lista blanca + tamaño mínimo. Los remotos grandes siempre pueden.
  // v1.0.28 — además de la lista de familias, el id directo (Groq/Cerebras) y el
  // de Workers AI ya declaran familia: si la familia admite bucle de
  // herramientas, se le da, sin inventar permiso para un id desconocido.
  const ranuraDirecta = ranuraDirectaDe(efectivo);
  const esNubeConHerramientas =
    CLOUD_TOOL_FAMILIES.test(efectivo) ||
    (ranuraDirecta !== null && familiaConHerramientas(ranuraDirecta.familia));
  const passesAllowlist = TOOL_CAPABLE_ALLOWLIST.test(efectivo) || esNubeConHerramientas;
  const bigEnough = paramsB === null ? tier !== "micro" && tier !== "tiny" : paramsB >= TOOL_CAPABLE_MIN_PARAMS_B;
  // Las familias de nube (gemini/gpt/claude/…) son tool-capable aunque su
  // nombre no declare tamaño: su function-calling es fiable y no gastan RAM
  // local, así que el umbral de tamaño no les aplica (RAÍZ v1.44.0).
  const toolCapable = esNubeConHerramientas || (passesAllowlist && bigEnough);

  const notes: string[] = [];
  if (ranuraDirecta) notes.push(`nube directa: ${ranuraDirecta.proveedor} · ${ranuraDirecta.motivo}`);

  let numCtx: number;
  let numPredict: number;
  let numBatch: number;
  // v1.16.3.1 — MODO BAJO CONSUMO: la escalera MR es la FUENTE ÚNICA de
  // residencia; ningún caso del switch puede volver a fijar un literal.
  const keepAlive = keepAliveBajoConsumo(paramsB, remote, ramGb);
  let temperature: number;
  let contextCharBudget: number;
  let historyTurns: number;
  let maxOpenFiles: number;
  let maxFileChars: number;
  // v1.45.4 — bandera de nube rápida (flash/lite/mini…): solo la activa el caso
  // "cloud". Expuesta en el perfil para que el servidor arme un prompt liviano.
  let nubeRapida = false;

  switch (tier) {
    case "micro":
      numCtx = 2048;
      numPredict = 400;
      numBatch = 128;
temperature = 0.35;
      contextCharBudget = 6000;
      historyTurns = 4;
      maxOpenFiles = 1;
      maxFileChars = 1500;
      notes.push("Modelo micro (<1.6B): sin herramientas, contexto 2048 y salida ≤400 tokens para que no se ahogue.");
      break;
    case "tiny":
      numCtx = 4096;
      numPredict = 700;
      numBatch = 128;
temperature = 0.4;
      contextCharBudget = 12000;
      historyTurns = 6;
      maxOpenFiles = 2;
      maxFileChars = 2500;
      notes.push("Modelo pequeño (1.6B-3.5B): sin herramientas, contexto 4096.");
      break;
    case "small":
      // v1.57.6 — con herramientas activas (que es el caso en ≥16 GB, ya que
      // el umbral `lowRam` sigue clavado en ≤8 GB), el superPrompt + los
      // tool-schemas del agente ocupan fácil 8-12K tokens ANTES de la charla
      // del usuario. Con num_ctx=8192 Ollama trunca en silencio y el modelo
      // «no se entera» de las herramientas: el síntoma real de Mario fue que
      // en cmd el mismo qwen3:4b respondía en segundos y en CerebroNico
      // «se cortaba». Con 16 GB hay aire para 16384 (KV ~3 GB + pesos ~3 GB).
      numCtx = lowRam ? 4096 : 16384;
      numPredict = 1200;
      numBatch = 256;
 temperature = 0.45;
      contextCharBudget = lowRam ? 16000 : 24000;
      historyTurns = 8;
      maxOpenFiles = 3;
      maxFileChars = 4000;
      notes.push("Modelo local ≤8B: contexto amplio cuando hay herramientas; con ≤8 GB se repliega a 4096.");
      break;
    case "medium":
      numCtx = lowRam ? 8192 : 16384;
      numPredict = 2000;
      numBatch = 512;
temperature = 0.5;
      contextCharBudget = lowRam ? 40000 : 60000;
      historyTurns = 14;
      maxOpenFiles = 4;
      maxFileChars = 6000;
      notes.push("Modelo medio (8B-34B): contexto amplio; con 8 GB espera lentitud.");
      break;
    case "large":
      numCtx = 32768;
      numPredict = -1;
      numBatch = 512;
temperature = 0.5;
      contextCharBudget = 200000;
      historyTurns = 30;
      maxOpenFiles = 6;
      maxFileChars = 12000;
      notes.push("Modelo grande local: cuidado con la RAM, el prompt largo dispara el tiempo de espera.");
      break;
    case "cloud":
    default: {
      numCtx = 32768;
      numPredict = -1;
      numBatch = 512;
      temperature = 0.5;
      // v1.45.2 → SUPERSEDED por v1.55.0: antes el presupuesto era un par de
      // literales (rápido 48000/12, grande 128000/20). Funcionaba para NO
      // desbordar, pero infrautilizaba la ventana real del modelo. Ahora se
      // deriva de esa ventana (ver bloque de abajo), conservando los suelos.
      nubeRapida = CLOUD_FAST.test(efectivo);
      // v1.55.0 — presupuesto DERIVADO de la ventana REAL del modelo (ya no un
      // literal a ojo): se amplia hasta donde el modelo aguanta, reservando
      // margen para salida + imágenes y con un tope duro para no disparar la
      // latencia en 8 GB. Ver la cabecera «VENTANA DE CONTEXTO REAL» arriba.
      const ventanaTokens = ventanaContextoTokens(efectivo);
      const fraccion = nubeRapida ? FRACCION_ENTRADA_RAPIDA : FRACCION_ENTRADA_GRANDE;
      const topeBudget = nubeRapida ? TOPE_BUDGET_RAPIDA : TOPE_BUDGET_GRANDE;
      const sueloBudget = nubeRapida ? SUELO_BUDGET_RAPIDA : SUELO_BUDGET_GRANDE;
      const presupuestoCrudo = Math.floor(ventanaTokens * fraccion * CARS_POR_TOKEN);
      contextCharBudget = Math.max(sueloBudget, Math.min(topeBudget, presupuestoCrudo));
      // Turnos de historial proporcionales al presupuesto (~1 turno ≈ 4000 chars),
      // con suelo (los valores previos) y techo (no reconstruir 100 turnos).
      historyTurns = Math.min(
        nubeRapida ? 40 : 60,
        Math.max(nubeRapida ? 12 : 20, Math.round(contextCharBudget / 4000))
      );
      maxOpenFiles = nubeRapida ? 5 : 8;
      maxFileChars = nubeRapida ? 16000 : 24000;
      const ventanaK = Math.round(ventanaTokens / 1000);
      notes.push(
        nubeRapida
          ? `Modelo de nube RÁPIDO (flash/lite/mini/turbo/haiku…): ventana real ≈${ventanaK}K tokens → presupuesto AMPLIADO a ${contextCharBudget} chars y ${historyTurns} turnos (antes 48000/12). Se reserva margen para la salida y las imágenes para no superar el límite del proveedor (evita «Prompt exceeds max length»).`
          : `Modelo de nube grande: ventana real ≈${ventanaK}K tokens → presupuesto AMPLIADO a ${contextCharBudget} chars y ${historyTurns} turnos (antes 128000/20), con tope duro para no disparar la latencia.`
      );
      break;
    }
  }

  if (lowRam && tier !== "cloud") {
    notes.push("Equipo con ≤8 GB de RAM: num_batch reducido y contexto ajustado para evitar swap.");
  }
  if (paramsB !== null && paramsB < TOOL_CAPABLE_MIN_PARAMS_B && passesAllowlist) {
    notes.push(
      `Modo sin herramientas: "${modelName}" (${paramsB}B) no soporta tool-calling de forma fiable; se enviará directo a streaming.`
    );
  }
  if (!passesAllowlist && !esNubeConHerramientas && bigEnough) {
    // v1.23.0 · NOTA HONESTA por nombre. Un modelo con tamaño de sobra pero
    // ausente de la lista blanca recibía CERO herramientas sin que nadie se lo
    // dijera: el usuario veía un agente mudo que «no sabe hacer cosas» y la
    // causa real era una regex de nombres. Ahora la nota se nombra a sí misma.
    // v1.57.2 — cayó la restricción `!remote`: un modelo de NUBE sin reconocer
    // también quedaba sin manos y sin una sola línea que lo dijera (doble
    // silencio). Ahora la nota honesta aplica también a la nube.
    notes.push(
      `Atención: "${modelName}" tiene tamaño suficiente pero su nombre NO está en la lista blanca de tool-calling: recibirá cero herramientas y no podrá escribir archivos ni ejecutar comandos. Si el modelo soporta herramientas, añadí su nombre a TOOL_CAPABLE_ALLOWLIST en src/engine/modelTiers.ts.`
    );
  }
  if (alias) {
    // Sin esta nota, el usuario vería «tier: cloud» en un modelo que él cree
    // local y no sabría por qué. La explicación es parte del arreglo.
    notes.push(
      `"${modelName}" está declarado como alias de "${alias}": hereda su perfil (${tier}) y no se le aplican los recortes de un modelo local.`
    );
  }

  // v1.57.14 — el dial del panel Pro, topado por la RAM que reporta la máquina.
  // Se aplica ACÁ y no en cada llamada para que no pueda haber dos caminos: la
  // escalera decide, la preferencia ajusta, el techo cobra.
  const aplicado = aplicarPreferenciaMotor(numCtx, keepAlive, remote, ramGb);
  if (aplicado.motivo) notes.push(`⚙️ Contexto: ${aplicado.motivo}`);

  return {
    tier,
    paramsB,
    remote,
    toolCapable,
    aliasDe: alias,
    numCtx: aplicado.numCtx,
    numPredict,
    numBatch,
    keepAlive: aplicado.keepAlive,
    ctxEscalera: numCtx,
    ctxRecortado: aplicado.numCtx !== numCtx,
    keepAliveEscalera: keepAlive,
    temperature,
    contextCharBudget,
    historyTurns,
    maxOpenFiles,
    maxFileChars,
    notes,
    nubeRapida,
    // 1 hilo libre para la interfaz: si Ollama acapara todos los núcleos, la UI
    // se congela y parece que "no contesta" aunque el modelo esté trabajando.
    numThreadSuggestion: (cores: number) => {
      if (!cores || cores <= 0) return null;
      // Los modelos diminutos no escalan bien con muchos hilos: repartir 8 hilos
      // entre capas de 400 MB añade sincronización y empeora la latencia.
      if (tier === "micro" || tier === "tiny") return Math.max(2, Math.min(cores - 1, 4));
      return Math.max(2, Math.min(cores - 1, 12));
    },
  };
}

/** Atajo booleano usado por el servidor y el cliente. */
export function shouldRunAgentLoop(modelName: string): boolean {
  return getModelProfile(modelName).toolCapable;
}

/**
 * v1.68.0 · DEFECTO 5 DEL MANUAL — «nombre desconocido» NO es «sin capacidad».
 * ────────────────────────────────────────────────────────────────────────────
 * `toolCapable` se decide por regex del nombre (TOOL_CAPABLE_ALLOWLIST +
 * CLOUD_TOOL_FAMILIES). Eso es correcto para un modelo LOCAL de Ollama, cuyo
 * tamaño y familia sí se leen en la etiqueta. No lo es para un endpoint `custom`
 * o un alias nuevo: ahí el nombre no dice nada, y la consecuencia era brutal —
 * `getToolsForModel()` devolvía `[]`, el modelo no recibía ni manos ni manual, y
 * se inventaba las suyas (así nació el «gemma4:31b-cloud» del diario y el
 * «consultarEscritorioMCP» de la sesión de Mario).
 *
 * Esta función separa los dos casos que la regex mezclaba:
 *   · VERIFICADO-NO  → sí sabemos que no puede (chico por tamaño o por tramo).
 *   · SIN VERIFICAR  → no lo sabemos: no hay familia, no hay tamaño, no hay nada.
 *
 * El segundo caso ya no se castiga con cero herramientas: el servidor le sirve el
 * juego mínimo (`HUESO_DE_OBRA`) y lo registra en el log. Capacidad sin verificar
 * se gestiona con prudencia, no con silencio.
 */
export function capacidadSinVerificar(modelName: string): boolean {
  const crudo = String(modelName ?? "").trim();
  // Un endpoint custom sin nombre (literal "default", cadena vacía) no informa nada.
  if (!crudo || /^default$/i.test(crudo)) return true;
  const efectivo = resolverAliasDeModelo(crudo);
  // v1.92.0 · Un ENRUTADOR es incógnita por definición: `openrouter/auto` decide
  // el destino al vuelo y `openrouter/free` enruta a lo que esté libre, así que
  // NADIE puede afirmar que el modelo de abajo hace function-calling nativo. Al
  // clasificarlos como nube (tier «cloud») el chequeo de `tier === "small"` de
  // abajo dejaría de aplicar y se servirían CERO herramientas — justo el «modelo de
  // nube sin manos» de v1.44.0 pero al revés. Se declara la incógnita en la puerta:
  // así reciben el juego mínimo por canal nativo Y el contrato de acción por texto.
  // v1.98.0 · la casa NO asume que un enrutador haga function-calling, pero el
  // usuario puede DECLARARLO: `CN_RUTER_CON_HERRAMIENTAS=1` dice «yo sé que mi
  // enrutador soporta tools, dale el catálogo completo». Configurar explícito
  // sobre adivinar (preferencia de la casa): sin la variable, la conducta sigue
  // siendo la de v1.92.0 — juego mínimo por canal nativo + contrato de acción por texto.
  if (esEnrutadorDeNube(efectivo)) return !/^(1|true|si|s\u00ed)$/i.test(String(process.env.CN_RUTER_CON_HERRAMIENTAS ?? "").trim());
  // Familia catalogada = capacidad conocida (la allowlist ya se pronunció).
  if (TOOL_CAPABLE_ALLOWLIST.test(efectivo) || CLOUD_TOOL_FAMILIES.test(efectivo)) return false;
  // Tamaño declarado en el nombre: si es chico, es un NO fundado, no una incógnita.
  const paramsB = parseParamsB(efectivo);
  if (paramsB !== null) return paramsB >= TOOL_CAPABLE_MIN_PARAMS_B;
  // Sin familia y sin tamaño: micro/tiny por defecto sí son un NO conservador del
  // tramo, pero `small` es el cubo de "desconocido" de getTier() → incógnita.
  const tier = getTier(paramsB, isRemote(efectivo));
  return tier === "small";
}

/** ¿Es un modelo diminuto (el rango 250 MB-1 GB del usuario)? */
export function isMicroModel(modelName: string): boolean {
  const p = parseParamsB(modelName);
  return p !== null && p <= 1.6;
}

/**
 * Construye el bloque `options` de /api/chat para Ollama.
 * @param cores núcleos de CPU (server: os.cpus().length)
 */
export function buildOllamaOptions(
  modelName: string,
  temperature: number | undefined,
  cores: number,
  ramGb?: number
): Record<string, unknown> {
  const p = getModelProfile(modelName, ramGb);
  const threads = p.numThreadSuggestion(cores);
  const opts: Record<string, unknown> = {
    temperature: typeof temperature === "number" ? Math.max(0.05, Math.min(1.0, temperature)) : p.temperature,
    num_ctx: p.numCtx,
    num_batch: p.numBatch,
    repeat_penalty: 1.12,
    repeat_last_n: 128,
    top_k: 40,
    top_p: 0.9,
  };
  if (threads !== null) opts.num_thread = threads;
  // num_predict = -1 significa "sin tope" y en Ollama es válido, pero no lo
  // enviamos para no pisar el default del usuario en modelos grandes/nube.
  if (p.numPredict > 0) opts.num_predict = p.numPredict;
  const pref = PREFERENCIA_MOTOR;
  if (typeof pref.topP === "number") opts.top_p = pref.topP;
  if (typeof pref.topK === "number") opts.top_k = pref.topK;
  if (typeof pref.numPredict === "number") {
    if (pref.numPredict === -1) delete opts.num_predict;
    else opts.num_predict = pref.numPredict;
  }
  return opts;
}

/**
 * Recorta una lista de mensajes al presupuesto de contexto.
 * Conserva SIEMPRE el primer mensaje de sistema y los últimos turnos.
 * Se usa en el servidor (defensa final) y en el cliente (contextCache).
 */
export function trimMessagesToBudget<T extends { role?: string; content?: string }>(
  messages: T[],
  budgetChars: number,
  historyTurns: number
): { messages: T[]; dropped: number; truncated: boolean; droppedMessages: T[] } {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  // Nos quedamos con los últimos `historyTurns * 2` mensajes (ida y vuelta)
  const keep = Math.max(2, historyTurns * 2);
  let kept = rest.slice(-keep);
  let dropped = rest.length - kept.length;

  const size = (arr: T[]) => arr.reduce((n, m) => n + (m.content?.length || 0), 0);
  // Si aún no cabe, vamos soltando los más antiguos del historial
  while (kept.length > 2 && size([...system, ...kept]) > budgetChars) {
    kept = kept.slice(1);
    dropped++;
  }

  // v1.45.2 — Qué mensajes se quedaron FUERA (los más antiguos). `kept` es
  // siempre un sufijo de `rest`, así que lo descartado es todo lo anterior.
  // Se devuelve para que quien llame pueda CONDENSARLO en un resumen en vez
  // de perderlo (memoria de tareas largas, ver `condensarHistorial`).
  const droppedMessages: T[] = rest.slice(0, rest.length - kept.length);

  // Último recurso: truncar mensajes larguísimos (un archivo pegado entero)
  let truncated = false;
  const perMessage = Math.max(800, Math.floor(budgetChars / Math.max(2, kept.length)));
  const fixed = kept.map((m) => {
    const c = m.content || "";
    if (c.length > perMessage) {
      truncated = true;
      return { ...m, content: c.slice(0, perMessage) + "\n\n[…recortado para no saturar el contexto del modelo local…]" };
    }
    return m;
  });

  return { messages: [...system, ...fixed], dropped, truncated, droppedMessages };
}

/**
 * v1.45.2 · MEMORIA DE TAREAS LARGAS (resumen determinista, sin coste de latencia).
 * ---------------------------------------------------------------------------
 * El problema: `trimMessagesToBudget` conserva la velocidad TIRANDO los
 * mensajes viejos — pero en una tarea larga eso es perder el hilo («se olvidó
 * de lo que estábamos haciendo»). El usuario pide las dos cosas a la vez:
 * recordar el contexto de tareas largas Y responder lo más rápido posible.
 *
 * Qué hace: coge los mensajes que el recorte dejó fuera y los condensa en UN
 * bloque breve (una línea por mensaje, recortada), acotado a `maxChars`. Ese
 * resumen viaja al inicio del contexto, así el modelo sigue el hilo mientras el
 * prompt total se mantiene pequeño → primer token rápido.
 *
 * Es DETERMINISTA (no llama a ningún modelo): no añade ni un segundo de espera.
 * Función pura: entran mensajes, sale texto. Se prueba sola.
 */
export function condensarHistorial<T extends { role?: string; content?: string }>(
  dropped: T[],
  maxChars: number
): string {
  if (!dropped?.length || maxChars < 200) return "";
  const etiqueta = (r?: string) =>
    r === "assistant" || r === "model"
      ? "Asistente"
      : r === "tool"
      ? "Herramienta"
      : "Usuario";
  // Presupuesto por mensaje para que quepan todos sin pasarse del tope.
  const porMensaje = Math.max(60, Math.floor((maxChars - 180) / dropped.length));
  const lineas: string[] = [];
  for (const m of dropped) {
    const texto = String(m.content || "").replace(/\s+/g, " ").trim();
    if (!texto) continue;
    const corte = texto.length > porMensaje ? texto.slice(0, porMensaje) + "…" : texto;
    lineas.push(`- ${etiqueta(m.role)}: ${corte}`);
  }
  if (!lineas.length) return "";
  let cuerpo = lineas.join("\n");
  // Red de seguridad dura por si la suma se pasó del tope.
  if (cuerpo.length > maxChars) cuerpo = cuerpo.slice(0, maxChars) + "…";
  return (
    `📌 RESUMEN DE LA CONVERSACIÓN PREVIA (${dropped.length} mensaje(s) más ` +
    `antiguos, condensados para no perder el hilo en tareas largas):\n${cuerpo}`
  );
}

/**
 * v1.23.0 · RECORTE DEL PROMPT ENTRANTE (el caso «se tranca con un log»).
 * ---------------------------------------------------------------------------
 * El defecto medido: `trimMessagesToBudget` recorta el HISTORIAL, pero el
 * mensaje que el usuario acaba de pegar entra CRUDO. Un log de 400 líneas
 * (≈40-60 KB) viaja entero al modelo; con un `num_ctx` de 8192 (modelo small)
 * Ollama se queda sin ventana, empieza a expulsar el system prompt y la
 * respuesta sale vacía o se cuelga sin mensaje: «le doy un log y no contesta».
 *
 * Qué hace: deja intacto el pedido del usuario (las primeras `keepHeadChars`)
 * y recorta SOLO el cuerpo pesado que suele venir pegado detrás (logs, volcados,
 * archivos), conservando cabecera + marcador honesto + cola (el final de un log
 * suele tener el error real). Nunca inventa: lo que quita, lo dice con el número
 * de caracteres suprimidos para que el modelo sepa que hay más.
 *
 * Es una función pura: entra texto, sale texto + cuánto se cortó. Se prueba sola.
 */
export interface RecortePrompt {
  texto: string;
  recortado: boolean;
  charsOmitidos: number;
}

export function trimIncomingPrompt(
  raw: string,
  budgetChars: number,
  opts: { headChars?: number; tailChars?: number } = {}
): RecortePrompt {
  const texto = String(raw ?? "");
  // Presupuesto de TODO el turno: si el mensaje entra entero con holgura, no se toca.
  const head = Math.max(1200, opts.headChars ?? Math.floor(budgetChars * 0.55));
  const tail = Math.max(600, opts.tailChars ?? Math.floor(budgetChars * 0.25));
  if (budgetChars <= 0 || texto.length <= budgetChars) {
    return { texto, recortado: false, charsOmitidos: 0 };
  }
  // Cabe de todo si caben cabecera + cola; el cuerpo del medio es lo que ahoga.
  if (texto.length <= head + tail + 200) {
    return { texto, recortado: false, charsOmitidos: 0 };
  }
  const resto = texto.length - head - tail;
  const recortado =
    texto.slice(0, head) +
    `\n\n[… el motor omitió ${resto} caracteres del centro de tu mensaje para no reventar la ventana de contexto del modelo (${budgetChars} car.). Se conserva el inicio y el final; si necesitás el medio, pedilo por partes o subilo como archivo …]\n\n` +
    texto.slice(texto.length - tail);
  return { texto: recortado, recortado: true, charsOmitidos: resto };
}

/**
 * ============================================================
 * v1.0.17 · el «-1» QUE SOLO EXISTE EN EL PANEL — HTTP 400 del chat local
 * ------------------------------------------------------------
 * DEFECTO REAL (reportado con el error literal de Ollama):
 *   HTTP 400: time: missing unit in duration "-1"
 *
 * El panel Pro ofrece «Mantener modelo en RAM → Siempre» y guarda el valor
 * "-1" (así se llama la bandera en el BAT de arranque, donde SÍ es válida:
 * OLLAMA_KEEP_ALIVE=-1). Pero `keep_alive` (aquí `-1`) NO es lo mismo: para la
 * API de Ollama -1 es «MinInt64 segundos» y su parser de duraciones lo rechaza
 * con ese 400. La forma válida de «nunca caduca» en la petición es `-1m`.
 *
 * Consecuencia medida: el panel arranca en "30m" (bien), pero en cuanto alguien
 * elige «Siempre» TODOS los mensajes al modelo local mueren con 400 — y el
 * mensaje del IDE dice «comprueba que Ollama esté arrancado», que es falso:
 * Ollama está arrancado, es la petición la que está mal formada.
 *
 * La cura es de forma, no de política: se traduce en el ÚNICO punto por donde
 * sale `keep_alive` hacia Ollama (`aplicarPreferenciaMotor` → perfil → todas
 * las puertas: chat, agente, warmup, navegador directo). Un valor que ya tiene
 * unidad ("5m", "30m", "0", "600") pasa intacto.
 * ============================================================
 */

/** Duración de residencia que Ollama acepta en el cuerpo JSON de la petición. */
export function traducirKeepAlive(valor: unknown): string {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return bruto;
  // "-1" (y su variante "+1"/"1e3" no interesa) es la única forma sin unidad que
  // Ollama interpreta mal: él sí admite segundos con signo en la variable de
  // entorno `OLLAMA_KEEP_ALIVE`, pero en `keep_alive` exige unidad.
  if (bruto === "-1" || bruto === "-1.0") return "-1m";
  return bruto;
}
