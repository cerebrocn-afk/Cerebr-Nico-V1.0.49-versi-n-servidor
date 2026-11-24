/**
 * fusibleGemini.ts — v1.57.12 · LA CADENA DEJA DE TANTear MODELOS MUERTOS
 * =========================================================================
 * RAÍZ (consola del 15/10): cada turno con Gemini como provider barría la lista
 * COMPLETA de modelos, uno por uno, aunque la respuesta de Google ya había
 * sentenciado a cada uno:
 *   · `gemini-2.5-flash` → 404 «no longer available to new users» (MUERTO — lo
 *     dice Google por escrito, y la IDE lo volvía a tentar en cada barrido);
 *   · `gemini-3-flash-preview` → 429 «retry in 17m42s» (CUOTA — el retryDelay
 *     venía SERVIDO en la respuesta y se tiraba a la basura: se reintentaba
 *     antes, fallaba antes, y así tres barridos en la misma sesión);
 *   · `gemini-omni-*` → 429 «limit: 0» (ESTO NO ES DE INTENTO: la cuenta
 *     gratuita nunca tiene acceso; reintentar es garantía de gastar un round-trip);
 *   · `gemini-3.5/3.6/3.7-flash` → 503 «high demand, try again later» (SATURADO —
 *     transitorio, merece reintento PERO con enfriamiento, no en el mismo turno).
 * Nueve URLs fallando en serie = el usuario mirando "pensando" minutos, y la
 * cuota (¡20 pedidos por día!) quemándose en modelos que no iban a responder.
 *
 * EL FUSIBLE: por modelo se recuerda el veredicto con su reloj. `muerto` no se
 * tenta más en toda la vida del proceso; `agotado` respeta el retryDelay que
 * Google mismo pidió; `saturado` enfría 5 minutos; un éxito limpia todo rastro
 * (Google dice que los picos de demanda son temporales — le creamos, con
 * enfriamiento). La lista de candidatos vivos queda filtrada ANTES de abrir
 * boca, y el último mensaje de error puede decir cuántos saltó y por qué.
 *
 * Todo seco y con reloj inyectable: se prueba sin red y sin esperar de verdad.
 */

/** La lista fija de reserva (último recurso si ListModels no responde). */
export const MODELOS_GEMINI_VIGENTES = [
  "gemini-4-hydrogen",
  "gemini-4-neon",
  "gemini-4-carbon",
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-mini",
  "gemini-3.5-mini",
];

/** Alias internos que NO son nombres de modelo de la API de Gemini. */
export const ALIAS_GEMINI_INTERNOS = new Set(["gemini", "gemini-flash", "gemini-free"]);

export type ClaseFallo = "muerto" | "agotado" | "saturado" | "otro";

export interface EstadoFusible {
  clase: Exclude<ClaseFallo, "otro">;
  /** Hasta cuándo no se tenta (Number.POSITIVE_INFINITY = muerto). */
  hasta: number;
  /** Motivo en una línea, para el informe honesto. */
  por: string;
}

/** Vida del proceso: un mapa chico, con tope para que no crezca sin techo. */
const FUSIBLES_MAX = 64;
const COOLDOWN_SATURADO_MS = 5 * 60 * 1000;
const AGOTADO_MIN_MS = 60 * 1000;
const AGOTADO_MAX_MS = 30 * 60 * 1000;
const fusibles = new Map<string, EstadoFusible>();

/**
 * Clasifica la respuesta de Google SIN llamar a nadie: lee el mensaje crudo.
 * El 404 de «ya no está disponible» y el 429 con retryDelay son oro: Google
 * dice exactamente qué hacer y antes se ignoraba.
 */
export function clasificarErrorGemini(err: unknown): { clase: ClaseFallo; retryMs: number; senal: string } {
  const s = String((err as any)?.message ?? err ?? "");
  if (/404|NOT_FOUND/i.test(s)) {
    return { clase: "muerto", retryMs: 0, senal: /no longer available/i.test(s) ? "Google lo dio de baja para esta cuenta" : "404: el ID no existe para esta clave" };
  }
  if (/429|RESOURCE_EXHAUSTED|quota.?exceed/i.test(s)) {
    // «Please retry in 17m42.08s» / «retry in 673s» — el reloj que Google pide.
    const m = s.match(/retry in (?:(\d+)\s*m)?(\d+(?:\.\d+)?)\s*s/i);
    const ms = m ? (Number(m[1] || 0) * 60 + Number(m[2])) * 1000 : 10 * 60 * 1000;
    const sinCuota = /limit:\s*0[,}]/i.test(s); // «limit: 0» = este plan nunca tiene acceso
    return {
      clase: "agotado",
      retryMs: sinCuota ? AGOTADO_MAX_MS : Math.max(AGOTADO_MIN_MS, Math.min(AGOTADO_MAX_MS, ms)),
      senal: sinCuota ? "cuota 0 en este plan (no es transitorio)" : "cuota diaria agotada",
    };
  }
  if (/503|UNAVAILABLE|high demand/i.test(s)) {
    return { clase: "saturado", retryMs: COOLDOWN_SATURADO_MS, senal: "demanda alta (transitorio)" };
  }
  return { clase: "otro", retryMs: 0, senal: "" };
}

/**
 * v1.70.3 · ENFRIAMIENTO EXPONENCIAL PARA EL 503 (revisión de arquitectura del
 * 25/10, ítem 2: «registrar los 429/503 con una ventana de enfriamiento
 * exponencial»). El 503 de saturación no trae Retry-After y su mensaje promete
 * que el pico es «temporal», pero los logs del 24/10 mostraron a Google
 * repitiéndolo turno tras turno: cada barrida de la cadena pagaba su
 * round-trip para recibir el mismo no. La primerísima vez el enfriamiento
 * sigue siendo el de siempre (5 min — el test «503 → SATURADO con
 * enfriamiento corto» es ley); cada golpe CONSECUTIVO lo duplica
 * (5 → 10 → 20 → 40 min) con tope de 1 hora, para no sentar de por vida a un
 * modelo que en el fondo está sano. El contador es por modelo, se hereda solo
 * mientras el fusible anterior era del mismo tipo, y lo borra cualquier éxito
 * — la memoria del fusible sigue siendo la única verdad que consulta la
 * cadena.
 */
const GOLPES_SATURADO = new Map<string, number>();
const TOPE_SATURADO_MS = 60 * 60 * 1000;

/** Anota el veredicto. `otro` NO fusiblea: un error de red no sentencia un modelo. */
export function registrarFalloGemini(modelo: string, err: unknown, ahora = Date.now()): void {
  const { clase, retryMs, senal } = clasificarErrorGemini(err);
  if (clase === "otro") return;
  let enfria = retryMs;
  const clave = String(modelo);
  if (clase === "saturado") {
    const previo = fusibles.get(clave);
    const consecutive = previo && previo.clase === "saturado" && previo.hasta > ahora
      ? (GOLPES_SATURADO.get(clave) || 1) + 1
      : 1;
    GOLPES_SATURADO.set(clave, consecutive);
    enfria = Math.min(COOLDOWN_SATURADO_MS * Math.pow(2, Math.min(consecutive - 1, 4)), TOPE_SATURADO_MS);
  } else {
    GOLPES_SATURADO.delete(clave); // agotado/muerto: su propio reloj manda, el contador se reinicia
  }
  const hasta = clase === "muerto" ? Number.POSITIVE_INFINITY : ahora + enfria;
  fusibles.set(clave, { clase, hasta, por: senal + (clase === "saturado" && enfria !== retryMs ? ` (enfriamiento x${Math.round(enfria / COOLDOWN_SATURADO_MS)} por repetición)` : "") });
  if (fusibles.size > FUSIBLES_MAX) {
    // Desague primero lo vencido; si igual se pasa, lo más viejo.
    for (const [k, v] of fusibles) if (v.hasta <= ahora) fusibles.delete(k);
    while (fusibles.size > FUSIBLES_MAX) fusibles.delete(fusibles.keys().next().value as string);
  }
}

/** Un modelo que respondió bien vuelve a ser confiable: se borra su fusible. */
export function registrarExitoGemini(modelo: string): void {
  fusibles.delete(String(modelo));
  GOLPES_SATURADO.delete(String(modelo)); // v1.70.3 — el éxito limpia también el contador de picos
}

/** ¿Está prohibido tentar este modelo ahora? (muerto = siempre; enfriado = hasta su reloj) */
export function fusibleRechazaGemini(modelo: string, ahora = Date.now()): boolean {
  const f = fusibles.get(String(modelo));
  if (!f) return false;
  if (f.hasta <= ahora) { fusibles.delete(String(modelo)); return false; }
  return true;
}

/** Estado legible para el informe final y para las pruebas. */
export function estadoFusibleGemini(modelo: string, ahora = Date.now()): EstadoFusible | null {
  const f = fusibles.get(String(modelo));
  if (!f) return null;
  if (f.hasta <= ahora) { fusibles.delete(String(modelo)); return null; }
  return f;
}

/** Una línea honesta para el «todos fallaron»: cuántos saltó y por qué. */
export function informeFusiblesGemini(candidatos: string[], ahora = Date.now()): string {
  const saltados = candidatos.filter((m) => fusibleRechazaGemini(m, ahora));
  if (!saltados.length) return "";
  const detalle = saltados.map((m) => `· ${m}: ${estadoFusibleGemini(m, ahora)?.por ?? "fusible abierto"}`).join("\n");
  return `\nEl fusible ya sabía (no se volvieron a tentar ${saltados.length} modelo(s)):\n${detalle}`;
}

/** Solo para pruebas: cierra el tablero. */
export function reiniciarFusiblesGemini(): void {
  fusibles.clear();
  GOLPES_SATURADO.clear(); // v1.70.3 — el tablero incluye los contadores de saturación
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.66.0 — LA CADENA SOLO TIENTA MODELOS DE CHAT
// ───────────────────────────────────────────────────────────────────────────
// RAÍZ (consola del 22/10): ListModels devuelve TODO el catálogo de la clave, y
// la cadena lo barría entero — 26 IDs, 103 fallos en serie— tentando como si
// generaran texto de chat a modelos que NO lo hacen:
//   · lyria-3-pro-preview        → música
//   · imagen-* / gemini-3-pro-image / nano-banana-pro-preview / gemini-nano-banana-2.1 → imagen
//   · gemini-3.5-transcribe       → voz→texto
//   · gemini-robotics-er-2-preview → robótica
//   · gemini-2.5-computer-use-preview / computer-use-preview → agente de escritorio
//   · deep-research-pro-preview-12-2025 → pipeline de investigación, no chat
// Cada uno quemaba un round-trip de la cuota (¡20/día!) y segundos de "pensando".
// Este filtro los saca ANTES del barrido; complementa al fusible (que recuerda
// los muertos/agotados) con un juicio por CAPACIDAD, no por historial.

/** Familias de modelo Gemini que NO responden a un prompt de chat de texto. */
const FAMILIAS_NO_CHAT_GEMINI = [
  "lyria",          // música
  "image",          // imagen (cubre `imagen-*` y `*-pro-image`)
  "nano-banana",    // imagen
  "veo",            // vídeo
  "transcribe",     // voz → texto
  "tts",            // texto → voz
  "audio",          // audio
  "embedding",      // vectores
  "aqa",            // QA sobre corpus (no chat libre)
  "robotics",       // robótica
  "computer-use",   // agente de escritorio
  "deep-research",  // pipeline de investigación
];

/** ¿Este ID es un modelo de CHAT (texto→texto) que vale la pena tentar? */
export function esModeloDeChatGemini(id: string): boolean {
  const s = String(id || "").trim().toLowerCase();
  if (!s) return false;
  return !FAMILIAS_NO_CHAT_GEMINI.some((k) => s.includes(k));
}

/** Deja en la lista SOLO los modelos de chat, conservando el orden original. */
export function filtrarModelosChatGemini(ids: string[]): string[] {
  return (Array.isArray(ids) ? ids : []).filter((m) => esModeloDeChatGemini(m));
}

/** Detecta si un ID pertenece a la familia Gemini 4 (`gemini-4-*`). */
export function esGemini4(model: string): boolean {
  return /^gemini-4(?:-|$)/i.test(String(model || "").trim());
}

/**
 * Resuelve `thinkingConfig.thinkingLevel` de forma segura para Gemini 3 y Gemini 4:
 * - Gemini 4 NO acepta `MINIMAL` (devuelve HTTP 400): se normaliza a `LOW`.
 * - `XHIGH` solo está soportado en `gemini-4-neon` y `gemini-4-hydrogen`.
 * - Modelos ajenos a Gemini 3/4 devuelven `undefined`.
 */
export function resolverPensamientoGemini(
  model: string,
  requestedLevel: unknown
): { thinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | "XHIGH" } | undefined {
  const id = String(model || "").trim().toLowerCase();
  const es3 = /^gemini-3/.test(id);
  const es4 = esGemini4(id);
  if (!es3 && !es4) return undefined;

  const raw = String(requestedLevel || "").trim().toUpperCase();
  const permitidos = new Set(["MINIMAL", "LOW", "MEDIUM", "HIGH", "XHIGH"]);
  const base = permitidos.has(raw) ? raw : es4 ? "LOW" : "MINIMAL";

  if (es4) {
    if (base === "MINIMAL") return { thinkingLevel: "LOW" };
    if (base === "XHIGH" && !/^gemini-4-(?:neon|hydrogen)/.test(id)) {
      return { thinkingLevel: "HIGH" };
    }
    return { thinkingLevel: base as "LOW" | "MEDIUM" | "HIGH" | "XHIGH" };
  }

  if (base === "XHIGH") return { thinkingLevel: "HIGH" };
  return { thinkingLevel: base as "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" };
}
