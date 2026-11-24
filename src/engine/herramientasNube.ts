/**
 * herramientasNube.ts — EL PUENTE DE HERRAMIENTAS PARA LA NUBE (v1.44.0)
 * ====================================================================
 * El síntoma de Mario (sesión JSON, msgs 8-19): con un modelo CLOUD
 * (gemini-3.5-flash-lite) el agente «inventaba» una función puente
 * «consultarEscritorioMCP» y caía en el bucle «hazlo / no puedo». La RAÍZ
 * confirmada: la rama Gemini de server.ts transmitía TEXTO y nada más — el
 * modelo recibía los NOMBRES de las herramientas en el prompt, pero el SDK
 * nunca recibía las `tools` ni se interpretaban las `functionCall`. El modelo
 * no tenía MANOS: solo podía hablar de herramientas, no llamarlas. Por eso
 * alucinaba un puente y luego se contradecía.
 *
 * Esta capa es LÓGICA PURA (sin red, sin disco, sin SDK): traduce el formato
 * de herramientas que ya usa el bucle de Ollama (estilo OpenAI/Ollama
 * `{ type:'function', function:{ name, description, parameters } }`) al
 * formato que entiende el SDK `@google/genai` (`functionDeclarations`), y
 * extrae de una respuesta/chunk de Gemini las llamadas a herramientas, sea
 * cual sea la forma en que vengan. Así el cableado real vive en server.ts
 * reutilizando `executeToolCall` (el MISMO ejecutor del bucle de Ollama), y
 * esta traducción se prueba entera (tests/herramientasNube.test.ts).
 *
 * Límite ético/legal: estas herramientas (fs/pc/web) actúan sobre lo que el
 * usuario POSEE y bajo su autorización; la descarga/navegación web mantiene
 * su flujo de confirmación previa en el puente :5000. Esta capa no decide eso,
 * solo transporta el contrato.
 */

// ═══════════════════════════════════════════════════════════════
// 1. TRADUCCIÓN: tools estilo Ollama/OpenAI  →  functionDeclarations de Gemini
// ═══════════════════════════════════════════════════════════════

export interface LlamadaHerramienta {
  name: string;
  args: Record<string, any>;
  // v1.45.6 — FIRMA DE PENSAMIENTO (Gemini 3). Los modelos "thinking" de
  // Gemini 3 devuelven una `thoughtSignature` pegada a la parte de la
  // `functionCall`. Esa firma hay que DEVOLVÉRSELA tal cual en el siguiente
  // turno, dentro de la misma parte. Si no se devuelve, Gemini corta con
  // 400: «Function call is missing a thought_signature in functionCall
  // parts». Por eso la capturamos acá y viaja con la llamada.
  thoughtSignature?: string;
}

/**
 * Campos de JSON-Schema que Gemini acepta en el `parameters` de una
 * functionDeclaration. El resto (p. ej. `$schema`, `additionalProperties`,
 * `default`, `examples`) hace que el SDK rechace el esquema entero, así que se
 * PODA. Mejor una herramienta con esquema mínimo que una petición que revienta.
 */
const CLAVES_SCHEMA_GEMINI = new Set([
  "type",
  "description",
  "properties",
  "items",
  "enum",
  "required",
  "nullable",
  "format",
]);

/** Gemini espera el `type` en MAYÚSCULAS (OBJECT, STRING, …). */
function tipoGemini(t: unknown): string | undefined {
  if (typeof t !== "string") return undefined;
  return t.trim().toUpperCase();
}

/**
 * Normaliza un JSON-Schema arbitrario al subconjunto que acepta Gemini.
 * Recursivo sobre `properties` e `items`. Nunca lanza: ante algo raro,
 * devuelve lo mejor que puede.
 */
export function sanitizarSchemaGemini(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return { type: "OBJECT", properties: {} };
  }
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!CLAVES_SCHEMA_GEMINI.has(k)) continue;
    if (k === "type") {
      const t = tipoGemini(v);
      if (t) out.type = t;
    } else if (k === "properties" && v && typeof v === "object") {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v as Record<string, any>)) {
        out.properties[pk] = sanitizarSchemaGemini(pv);
      }
    } else if (k === "items") {
      out.items = sanitizarSchemaGemini(v);
    } else {
      out[k] = v;
    }
  }
  // Gemini exige un `type` siempre; si no vino, lo más seguro es OBJECT.
  if (!out.type) out.type = "OBJECT";
  // Gemini RECHAZA (error 400) cualquier ARRAY que no declare `items`.
  // Ese era el fallo real: una herramienta con un campo lista (p. ej. `faq`)
  // sin `items` tumbaba TODA la petición. Garantizamos un `items` válido.
  if (out.type === "ARRAY" && (!out.items || typeof out.items !== "object")) {
    out.items = { type: "STRING" };
  }
  return out;
}

/**
 * Traduce la lista de herramientas estilo Ollama/OpenAI
 * (`{ type:'function', function:{ name, description, parameters } }`) a las
 * `functionDeclarations` de Gemini. Descarta entradas sin nombre.
 */
export function toGeminiFunctionDeclarations(ollamaTools: any[]): any[] {
  if (!Array.isArray(ollamaTools)) return [];
  const out: any[] = [];
  for (const t of ollamaTools) {
    const fn = t?.function ?? t;
    const name = fn?.name;
    if (!name || typeof name !== "string") continue;
    const decl: any = { name };
    if (fn?.description) decl.description = String(fn.description);
    // Gemini NO acepta `parameters` vacío/omitido como «objeto sin campos» en
    // todas las versiones; si no hay propiedades, se omite `parameters` y la
    // herramienta queda sin argumentos (válido para list_files, etc.).
    const params = fn?.parameters;
    const tieneProps =
      params && typeof params === "object" &&
      params.properties && typeof params.properties === "object" &&
      Object.keys(params.properties).length > 0;
    if (tieneProps) decl.parameters = sanitizarSchemaGemini(params);
    out.push(decl);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// 2. EXTRACCIÓN: de un chunk/respuesta de Gemini  →  llamadas a herramientas
// ═══════════════════════════════════════════════════════════════

/**
 * Saca las llamadas a herramientas de un chunk/respuesta del SDK `@google/genai`,
 * tolerando las tres formas en que pueden venir según versión del SDK:
 *   a) `resp.functionCalls` como array — el camino directo del SDK nuevo.
 *   b) `resp.functionCalls` como función — variantes que lo exponen así.
 *   c) hurgando en `resp.candidates[].content.parts[].functionCall`.
 * Nunca lanza: ante algo inesperado devuelve [].
 */
export function extraerLlamadasGemini(resp: any): LlamadaHerramienta[] {
  if (!resp || typeof resp !== "object") return [];
  const salida: LlamadaHerramienta[] = [];
  const empujar = (fc: any, firma?: unknown) => {
    if (fc && typeof fc.name === "string" && fc.name) {
      const ll: LlamadaHerramienta = {
        name: fc.name,
        args: (fc.args && typeof fc.args === "object") ? fc.args : {},
      };
      // v1.45.6 — la firma puede venir en la parte (p.thoughtSignature) o,
      // en algunas variantes del SDK, pegada a la propia functionCall.
      const sig = firma ?? fc.thoughtSignature ?? fc.thought_signature;
      if (typeof sig === "string" && sig) ll.thoughtSignature = sig;
      salida.push(ll);
    }
  };
  // v1.45.6 — PLAN C PRIMERO: recorrer candidates[].content.parts[] es la
  // única forma fiable de CAPTAR la `thoughtSignature`, porque vive en la
  // PARTE (al lado de la functionCall), no dentro del objeto functionCall ni
  // en el atajo `resp.functionCalls`. Si de aquí salen llamadas, esas son las
  // buenas (traen firma). Solo si no hay nada, caemos al atajo.
  try {
    const cands = (resp as any).candidates;
    if (Array.isArray(cands)) {
      for (const c of cands) {
        const parts = c?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p?.functionCall) empujar(p.functionCall, p.thoughtSignature ?? p.thought_signature);
          }
        }
      }
    }
    if (salida.length) return salida;
  } catch { /* seguimos al atajo */ }
  // ATAJO: `resp.functionCalls` (array o función). No suele traer la firma,
  // pero mejor una llamada sin firma que ninguna llamada.
  try {
    const fcs = (resp as any).functionCalls;
    const arr = typeof fcs === "function" ? fcs.call(resp) : fcs;
    if (Array.isArray(arr) && arr.length) {
      for (const fc of arr) empujar(fc);
    }
  } catch { /* nada */ }
  return salida;
}

/**
 * Convierte el resultado crudo de `executeToolCall` (siempre un string, casi
 * siempre JSON) en el objeto `response` que espera un `functionResponse` de
 * Gemini. Si no es JSON, se envuelve en `{ resultado: <texto> }` para que el
 * modelo igual reciba algo útil.
 */
export function respuestaHerramientaGemini(nombre: string, resultadoCrudo: string): any {
  let obj: any;
  try {
    obj = JSON.parse(resultadoCrudo);
    if (obj === null || typeof obj !== "object") obj = { resultado: obj };
  } catch {
    obj = { resultado: String(resultadoCrudo ?? "") };
  }
  return { functionResponse: { name: nombre, response: obj } };
}
