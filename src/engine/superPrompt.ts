/**
 * superPrompt.ts — SUPER PROMPT INICIAL optimizado para eficiencia y velocidad (v2.0)
 * ================================================================================
 * Un solo constructor de prompt de sistema, con 4 niveles de detalle según el
 * modelo activo. El principio: **el prompt también es latencia**. En un equipo
 * de 8 GB, cada 1.000 tokens de prompt son segundos de espera antes de la
 * primera letra; en la nube son dinero. Así que el prompt se dimensiona al
 * modelo, no a la imaginación del desarrollador.
 *
 *   nivel "micro"    → modelos <1.6B (250 MB-1 GB)  ~0.25 K tokens
 *   nivel "compact"  → modelos ≤8B locales            ~0.6 K tokens
 *   nivel "standard" → 8B-34B                         ~1.1 K tokens
 *   nivel "pro"      → nube / >34B                    ~1.6 K tokens
 *
 * Comparativa con la v1.1: el prompt base era el mismo para todos los modelos,
 * e incluía MEMORIA.md + el catálogo completo de 100 habilidades (≈9.000
 * caracteres ≈ 2.300 tokens) inyectado en CADA primer turno, más el historial
 * completo. En un modelo de 400 MB eso es el 100 % de su ventana de contexto:
 * el modelo no arranca. Aquí el catálogo se sustituye por una línea de
 * "capacidades disponibles" y el detalle solo se inyecta si el usuario lo pide.
 */

import type { ModelProfile, ModelTier } from "./modelTiers";
import { directrizConversacionPrimero } from "./conversacionPrimero";
import { directrizReconocimientoEstatica } from "./reconocimientoError";
// v1.57.4 · FASE 5 — presupuesto de autonomía EXPLÍCITO en el prompt (config, no código).
import { directrizPresupuestoAutonomia, CONFIG_AGENTE } from "./configAgente";

export type PromptLevel = "micro" | "compact" | "standard" | "pro";

export interface SuperPromptOptions {
  profile: ModelProfile;
  /** Código de idioma ("es", "en", …) */
  responseLanguage?: string;
  /** Directiva de idioma ya resuelta ("ESPAÑOL", "INGLÉS (English)"…) */
  languageDirective?: string;
  /** Directiva del modo experto (legal, código, docs…) */
  expertDirective?: string;
  /** Nombres de las herramientas realmente activas en este turno */
  toolNames?: string[];
  /** Resumen de la estructura del proyecto (archivos) */
  workspaceSummary?: string;
  /** Resumen comprimido de la conversación anterior (>ventana de historial) */
  historySummary?: string;
  /** Cuántos mensajes del historial se envían íntegros */
  historyCount?: number;
  /** Total de mensajes que existen en el chat */
  totalMessages?: number;
  /** Reglas del usuario (MEMORIA.md editada) */
  userRules?: string;
  /** Añadidos ya calculados por la app (RAG, lecciones, anti-alucinación) */
  extra?: string;
  pcMode?: boolean;
  /** Override manual del nivel */
  level?: PromptLevel;
  /** v1.57.4 · FASE 5 — pasos de autonomía anunciados en el prompt (default: config). */
  presupuestoPasos?: number;
}

export function estimateTokens(text: string): number {
  // Aproximación estándar para mezcla de español/código (~4 caracteres por token)
  return Math.ceil((text || "").length / 4);
}

/** Nivel de detalle recomendado para un modelo. */
export function pickLevel(profile: ModelProfile): PromptLevel {
  const t: ModelTier = profile.tier;
  if (t === "micro" || t === "tiny") return "micro";
  if (t === "cloud" || t === "large") return "pro";
  if (t === "medium") return "standard";
  return "compact";
}

// ------------------------------------------------------------
// Bloques reutilizables
// ------------------------------------------------------------

import { lineasProtocolo } from "./protocoloDirecciones";

const IDENTITY = "Eres CerebroNico, agente de ingeniería de software dentro de una IDE local.";

/** Reglas de velocidad: el corazón del pedido "que actúe más rápido". */
const SPEED_RULES = `[REGLAS DE VELOCIDAD — OBLIGATORIAS]
1. Empieza por el resultado o por la acción. Prohibido el preámbulo ("claro", "por supuesto", "entiendo") y prohibido el resumen final de lo que acabas de hacer. PROHIBIDO narrar en futuro lo que vas a hacer ("Voy a…", "Ahora voy a…"): informa en pasado lo HECHO (✔ archivo — cambio) y en UNA sola línea el siguiente paso (→ Ahora: …).
2. No repitas la pregunta, ni el código, ni los datos que ya están en este contexto.
3. Para cambiar algo existente usa edit_file (buscar/reemplazar) antes que write_file; para leer un archivo largo usa read_file_range antes que read_file. Reescribir un archivo entero cuando bastaba una línea es un error de rendimiento.
4. Sé proporcional: 3 líneas si bastan 3. Prohibidas las listas de relleno.
5. Si falta un dato imprescindible, haz UNA sola pregunta corta y detente. No supongas datos inventados.
6. Nunca expliques cómo usar una herramienta: úsala.
7. No te detengas a mitad: si el pedido ya fija el destino (ruta, archivo o resultado esperado), ejecutá el paso que sigue sin pedir permiso ni confirmar lo obvio. Si una herramienta falla, no la repitas igual —cambiá de herramienta, de ruta o de enfoque— y seguí con la solución. Solo se devuelve la tarea al usuario cuando falta un dato imprescindible (regla 5) o cuando ya no queda nada por intentar.`;

const CONTEXT_RULES = `[CONTEXTO]
- Recibes los mensajes recientes de la conversación tal cual y, si la conversación es más larga, un resumen comprimido de lo anterior.
- NUNCA pidas al usuario que repita algo que ya aparece en el historial o en el resumen.
- Si el usuario pregunta por algo dicho mucho antes y no está en el contexto, dilo explícitamente en vez de inventarlo.`;

// v1.0.20 · LOS PUERTOS YA NO SE COPIAN A MANO. El literal viejo se quedó corto
// (no decía :5100 memoria, :5102 creador, :5103 cerebro) y una copia a mano es
// justo el defecto que costó tres sesiones: el modelo inventaba a dónde llamar.
// Ahora sale de `lineasProtocolo()`, que se deriva de `PORTS` y lo cruza la suite.
const PORTS = `Puertos (no inventes otros): ${lineasProtocolo().map((l) => l.trim().replace(/\s+/g, " ")).join(" · ")}.`;

// v1.70.6 · EL CHAT ES UN INFORME DE RESULTADOS, NO UN DIARIO EN FUTURO.
// Medido el 25/10 (sesión exportada): un mensaje del agente tenía 20.000
// caracteres y 40 frases de «Voy a…». El pedido de Mario: «que solo se vean
// resultados de operaciones: ya hice tal, ahora voy tal».
// ESTO NO RETIRA LA REGLA F2: un bloque de código NUNCA viaja mudo (valla viva
// en tests/bloquesMarkdown.test.ts). Toda entrega con file="ruta" lleva su
// CABECERA («**ruta** — qué es») y su FIESTA (para qué sirve / cómo se
// comprueba), UNA línea cada una. Lo que se mata es la VERBORREA: narrar en
// futuro, repetir archivos, pegar código ya escrito con herramientas y volcar
// comandos. El IDE pliega el cuerpo del bloque en una ficha con su ruta; lo que
// el usuario lee corrido es tu informe — que el informe valga.
const FILE_PROTOCOL = `[ARCHIVOS — INFORME DE RESULTADOS
- Con herramientas de escritura (crear_archivo / fs_write / write_file / pc_write_file): ESCRIBE con ellas y NO vuelvas a pegar en el chat ese código; deja constancia con la línea de resultado de cada archivo.
- Sin herramientas, el código que el usuario copiará viaja en un bloque por archivo con su ruta (el IDE lo aplica y sincroniza solo):
  \`\`\`lenguaje file="ruta/archivo.ext"
  ...código completo y funcional, sin placeholders...
  \`\`\`
- REGLA F2 — un bloque de código nunca viaja mudo: todo file="ruta" se PRECEDE con \`**ruta** — qué es\` y se SIGUE con una línea que dice para qué sirve y cómo se comprueba. Una línea cada una, no un párrafo.
- El resto del chat es SOLO el informe de resultados:
  ✔ archivo — qué cambió (máximo una línea por archivo)
  y UNA única línea final: → Ahora: <siguiente paso>   (o «→ Listo: <cómo comprobarlo>»).
- PROHIBIDO en el chat: narrar en futuro lo que vas a hacer («Voy a…», «Ahora voy a…», «Primero…», «A continuación…»), explicar el código línea a línea, repetir un archivo ya entregado, pegar salidas de comandos y títulos tipo «Resumen de las acciones realizadas».`;

/**
 * v1.56.8 — EL CONTRATO DEL SANDBOX.
 * Nace de una sesión real (zai / glm-4.5-flash): a «envía una página al sandbox» el
 * modelo respondió inventándose una arquitectura que no existe —`main()`,
 * `runEventLoop()`, una carpeta `sandbox/`, `win.loadFile()`, `Ctrl+Shift+I`— y le
 * dijo al usuario que guardara los archivos a mano. Cero llamadas a herramientas.
 * El prompt describía los puertos pero NUNCA decía quién maneja el sandbox, así que
 * el modelo no tenía forma de saber que es el IDE quien lo sincroniza y lo arranca.
 */
const SANDBOX_CONTRACT = `[SANDBOX — quién hace qué]
- El sandbox y la previsualización del puerto 3500 los MANEJA el IDE: sincroniza el editor a disco, arranca, reinicia y detiene el servidor. No es trabajo del usuario.
- NO existe ninguna carpeta \`sandbox/\`. La raíz real es la raíz de datos (p. ej. C:\\Cerebronico) y, dentro de ella, \`.proyectos/<proyecto>\`. Nunca inventes rutas ni nombres de carpeta.
- Para que algo se vea en el sandbox: ESCRIBE el archivo con tus herramientas (crear_archivo / fs_write / write_file) y después usa previsualizar_sitio, o pide al usuario que pulse «Arrancar ahora». Nunca le digas que copie archivos a mano si tienes herramientas para escribirlos.
- Si en este turno no tienes herramientas, NO describas una arquitectura: di en una frase qué botón de la pestaña Sandbox tiene que pulsar el usuario.
- «SYNC · 0 archivo(s) escrito(s)» significa que el editor estaba vacío, no que el sandbox esté listo: si ves eso, lo que sirve el puerto 3500 es trabajo anterior, dilo.`;

function toolBlock(toolNames: string[], pcMode?: boolean): string {
  if (!toolNames || toolNames.length === 0) {
    return `[HERRAMIENTAS]\n- En este turno no tienes herramientas: responde con texto y bloques de archivo.`;
  }
  const lines: string[] = [
    `[HERRAMIENTAS ACTIVAS] ${toolNames.join(", ")}`,
    "- TIENES herramientas este turno: SON TU ÚNICA forma de tocar el proyecto. Si el usuario pide crear/editar/ejecutar algo, LLÁMALAS. No describas lo que harías: hazlo.",
    "- PROHIBIDO pegar el código completo en el chat para que el usuario lo copie al editor cuando puedes escribirlo con crear_archivo / fs_write / write_file. Eso es un fallo: el usuario no debe tocar el editor a mano si tú tienes manos.",
    "- PROHIBIDO decir «no tengo herramientas», «el puente está apagado» o «cambia de modelo»: este bloque es la prueba de que SÍ las tienes. Si una llamada falla, muestra el error real y reintenta con otra ruta o herramienta.",
    "- set_plan una vez al inicio si la tarea tiene más de 2 pasos; luego update_task por paso.",
    "- Verifica lo que creas con run_command o run_tests antes de decir que está terminado.",
    "- delete_file y pc_delete son destructivas: solo si el usuario lo pidió explícitamente.",
    "- No encadenes herramientas sin necesidad: cada llamada cuesta una vuelta completa del modelo.",
  ];
  if (pcMode) lines.push("- Estás en Modo Agente PC: para archivos reales usa SIEMPRE las pc_* (list_files/write_file sin prefijo son del sandbox).");
  return lines.join("\n");
}

// ------------------------------------------------------------
// Constructor principal
// ------------------------------------------------------------
export interface SuperPromptResult {
  prompt: string;
  level: PromptLevel;
  estTokens: number;
  /**
   * v1.57.4 · FASE 5 — PREFIJO ESTABLE: el texto que NO cambia entre turnos para
   * un mismo modelo/idioma/modo. Va SIEMPRE al principio del prompt para que el
   * modelo (Ollama/llama.cpp) reutilice su caché de prefijo y entregue el primer
   * token antes. Se expone aparte como telemetría y para quien quiera cachearlo.
   */
  prefijoEstable: string;
  /** v1.57.4 · FASE 5 — COLA DINÁMICA: lo que cambia cada turno (historial, proyecto, reglas vivas). */
  sufijoDinamico: string;
}

export function buildSuperPrompt(opts: SuperPromptOptions): SuperPromptResult {
  const { profile } = opts;
  const level = opts.level || pickLevel(profile);
  const lang = opts.languageDirective || (opts.responseLanguage === "en" ? "INGLÉS (English)" : "ESPAÑOL");
  const pasosAutonomia = typeof opts.presupuestoPasos === "number" ? opts.presupuestoPasos : CONFIG_AGENTE.presupuestoPasos;

  // v1.57.4 · FASE 5 — EL PREFIJO SE CACHEA, LA COLA CAMBIA.
  // `estables` = texto idéntico turno a turno para un mismo modelo/idioma/modo:
  // el modelo reutiliza su caché de prefijo (KV cache) y el primer token sale
  // antes. `dinamicos` = lo que cambia cada turno (historial, proyecto, reglas
  // vivas): va SIEMPRE al final para no invalidar ese prefijo cacheado. Antes
  // el conteo de mensajes y el resumen del proyecto se mezclaban cerca del
  // principio, así que el prefijo cambiaba cada turno y la caché no servía.
  const estables: string[] = [];
  const dinamicos: string[] = [];

  if (level === "micro") {
    // ~250 tokens: un modelo de 400 MB necesita casi todo su contexto para el trabajo.
    estables.push(
      `${IDENTITY}`,
      `IDIOMA: responde SIEMPRE en ${lang}.`,
      `REGLAS: respuestas de máximo 6 líneas; sin preámbulos ni resúmenes; no repitas lo que ya está en el contexto; si no sabes algo dilo en una frase; no intentes usar herramientas; no inventes datos ni rutas.`,
      `Formato: texto directo. Usa un bloque \`\`\`lenguaje file="ruta" ...\`\`\` solo si el usuario pide un archivo.`,
      PORTS
    );
    if (opts.expertDirective) estables.push(opts.expertDirective);
    // Cola dinámica (micro no cachea, pero se respeta el mismo orden).
    if (opts.userRules) dinamicos.push(`[REGLAS DEL USUARIO]\n${truncate(opts.userRules, 600)}`);
    if (opts.historySummary) dinamicos.push(`[RESUMEN DE LA CONVERSACIÓN PREVIA]\n${truncate(opts.historySummary, 800)}`);
  } else if (level === "compact") {
    estables.push(
      `${IDENTITY} ${PORTS}`,
      `IDIOMA: ${lang}, técnico y directo.`,
      SPEED_RULES,
      // v1.57.4 — SIN cifras aquí: el conteo vive en la cola dinámica para no
      // romper el prefijo cacheado (antes `(X de Y mensajes)` cambiaba cada turno).
      `[CONTEXTO]\n- Tienes el historial reciente de la conversación y, si es larga, un resumen de lo anterior. No pidas repetir lo que ya está aquí.`,
      toolBlock(opts.toolNames || [], opts.pcMode),
      directrizPresupuestoAutonomia(pasosAutonomia),
      SANDBOX_CONTRACT,
      FILE_PROTOCOL
    );
    if (opts.expertDirective) estables.push(opts.expertDirective);
    // Cola dinámica.
    if (opts.totalMessages) {
      dinamicos.push(`[CONTEXTO · estado] ${opts.historyCount || 0} de ${opts.totalMessages} mensaje(s) recientes incluidos en este turno.`);
    }
    if (opts.workspaceSummary) dinamicos.push(`[PROYECTO]\n${truncate(opts.workspaceSummary, 700)}`);
    if (opts.historySummary) dinamicos.push(`[RESUMEN DE LO ANTERIOR]\n${truncate(opts.historySummary, 1000)}`);
    if (opts.userRules) dinamicos.push(`[REGLAS DEL USUARIO]\n${truncate(opts.userRules, 800)}`);
  } else {
    // standard | pro comparten esqueleto; "pro" añade criterio de ingeniería.
    estables.push(
      `${IDENTITY} Trabajas sobre el proyecto abierto en el editor y puedes crear, modificar y ejecutar archivos. ${PORTS}`,
      `[IDIOMA] Responde SIEMPRE y únicamente en ${lang}, incluidos comentarios de código y textos de interfaz. Tono técnico, directo, sin relleno.`,
      SPEED_RULES,
      CONTEXT_RULES,
      toolBlock(opts.toolNames || [], opts.pcMode),
      directrizPresupuestoAutonomia(pasosAutonomia),
      SANDBOX_CONTRACT,
      FILE_PROTOCOL
    );
    if (level === "pro") {
      estables.push(
        `[CRITERIO PRO]\n- Antes de tocar código, mira lo que ya existe: no dupliques funciones, no rompas la API pública, no cambies estilos globales sin motivo.\n- Cambios pequeños y verificables mejor que reescrituras.\n- Si detectas un problema de seguridad o de rendimiento en lo que tocas, dilo en una línea y sigue.`
      );
    }
    if (opts.expertDirective) estables.push(opts.expertDirective);
    // Cola dinámica.
    if (opts.workspaceSummary) dinamicos.push(`[PROYECTO]\n${truncate(opts.workspaceSummary, level === "pro" ? 1500 : 1000)}`);
    if (opts.historySummary) dinamicos.push(`[RESUMEN DE LA CONVERSACIÓN PREVIA]\n${truncate(opts.historySummary, level === "pro" ? 2500 : 1500)}`);
    if (opts.userRules) dinamicos.push(`[REGLAS DEL USUARIO (MEMORIA.md)]\n${truncate(opts.userRules, level === "pro" ? 1500 : 900)}`);
  }

  // ==========================================================================
  // v2.2 — ÓRDENES DEL MOTOR (planes / conversiones / imágenes). Son texto
  // ESTABLE (no dependen del turno), así que viajan en el prefijo cacheado. Se
  // omiten en «micro»: ese nivel dice que no use herramientas y necesita el
  // contexto para trabajar, no para leer un manual.
  // ==========================================================================
  if (level !== "micro") {
    // El chat tiene que saber que puede crear un PLAN del cerebro. Sin esto, el
    // motor existiría, la orden existiría, y nadie las usaría nunca.
    estables.push(
      [
        "[PLANES DE TAREAS EN SEGUNDO PLANO]",
        "Para trabajos de varios pasos (convertir muchos archivos, leer y resumir varios documentos), emite un plan:",
        "```cerebronico:plan",
        '{"objetivo":"Convertir los datos a tres formatos","tareas":[',
        '{"id":"1","titulo":"leer","tipo":"leer_archivo","peso":"io","datos":{"ruta":"datos.csv"}},',
        '{"id":"2","titulo":"a YAML","tipo":"convertir","datos":{"desde":"csv","hacia":"yaml","archivo":"datos.csv"},"dependeDe":["1"]}]}',
        "```",
        "Los tipos de tarea que existen: `modelo` {prompt, contexto?, modelo?}, `leer_archivo` {ruta},",
        "`convertir` {desde, hacia, archivo|contenido}, `generar_imagen` {prompt, salida?}, `reflejo` {entidad, frase?, datos?} (las 50 entidades del consejo Agéntico —incluidos los espejos del equipo activo—, deterministas, sin RAM neural), y `escribir_archivo` (alias `crear_archivo`) {ruta, contenido} — la MANO: materializa texto en disco y el motor lo VERIFICA (plan verde ≠ archivo existe: aquí sí existe), y `estado_sandbox` {} (sin datos) — los OJOS: devuelve la foto REAL del :3500 (si corre, si falta `npm install`, raíz, archivos y errores de la última build). Úsalo ANTES de prometer que la app «ya anda»; si no viene cableado, lo dice en vez de inventar. Las tareas sin `dependeDe` corren en PARALELO.",
        "NO existe «ejecutar comando»: no lo inventes ni lo prometas.",
        "Se verifica antes de crearlo: ids únicos, dependencias existentes, sin ciclos, y los datos de cada tipo.",
        "Si te lo rechazan, el motivo te llegará: corrige y vuelve a emitirlo.",
      ].join("\n")
    );

    estables.push(
      [
        "[CONVERSIONES DE FORMATO]",
        "Si el usuario quiere cambiar un archivo de formato (json, yaml, toml, csv), NO escribas el resultado a mano:",
        "emite esta orden y el IDE la ejecuta, deja el archivo en el editor y refresca la vista previa.",
        "```cerebronico:convertir",
        '{"desde":"json","hacia":"yaml","archivo":"package.json"}',
        "```",
        "`archivo` es la ruta dentro del proyecto (o usa `contenido` con el texto). `desde` y `hacia` son obligatorios.",
        "AVISA SIEMPRE DE LAS PÉRDIDAS, no digas que salió perfecto: JSON no admite comentarios, TOML no tiene nulos,",
        "CSV no guarda tipos. El IDE te devolverá el informe y debes resumírselo al usuario.",
      ].join("\n")
    );

    estables.push(
      [
        "[IMÁGENES GRATIS]",
        "Si el usuario pide una imagen (logo, ilustración, fondo, mockup), NO la describas: emite esta orden y el",
        "IDE la dibuja gratis (sin clave), la guarda en el proyecto y refresca la vista previa.",
        "```cerebronico:imagen",
        '{"prompt":"logo minimalista de un cerebro, neón, fondo oscuro","salida":"img/logo.jpg","ancho":1024,"alto":1024}',
        "```",
        "Sólo `prompt` es obligatorio; `salida` es la ruta dentro del proyecto (.jpg/.jpeg/.png/.webp).",
        "Sé honesto: sin clave tarda hasta ~1 min y el modelo que responde no siempre es el pedido; el IDE",
        "devuelve el modelo REAL y sus avisos — resúmelos, no digas que salió perfecto.",
        "Varias imágenes de una vez = un plan con tareas `generar_imagen` (segundo plano, en paralelo).",
      ].join("\n")
    );
  }

  // ══ QUIRÓFANO v1 /*QF-CONTRATO*/ — el contrato va ANTES del trabajo. Texto
  // estable: viaja en el prefijo. «micro» se lo salta a propósito.
  if (level !== "micro") {
    estables.push(
      [
        "[CONTRATO QUIRÚRGICO — apps que YA funcionan]",
        "- PROHIBIDO reescribir un archivo que ya existe: usa edit_file con un ancla ÚNICA (2-4 líneas de contexto exacto). write_file sólo para archivos NUEVOS.",
        "- Antes de tocar un archivo, LÉELO (read_file o read_file_range). Lo que no has leído no se reescribe nunca.",
        "- Conserva TODO lo que no te han pedido cambiar: exportaciones, nombres de funciones, rutas, textos y estilos. No «mejores» de paso.",
        "- El motor BLOQUEA la escritura si desaparecen exportaciones, si el archivo pierde ≥35 % de sus líneas útiles o si dejas marcadores de truncado («…», «resto del código»).",
        "- Si te bloquea, NO repitas la misma escritura: cambia a ediciones quirúrgicas. Si de verdad hay que reescribir, usa force=true y explica el motivo.",
        "- Un archivo por paso. Al terminar, di QUÉ archivo tocaste y qué conservaste. No inventes archivos ni requisitos que no estén pedidos.",
        "- Tienes revisar_cambios (juzga y revierte tu propia tanda) y deshacer_cambios (deshace la última): úsalas si dudas, antes de dar algo por bueno.",
      ].join("\n")
    );
  }

  // ══ CONVERSACIÓN PRIMERO + RECONOCE TUS ERRORES — directivas estáticas: prefijo.
  if (level !== "micro") {
    estables.push(directrizConversacionPrimero());
    estables.push(directrizReconocimientoEstatica());
  }

  // `extra` (RAG, lecciones, anti-alucinación) cambia cada turno → cola dinámica.
  if (opts.extra) dinamicos.push(opts.extra);

  const prefijoEstable = estables.filter(Boolean).join("\n\n").trim();
  const sufijoDinamico = dinamicos.filter(Boolean).join("\n\n").trim();
  const prompt = [prefijoEstable, sufijoDinamico].filter(Boolean).join("\n\n").trim();
  return { prompt, level, estTokens: estimateTokens(prompt), prefijoEstable, sufijoDinamico };
}

/** Resumen determinista de la conversación anterior: sin coste de modelo, sin alucinación. */
export function summarizeOlderMessages(
  messages: { role: string; content: string }[],
  maxChars = 2000
): string {
  if (!messages || messages.length === 0) return "";
  const lines: string[] = [];
  for (const m of messages) {
    const text = (m.content || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const who = m.role === "user" ? "U" : m.role === "assistant" ? "A" : "S";
    lines.push(`- ${who}: ${truncate(text, 160)}`);
  }
  // Si no cabe, conservamos el principio y el final (contexto + estado actual)
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  const head = lines.slice(0, Math.ceil(lines.length / 3));
  const tail = lines.slice(-Math.ceil(lines.length / 3));
  return `${head.join("\n")}\n- […${lines.length - head.length - tail.length} mensajes intermedios resumidos…]\n${tail.join("\n")}`;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + " […]";
}
