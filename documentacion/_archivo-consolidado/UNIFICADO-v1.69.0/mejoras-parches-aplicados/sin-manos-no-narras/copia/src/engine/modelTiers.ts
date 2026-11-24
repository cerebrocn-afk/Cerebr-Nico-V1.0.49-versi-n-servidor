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
  /** Ventana de contexto a pedir a Ollama */
  numCtx: number;
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

/** Patrones que declaran explícitamente un tamaño en el nombre: ":0.5b", ":7b", ":3.2b", ":135m" */
const SIZE_IN_NAME = /[:@_-](\d+(?:\.\d+)?)\s*(b|m)\b/i;

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
const TOOL_CAPABLE_ALLOWLIST =
  /llama3\.|llama-3|qwen2\.5|qwen3|mistral|mixtral|command-r|gemma3|granite|hermes3|nemotron|functionary|phi-4|phi4|nous-hermes|gpt-oss|deepseek|glm-4/i;

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
  if (paramsB !== null && paramsB <= DIMINUTO_PARAMS_B) return "3m";
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
  const m = modelName.match(SIZE_IN_NAME);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return null;
  return m[2].toLowerCase() === "b" ? value : value / 1000;
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
  return REMOTE_HINTS.test(efectivo) || CLOUD_ONLY_FAMILIES.test(efectivo) || esApiNube;
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
  const esNubeConHerramientas = CLOUD_TOOL_FAMILIES.test(efectivo);
  const passesAllowlist = TOOL_CAPABLE_ALLOWLIST.test(efectivo) || esNubeConHerramientas;
  const bigEnough = paramsB === null ? tier !== "micro" && tier !== "tiny" : paramsB >= TOOL_CAPABLE_MIN_PARAMS_B;
  // Las familias de nube (gemini/gpt/claude/…) son tool-capable aunque su
  // nombre no declare tamaño: su function-calling es fiable y no gastan RAM
  // local, así que el umbral de tamaño no les aplica (RAÍZ v1.44.0).
  const toolCapable = esNubeConHerramientas || (passesAllowlist && bigEnough);

  const notes: string[] = [];

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
      numCtx = lowRam ? 4096 : 8192;
      numPredict = 1200;
      numBatch = 256;
temperature = 0.45;
      contextCharBudget = lowRam ? 16000 : 24000;
      historyTurns = 8;
      maxOpenFiles = 3;
      maxFileChars = 4000;
      notes.push("Modelo local ≤8B: contexto moderado para no agotar la RAM.");
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
  if (!passesAllowlist && bigEnough && !remote) {
    // v1.23.0 · NOTA HONESTA por nombre. Un modelo con tamaño de sobra pero
    // ausente de la lista blanca recibía CERO herramientas sin que nadie se lo
    // dijera: el usuario veía un agente mudo que «no sabe hacer cosas» y la
    // causa real era una regex de nombres. Ahora la nota se nombra a sí misma.
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

  return {
    tier,
    paramsB,
    remote,
    toolCapable,
    aliasDe: alias,
    numCtx,
    numPredict,
    numBatch,
    keepAlive,
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
