/**
 * enjambreEclectico.ts — LA RESPUESTA ECLÉCTICA (v1.80.0 · FASE 1.5 del plano)
 * ============================================================================
 * QUÉ ES: el criterio del enjambre. UN MISMO prompt se manda a VARIAS voces
 * (distintos proveedores, en paralelo), cada una contesta lo suyo, y al final
 * se hace un RESUMEN/CONSENSO de todas las respuestas con un VEREDICTO FINAL
 * sobre la tarea pedida.
 *
 * POR QUÉ EXISTE (pedido de Mario 27/10): «la API unificada integra en el mismo
 * prompt a varios proveedores, contestan todos y al final se hace un
 * resumen/consenso general de todas las respuestas (respuesta ecléctica). No
 * quiero que aparezca en CerebroNico, pero sí su funcionamiento: mismo prompt a
 * varios proveedores, varias respuestas. Eso debe hacerlo el orquestador y
 * evaluar las respuestas para dar un veredicto final de la tarea solicitada».
 * La traducción a esta casa: la marca externa NO va en la IDE; la CAPACIDAD va,
 * y es nuestra. El enjambre se arma con lo que el usuario ya tiene cargado
 * (⭐ Favoritos + lo detectado en cada ranura), se ejecuta en paralelo, se
 * evalúa cada respuesta y se firma un veredicto.
 *
 * QUÉ NO ES: no es un segundo chat ni un panel que simula. Este archivo es la
 * PARTE PURA — sin red, sin disco, sin reloj, sin React — y por eso se puede
 * probar entero (`tests/enjambreEclectico.test.ts`). Las llamadas viven en
 * `server/enjambreLlamadas.ts` y el cable en `server/routers/enjambre.ts`.
 *
 * REGLAS DE LA CASA QUE APLICÁ:
 *  · Ninguna voz inventada: solo proveedores con clave/URL cargada y modelos
 *    reales (aduana mediante). Un modelo fantasma no vota.
 *  · Una voz por proveedor: dos respuestas del mismo motor no son consenso, son
 *  · eco. (De ahí lo «ecléctico».)
 *  · Embedders afuera: un modelo de vectores no contesta, y marcarlo es
 *    garantía de ruido (lección v1.78.0).
 *  · El veredicto SIN juez también existe: si el juez no contesta, se entrega
 *    el consenso MEDIDO (similitud real entre respuestas) y se dice que no hubo
 *    juez. Un consenso que se inventa las coincidencias no es consenso.
 */

// ─── Una sola fuente de los puertos: `PORTS` (src/constants.ts) ──────────────
// Se importa en vez de escribir 5000/3500 a mano: si el mapa de puertos cambia,
// un prompt que nombra un puerto muerto es peor que un prompt sin puertos.
import { PORTS } from "../constants";
// v1.86.5 · la certeza llega al enjambre: el revisor del chat (certezaModelo.ts)
// también vigila el veredicto que firma el enjambre, que genera texto y NUNCA
// ejecuta ni lee. Se importa acá (módulo puro, sin ciclo) para que la regla sea
// una sola y probable, no dos catálogos que divergen.
import { revisarSalida } from "./certezaModelo";
import type { Certeza } from "./certeza";
import type { AvisoVocabulario } from "./vocabulario";

const PUERTO_PUENTE = PORTS.BRIDGE;
const PUERTO_SANDBOX = PORTS.SANDBOX;

// ─── La voz de la casa: `cerebro/auto` ──────────────────────────────────────

/**
 * El modelo virtual que aparece en el selector. NO es un proveedor externo: es
 * la puerta del enjambre. Se elige como se elige cualquier modelo —y por eso
 * funciona como valor por defecto— pero al hablarle, el turno no va a una
 * máquina: va a varias y vuelve con veredicto.
 */
export const MODELO_CEREBRO_AUTO = "cerebro/auto";
export const PROVEEDOR_CEREBRO = "cerebro";

export const DESCRIPCION_CEREBRO_AUTO =
  "Tu motor, pero con varias voces: el MISMO prompt se manda en paralelo a los proveedores cargados (⭐ Favoritos + API unificada), cada uno contesta, y el orquestador evalúa las respuestas y firma un veredicto final con el acuerdo medido. Sin voces cargadas avisa y no finge consenso.";

/** ¿El turno hay que mandarlo al enjambre en vez de a un modelo? */
export function esCerebroAuto(provider: string, model: string): boolean {
  const p = String(provider || "").toLowerCase();
  const m = String(model || "").trim().toLowerCase();
  return p === PROVEEDOR_CEREBRO || m === MODELO_CEREBRO_AUTO || m.startsWith("cerebro/");
}

// ───────────────────────────────────────────────────────────────────────────
// v1.84.5 · EL ENJAMBRE CON MEMORIA (sesión exportada 1793074563435, la queja
// de Mario: «se olvidan de qué estaban haciendo 2 o 3 mensajes atrás; no pueden
// usar las imágenes»). Diagnosticado sin adornos: cada voz recibía
// `messages:[system, la-tarea-de-ahora]` — el enjambre era amnésico por
// construcción, y el veredicto de sus propias voces lo confirmó en pantalla:
// «no tengo memoria persistente… solo veo los mensajes de la conversación
// activa». La ruta normal del chat SÍ manda historial e imágenes (engine.ts);
// el enjambre se desviaba antes de todo eso. Estas funciones puras cierran la
// brecha con las MISMAS convenciones de la casa:
//   · la memoria viaja DENTRO del turno de usuario (los proveedores del
//     enjambre reciben de todo, y un solo turno es lo único que el contrato
//     actual garantiza en los doce);
//   · las imágenes solo se mandan a voces donde se espera visión (la lista es
//     deliberadamente la misma de `isVisionModelName` en utils/engine.ts);
//   · y si no hay memoria que inyectar, el prompt queda INTACTO: un cliente
//     viejo sigue obteniendo exactamente el enjambre de v1.84.4.
// ───────────────────────────────────────────────────────────────────────────
export interface TurnoMemoria {
  rol: string;
  texto: string;
}
export interface AdjuntoPlano {
  nombre: string;
  tipo: string;
  esImagen: boolean;
  /** base64 PURO (sin prefijo `data:…;base64,`), solo para imágenes. */
  base64?: string;
}

export const MEMORIA_MAX_TURNOS = 12;
export const MEMORIA_CHARS_POR_TURNO = 700;
export const MEMORIA_PRESUPUESTO_CHARS = 6000;
export const ADJUNTOS_MAX_IMAGENES = 4;

/** Basura de turno que NO debe reeducar a las voces: marcadores y errores. */
const TURNO_RUIDO = /^\s*(⊕⊕|⚠️\s*Error de comunicaci|⚠️\s*.*no pudo consensuar|⏹)/;

/** Misma lista que `isVisionModelName` (utils/engine.ts): una verdad, dos lecturas coordinadas por prueba. */
const VISION_PATRON = /vision|smolvlm|glm-ocr|glm-4v|glm4v|glm-5|llava|llava-phi3|bakllava|moondream|minicpm|qwen2\.5vl|qwen2-vl|qwen3-vl|qwen-vl|cogvlm|internvl|pixtral|deepseek-vl|gpt-oss|gemma3|gemma4|kimi/i;
export function modeloConVisionEsperable(modelo: string): boolean {
  return VISION_PATRON.test(String(modelo || ""));
}

/**
 * Las seis herramientas del puente :5000 (agent_bridge_5000.py: HERRAMIENTAS, y
 * `tests/puenteToolsCall.test.ts:60` las congela en ese orden). Se nombran acá
 * porque son LA SALIDA que una voz del enjambre tiene que señalar cuando la
 * tarea pide tocar el disco: no puede ejecutarlas, pero sí decir cuál hace falta.
 */
export const HERRAMIENTAS_DEL_PUENTE: ReadonlyArray<string> = [
  "fs_read", "fs_write", "fs_list", "fs_delete", "fs_mkdir", "exec",
];

/**
 * SISTEMA_VOCES — el system prompt de cada voz del enjambre (v1.86.4).
 *
 * Por qué existe, con la sesión delante (cerebronico-ide-sesion-1793147384797):
 * el arranque anunciaba `[tools] Pack externo "puente-mcp" cargado con
 * 6 herramienta(s)` y, cuando la respuesta salía por el enjambre ecléctico, el
 * modelo contestaba que no tenía acceso a archivos. No es una mentira del
 * modelo ni un pack roto: es un alcance que nadie le declaró. `llamarVoces`
 * manda `messages`/`systemInstruction` y NADA más — sin `tools`, sin
 * `tool_choice`— en las tres ramas (Ollama, Gemini y OpenAI-compat). Las
 * herramientas solo viajan por el chat: `server/cicloOpenAICompat.ts:476-479`
 * pone `tools` + `tool_choice:"auto"` y las ejecuta contra el puente :5000.
 *
 * La casa no disfraza: en vez de simular herramientas que no existen, el prompt
 * DECLARA el alcance y obliga a entregar la orden accionable. Un modelo que sabe
 * que está mirando por un agujero chico deja de decir «no puedo» y empieza a
 * decir «leé tal archivo con fs_read».
 */
export const SISTEMA_VOCES =
  "Respondés UNICAMENTE en español técnico, directo y sin relleno. " +
  "No mencionás que otros modelos estén respondiendo: contestás la tarea como si dependiera de vos.\n" +
  "ALCANCE DE ESTA LLAMADA (es parte de la tarea, no un detalle): el enjambre envía messages y systemInstruction, " +
  "sin tools y sin tool_choice. Por eso NUNCA respondas «no tengo acceso a archivos», «no puedo leer» ni «no puedo ejecutar»: " +
  "esa limitación es de ESTA llamada, no del IDE, y usarla de respuesta es no responder. " +
  "Acá se trabaja con el texto que ya llegó: razoná sobre él y devolvé la orden concreta y accionable " +
  "(ruta exacta + cambio exacto). Quien toca el disco es otro órgano: el chat en Modo Agente PC manda tools al proveedor " +
  "y las ejecuta contra el puente :" + PUERTO_PUENTE + " (" + HERRAMIENTAS_DEL_PUENTE.join(", ") + ") y el sandbox :" + PUERTO_SANDBOX + ". " +
  "Si necesitás un archivo que no está en el prompt, decí cuál hay que leer con fs_read; jamás inventes su contenido.";

/**
 * Arma el prompt de las voces y del juez con la memoria de la sesión dentro.
 * Sin memoria ni adjuntos, devuelve la tarea TAL CUAL (compatibilidad total).
 */
export function armarPromptConMemoria(opts: {
  tarea: string;
  historial?: TurnoMemoria[];
  adjuntos?: AdjuntoPlano[];
}): { prompt: string; turnos: number; imagenes: number; nota: string; memoria: string } {
  const tarea = String(opts.tarea || "");
  const turnos = (Array.isArray(opts.historial) ? opts.historial : [])
    .filter((t) => t && (t.rol === "user" || t.rol === "assistant") && String(t.texto || "").trim())
    .filter((t) => !TURNO_RUIDO.test(t.texto))
    .slice(-MEMORIA_MAX_TURNOS)
    // v1.86.2 · los informes eclécticos previos viajan DIGERIDOS: si el turno
    // anterior llega integral, la voz más perezosa lo transcribe y el enjambre
    // re-entrega la misma respuesta (sesión 1793133418292, cuatro turnos
    // seguidos con el mismo veredicto). La sustancia corta alcanza para saber
    // de qué se hablaba; no alcanza para copiar.
    .map((t) => ({
      rol: t.rol,
      texto: (t.rol === "assistant" ? digerirTurnoAsistente(String(t.texto)) : String(t.texto)).trim().slice(0, MEMORIA_CHARS_POR_TURNO),
    }));
  // Presupuesto total de memoria: se corta por el frente (lo viejo viejo).
  let total = 0;
  const memoria: typeof turnos = [];
  for (let i = turnos.length - 1; i >= 0; i--) {
    total += turnos[i].texto.length;
    if (total > MEMORIA_PRESUPUESTO_CHARS) break;
    memoria.unshift(turnos[i]);
  }
  const adjuntos = (Array.isArray(opts.adjuntos) ? opts.adjuntos : []).filter((a) => a && a.nombre);
  const imagenes = adjuntos.filter((a) => a.esImagen && a.base64).slice(0, ADJUNTOS_MAX_IMAGENES);
  const turnosUsados = memoria.length;
  if (!turnosUsados && !adjuntos.length) {
    return { prompt: tarea, turnos: 0, imagenes: 0, nota: "", memoria: "" };
  }
  const partes: string[] = [];
  if (turnosUsados) {
    partes.push(
      "── CONVERSACIÓN PREVIA DE ESTA SESIÓN (memoria: el usuario da por hecho que la tenés; no la repite) ──"
    );
    for (const t of memoria) {
      partes.push(t.rol === "user" ? `Usuario: ${t.texto}` : `Asistente (veredicto anterior): ${t.texto}`);
    }
    partes.push("── Fin de la memoria ──");
    // v1.86.1 · ANTI-BUCLE: la memoria es contexto, no tarea. Sin esta regla
    // las voces re-respondían el veredicto viejo (sesión 1793125918256,
    // «¿te trancastes? ESTÁS REPITIENDO»).
    partes.push(
      "REGLA ANTI-BUCLE: lo de arriba es CONTEXTO, no la tarea. Contestá SOLO la tarea de ESTE turno (abajo): si la memoria ya trae la respuesta, no la repitas ni la parafraseés — avanzá con lo que la tarea actual pide."
    );
  }
  if (adjuntos.length) {
    partes.push("");
    partes.push("[ARCHIVOS ADJUNTADOS EN EL MENSAJE ACTUAL]");
    for (const a of adjuntos.slice(0, 12)) {
      partes.push(a.esImagen
        ? `· ${a.nombre} (${a.tipo}) — imagen${a.base64 ? ": llega a las voces con visión" : " (sin datos en línea)"}`
        : `· ${a.nombre} (${a.tipo})`);
    }
  }
  partes.push("");
  partes.push("[LA TAREA DE ESTE TURNO — RESPONDE ESTO CON LA MEMORIA DE ARRIBA]");
  partes.push(tarea);
  const nota =
    `Memoria del turno: ${turnosUsados} mensaje${turnosUsados === 1 ? "" : "s"} previo${turnosUsados === 1 ? "" : "s"}` +
    (adjuntos.length ? ` · ${adjuntos.length} archivo(s) adjuntos` : "") +
    (imagenes.length ? ` · ${imagenes.length} imagen(es) a las voces con visión` : "");
  // v1.86.2 · la memoria sale SEPARADA del prompt, para que el juez pueda leer
  // la tarea sin el envoltorio delante (ver `promptDelJuez`).
  return {
    prompt: partes.join("\n"),
    turnos: turnosUsados,
    imagenes: imagenes.length,
    nota,
    memoria: turnosUsados ? partes.slice(0, partes.indexOf("── Fin de la memoria ──") + 2).join("\n") : "",
  };
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface VozPlana {
  provider: string;
  modelId: string;
  name?: string;
  /**
   * v2.3.6 · puesta por el usuario en la ranura de voz (no elegida por el
   * armado). Sirve para que el panel pueda decir QUÉ voz fue elegida a mano y
   * cuál fue la que el criterio arrimó: dos orígenes distintos, un solo registro.
   */
  fijada?: boolean;
}

export interface CriterioEnjambre {
  /** Cuántas voces se piden como mínimo para que el consenso valga. */
  minimas: number;
  /** Techo de voces por ráfaga (cuota y paciencia del usuario). */
  maximas: number;
  /** Un local puede entrar si el usuario lo pide: mismo hardware, misma sordera. */
  incluirLocales: boolean;
  /**
   * v2.3.6 · LA RANURA DE VOZ (pedido del 4/11: «una función parecida al favorito
   * pero de ecléctico, y que sea elegido para una de las voces, así selecciono
   * modelos que contesten»). Son modelos que el USUARIO afirma que deben hablar.
   * Entran primero en la fila y por lo tanto ocupan las ranuras antes que el resto
   * de los favoritos; el resto completa como siempre.
   *
   * Tres límites que no se negocian acá:
   *   · NUNCA CERO VOCES — una ranura vacía o mal cargada NO apaga el enjambre;
   *     se usa la fila vieja y el descarte se lee en `descartes`;
   *   · la aduana sigue mandando: un modelo declarado pero embedding/encabezado/
   *     sin clave se descarta CON MOTIVO, no se lo cuela por haber sido elegido;
   *   · el criterio del resto no cambia: ranura vacía = comportamiento idéntico.
   */
  vocesFijas?: VozPlana[];
  /** El modelo que el usuario tiene elegido; si pasa la aduana, es voz. */
  actual?: VozPlana | null;
}

export const CRITERIO_POR_DEFECTO: CriterioEnjambre = {
  minimas: 2,
  maximas: 5,
  incluirLocales: false,
  actual: null,
};

/**
 * LA REGLA DE MARIO (27/10): «siempre una va a contestar, y si muchos contestan
 * mejor será el veredicto». Dos consecuencias en el criterio, y ninguna es
 * cosmética:
 *
 *  1. NUNCA CERO VOCES. Si los favoritos nube no alcanzan, la voz de respaldo
 *     entra igual —el modelo elegido o un local— porque el enjambre sin voces no
 *     contesta, y un enjambre que contesta menos que un modelo solo es un lujo
 *     roto. La diferencia con «no hay enjambre» se DECLARA en el informe.
 *  2. EL VEREDICTO ESCALA CON QUIENES CONTESTARON. La confianza no es solo
 *     «qué parecido tienen las respuestas»: es cuánto acuerdo HAY ponderado por
 *     cuántas voces lo sostienen. Una voz = el piso (0.35). Cinco = techo (1.0).
 */
export function confianzaEclectica(opts: { acuerdo: number; respondieron: number; convocadas: number }): number {
  const n = Math.max(0, Math.round(Number(opts.respondieron) || 0));
  const acuerdo = Math.max(0, Math.min(1, Number(opts.acuerdo) || 0));
  const mesa = [0, 0.35, 0.55, 0.75, 0.9, 1];
  const peso = n >= mesa.length ? 1 : mesa[n];
  // El acuerdo manda cuando hay materia; sin materia manda la duda.
  // Con UNA sola voz el techo es el piso de duda (0.35): no hay con qué
  // contrastarla, por más elocuente que sea. Con dos o más, el acuerdo manda
  // pero la cantidad de voces sostiene la mitad de la nota.
  const base = n <= 1 ? acuerdo * mesa[1] : 0.55 * acuerdo + 0.45 * peso;
  const techo = opts.convocadas > 0 && n === 0 ? 0 : 1;
  return Math.round(Math.max(0, Math.min(1, base * techo)) * 100) / 100;
}

export interface ArmadoEnjambre {
  voces: VozPlana[];
  /** Por qué estas voces (se lee en la IDE, no en un log oculto). */
  motivo: string;
  /** Qué se descartó y por qué — la honestidad incluye los descartes. */
  descartes: Array<{ modelId: string; razon: string }>;
  /** true cuando hay menos voces que el mínimo: igual se consulta, se avisa. */
  porDebajoDelMinimo: boolean;
  /**
   * true cuando el enjambre no tuvo más remedio que usar una voz de respaldo
   * (regla «siempre una va a contestar»). El informe LO DICE: una voz no es
   * un consenso, es la palabra de un solo modelo con buen disfraz.
   */
  respaldo: boolean;
}

export interface RespuestaVoz {
  provider: string;
  model: string;
  ok: boolean;
  texto: string;
  /** Motivo legible cuando ok === false. */
  error?: string;
  ms: number;
  /**
   * v1.97.3 — true cuando la voz reintentó UN intento tras un fallo transitorio
   * (429/5xx o red rota pronto): el informe puede mostrar que el enjambre ya
   * gastó su segunda chance antes de declarar la voz muerta.
   */
  reintentada?: boolean;
}

export interface EvaluacionVoz {
  provider: string;
  model: string;
  ok: boolean;
  /** 0..100 — utilidad de la respuesta para la tarea (no su «verdad»). */
  puntaje: number;
  etiquetas: string[];
  /** Primeras líneas, para el informe. */
  extracto: string;
  ms: number;
}

export interface PuntoConsenso {
  /** La afirmación, tal como la dijo una de las voces (sin reescribir). */
  texto: string;
  /** Cuántas voces la sostienen. */
  voces: number;
}

export interface ConsensoMedido {
  /** 0..1 — acuerdo medio por similitud real entre respuestas utilizables. */
  acuerdo: number;
  /** Afirmaciones que sostienen al menos la mitad de las voces utilizables. */
  coincidencias: PuntoConsenso[];
  /** Afirmaciones que dijo una sola voz (lo que hay que verificar, no negar). */
  divergencias: PuntoConsenso[];
  /** Índice de la mejor respuesta utilizable, o -1. */
  mejor: number;
  /** Cuántas voces quedaron fuera de la medición (vacías/error). */
  descartadas: number;
  /** Cuántas voces contestaron con materia utilizable (la base del veredicto). */
  respondieron: number;
}

export interface VeredictoEclectico {
  /** El resumen integrado de todas las respuestas. */
  resumen: string;
  /** La respuesta final a la tarea pedida. */
  veredicto: string;
  /** 0..1 — confianza declarada (la del juez si lo hay, la medida si no). */
  confianza: number;
  coincidencias: string[];
  divergencias: string[];
  /** provider/model de la voz que mejor respondió, si la hay. */
  mejorVoz: string | null;
  riesgos: string[];
  /** "juez" cuando un modelo integró; "medido" cuando fue similitud pura. */
  origen: "juez" | "medido" | "ninguno";
}

// ─── Aduana de voces ───────────────────────────────────────────────────────

const FANTASMA = /^(fav-model|cat-|msg-|queue-)-/;
const EMBEDDING = /(embedding|embed|bge-|mxbai|nomic-embed|snowflake-arctic-embed|jina-embed)/i;
const LOCAL = /^(ollama|local)$/;

const mismoNombre = (a: string, b: string) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Arma el enjambre con lo que REALMENTE se puede llamar.
 * El orden manda: primero el modelo elegido por el usuario (es el que él pidió
 * que conteste), después ⭐ Favoritos en el orden de la carpeta.
 */
export function armarEnjambre(
  candidatos: VozPlana[],
  tieneClavePorProvider: Record<string, boolean>,
  criterio: Partial<CriterioEnjambre> = {}
): ArmadoEnjambre {
  const c: CriterioEnjambre = { ...CRITERIO_POR_DEFECTO, ...criterio };
  const descartes: Array<{ modelId: string; razon: string }> = [];

  const fila: VozPlana[] = [];
  if (c.actual && String(c.actual.modelId || "").trim()) fila.push(c.actual);
  // v2.3.6 · la ranura del usuario va DELANTE: si hay lugar, habla; si la aduana la
  // rechaza, el descarte lo dice y la fila vieja cubre (NUNCA CERO VOCES).
  const fijadas = Array.isArray(c.vocesFijas) ? c.vocesFijas : [];
  let fijadasEnFila = 0;
  for (const f of fijadas) {
    if (!f || !String(f.modelId || "").trim()) continue;
    if (fila.some((x) => mismoNombre(x.modelId, f.modelId) && x.provider === f.provider)) continue;
    fila.push({ ...f, fijada: true });
    fijadasEnFila++;
  }
  for (const f of candidatos || []) if (f && !fila.some((x) => mismoNombre(x.modelId, f.modelId) && x.provider === f.provider)) fila.push(f);

  const voces: VozPlana[] = [];
  const proveedoresUsados = new Set<string>();
  for (const v of fila) {
    const modelId = String(v.modelId || "").trim();
    const provider = String(v.provider || "").trim().toLowerCase();
    if (!modelId || !provider) {
      descartes.push({ modelId: modelId || "(sin nombre)", razon: "entrada incompleta: sin modelo o sin proveedor" });
      continue;
    }
    if (FANTASMA.test(modelId)) {
      descartes.push({ modelId, razon: "identificador interno de la IDE, no un modelo real" });
      continue;
    }
    if (EMBEDDING.test(modelId)) {
      descartes.push({ modelId, razon: "modelo de embeddings: no contesta chats" });
      continue;
    }
    if ((provider === "ollama" || provider === "local") && !c.incluirLocales) {
      descartes.push({ modelId, razon: "local: mismo hardware que el primario, mismo silencio" });
      continue;
    }
    if (provider !== "custom" && provider !== "ollama" && provider !== "local" && tieneClavePorProvider[provider] !== true) {
      descartes.push({ modelId, razon: "proveedor sin clave cargada en su ranura" });
      continue;
    }
    if (provider === "custom" && tieneClavePorProvider["custom"] !== true) {
      descartes.push({ modelId, razon: "API unificada sin URL configurada" });
      continue;
    }
    if (proveedoresUsados.has(provider)) {
      descartes.push({ modelId, razon: `otro modelo de ${provider} ya es voz: dos ecos del mismo motor no suman` });
      continue;
    }
    if (voces.length >= c.maximas) {
      descartes.push({ modelId, razon: `techo de ${c.maximas} voces por ráfaga (cuota y paciencia)` });
      continue;
    }
    // v2.3.6 · se conserva la marca de origen: el panel tiene que poder decir
    // «esta voz la puso el usuario» y no hacerle adivinar la procedencia.
    voces.push({ provider, modelId, name: v.name, ...(v.fijada ? { fijada: true } : {}) });
    proveedoresUsados.add(provider);
  }

  // ── LA VOZ DE RESPALDO (regla de Mario: «siempre una va a contestar») ──
  // Si no quedó NINGUNA voz nube, el enjambre no puede quedarse mudo: entra el
  // modelo elegido y, si no hay, un local. Se DECLARA como respaldo en el
  // informe — una voz no es consenso, y decirlo es parte del veredicto.
  let respaldo = false;
  if (voces.length === 0) {
    const candidates: VozPlana[] = [];
    if (c.actual && String(c.actual.modelId || "").trim() && !FANTASMA.test(c.actual.modelId) && !EMBEDDING.test(c.actual.modelId)) {
      candidates.push({ provider: String(c.actual.provider || "").toLowerCase(), modelId: String(c.actual.modelId).trim(), name: c.actual.name });
    }
    for (const v of fila) {
      const p = String(v.provider || "").toLowerCase();
      if ((p === "ollama" || p === "local") && !FANTASMA.test(v.modelId) && !EMBEDDING.test(v.modelId)) candidates.push({ provider: p, modelId: v.modelId, name: v.name });
    }
    for (const cand of candidates) {
      if (!cand.provider || !cand.modelId || cand.provider.startsWith("cerebro")) continue;
      voces.push(cand);
      respaldo = true;
      break;
    }
    if (respaldo) descartes.push({ modelId: "(respaldo)", razon: "sin favoritos nube utilizables: el enjambre contesta con una sola voz y lo declara" });
  }

  const porDebajoDelMinimo = voces.length < c.minimas;
  const motivo = respaldo
    ? `Enjambre en MÍNIMOS: sin voces nube disponibles, contesta una sola voz de respaldo (${voces[0] ? `${voces[0].provider}/${voces[0].modelId}` : "—"}). Veredicto de una voz: sin acuerdo con el cual contrastar.`
    : porDebajoDelMinimo
    ? `Enjambre con ${voces.length} voz (se pedían ${c.minimas} como mínimo): se consulta igual y el consenso vale menos.`
    : `Enjambre de ${voces.length} voces de ${proveedoresUsados.size} proveedores distintos.`;

  return { voces, motivo, descartes, porDebajoDelMinimo, respaldo };
}

// ─── Evaluación de cada respuesta ───────────────────────────────────────────

const PATRON_RECHAZO =
  /(no puedo|no puedo ayudar|no puedo cumplir|como (?:modelo|ia|asistente) (?:de lenguaje|ling|lenguaje|grand|de un lenguaje)|como lenguaje|no estoy capacitado|i (?:cannot|can't|am unable)|as an ai|as a language model|i'?m (?:sorry|unable)|lo siento, pero no)/i;
const PATRON_PLACEHOLDER = /(\.\.\.\s*(?:resto|el resto|resto del código|truncad)|resto del código|\/\/\s*(?:\.\.\.|aqu[ií])\s*(?:resto|sigue|contin[uú]a)|\bTODO\b|\bFIXME\b|\(\s*archivo truncado)/i;
const PATRON_PROMESA_VACIA = /^(?:claro|por supuesto|de acuerdo|perfecto|listo|entiendo|vale)[\s,.!:]*$/i;

const normaliza = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokeniza = (s: string): string[] => normaliza(s).split(" ").filter((w) => w.length > 2);

/** Similitud de Jaccard sobre tokens normalizados (0..1). Pura y barata. */
export function similitud(a: string, b: string): number {
  const A = new Set(tokeniza(a));
  const B = new Set(tokeniza(b));
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return comunes / (A.size + B.size - comunes);
}

// ─── v1.86.1 · BUCLE DE REPETICIÓN ─────────────────────────────────────────
// Sesión 1793125918256 (turnos 9-10): el usuario preguntó «¿te trancastes?
// ESTÁS REPITIENDO» y el enjambre re-entregó el MISMO veredicto del turno
// anterior. Causa raíz sin adornos: la memoria inyectaba el veredicto viejo,
// las voces re-respondían el tema viejo, y el juez integraba la repetición
// como «veredicto nuevo». Un contrato que no puede fallar no es un contrato:
// el bucle ahora se MIDE, y si existe se DECLARA, no se disfraza.
export const BUCLE_UMBRAL_SIMILITUD = 0.8;
export type MotivoBucle = "repeticion-exacta" | "repeticion-casi-exacta" | null;
export interface DiagnosticoBucle {
  bucle: boolean;
  motivo: MotivoBucle;
  /** 0..1 — similitud medida entre el veredicto anterior y el de este turno. */
  similitud: number;
  /** v1.86.2 · cuántos veredictos recordados se compararon (0 = no había con qué medir). */
  comparados: number;
  /**
   * v1.86.2 · Posición (1-based, orden cronológico) del veredicto recordado más
   * repetido. `1` significa literalmente «repitió el PRIMER mensaje»: eso fue lo
   * que denunció Mario en la sesión 1793133418292 y antes no se podía nombrar.
   */
  turnoRepetido: number;
  /** v1.86.2 · cuántos turnos recordados seguidos arrastran la misma respuesta. */
  racha: number;
}

const NO_HAY_BUCLE: DiagnosticoBucle = {
  bucle: false, motivo: null, similitud: 0, comparados: 0, turnoRepetido: 0, racha: 0,
};

// ─── v1.86.2 · LA SUSTANCIA: lo que se compara, sin el envoltorio ──────────
// Medición forense de la sesión 1793133418292 (turnos 9→11 y 13→15): el
// «Veredicto final de la tarea» era BYTE A BYTE el mismo, y sin embargo el
// detector de v1.86.1 midió 0.793 y 0.786 y no disparó. No era un problema de
// umbral: comparaba el veredicto CRUDO del juez contra el informe ENVOLTORIO
// del turno anterior (rótulos, tabla, tiempos). Comparar como con como
// —sustancia contra sustancia— da 1.000 en los mismos datos.
export const ETIQUETA_RESUMEN = "**Resumen del enjambre:**";
export const ETIQUETA_VEREDICTO = "**Veredicto final de la tarea:**";
const ETIQUETAS_INFORME = /\*\*(?:Resumen del enjambre|Veredicto final de la tarea):\*\*/g;

/** ¿Es un informe del propio enjambre (y por tanto, copiable por las voces)? */
export function esInformeEclectico(texto: string): boolean {
  const src = String(texto || "");
  return src.includes(ETIQUETA_VEREDICTO) || /^\s*🎭\s*RESPUESTA ECLÉCTICA/i.test(src);
}

/**
 * Pura: deja solo lo dicho (resumen + veredicto), sin cabecera, sin tabla de
 * voces, sin tiempos, sin «Tarea consultada». Es la UNICA representación con la
 * que se compara un veredicto: si dos turnos dijeron lo mismo, se ve.
 */
export function sustanciaDeInforme(texto: string): string {
  const src = String(texto || "");
  const iR = src.indexOf(ETIQUETA_RESUMEN);
  const iV = src.indexOf(ETIQUETA_VEREDICTO);
  if (iR === -1 && iV === -1) return src.trim();
  const desde = iR !== -1 && (iV === -1 || iR < iV) ? iR + ETIQUETA_RESUMEN.length : iV + ETIQUETA_VEREDICTO.length;
  let resto = src.slice(desde);
  const fin = resto.indexOf("> Tarea consultada:");
  if (fin !== -1) resto = resto.slice(0, fin);
  return resto.replace(ETIQUETAS_INFORME, " ").trim();
}

/**
 * v1.86.2 · DIGERIR, NO COPIAR. La causa structural del bucle: la memoria mandaba
 * lo ya dicho y una voz débil lo transcribía como respuesta nueva. Todo turno
 * asistente entra recortado a la sustancia y, si supera el tope, con una marca
 * explícita de «esto es contexto». Los turnos del usuario se mandan textuales
 * (son la tarea; no son copia).
 *
 * Se aplica a CUALQUIER turno asistente — no solo a los informes con rótulos —
 * porque el cliente (`turnoParaMemoria`) ya comprime el informe a su resolución
 * antes de subirlo, y ahí llega sin etiquetas: recortar igual es lo que corta la
 * cadena de copia.
 */
export const MEMORIA_ASISTENTE_MAX_CHARS = 260;
export const NOTA_RECORTE_ANTI_BUCLE =
  "…[veredicto anterior recortado a propósito: es CONTEXTO, no lo copies ni lo parafraseés]";

export function digerirTurnoAsistente(texto: string): string {
  const src = String(texto || "").trim();
  if (!src) return src;
  const sust = esInformeEclectico(src) ? sustanciaDeInforme(src) : src;
  if (sust.length <= MEMORIA_ASISTENTE_MAX_CHARS) return sust;
  return `${sust.slice(0, MEMORIA_ASISTENTE_MAX_CHARS).trim()} ${NOTA_RECORTE_ANTI_BUCLE}`;
}

/**
 * Pura: compará el veredicto de este turno contra los veredictos recordados
 * (en orden cronológico: el índice 0 es el primer mensaje de la sesión).
 * Devuelve el PEOR caso medido — la repetición más alta — y la racha de turnos
 * consecutivos (contando desde el más reciente) que vienen diciendo lo mismo.
 */
export function medirBucleRepeticion(recordados: (string | undefined)[] | undefined, actual: string | undefined): DiagnosticoBucle {
  // v1.86.2 · LOS DOS LADOS SE DESNUDAN. Si un lado conserva los rótulos del
  // informe y el otro no, seis tokens de cabecera alcanzan para bajar un 1.000
  // real a 0.793 y que el umbral no dispare: eso fue exactamente el rojo de
  // Mario en la sesión 1793133418292. Se compara sustancia contra sustancia.
  const b = normaliza(sustanciaDeInforme(String(actual || "")));
  const lista = (Array.isArray(recordados) ? recordados : [])
    .map((t) => normaliza(sustanciaDeInforme(String(t || ""))))
    .filter((t) => t.length > 0);
  if (!b || !lista.length) return { ...NO_HAY_BUCLE };
  let mejor = 0;
  let posicion = 0;
  for (let i = 0; i < lista.length; i++) {
    const s = lista[i] === b ? 1 : similitud(lista[i], b);
    if (s > mejor) { mejor = s; posicion = i + 1; }
  }
  // Racha: cuántos turnos seguidos (del más nuevo hacia atrás) repiten el umbral.
  let racha = 0;
  for (let i = lista.length - 1; i >= 0; i--) {
    const s = lista[i] === b ? 1 : similitud(lista[i], b);
    if (s >= BUCLE_UMBRAL_SIMILITUD) racha++;
    else break;
  }
  const bucle = mejor >= BUCLE_UMBRAL_SIMILITUD;
  return {
    bucle,
    motivo: !bucle ? null : mejor === 1 ? "repeticion-exacta" : "repeticion-casi-exacta",
    similitud: mejor,
    comparados: lista.length,
    turnoRepetido: bucle ? posicion : 0,
    racha,
  };
}

/**
 * Compatibilidad con v1.86.1: un solo veredicto anterior. Equivale a medir contra
 * la memoria de un turno (que es justo lo que la versión pasada sabía hacer).
 */
export function detectarBucleRepeticion(anterior: string | undefined, actual: string | undefined): DiagnosticoBucle {
  const a = String(anterior || "").trim();
  if (!a || !String(actual || "").trim()) return { ...NO_HAY_BUCLE };
  return medirBucleRepeticion([a], actual);
}



const fragmentos = (texto: string): string[] =>
  String(texto || "")
    .split(/\n+/)
    .map((l) => l.replace(/^[\s\-•*0-9.)\]}]+/, "").trim())
    .filter((l) => l.length >= 24);

/**
 * Evalúa UNA respuesta del enjambre. No juzga si es «verdad»: mide si SIRVE
 * para la tarea (contestó, no se excusó, no dejó placeholders, tiene cuerpo,
 * no se repide a sí misma). El puntaje es determinista: mismo texto, mismo número.
 */
export function evaluarRespuesta(v: { provider: string; model: string; ok: boolean; texto: string; ms: number }): EvaluacionVoz {
  const texto = String(v.texto || "");
  const limpio = texto.trim();
  const etiquetas: string[] = [];
  let puntaje = 0;

  if (!v.ok) {
    return { provider: v.provider, model: v.model, ok: false, puntaje: 0, etiquetas: ["sin respuesta"], extracto: "", ms: v.ms };
  }
  if (!limpio) {
    return { provider: v.provider, model: v.model, ok: true, puntaje: 0, etiquetas: ["vacia"], extracto: "", ms: v.ms };
  }

  puntaje = 40; // contestó algo legible: eso es el piso, no el mérito
  const n = limpio.length;
  if (n < 40) {
    puntaje -= 25;
    etiquetas.push("escasa");
  } else if (n < 240) {
    puntaje -= 5;
  } else if (n <= 12000) {
    puntaje += 15;
  } else {
    puntaje += 5;
    etiquetas.push("verbosa");
  }

  if (PATRON_RECHAZO.test(limpio)) {
    puntaje = Math.min(puntaje, 15);
    etiquetas.push("rechazo");
  }
  if (PATRON_PLACEHOLDER.test(limpio)) {
    puntaje -= 25;
    etiquetas.push("placeholder");
  }
  if (PATRON_PROMESA_VACIA.test(limpio)) {
    puntaje = Math.min(puntaje, 10);
    etiquetas.push("sin-contenido");
  }
  if (/"`|```|=>|const |function |def |import /.test(limpio) || /^\s*[-*]\s+/m.test(limpio)) puntaje += 10;

  // ¿Se repite a sí misma? (degeneración lineal medida en `degeneracionLineal.ts`)
  const frag = fragmentos(limpio);
  if (frag.length >= 4) {
    const vistos = new Set<string>();
    let repetidos = 0;
    for (const f of frag) {
      const clave = normaliza(f).slice(0, 80);
      if (vistos.has(clave)) repetidos++;
      else vistos.add(clave);
    }
    if (repetidos / frag.length > 0.35) {
      puntaje -= 20;
      etiquetas.push("repetitiva");
    }
  }

  puntaje = Math.max(0, Math.min(100, Math.round(puntaje)));
  const extracto = limpio.replace(/\s+/g, " ").slice(0, 180);
  return { provider: v.provider, model: v.model, ok: true, puntaje, etiquetas, extracto, ms: v.ms };
}

// ─── Consenso medido (sin juez) ────────────────────────────────────────────

/**
 * El consenso POR MEDICIÓN: cuenta qué afirmaciones sostienen varias voces y
 * cuáles dijo una sola. No inventa coincidencias — si nada se parece, el
 * acuerdo es bajo y el informe lo dice.
 */
export function medirConsenso(evaluadas: EvaluacionVoz[], respuestas: RespuestaVoz[]): ConsensoMedido {
  const utilizables: Array<{ i: number; texto: string; puntaje: number }> = [];
  evaluadas.forEach((e, i) => {
    const t = String(respuestas[i]?.texto || "").trim();
    if (e.ok && t && e.puntaje >= 25) utilizables.push({ i, texto: t, puntaje: e.puntaje });
  });

  if (utilizables.length === 0) {
    return { acuerdo: 0, coincidencias: [], divergencias: [], mejor: -1, descartadas: evaluadas.length, respondieron: 0 };
  }

  // Similitud media por pares
  let pares = 0;
  let suma = 0;
  for (let a = 0; a < utilizables.length; a++) {
    for (let b = a + 1; b < utilizables.length; b++) {
      suma += similitud(utilizables[a].texto, utilizables[b].texto);
      pares++;
    }
  }
  const acuerdo = pares > 0 ? Math.round((suma / pares) * 100) / 100 : 1;

  // Frases: cuántas voces las sostienen
  const umbral = utilizables.length >= 3 ? 0.5 : 0.6;
  const cuenta = (frase: string, excluido: number): number => {
    let c = 1;
    utilizables.forEach((u, idx) => {
      if (idx === excluido) return;
      if (similitud(frase, u.texto) >= umbral) c++;
    });
    return c;
  };

  const mitad = Math.max(2, Math.ceil(utilizables.length / 2));
  const vistos: string[] = [];
  const coincidencias: PuntoConsenso[] = [];
  const divergencias: PuntoConsenso[] = [];

  for (const u of utilizables) {
    for (const f of fragmentos(u.texto)) {
      if (vistos.some((x) => similitud(x, f) >= 0.75)) continue;
      vistos.push(f);
      const n = cuenta(f, utilizables.indexOf(u));
      if (n >= mitad) {
        if (!coincidencias.some((p) => similitud(p.texto, f) >= 0.75)) coincidencias.push({ texto: f.slice(0, 220), voces: n });
      } else if (n === 1) {
        if (!divergencias.some((p) => similitud(p.texto, f) >= 0.75)) divergencias.push({ texto: f.slice(0, 220), voces: 1 });
      }
    }
  }

  let mejor = -1;
  let mejorPuntaje = -1;
  for (const u of utilizables) {
    if (u.puntaje > mejorPuntaje) {
      mejorPuntaje = u.puntaje;
      mejor = u.i;
    }
  }

  return {
    acuerdo,
    coincidencias: coincidencias.slice(0, 8),
    divergencias: divergencias.slice(0, 6),
    mejor,
    descartadas: evaluadas.length - utilizables.length,
    respondieron: utilizables.length,
  };
}

// ─── El juez (integración) ─────────────────────────────────────────────────

/**
 * Prompt del juez: UN modelo lee todas las respuestas y firma el veredicto.
 * v1.86.1 · `anteriorVeredicto` (opcional): el veredicto del turno anterior viaja
 * ROTULADO COMO MEMORIA — el juez tiene prohibido re-entregarlo (regla 7,
 * anti-bucle). Sin memoria, el prompt queda exactamente como en v1.86.0.
 *
 * v1.86.2 · SEPARACIÓN TAREA / MEMORIA. Hasta acá el juez recibía como
 * «TAREA SOLICITADA» el prompt con la memoria pegada adentro: el bloque más
 * largo y más antiguo del texto era el primer mensaje de la sesión, y un juez
 * débil integraba ESO (sesión 1793133418292: cuatro turnos firmando el mismo
 * «Crear el archivo components/Preview.js…»). Ahora la tarea va sola y la
 * memoria va en su propio rótulo, al final. `tarea` puede seguir siendo el
 * prompt con memoria (compatibilidad); cuando se manda `memoria` aparte, la
 * tarea se le recorta y el juez ve una sola cosa que contestar.
 *
 * v1.86.2 · `correccionBucle`: el re-empuje. Cuando el informe mide que la
 * firma repite un turno recordado, se le pide UNA segunda integración nombrando
 * exactamente qué repitió. Es el mismo gesto de `auditoriaBucle.ts` (anuncio sin
 * acción → re-empuje), aplicado al juez.
 */
export function promptDelJuez(
  tarea: string,
  respuestas: RespuestaVoz[],
  opts: { anteriorVeredicto?: string; memoria?: string; correccionBucle?: string } = {}
): { sistema: string; usuario: string } {
  const cuerpo = (respuestas || [])
    .map((r, i) => {
      const texto = r.ok && String(r.texto || "").trim() ? String(r.texto).trim().slice(0, 4000) : `(sin respuesta: ${String(r.error || "vacío").slice(0, 160)})`;
      return `--- VOZ ${i + 1} · ${r.provider}/${r.model} ---\n${texto}`;
    })
    .join("\n\n");

  const memoriaSeparada = typeof opts.memoria === "string" && opts.memoria.trim();
  const tareaLimpia = memoriaSeparada
    ? String(tarea || "").split("[LA TAREA DE ESTE TURNO — RESPONDE ESTO CON LA MEMORIA DE ARRIBA]")[1]?.trim() || String(tarea || "")
    : String(tarea || "");

  const bloqueMemoria = memoriaSeparada
    ? `\n\n── MEMORIA DE LA SESIÓN (contexto: NO es la tarea; si tu firma coincide con esto sin avanzar, es un fallo) ──\n${String(opts.memoria).slice(0, 2600)}`
    : "";
  const bloqueAnterior = !memoriaSeparada && opts.anteriorVeredicto
    ? `\n\n── VEREDICTO DEL TURNO ANTERIOR (memoria: contexto, NO lo repitas; la tarea es solo la de arriba) ──\n${String(opts.anteriorVeredicto).slice(0, 1200)}`
    : "";
  const bloqueCorreccion = opts.correccionBucle
    ? `\n\n── RE-EMPUJE: TU FIRMA ANTERIOR REPITIÓ LA MEMORIA ──\n${String(opts.correccionBucle).slice(0, 1400)}\nRehacé la integración contestando SOLO la TAREA SOLICITADA de arriba. Si no hay nada nuevo que decir, no repitas: firmá qué FALTA para avanzar y qué acción concreta hay que tomar (archivo, herramienta, verificación).`
    : "";

  return {
    sistema: [
      "Eres el INTEGRADOR de un enjambre de modelos. No contestás desde tu cabeza: leés TODAS las respuestas y firmás una sola.",
      "Reglas: (1) lo que varias voces dicen parecido es CONSENSO; (2) lo que dijo una sola es DIVERGENCIA y se marca como tal, no se niega;",
      "(3) si las voces se contradicen en un hecho, se declara la contradicción y se dice qué verificar;",
      "(4) nada de inventar datos que ninguna voz aportó; (5) respondé en español técnico, directo, sin relleno;",
      "(6) LA CONFIANZA ESCALA CON LAS VOCES QUE CONTESTARON: una sola voz = 0.3 o menos; dos rondando 0.5; tres o más coincidiendo = 0.7 en adelante. No la regales.",
      "(7) ANTI-BUCLE: el usuario consulta por turnos. Contestá ÚNICAMENTE la tarea solicitada de arriba: si el veredicto del turno anterior aparece como memoria, NO lo repitas ni lo parafraseés — avanzá con lo que ESTA tarea pide.",
      "(8) TAREA ≠ MEMORIA: lo único que hay que contestar es lo que va después de «TAREA SOLICITADA:». Si el bloque de memoria es más largo que la tarea, eso no te da permiso de re-entregar lo de la memoria: una firma que coincide con la memoria sin avanzar es un fallo, no una respuesta.",
      "Devolvé SOLO este JSON, sin texto alrededor:",
      '{"resumen":"consolidado de todas las respuestas","veredicto":"respuesta final a la tarea pedida","confianza":0.0,"coincidencias":["..."],"divergencias":["..."],"riesgos":["..."],"mejor_voz":"provider/modelo"}',
    ].join("\n"),
    usuario:
      `TAREA SOLICITADA:\n${tareaLimpia.slice(0, 6000)}\n\nRESPUESTAS DEL ENJAMBRE (${(respuestas || []).length}):\n\n${cuerpo}` +
      bloqueMemoria +
      bloqueAnterior +
      bloqueCorreccion,
  };
}

/** Lectura tolerante del JSON del juez (acepta texto alrededor). */
export function parsearVeredictoJuez(texto: string): VeredictoEclectico | null {
  const bruto = String(texto || "");
  const inicio = bruto.indexOf("{");
  const fin = bruto.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) return null;
  let j: any;
  try {
    j = JSON.parse(bruto.slice(inicio, fin + 1));
  } catch {
    return null;
  }
  const lista = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  const resumen = String(j?.resumen || "").trim();
  const veredicto = String(j?.veredicto || "").trim();
  if (!resumen && !veredicto) return null;
  const confianzaRaw = Number(j?.confianza);
  return {
    resumen: resumen || veredicto,
    veredicto: veredicto || resumen,
    confianza: Number.isFinite(confianzaRaw) ? Math.max(0, Math.min(1, confianzaRaw)) : 0.5,
    coincidencias: lista(j?.coincidencias),
    divergencias: lista(j?.divergencias),
    mejorVoz: j?.mejor_voz ? String(j.mejor_voz) : null,
    riesgos: lista(j?.riesgos),
    origen: "juez",
  };
}

/**
 * Veredicto sin juez: el consenso MEDIDO manda, y el informe lo dice en la
 * primera línea. Nunca se disfraza de integración lo que es comparación.
 */
export function veredictoMedido(evaluadas: EvaluacionVoz[], respuestas: RespuestaVoz[]): VeredictoEclectico {
  const c = medirConsenso(evaluadas, respuestas);
  const mejor = c.mejor >= 0 ? `${respuestas[c.mejor].provider}/${respuestas[c.mejor].model}` : null;
  const textoMejor = c.mejor >= 0 ? String(respuestas[c.mejor].texto || "").trim() : "";
  return {
    resumen:
      c.coincidencias.length > 0
        ? c.coincidencias.map((p) => `- ${p.texto} (${p.voces} voces)`).join("\n")
        : c.respondieron <= 1
        ? "Una sola voz contestó: no hay nada con qué contrastarla."
        : "Ninguna afirmación en común: las voces no coinciden en nada medible.",
    veredicto: textoMejor
      ? `${textoMejor.length > 2400 ? textoMejor.slice(0, 2400) + " …" : textoMejor}`
      : "Sin respuesta utilizable en el enjambre.",
    // La confianza ESCALA con cuántas contestaron (regla de Mario: «si muchos
    // contestan, mejor será el veredicto»), no solo con qué tan parecido está.
    confianza: confianzaEclectica({ acuerdo: c.acuerdo, respondieron: c.respondieron, convocadas: respuestas.length }),
    coincidencias: c.coincidencias.map((p) => p.texto),
    divergencias: c.divergencias.map((p) => p.texto),
    mejorVoz: mejor,
    riesgos: c.divergencias.slice(0, 3).map((p) => `Divergencia sin confirmar: ${p.texto.slice(0, 140)}`),
    origen: "medido",
  };
}

export function veredictoNinguno(): VeredictoEclectico {
  return {
    resumen: "",
    veredicto: "El enjambre no obtuvo ninguna respuesta utilizable.",
    confianza: 0,
    coincidencias: [],
    divergencias: [],
    mejorVoz: null,
    riesgos: [],
    origen: "ninguno",
  };
}

/**
 * v1.86.5 · LA CERTEZA LLEGA AL ENJAMBRE (evolución «perfección de certeza»).
 *
 * El enjambre GENERA texto (las voces y el juez), nunca ejecuta un comando ni
 * lee un archivo: la evidencia honesta es vacía y `certezaDe({})` da
 * `sin_verificar`. Hasta acá el veredicto se firmaba sin pasar por el revisor
 * (`certezaModelo.revisarSalida`), así que podía decir «funciona», «verificado»
 * o «listo» sin una ejecución que lo respalde — y para el usuario sonaba igual
 * que un informe con la puerta ejecutada detrás. El camino del chat ya pasaba
 * por el revisor (`server/streamContext.ts`); el del enjambre no. Esto cierra
 * esa brecha en el PUNTO PURO (probable sin servidor): se reescriben las
 * afirmaciones del `resumen` y el `veredicto` ANTES de firmar el informe.
 *
 * Qué NO se toca, y por qué:
 *   · `coincidencias` y `divergencias` son CITAS de lo que dijeron las voces, y
 *     reescribirlas sería falsificar la evidencia (que ya se etiqueta
 *     «verificar antes de confiar» / «lo sostienen varias voces»). Se cita,
 *     no se firma.
 *   · la determinística del informe (marcadores, tabla, acuerdos) no lleva
 *     palabras de afirmación, así que el revisor no la altera.
 */
export interface VeredictoConCerteza {
  veredicto: VeredictoEclectico;
  /** Siempre `sin_verificar` acá: el enjambre no ejecuta ni lee. */
  certeza: Certeza;
  /** Palabras que prometían más de lo que la evidencia sostiene (ya reescritas). */
  avisos: AvisoVocabulario[];
}

export function revisarVeredictoDelEnjambre(veredicto: VeredictoEclectico): VeredictoConCerteza {
  const rResumen = revisarSalida(veredicto.resumen || "");
  const rVeredicto = revisarSalida(veredicto.veredicto || "");
  return {
    veredicto: {
      ...veredicto,
      resumen: rResumen.texto,
      veredicto: rVeredicto.texto,
    },
    certeza: rVeredicto.certeza,
    avisos: [...rResumen.avisos, ...rVeredicto.avisos],
  };
}

// ─── El informe (cara humana, determinista) ────────────────────────────────

const barra = (v: number): string => {
  const lleno = Math.max(0, Math.min(10, Math.round(v * 10)));
  return "█".repeat(lleno) + "░".repeat(10 - lleno);
};

/**
 * Render del informe final. Determinista: mismos datos → mismos bytes
 * (la casa exige que el manual y el informe se puedan comparar entre versiones).
 */
export function informeEclectico(opts: {
  tarea: string;
  respuestas: RespuestaVoz[];
  evaluadas: EvaluacionVoz[];
  veredicto: VeredictoEclectico;
  juez?: VozPlana | null;
  motivoArmado?: string;
  /** v1.84.5 — qué memoria se inyectó en el turno (línea honesta bajo el rótulo). */
  notaMemoria?: string;
  /** v1.86.1 — veredicto del turno anterior: con él se MIDE el bucle de repetición. */
  anteriorVeredicto?: string;
  /**
   * v1.86.2 — TODOS los veredictos recordados, en orden cronológico (el índice 0
   * es el primer mensaje de la sesión). Con esto el detector puede decir a qué
   * turno se volvió, en vez de mirar nomás el vecino inmediato.
   */
  recordadosVeredictos?: string[];
  /** v1.86.2 — cuántas veces se re-empujó al juez por medir repetición (0, 1). */
  reempuje?: number;
}): string {
  const { respuestas, evaluadas, veredicto } = opts;
  const lines: string[] = [];
  const contestaron = (evaluadas || []).filter((e) => e && e.ok && e.puntaje >= 25).length;
  lines.push(`🎭 RESPUESTA ECLÉCTICA — ${contestaron}/${respuestas.length} voces contestaron, un solo prompt`);
  if (opts.motivoArmado) lines.push(`   ${opts.motivoArmado}`);
  if (opts.notaMemoria) lines.push(`   ${opts.notaMemoria}`);
  // v1.86.1 · BUCLE DE REPETICIÓN: se mide contra el veredicto anterior y, si
  // existe, SE DECLARA en la cara visible. Un enjambre que re-entrega el mismo
  // veredicto no avanzó, y decirlo es parte del veredicto (se declara, no se
  // disfraza de respuesta nueva).
  // v1.86.2 · se mide CONTRA TODA LA MEMORIA y sobre la SUSTANCIA de cada
  // informe, que es lo único comparable. La versión anterior comparaba envoltorio
  // contra envoltorio y medía 0.79 en un veredicto idéntico (sesión 1793133418292).
  const recordados = Array.isArray(opts.recordadosVeredictos) && opts.recordadosVeredictos.length
    ? opts.recordadosVeredictos
    : (opts.anteriorVeredicto ? [opts.anteriorVeredicto] : []);
  const diagnosticoBucle = medirBucleRepeticion(
    recordados,
    `${veredicto.resumen}\n${veredicto.veredicto}`
  );
  const riesgos = [...(veredicto.riesgos || [])];
  if (diagnosticoBucle.bucle) {
    const donde = diagnosticoBucle.comparados > 1
      ? `el turno ${diagnosticoBucle.turnoRepetido} de ${diagnosticoBucle.comparados} recordados${diagnosticoBucle.turnoRepetido === 1 ? " — EL PRIMERO de la sesión" : ""}`
      : "el turno anterior";
    const racha = diagnosticoBucle.racha >= 2 ? ` · van ${diagnosticoBucle.racha + 1} turnos diciendo lo mismo` : "";
    lines.push(
      `   ⛔ BUCLE DE REPETICIÓN DETECTADO (similitud ${Math.round(diagnosticoBucle.similitud * 100)} %, ${diagnosticoBucle.motivo}): este veredicto repite ${donde}${racha}. El enjambre NO avanzó: se declara, no se disfraza de respuesta nueva.`
    );
    riesgos.push(
      `Bucle de repetición (similitud ${Math.round(diagnosticoBucle.similitud * 100)} % con ${donde}): el enjambre re-entregó un veredicto viejo${
        (opts.reempuje || 0) > 0 ? ` y el re-empuje #${opts.reempuje} tampoco lo rompió` : ""
      }; cambió la tarea o sumá voces con ⭐ — consultar lo mismo otra vez no produce nada nuevo.`
    );
  }
  if ((opts.reempuje || 0) > 0) {
    lines.push(
      `   ↻ RE-EMPUJE DEL JUEZ (${opts.reempuje}): la primera integración repetía la memoria y se pidió de nuevo. Se declara el intento, no se esconde.`
    );
  }
  if (contestaron === 1) {
    lines.push("   ⚠ Veredicto de UNA sola voz: no hubo con qué contrastarla. Marcá más modelos con ⭐ para que el consenso valga.");
  } else if (contestaron >= 3) {
    lines.push(`   ↑ El veredicto vale más: ${contestaron} motores independientes coinciden o se contradicen en lo concreto.`);
  }
  lines.push("");
  lines.push("| # | voz | estado | puntaje | ms |");
  lines.push("|---|-----|--------|---------|----|");
  respuestas.forEach((r, i) => {
    const e = evaluadas[i];
    const estadoBase = !r.ok ? `✗ ${String(r.error || "error").slice(0, 60)}` : e && e.etiquetas.length > 0 ? `✓ ${e.etiquetas.join(",")}` : "✓";
    // v1.97.3 · el reintento se declara: nadie ve una voz «muerta» sin saber que
    // el enjambre ya gastó su segunda chance por un fallo transitorio.
    const estado = r.reintentada ? `${estadoBase} · reintentada` : estadoBase;
    lines.push(`| ${i + 1} | ${r.provider}/${r.model} | ${estado} | ${e ? e.puntaje : "-"} | ${Math.round(r.ms)} |`);
  });
  lines.push("");
  lines.push(`**Acuerdo medido:** ${barra(veredicto.confianza)} ${Math.round(veredicto.confianza * 100)} %` +
    (veredicto.origen === "juez"
      ? ` · integrado por ${opts.juez ? `${opts.juez.provider}/${opts.juez.modelId}` : "el juez"}`
      : veredicto.origen === "medido"
      ? " · sin juez: consenso por similitud real entre respuestas"
      : " · sin material para consensuar"));
  if (veredicto.mejorVoz) lines.push(`**Voz más sólida:** ${veredicto.mejorVoz}`);
  if (veredicto.coincidencias.length > 0) {
    lines.push("");
    lines.push("**Coincidencias (lo sostienen varias voces):**");
    for (const c of veredicto.coincidencias.slice(0, 8)) lines.push(`- ${c}`);
  }
  if (veredicto.divergencias.length > 0) {
    lines.push("");
    lines.push("**Divergencias (lo dijo una sola voz — verificar antes de confiar):**");
    for (const d of veredicto.divergencias.slice(0, 6)) lines.push(`- ${d}`);
  }
  if (riesgos.length > 0) {
    lines.push("");
    lines.push("**Riesgos declarados:**");
    for (const r of riesgos.slice(0, 6)) lines.push(`- ${r}`);
  }
  if (veredicto.resumen && veredicto.resumen !== veredicto.veredicto) {
    lines.push("");
    lines.push("**Resumen del enjambre:**");
    lines.push(veredicto.resumen);
  }
  lines.push("");
  lines.push("**Veredicto final de la tarea:**");
  lines.push(veredicto.veredicto || "(vacío)");
  lines.push("");
  lines.push(`> Tarea consultada: ${String(opts.tarea || "").replace(/\s+/g, " ").slice(0, 240)}`);
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.88.0 · LA FASE 2: EL VEREDICTO EJECUTA
// ═══════════════════════════════════════════════════════════════════════════
// EL DEFECTO MEDIDO (sesión 1793219578712): el enjambre devolvía «Veredicto
// final de la tarea: ```bash fs_write …```» — una orden escrita, no ejecutada.
// `SISTEMA_VOCES` lo ordenaba así porque esa llamada va sin `tools`. La fase 1
// (deliberar en paralelo, barato) es correcta; lo que faltaba es la fase 2.
//
// ESTAS FUNCIONES SON EL CRITERIO, PURO: deciden si la tarea pide OBRA (y no
// consejo), redactan el encargo del ejecutor y firman el bloque de resultado.
// Quien llama a las herramientas vive en `server/enjambreLlamadas.ts`.

/**
 * ¿La tarea pide que se HAGA algo con efecto, o solo que se opine?
 * Se busca la RAIZ del verbo (no la forma conjugada completa): «hacerme un pdf»
 * y «generá el informe» son obra; las dos llevan el verbo en medio de la frase.
 */
const VERBO_DE_OBRA =
  /(^|\s)(cre(a|á|ar|es|en)|gener(a|á|ar|es|en)|hac(e|é|er|es|erme|erlo)|escrib(i|í|ir|e|as)|guard(a|á|ar|e|alo)|dej(a|á|ar|alo|alo ahí)|instal(a|á|ar|e)|borr(a|á|ar|e)|modific(a|á|ar|e)|edit(a|á|ar|e)|refactoriz(a|á|ar|e)|ejecut(a|á|ar|e)|corr(e|é|er|elo)|abr(e|í|ir|elo)|descarg(a|á|ar|e)|export(a|á|ar|e)|convert(i|í|ir|e)|renombr(a|á|ar|e)|muev(e|a|elo)|sincroniz(a|á|ar|e))/i;

/** Una pregunta pide criterio, no obra: «¿cómo hago un PDF?» no se ejecuta. */
const ARRANQUE_DE_PREGUNTA =
  /^\s*(¿|cómo\b|como\b|qué\b|que\b|por qué\b|porque\b|cuál\b|cual\b|cuándo\b|cuando\b|dónde\b|donde\b|quién\b|quien\b|puedes explicar|me explicas|explicame|explicá)/i;

/** Decide si el turno ecléctico necesita fase 2. Función pura y testeable. */
export function tareaPideEjecucion(tarea: string): boolean {
  const t = String(tarea ?? "").trim();
  if (t.length < 6) return false; // «hola», «sigue», «continúa»: no hay tarea
  if (ARRANQUE_DE_PREGUNTA.test(t)) return false;
  return VERBO_DE_OBRA.test(t);
}

/** El encargo del ejecutor. Corto y con la prohibición explícita de narrar. */
export const SISTEMA_EJECUTOR =
  "Sos la VOZ EJECUTORA del enjambre de CerebróNico. Recibís una tarea y un plan ya deliberado por varias voces. " +
  "Tenés herramientas reales conectadas al IDE: escriben archivos, leen el disco, ejecutan comandos, generan documentos y hablan con el puente del PC. " +
  "REGLA ÚNICA: ejecutá, no narres. No digas «voy a», no expliques cómo se haría, no devuelvas fragmentos de código como si fueran la entrega. " +
  "Si la tarea pide un archivo, el archivo debe quedar escrito y debés nombrar su ruta exacta. " +
  "Si una herramienta falla, corregí y reintentá con otra ruta o herramienta; si no podés, decí el motivo real y qué falta. " +
  "Al terminar, una sola línea: qué quedó hecho, con rutas y cifras medidas (bytes, páginas, líneas). Nunca inventes una cifra.";

/** El prompt de la fase 2: la tarea, el plan del enjambre y la orden de actuar. */
export function promptDeEjecucion(tarea: string, plan?: string): string {
  const p = String(plan ?? "").trim();
  return [
    `TAREA DEL USUARIO:\n${String(tarea ?? "").trim()}`,
    p ? `PLAN DEL ENJAMBRE (referencia, no obligación — si el plan está mal, hacé lo correcto):\n${p.slice(0, 4000)}` : "",
    "EJECUTÁ AHORA con las herramientas. No describas pasos: dalos. Al cerrar, resumí en una línea qué quedó escrito y dónde.",
  ].filter(Boolean).join("\n\n");
}

export interface PasoDeObra {
  nombre: string;
  ok: boolean;
  resumen: string;
}

/** El bloque que se añade al informe. Si no hubo efecto, LO DICE. */
export function bloqueDeObra(r: {
  intentado: boolean;
  ok: boolean;
  pasos: PasoDeObra[];
  texto?: string;
  error?: string;
  ejecutor?: string;
  vueltas?: number;
}): string {
  if (!r.intentado) return "";
  const cabecera = "### Fase 2 · la tarea, ejecutada";
  if (!r.pasos.length) {
    return `${cabecera}\n**No se ejecutó nada.** ${r.error ? `Motivo: ${r.error}` : "El ejecutor no llegó a usar ninguna herramienta."}`;
  }
  const lineas = r.pasos.map((p) => `- \`${p.nombre}\` ${p.ok ? "✔" : "✗"} — ${p.resumen.replace(/\s+/g, " ").slice(0, 160)}`);
  const conEfecto = r.pasos.filter((p) => p.ok).length;
  const veredicto = r.ok
    ? `**${conEfecto} de ${r.pasos.length} paso(s) con efecto real${r.ejecutor ? ` · ejecutor ${r.ejecutor}` : ""}.**`
    : `**Ningún paso tuvo efecto. ${r.error ? `Motivo: ${r.error}` : "La tarea queda pendiente."}**`;
  const cierre = r.texto ? `\n\n> ${r.texto.replace(/\s+/g, " ").slice(0, 320)}` : "";
  return `${cabecera}\n${lineas.join("\n")}\n\n${veredicto}${cierre}`;
}
