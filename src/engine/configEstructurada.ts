/**
 * configEstructurada.ts — SALIDA FORZADA A JSON + ORDEN DE CACHÉ (v1.53.3 · Paso A)
 * =====================================================================================
 * QUÉ CURA: la Hoja de Ruta v1.53.2 (Paso A.1) pide AUDITAR si las llamadas
 * cloud (Gemini / Z.ai) FUERZAN salida estructurada. La auditoría dio NO: la
 * rama Gemini de server.ts arma `config` SIN `responseMimeType`, y la rama
 * OpenAI-compat (Z.ai/GLM/Groq/OpenRouter) no manda `response_format`. Sin eso,
 * el agente «arquitecto» puede devolver prosa alrededor del JSON → el parser se
 * rompe → reparación → quema créditos. Determinismo barato = pedir JSON de raíz.
 *
 * Y la estrategia de VELOCIDAD (TTFT): el prefill del contexto redundante es el
 * cuello de botella. Para que el prompt-cache (implícito o explícito) del
 * proveedor SOBREVIVA entre llamadas, los bloques deben ir de lo MÁS ESTÁTICO
 * (esquemas, kbArquitectura, reglas de la casa) a lo MÁS DINÁMICO (el archivo
 * que se está editando). Si lo dinámico va en medio, invalida el caché de todo
 * lo que viene detrás. Aquí se ORDENA eso de forma pura y determinista.
 *
 * PURO: no toca red, ni disco, ni SDK. Recibe clase de tarea + proveedor +
 * segmentos y devuelve (a) el fragmento de config que el que llama mete en su
 * llamada, y (b) los segmentos reordenados + una clave de caché estable. El
 * cableado (meter esto en server.ts) lo hace quien llama — trinquete intacto.
 * Se prueba entero en tests/configEstructurada.test.ts (npx tsx).
 */

/** Las dos familias de API que usa el IDE para la nube. */
export type ProveedorApi = "gemini" | "openai-compat";

/** ¿La tarea EXIGE un objeto JSON estricto, o es prosa libre? */
export type ClaseSalida = "json" | "texto";

/**
 * Clasifica el modelo en una de las dos familias de API. No reinventa el
 * detector de proveedor de server.ts (ese decide red/clave); esto solo elige
 * la FORMA del campo de salida estructurada, que difiere entre Gemini (campo
 * `responseMimeType`) y el resto OpenAI-compatible (campo `response_format`).
 */
export function proveedorApiDe(modelo: string): ProveedorApi {
  const m = String(modelo || "").toLowerCase();
  return m.startsWith("gemini") || m.startsWith("models/gemini") ? "gemini" : "openai-compat";
}

/** El fragmento de config que se mezcla (spread) en la llamada del proveedor. */
export interface FragmentoSalida {
  /** Campos para `config` de Gemini (generateContent / generateContentStream). */
  gemini: Record<string, unknown>;
  /** Campos para el body OpenAI-compatible (chat/completions). */
  openaiCompat: Record<string, unknown>;
}

/**
 * Devuelve el fragmento de salida estructurada para la familia de API dada.
 * Con `clase === "texto"` NO fuerza nada (devuelve {} — cero regresión sobre el
 * camino de prosa de hoy). Con `clase === "json"`:
 *   · Gemini         → responseMimeType: "application/json" (+ responseSchema
 *                      si se pasa un esquema).
 *   · OpenAI-compat  → response_format json_schema estricto si hay esquema, o
 *                      json_object si no lo hay.
 * Determinista: mismas entradas → mismo fragmento.
 */
export function fragmentoSalida(
  clase: ClaseSalida,
  schema?: Record<string, unknown> | null,
  nombreSchema = "salida",
): FragmentoSalida {
  if (clase !== "json") return { gemini: {}, openaiCompat: {} };

  const gemini: Record<string, unknown> = { responseMimeType: "application/json" };
  if (schema) gemini.responseSchema = schema;

  const openaiCompat: Record<string, unknown> = schema
    ? { response_format: { type: "json_schema", json_schema: { name: nombreSchema, schema, strict: true } } }
    : { response_format: { type: "json_object" } };

  return { gemini, openaiCompat };
}

/** Azarúcar: el fragmento correcto para UN modelo concreto. */
export function fragmentoSalidaPara(
  modelo: string,
  clase: ClaseSalida,
  schema?: Record<string, unknown> | null,
  nombreSchema = "salida",
): Record<string, unknown> {
  const f = fragmentoSalida(clase, schema, nombreSchema);
  return proveedorApiDe(modelo) === "gemini" ? f.gemini : f.openaiCompat;
}

// =====================================================================================
// ORDEN DE CACHÉ (perf #1 y #2 de la Hoja de Ruta): de lo estático a lo dinámico
// =====================================================================================

/** Cuán estable es un bloque de contexto. El caché vive mientras no cambie. */
export type Estabilidad = "estatico" | "semi" | "dinamico";

/** Un bloque de contexto que viaja en el prompt. */
export interface SegmentoContexto {
  /** Etiqueta libre para auditar (p.ej. "kbArquitectura", "archivo-editado"). */
  nombre: string;
  /** estatico = esquemas/kb/reglas; semi = instrucciones de sistema; dinamico = código que cambia. */
  estabilidad: Estabilidad;
  /** El texto del bloque. */
  texto: string;
}

const RANGO_ESTABILIDAD: Record<Estabilidad, number> = { estatico: 0, semi: 1, dinamico: 2 };

/**
 * Reordena los segmentos de lo MÁS ESTÁTICO a lo MÁS DINÁMICO para preservar el
 * prompt-cache del proveedor. ESTABLE: dentro de un mismo nivel de estabilidad
 * respeta el orden original (no baraja esquemas entre sí). Así el prefijo
 * estático es BYTE-A-BYTE idéntico entre llamadas → cache hit; el único bloque
 * que cambia (el archivo editado) queda al final y NO invalida lo de atrás.
 */
export function ordenarParaCache(segmentos: SegmentoContexto[]): SegmentoContexto[] {
  const lista = Array.isArray(segmentos) ? segmentos.filter(Boolean) : [];
  // sort estable por índice como desempate (Array.sort es estable en Node ≥12,
  // pero no dependemos de ello: desempatamos con el índice original explícito).
  return lista
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (RANGO_ESTABILIDAD[a.s.estabilidad] - RANGO_ESTABILIDAD[b.s.estabilidad]) || (a.i - b.i))
    .map((x) => x.s);
}

/**
 * Clave de caché determinista para el PREFIJO ESTABLE (estatico + semi). Es lo
 * que el que llama puede usar como id de `cachedContents` (Gemini) o para
 * decidir si reutiliza un caché ya creado. djb2 → hex, sin dependencias.
 * Solo el bloque dinámico queda fuera de la clave (es lo que debe cambiar).
 */
export function claveCache(segmentos: SegmentoContexto[]): string {
  const estable = ordenarParaCache(segmentos).filter((s) => s.estabilidad !== "dinamico");
  const texto = estable.map((s) => `${s.nombre}\u0000${s.texto}`).join("\u0001");
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return "cc_" + h.toString(16).padStart(8, "0");
}
