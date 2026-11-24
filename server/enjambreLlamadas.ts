/**
 * enjambreLlamadas.ts — LA CAPA DE LLAMADAS DEL ENJAMBRE (v1.80.0)
 * =================================================================
 * QUÉ HACE: manda EL MISMO prompt a varias voces en paralelo, y después manda
 * todas las respuestas al juez. Es la parte con red del enjambre; el criterio
 * (a quién se llama, cómo se evalúa, cómo se consensúa) vive en
 * `src/engine/enjambreEclectico.ts`, que es puro y probado.
 *
 * POR QUÉ OTRO MÓDULO Y NO `server.ts`: el trinquete del contrato de rutas dice
 * que el monolito se parte, no se crece. Aquí solo se llama y se espera; las
 * rutas están en `server/routers/enjambre.ts`.
 *
 * POR QUÉ `fetchCloud` y no `fetch` a secas: el enjambre habla por las MISMAS
 * venas que el chat — primer byte medido (`relojModelos`), cuarentena
 * (`fusibleProveedores`) y presupuesto dinámico. Un enjambre que llama a un
 * proveedor en cuarentena pierde el tiempo del usuario dos veces.
 *
 * CLAVES: viajan en el cuerpo de la petición desde el navegador del usuario
 * (igual que `/api/ai/stream`) y NUNCA se escriben en disco ni se loguean. La
 * casa no guarda secretos ajenos: `scripts/sin-claves.mjs` lo vigila.
 */
import { fetchCloud } from "./fetchCloud";
import { SISTEMA_VOCES, modeloConVisionEsperable, type RespuestaVoz } from "../src/engine/enjambreEclectico";

export interface VozPedido {
  provider: string;
  model: string;
}

/**
 * v1.84.5 · Imagen adjunta al turno, en el idioma que habla cada proveedor.
 * Solo se manda a voces donde se espera visión (`modeloConVisionEsperable`):
 * mandarle un `image_url` a un texto-puro es un 400 seguro, y una voz que
 * falló por culpa nuestra envenena el consenso. Las demás voces reciben la
 * lista de archivos en el texto (el prompt con memoria ya la trae).
 */
export interface ImagenParaVoz {
  mimeType: string;
  /** base64 PURO, sin prefijo `data:…;base64,`. */
  base64: string;
}

export interface CredencialesEnjambre {
  /** Ollama local (opcional: solo si el usuario dejó locales en el enjambre). */
  ollamaUrl?: string;
  /** Claves por proveedor, tomadas del estado vivo del navegador. */
  keys?: Record<string, string | undefined>;
  /** Endpoint unificado (la ranura «URL»): proveedor `custom`. */
  customUrl?: string;
  customKey?: string;
}

const BASES_OPENAI_COMPAT: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  zai: "https://api.z.ai/api/paas/v4",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  together: "https://api.together.xyz/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com",
  fireworks: "https://api.fireworks.ai/inference/v1",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Normaliza la URL del endpoint unificado hacia /chat/completions. */
export function endpointUnificado(urlBruta: string): string {
  const u = String(urlBruta || "").replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(u)) return u;
  if (/\/v1$/.test(u)) return `${u}/chat/completions`;
  return `${u}/v1/chat/completions`;
}

/** `custom` no tiene base fija: la pone el usuario. Nunca se adivina. */
function basePara(provider: string, cred: CredencialesEnjambre): { base?: string; clave: string; error?: string } {
  const clave = String(cred.keys?.[provider] || "").trim();
  if (provider === "custom") {
    const url = String(cred.customUrl || "").trim();
    if (!url) return { clave: "", error: "la API unificada no tiene URL configurada en su ranura" };
    return { base: "", clave: String(cred.customKey || "").trim() };
  }
  const base = BASES_OPENAI_COMPAT[provider];
  if (!base) return { clave, error: `proveedor «${provider}» no tiene endpoint conocido en el enjambre` };
  return { base, clave };
}

/** Error con mensaje corto: lo que se muestra en la tabla del informe. */
class Error_ extends Error {}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * v1.97.3 · EL FALLO DICE POR QUÉ. «HTTP 429: {"error":…}» en la tabla del
 * informe era un código de postal: el usuario veía una voz muerta y no sabía si
 * era su clave, su crédito o el proveedor. Clasificación honesta por estado
 * (los free tiers de los «proveedores de siempre» mueren de 429 cuando se acaba
 * la cuota: esto lo dice en vez de callarlo).
 */
export function explicarFalloProvedor(mensaje: string): string {
  const m = String(mensaje || "");
  const st = /HTTP (\d{3})/.exec(m);
  if (st) {
    const n = Number(st[1]);
    if (n === 401) return "clave rechazada por el proveedor (inválida o expirada): revisá su ranura";
    if (n === 402) return "créditos agotados en el proveedor (HTTP 402): esta voz no vota hoy";
    if (n === 403) return "acceso denegado por el proveedor (HTTP 403)";
    if (n === 404) return "el modelo no existe en ese proveedor (HTTP 404): revisá el nombre de la ranura";
    if (n === 408 || n === 504) return `puerta de enlace del proveedor sin respuesta (HTTP ${n})`;
    if (n === 429) return "límite de uso del proveedor (HTTP 429): cuota del free tier o pico — esperá o cargá créditos";
    if (n >= 500) return `caída del servidor del proveedor (HTTP ${n}): transitoria`;
  } else {
    // v1.97.3 · los fallos SIN código (red rota, timeout, cuarentena) también
    // se explican: antes la ramita caía en el `return` de arriba (código muerto).
    if (/tiempo de espera agotado/.test(m)) return "el proveedor no contestó a tiempo: la voz no vota este turno";
    if (/EN CUARENTENA/.test(m)) return "el proveedor está en cuarentena (fusible local): no se le volvió a llamar";
    if (/ECONNREFUSED/.test(m)) return "el endpoint del proveedor rechazó la conexión: revisá la URL de su ranura";
    if (/EAI_AGAIN|ENOTFOUND/.test(m)) return "no se pudo resolver el dominio del proveedor: revisá tu conexión";
    if (/ECONNRESET|ETIMEDOUT|fetch failed/i.test(m)) return "la red se cortó antes de llegar al proveedor (intento fallido)";
  }
  return m;
}

/**
 * v1.97.3 · ¿VALE LA PENA REINTENTAR? Un fallo es transitorio cuando el
 * proveedor CONTESTÓ rápido con un 5xx/429 (está caído o en pico, no muerto) o
 * cuando la red misma se rompió (ECONNRESET/ETIMEDOUT/EAI_AGAIN) antes de los
 * 20 s. Lo que NO se reintenta: 4xx de clave/crédito/modelo (repetir gasta la
 * misma verdad), un tiempo de espera agotado (el proveedor era LENTO, no
 * roto: otro 60 s no arreglan nada) y una cuarentena activa (el fusible ya
 * decidió por el usuario).
 */
function esFalloTemporal(e: any, msTranscurridos: number): boolean {
  const msg = String(e?.message || e);
  if (/EN CUARENTENA|sin respuesta de/.test(msg)) return false; // el reloj/fusible ya habló
  if (String(e?.name || "") === "AbortError") return false;
  const st = /HTTP (\d{3})/.exec(msg);
  if (st) {
    const n = Number(st[1]);
    return n === 429 || n >= 500; // contestó rápido: el pico suele pasarse
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return msTranscurridos < 20_000; // la red se rompió ANTES de esperar: reintentar es barato
  }
  return false;
}

/**
 * El mismo prompt a varias voces: el texto ya salió de `armarPromptConMemoria`.
 *
 * v1.97.3 · REINTENTO ÚNICO SOBRE FALLO TRANSITORIO. Una voz muerta es un voto
 * menos, y el usuario ya pagó caro a las nubes: si el fallo es transitorio
 * (`esFalloTemporal`: 429/5xx rápido, o red rota antes de los 20 s) se duerme
 * 1,5 s y se intenta UNA vez más — no más (el segundo fallo es final: el pico
 * se pasó o no se pasó). Lo no transitorio (clave inválida, créditos agotados,
 * modelo inexistente, tiempo agotado, cuarentena) NO gasta la segunda chance.
 * El mensaje de error llega ya explicado (`explicarFalloProvedor`): la tabla
 * del informe dice «créditos agotados», no una pared de `HTTP 402: {"error"…}`.
 */
async function unaVoz(
  voz: VozPedido,
  sistema: string,
  usuario: string,
  cred: CredencialesEnjambre,
  maxTokens: number,
  timeoutMs: number,
  imagenes?: ImagenParaVoz[]
): Promise<RespuestaVoz> {
  const t0 = Date.now();
  const provider = String(voz.provider || "").toLowerCase();
  try {
    return await intentoDeVoz(voz, sistema, usuario, cred, maxTokens, timeoutMs, imagenes);
  } catch (e: any) {
    if (esFalloTemporal(e, Date.now() - t0)) {
      await dormir(1_500);
      try {
        const segunda = await intentoDeVoz(voz, sistema, usuario, cred, maxTokens, timeoutMs, imagenes);
        return { ...segunda, reintentada: true, ms: Date.now() - t0 };
      } catch (e2: any) {
        const msg = String(e2?.message || e2);
        return { provider, model: voz.model, ok: false, texto: "", error: explicarFalloProvedor(msg).slice(0, 200), ms: Date.now() - t0, reintentada: true };
      }
    }
    const abortado = String(e?.name || "") === "AbortError";
    const msg = abortado ? "tiempo de espera agotado" : String(e?.message || e);
    return { provider, model: voz.model, ok: false, texto: "", error: explicarFalloProvedor(msg).slice(0, 200), ms: Date.now() - t0 };
  }
}

/**
 * UN intento de voz. Lanza los errores de red/HTTP/cuarentena (no los traga):
 * el envoltorio `unaVoz` decide si el fallo se reintenta o es final.
 */
async function intentoDeVoz(
  voz: VozPedido,
  sistema: string,
  usuario: string,
  cred: CredencialesEnjambre,
  maxTokens: number,
  timeoutMs: number,
  imagenes?: ImagenParaVoz[]
): Promise<RespuestaVoz> {
  const t0 = Date.now();
  const provider = String(voz.provider || "").toLowerCase();
  const ctrl = new AbortController();
  const alarma = setTimeout(() => ctrl.abort(), timeoutMs);
  // Solo las voces con visión reciben los píxeles; el resto trabaja con la
  // lista de archivos que `armarPromptConMemoria` ya puso en el texto.
  const ve = modeloConVisionEsperable(voz.model) && Array.isArray(imagenes) && imagenes.length > 0;
  try {
    if (provider === "ollama" || provider === "local") {
      const url = `${String(cred.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "")}/api/chat`;
      const r = await fetchCloud(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: voz.model,
          stream: false,
          messages: [
            { role: "system", content: sistema },
            // Ollama multimodal: `images` en el turno de usuario (base64 puro).
            ve
              ? { role: "user", content: usuario, images: (imagenes as ImagenParaVoz[]).map((i) => i.base64) }
              : { role: "user", content: usuario },
           ],
         }),
         signal: ctrl.signal,
       });
      if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
      const j: any = await r.json();
      const texto = String(j?.message?.content || j?.response || "");
      return { provider, model: voz.model, ok: texto.trim().length > 0, texto, error: texto.trim() ? undefined : "Ollama respondió vacío", ms: Date.now() - t0 };
    }

    if (provider === "gemini") {
      const clave = String(cred.keys?.gemini || "").trim();
      if (!clave) throw new Error_("sin clave en la ranura de Google Gemini");
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(voz.model)}:generateContent?key=${encodeURIComponent(clave)}`;
      const r = await fetchCloud(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{
            role: "user",
            parts: [
              { text: usuario },
              // Gemini multimodal: `inline_data` junto al texto (base64 puro).
              ...(ve
                ? (imagenes as ImagenParaVoz[]).map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } }))
                : []),
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error_(`Gemini HTTP ${r.status}`);
      const j: any = await r.json();
      const partes = j?.candidates?.[0]?.content?.parts;
      const texto = Array.isArray(partes) ? partes.map((p: any) => String(p?.text || "")).join("") : "";
      return { provider, model: voz.model, ok: texto.trim().length > 0, texto, error: texto.trim() ? undefined : "Gemini respondió vacío", ms: Date.now() - t0 };
    }

    const { base, clave, error } = basePara(provider, cred);
    if (error) throw new Error_(error);
    if (!clave && provider !== "custom") throw new Error_(`sin clave en la ranura de ${provider}`);
    const url = provider === "custom" ? endpointUnificado(cred.customUrl || "") : `${base!.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clave) headers["Authorization"] = `Bearer ${clave}`;
    const r = await fetchCloud(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: voz.model,
        temperature: 0.4,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: sistema },
          // OpenAI-compat multimodal: `content` como partes (texto + image_url).
          ve
            ? {
                role: "user",
                content: [
                  { type: "text", text: usuario },
                  ...(imagenes as ImagenParaVoz[]).map((i) => ({
                    type: "image_url",
                    image_url: { url: `data:${i.mimeType};base64,${i.base64}` },
                  })),
                ],
              }
            : { role: "user", content: usuario },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => "");
      throw new Error_(`HTTP ${r.status}${cuerpo ? `: ${cuerpo.slice(0, 120)}` : ""}`);
    }
    const j: any = await r.json();
    const texto = String(j?.choices?.[0]?.message?.content || "");
    return { provider, model: voz.model, ok: texto.trim().length > 0, texto, error: texto.trim() ? undefined : "respuesta vacía", ms: Date.now() - t0 };
  } catch (e: any) {
    // v1.97.3 · el intento NO traga: `unaVoz` decide si el fallo es transitorio
    // (reintento único) o final (error explicado).
    throw e;
  } finally {
    clearTimeout(alarma);
  }
}

/**
 * Llama a TODAS las voces en paralelo (Promise.all, no en serie: el usuario
 * espera una vez, no cuatro). Ninguna voz puede matar la ráfaga: la que falla
 * devuelve su motivo y sigue en el informe.
 */
export async function llamarVoces(
  voces: VozPedido[],
  tarea: string,
  cred: CredencialesEnjambre,
  opts?: { maxTokens?: number; timeoutMs?: number; sistema?: string; imagenes?: ImagenParaVoz[] }
): Promise<RespuestaVoz[]> {
  // v1.86.4 · el default ya no es un literal local: es `SISTEMA_VOCES`, que
  // declara el alcance real de esta llamada (sin tools) y a qué órgano
  // pertenece tocar el disco. Nadie adivina más su alcance.
  const sistema = opts?.sistema || SISTEMA_VOCES;
  const llamadas = (voces || []).map((v) =>
    unaVoz(v, sistema, String(tarea || ""), cred, opts?.maxTokens ?? 1200, opts?.timeoutMs ?? 60_000, opts?.imagenes)
  );
  return Promise.all(llamadas);
}

/** Una sola llamada (el juez). Nunca lanza: devuelve su motivo. */
export async function llamarJuez(
  juez: VozPedido,
  prompt: { sistema: string; usuario: string },
  cred: CredencialesEnjambre,
  opts?: { maxTokens?: number; timeoutMs?: number }
): Promise<RespuestaVoz> {
  return unaVoz(juez, prompt.sistema, prompt.usuario, cred, opts?.maxTokens ?? 1400, opts?.timeoutMs ?? 75_000);
}

/** Proveedores que el enjambre sabe llamar (para `/api/enjambre/estado`). */
export const PROVEEDORES_CONOCIDOS = ["ollama", "gemini", "openai", "openrouter", "zai", "groq", "cerebras", "together", "mistral", "deepseek", "fireworks", "custom"];

// ═══════════════════════════════════════════════════════════════════════════
// v1.88.0 · FASE 2 — EL EJECUTOR
// ═══════════════════════════════════════════════════════════════════════════
// La fase 1 (voces) va SIN `tools` a propósito: deliberar en paralelo y barato.
// Esta función es la otra mitad: UNA voz, EN SERIE, con las herramientas reales
// del IDE y con presupuesto de pasos. No usa `StreamContext` a propósito — el
// ejecutor no habla SSE ni abre el acta del turno de chat (haría global algo que
// debe ser local y podría pisar un turno en vuelo). El resultado viaja al informe.

export interface PasoObra {
  nombre: string;
  ok: boolean;
  resumen: string;
}

export interface ResultadoEjecucion {
  ok: boolean;
  texto: string;
  pasos: PasoObra[];
  vueltas: number;
  error?: string;
  proveedor: string;
  modelo: string;
}

/**
 * ¿Este proveedor puede ejecutar con herramientas en este ejecutor?
 *
 * v1.92.0 — GEMINI DEJA DE ESTAR FUERA. Hasta v1.88.0 se declaraba «sin ejecutor»
 * porque su camino habla otro contrato de tool calling (el SDK, con
 * `functionDeclarations`) y fingir que se ejecuta era peor que no ofrecerlo. Pero
 * la renuncia tenía un costo que cayó encima del usuario: si la voz más sólida del
 * enjambre era Gemini, la fase 2 no tocaba el disco y el veredicto volvía a ser
 * una orden escrita. Mario lo pidió en términos exactos: «que todos puedan usar
 * herramientas o que se llame al modelo con la herramienta». El contrato nativo de
 * REST de Gemini (`:generateContent` + `functionCall`/`functionResponse`) es tan
 * documentado como el de OpenAI, así que ahora se habla EN SU IDIOMA: ver
 * `ejecutarConGemini`. No se traduce a la fuerza el cuerpo de OpenAI: se arma el
 * que Gemini espera.
 */
export function puedeEjecutar(provider: string): boolean {
  const p = String(provider || "").toLowerCase();
  if (p === "ollama" || p === "custom" || p === "local" || p === "gemini") return true;
  return Boolean(BASES_OPENAI_COMPAT[p]);
}

/** Herramienta OpenAI-compat → `functionDeclarations` de Gemini.
 *  Gemini no acepta `type:"function"` ni anida en `function`, y su `parameters`
 *  debe ser un JSON-Schema OBJETO (nunca cadena). Lo que sobre se tira: un
 *  `functionDeclarations` mal formado es un 400 de Gemini, y un 400 en la fase 2
 *  es el «no hizo nada» que el usuario ya no aguanta. */
export function declaracionesGemini(herramientas: any[]): any[] {
  return (herramientas || [])
    .map((h) => {
      const f = h?.function ?? h ?? {};
      const nombre = String(f.name || "").trim();
      if (!nombre) return null;
      let params: any = f.parameters;
      if (typeof params === "string") {
        try { params = JSON.parse(params); } catch { params = undefined; }
      }
      const esquema =
        params && typeof params === "object" && !Array.isArray(params)
          ? params
          : { type: "object", properties: {} };
      return {
        name: nombre,
        description: String(f.description || ""),
        parameters: {
          type: esquema.type || "object",
          properties: esquema.properties && typeof esquema.properties === "object" ? esquema.properties : {},
          ...(Array.isArray(esquema.required) && esquema.required.length ? { required: esquema.required } : {}),
        },
      };
    })
    .filter(Boolean) as any[];
}

/**
 * Fase 2 con Gemini: mismo lazo (modelo pide → se ejecuta → se devuelve el
 * resultado → se cierra), otro envoltorio. Devuelve SIEMPRE un resultado.
 */
async function ejecutarConGemini(opts: EjecutarOpts, base: ResultadoEjecucion, pasos: PasoObra[]): Promise<ResultadoEjecucion> {
  const maxPasos = Math.max(1, Math.min(Number(opts.maxPasos) || 6, 12));
  const maxTokens = Math.max(256, Number(opts.maxTokens) || 2500);
  const timeoutMs = Math.max(5_000, Number(opts.timeoutMs) || 120_000);
  const clave = String(opts.cred.keys?.gemini || "").trim();
  if (!clave) return { ...base, error: "sin clave en la ranura de Google Gemini" };
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(base.modelo)}:generateContent?key=${encodeURIComponent(clave)}`;
  const hacerFetch = opts.doFetch || ((u: string, init: RequestInit) => fetchCloud(u, init));
  const declaraciones = declaracionesGemini(opts.herramientas);
  const contenidos: any[] = [{ role: "user", parts: [{ text: String(opts.usuario || "") }] }];
  for (let vuelta = 1; vuelta <= maxPasos; vuelta++) {
    base.vueltas = vuelta;
    const ctrl = new AbortController();
    const alarma = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const cuerpo: any = {
        systemInstruction: { parts: [{ text: String(opts.sistema || "") }] },
        contents: contenidos,
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      };
      // Solo se declaran herramientas si hay: un array vacío es 400 seguro.
      if (declaraciones.length) cuerpo.tools = [{ functionDeclarations: declaraciones }];
      const r = await hacerFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: ctrl.signal,
      });
      if (!r || r.ok === false) {
        return { ...base, error: `el ejecutor no pudo llamar a gemini: ${r?.status ? `HTTP ${r.status}` : "sin respuesta"}` };
      }
      const j: any = await r.json();
      const partes = j?.candidates?.[0]?.content?.parts;
      const lista = Array.isArray(partes) ? partes : [];
      const texto = lista.map((p: any) => String(p?.text || "")).join("").trim();
      const llamadas = lista.filter((p: any) => p?.functionCall?.name).map((p: any) => p.functionCall);
      if (!llamadas.length) return { ...base, ok: pasos.some((p) => p.ok), texto };

      contenidos.push({ role: "model", parts: llamadas.map((fc: any) => ({ functionCall: { name: fc.name, args: fc.args ?? {} } })) });
      for (const fc of llamadas) {
        const nombre = String(fc?.name || "").trim();
        let salida = "";
        try {
          salida = String((await opts.ejecutarHerramienta(nombre, (fc?.args && typeof fc.args === "object" ? fc.args : {}) as any)) ?? "");
        } catch (e: any) {
          salida = `❌ ${String(e?.message || e)}`;
        }
        pasos.push({ nombre, ok: tuvoEfecto(salida), resumen: salida });
        contentsPush(contenidos, nombre, salida);
      }
    } catch (e: any) {
      const abortado = String(e?.name || "") === "AbortError";
      return { ...base, ok: pasos.some((p) => p.ok), error: abortado ? "tiempo de espera agotado en el ejecutor" : String(e?.message || e).slice(0, 200) };
    } finally {
      clearTimeout(alarma);
    }
  }
  return { ...base, ok: pasos.some((p) => p.ok), error: `tope de ${maxPasos} pasos alcanzado sin cierre` };
}

/** Cierre del turno: Gemini exige las respuestas de función en UN solo `user`. */
function contentsPush(contenidos: any[], nombre: string, salida: string) {
  const parte = { functionResponse: { name: nombre, response: { resultado: salida.slice(0, 8000) } } };
  const ultimo = contenidos[contenidos.length - 1];
  if (ultimo && ultimo.role === "user" && Array.isArray(ultimo.parts) && ultimo.parts.every((p: any) => p?.functionResponse)) {
    ultimo.parts.push(parte);
  } else {
    contenidos.push({ role: "user", parts: [parte] });
  }
}

/** Un resultado de herramienta cuenta como efecto si no es un error declarado. */
function tuvoEfecto(salida: string): boolean {
  return !/^\s*(❌|error\b|hubo un error|no se pudo|no pude)/i.test(String(salida || ""));
}

/** El pedido de la fase 2. Nombrado (v1.92.0) porque lo comparten los dos lazos:
 *  el de OpenAI-compat/Ollama y el nativo de Gemini. */
export interface EjecutarOpts {
  provider: string;
  model: string;
  sistema: string;
  usuario: string;
  cred: CredencialesEnjambre;
  herramientas: any[];
  ejecutarHerramienta: (nombre: string, args: any) => Promise<string>;
  maxPasos?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Inyectable para pruebas: por defecto, el guardián de siempre (`fetchCloud`). */
  doFetch?: (url: string, init: RequestInit) => Promise<any>;
}

/**
 * Ejecuta la tarea con herramientas. Devuelve SIEMPRE un resultado (nunca lanza):
 * el informe necesita poder decir qué pasó, incluso cuando no pasó nada.
 */
export async function ejecutarTareaConHerramientas(opts: EjecutarOpts): Promise<ResultadoEjecucion> {
  const provider = String(opts.provider || "").toLowerCase();
  const modelo = String(opts.model || "");
  const maxPasos = Math.max(1, Math.min(Number(opts.maxPasos) || 6, 12));
  const maxTokens = Math.max(256, Number(opts.maxTokens) || 2500);
  const timeoutMs = Math.max(5_000, Number(opts.timeoutMs) || 120_000);
  const hacerFetch = opts.doFetch || ((url: string, init: RequestInit) => fetchCloud(url, init));
  const pasos: PasoObra[] = [];
  const mensajes: any[] = [
    { role: "system", content: String(opts.sistema || "") },
    { role: "user", content: String(opts.usuario || "") },
  ];
  const base: ResultadoEjecucion = { ok: false, texto: "", pasos, vueltas: 0, proveedor: provider, modelo };

  if (!puedeEjecutar(provider)) {
    return { ...base, error: `«${provider}» no tiene ejecutor con herramientas en el enjambre` };
  }

  // v1.92.0 · Gemini ya no está excluido: su lazo habla `functionDeclarations` /
  // `functionCall` / `functionResponse`. Se bifurca acá y no dentro del bucle para
  // que el cuerpo de OpenAI-compat siga siendo un solo camino legible.
  if (provider === "gemini") return ejecutarConGemini(opts, base, pasos);

  let url = "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "ollama") {
    url = `${String(opts.cred.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "")}/api/chat`;
  } else {
    const { base: baseUrl, clave, error } = basePara(provider, opts.cred);
    if (error) return { ...base, error };
    if (!clave && provider !== "custom") return { ...base, error: `sin clave en la ranura de ${provider}` };
    url = provider === "custom" ? endpointUnificado(opts.cred.customUrl || "") : `${baseUrl!.replace(/\/+$/, "")}/chat/completions`;
    if (clave) headers["Authorization"] = `Bearer ${clave}`;
  }

  for (let vuelta = 1; vuelta <= maxPasos; vuelta++) {
    base.vueltas = vuelta;
    const ctrl = new AbortController();
    const alarma = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const cuerpo =
        provider === "ollama"
          ? { model: modelo, messages: mensajes, tools: opts.herramientas, stream: false, options: { temperature: 0.2, num_predict: maxTokens } }
          : { model: modelo, messages: mensajes, tools: opts.herramientas, tool_choice: "auto", temperature: 0.2, max_tokens: maxTokens, stream: false };

      const r = await hacerFetch(url, { method: "POST", headers, body: JSON.stringify(cuerpo), signal: ctrl.signal });
      if (!r || r.ok === false) {
        const detalle = r?.status ? `HTTP ${r.status}` : "sin respuesta";
        return { ...base, error: `el ejecutor no pudo llamar a ${provider}: ${detalle}` };
      }
      const j: any = await r.json();
      const msg = provider === "ollama" ? j?.message : j?.choices?.[0]?.message;
      const llamadas: any[] = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];

      if (!llamadas.length) {
        return { ...base, ok: pasos.some((p) => p.ok), texto: String(msg?.content || "").trim() };
      }

      mensajes.push({ role: "assistant", content: msg?.content ?? null, tool_calls: llamadas });

      for (const llamada of llamadas) {
        const nombre = String(llamada?.function?.name || "").trim();
        let args: any = llamada?.function?.arguments;
        if (typeof args === "string") {
          try { args = JSON.parse(args || "{}"); } catch { args = {}; }
        }
        if (!nombre) continue;
        let salida = "";
        try {
          salida = String((await opts.ejecutarHerramienta(nombre, args ?? {})) ?? "");
        } catch (e: any) {
          salida = `❌ ${String(e?.message || e)}`;
        }
        pasos.push({ nombre, ok: tuvoEfecto(salida), resumen: salida });
        mensajes.push({ role: "tool", tool_call_id: llamada?.id ?? nombre, name: nombre, content: salida.slice(0, 8000) });
      }
    } catch (e: any) {
      const abortado = String(e?.name || "") === "AbortError";
      return { ...base, ok: pasos.some((p) => p.ok), error: abortado ? "tiempo de espera agotado en el ejecutor" : String(e?.message || e).slice(0, 200) };
    } finally {
      clearTimeout(alarma);
    }
  }

  return { ...base, ok: pasos.some((p) => p.ok), error: `tope de ${maxPasos} pasos alcanzado sin cierre` };
}
