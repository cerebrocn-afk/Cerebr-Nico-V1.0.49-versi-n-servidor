/**
 * normalizarOllama.ts — v1.0.15 · EL SYSTEM VA PRIMERO Y EL PROMPT CABE
 * =====================================================================
 * DOS FALLOS MEDIDOS en el LOG_OLLAMA de Mario (2026-11-10), los dos devuelven
 * HTTP 500 en POST /api/chat y dejan a Ollama local «sin andar»:
 *
 *   1) PLANTILLA JINJA — qwen3.5 (y otras) abortan con:
 *        «Error: Jinja Exception: System message must be at the beginning.»
 *      El motor empuja notas de continuidad / huecos / orden-de-obra como
 *      role:"system" al FINAL del array (server.ts cuerpoBucleAgente, líneas
 *      3519-3525), DESPUÉS de los user/assistant. La plantilla sólo acepta UN
 *      system y en la posición 0 → rechaza el pedido entero.
 *      → consolidarSystemAlInicio(): junta todos los system en uno solo al frente.
 *
 *   2) CONTEXTO DESBORDADO — Ollama corta con:
 *        «request (16547 tokens) exceeds the available context size (8192 tokens)»
 *      El manual + la orden de obra + el historial pasan el num_ctx del modelo.
 *      → recortarMensajesAVentana(): recorta historial viejo (nunca el system ni
 *        el último pedido) para caber en num_ctx dejando sitio para la respuesta.
 *
 * Lógica PURA y sin dependencias: se prueba aislada (tests/normalizarOllama.test.ts)
 * y se llama justo antes de cada fetch a /api/chat (server.ts). No muta el array
 * de entrada: devuelve uno nuevo, así el bucle de agente conserva su estado.
 */

export interface MensajeChat {
  role: string;
  content?: string;
  [clave: string]: unknown;
}

/**
 * Junta TODOS los `role:"system"` (en su orden original) en un único mensaje
 * system al frente del array. El resto (user/assistant/tool) queda intacto y
 * en su mismo orden. Si no hay ningún system, devuelve el array tal cual.
 */
export function consolidarSystemAlInicio<T extends MensajeChat>(mensajes: T[]): T[] {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return mensajes;
  const sys: string[] = [];
  const resto: T[] = [];
  for (const m of mensajes) {
    if (m && m.role === "system") {
      const c = typeof m.content === "string" ? m.content : "";
      if (c.trim()) sys.push(c);
    } else {
      resto.push(m);
    }
  }
  if (sys.length === 0) return mensajes;
  const fundido = { role: "system", content: sys.join("\n\n") } as unknown as T;
  return [fundido, ...resto];
}

/** Estima tokens de un texto (≈ 1 token cada 4 chars; conservador para español). */
export function tokensAprox(texto: string): number {
  return Math.ceil((texto ? texto.length : 0) / 4);
}

/**
 * v1.0.16 · LA VENTANA CRECE ANTES DE AMPUTAR. Dado el coste real del array y un
 * `numCtxBase` (el que trae el perfil/dial), devuelve el `num_ctx` que hay que
 * MANDAR a Ollama para que TODO el prompt entre entero —manual + orden de obra +
 * historial— dejando `reservaSalidaTokens` libres para la respuesta, SIN pasar de
 * `topeDuro` (lo que la RAM del equipo puede pagar de KV-cache; ver techoDeContexto).
 *
 * Caso de Mario («TENGO 16 DE RAM»): el dial del panel Pro mandaba num_ctx=8192 y
 * pisaba el 16384 del tier; con 16 GB el techo deja >32k, así que en vez de
 * recortar el prompt (16547 tok) a 8192 —mutilando el manual— se SUBE la ventana a
 * ~17408 y el prompt cabe. Nunca BAJA del base ni SUBE del tope; redondea a 1024.
 * PURA: no muta la entrada; es el recortarMensajesAVentana quien, si aun con el
 * tope no entra, recorta el historial viejo.
 */
export function ventanaParaCaber<T extends MensajeChat>(
  mensajes: T[],
  numCtxBase: number,
  reservaSalidaTokens = 512,
  topeDuro?: number,
): number {
  const base = Number.isFinite(numCtxBase) && numCtxBase > 0 ? Math.floor(numCtxBase) : 8192;
  const tope =
    Number.isFinite(topeDuro as number) && (topeDuro as number) > base
      ? Math.floor(topeDuro as number)
      : base;
  if (!Array.isArray(mensajes) || mensajes.length === 0) return base;
  const costo = mensajes.reduce(
    (s, m) => s + tokensAprox(typeof m.content === "string" ? m.content : "") + 4,
    0,
  );
  const necesario = costo + Math.max(0, reservaSalidaTokens);
  if (necesario <= base) return base;
  const redondeado = Math.ceil(necesario / 1024) * 1024;
  return Math.min(tope, Math.max(base, redondeado));
}

/**
 * Recorta el array para que su coste en tokens entre en `numCtxTokens` dejando
 * `reservaSalidaTokens` libres para la respuesta del modelo. Nunca toca:
 *   · el primer mensaje si es system (el manual / orden de obra),
 *   · el último mensaje (el pedido actual del usuario).
 * Elimina los mensajes del MEDIO empezando por los más viejos. Si aún así no
 * entra (system enorme solo), trunca el contenido del system al final.
 */
export function recortarMensajesAVentana<T extends MensajeChat>(
  mensajes: T[],
  numCtxTokens: number,
  reservaSalidaTokens = 512,
  log?: (m: string) => void,
): T[] {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return mensajes;
  const ctx = Number.isFinite(numCtxTokens) && numCtxTokens > 0 ? Math.floor(numCtxTokens) : 8192;
  const presupuesto = Math.max(512, ctx - Math.max(0, reservaSalidaTokens));
  const costo = (m: T): number => tokensAprox(typeof m.content === "string" ? m.content : "") + 4;

  const total = mensajes.reduce((s, m) => s + costo(m), 0);
  if (total <= presupuesto) return mensajes;

  const tieneSys = Boolean(mensajes[0]) && mensajes[0].role === "system";
  const head: T[] = tieneSys ? [mensajes[0]] : [];
  const cuerpo = mensajes.slice(tieneSys ? 1 : 0);
  const ultimo = cuerpo.length ? cuerpo[cuerpo.length - 1] : null;
  const medio = ultimo ? cuerpo.slice(0, -1) : cuerpo;

  let usado = head.reduce((s, m) => s + costo(m), 0) + (ultimo ? costo(ultimo) : 0);
  const conservados: T[] = [];
  // Se conservan los mensajes del medio desde el MÁS NUEVO hacia atrás.
  for (let k = medio.length - 1; k >= 0; k--) {
    const c = costo(medio[k]);
    if (usado + c > presupuesto) break;
    usado += c;
    conservados.unshift(medio[k]);
  }
  const quitados = medio.length - conservados.length;
  const out: T[] = [...head, ...conservados, ...(ultimo ? [ultimo] : [])];

  // Último recurso: el system solo ya no entra → se trunca su texto.
  if (usado > presupuesto && tieneSys && out[0] && typeof out[0].content === "string") {
    const sobraTokens = usado - presupuesto;
    const c = out[0].content as string;
    const charsAQuitar = Math.min(c.length - 1, sobraTokens * 4);
    if (charsAQuitar > 0) {
      out[0] = {
        ...out[0],
        content: c.slice(0, c.length - charsAQuitar) + "\n[…recortado para caber en la ventana del modelo local]",
      } as T;
    }
  }

  if (quitados > 0) {
    log?.(`[CerebroNico] 🪟 Contexto local recortado: ${quitados} mensaje(s) viejo(s) fuera para caber en num_ctx=${ctx}.`);
  }
  return out;
}

/**
 * v1.0.16 · Un solo paso para el prompt de Ollama: system-first, la ventana
 * CRECE hasta `topeRam` si el prompt no entra, y se recorta a num_ctx. Muta
 * `opciones.num_ctx` cuando la ventana sube; devuelve los mensajes saneados.
 * Antes esto vivía inline y duplicado en server.ts (agente y streaming): aquí
 * es una sola verdad reutilizable, sin lógica repetida en el monolito.
 */
export function sanearYVentana<T extends MensajeChat>(
  mensajes: T[],
  opciones: Record<string, any>,
  topeRam: number | undefined,
  log?: (m: string) => void,
  declarado?: number | null, // v1.0.20 · lo que el modelo declara en /api/show: manda sobre cualquier deseo
): T[] {
  const base = Number(opciones?.num_ctx) || 8192;
  const resv = Number(opciones?.num_predict) || 512;
  const sys = consolidarSystemAlInicio(mensajes);
  const ventana = ventanaParaCaber(sys, base, resv, topeRam);
  // v1.0.20 · EL 400 DE qwen3.5:4b («17929 tokens > 8192») salía de pedirle al
  // modelo una ventana que él no declara. Si /api/show dijo cuánto tiene, ese
  // número es el techo, no una sugerencia.
  const techoModelo = Number.isFinite(declarado as number) && (declarado as number) > 0 ? Math.floor(declarado as number) : null;
  if (techoModelo !== null && ventana > techoModelo) {
    log?.(`[CerebroNico] 🪟 El modelo declara ${techoModelo} de contexto: la ventana pedida (${ventana}) se clampa a esa cifra.`);
  }
  const final = techoModelo !== null ? Math.min(ventana, Math.max(512, techoModelo)) : ventana;
  if (opciones && final !== base) opciones.num_ctx = final;
  return recortarMensajesAVentana(sys, Number(opciones?.num_ctx) || base, resv, log);
}
