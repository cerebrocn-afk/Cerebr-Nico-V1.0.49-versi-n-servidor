/**
 * preflightLocal.ts — v1.46.0 · EL MODELO LOCAL SE COMPRUEBA ANTES DE ENVIAR
 * ==========================================================================
 * QUÉ ES: dos traducciones que salieron de `server.ts` (el monolito del IDE
 * tiene un TRINQUETE: «la Fase 2 es partir, no añadir»). Sacarlas aquí no es
 * cosmética: es la regla del proyecto. El motor las usa con una línea cada una.
 *
 * 1) `preflightModeloOllama` — mata el 404 que dejaba al usuario en un bucle.
 *    Caso real de la sesión de Mario: elegía `CODEAPP-0:latest`, Ollama
 *    respondía «HTTP 404: model … not found, try pulling it first» y el consejo
 *    era `ollama pull CODEAPP-0:latest`. Pero el modelo YA estaba: aparecía en
 *    su propio `ollama list`. Mandar a descargar lo que ya está descargado no
 *    arregla nada. Ahora se pregunta a Ollama qué tiene de verdad y, si el
 *    nombre no coincide, se dice cuál escribe mal y cuál se le parece más.
 *
 * 2) `mensajeLegibleDeError` — «signal is aborted without reason» deja de
 *    llegar al usuario. Esa cadena es lo que Node pone al abortar un fetch, y
 *    el usuario la leyó tal cual sin saber si había hecho algo mal. Casi nunca
 *    es culpa suya: es un cambio de modelo, una cancelación o el watchdog
 *    cortando una espera. Se traduce al idioma de la persona.
 */

import { sirveComoCerebroChat } from "./cerebroModelo"; // v1.57.12 · CERTEZA DE MODELO

/** Resultado del preflight: o se puede seguir, o se explica por qué no. */
export type PreflightLocal =
  | { ok: true }
  | { ok: false; mensaje: string };

/**
 * Distancia de edición (Levenshtein) con dos filas.
 * Sirve para UNA cosa: ordenar los modelos instalados por parecido al nombre
 * que el usuario pidió, y poder decirle «quisiste este, tienes estos».
 * Sin dependencias: el IDE no va a instalar una librería por esto.
 */
export function distanciaSimple(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let previa: number[] = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const actual: number[] = [i];
    for (let j = 1; j <= t.length; j++) {
      const coste = s[i - 1] === t[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + coste);
    }
    previa = actual;
  }
  return previa[t.length];
}

/** `nombre:latest` y `nombre` son el MISMO modelo para Ollama. Se comparan igual. */
const sinEtiqueta = (s: string) => s.toLowerCase().replace(/:latest$/, "");

/**
 * Pregunta a Ollama qué modelos tiene y decide si el pedido existe.
 *
 * `fetch` se inyecta para poder probar esto sin levantar Ollama (y para no
 * arrastrar dependencias de red al módulo). Devuelve `ok: true` cuando NO se
 * puede comprobar (Ollama caído o lento): el preflight no puede convertirse en
 * un bloqueo — el camino normal de error ya informa de eso.
 */
/**
 * v1.57.20 · LAS CAPACIDADES REALES del modelo según Ollama (`/api/show`), o null
 * si esta versión de Ollama no las reporta. La verdad la dice el motor, no una
 * lista de nombres: el HTTP 400 «does not support image input» de gpt-oss:120b-cloud
 * (consola del 15/10) era evitable sin gastar la llamada.
 */
export async function capacidadesDeModelo(
  targetUrl: string,
  modelo: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[] | null> {
  try {
    const r = await fetchImpl(`${targetUrl}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: modelo }),
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const caps = d?.capabilities;
    return Array.isArray(caps) ? caps.map((c: any) => String(c).toLowerCase()) : null;
  } catch {
    return null;
  }
}

export async function preflightModeloOllama(
  targetUrl: string,
  modelo: string,
  fetchImpl: typeof fetch = fetch,
  tieneImagenes = false
): Promise<PreflightLocal> {
  // v1.57.12 · CERTEZA DE MODELO: un OCR sin imagen o un embedding NUNCA van a
  // responder un chat. Antes se les mandaba igual y el watchdog los mataba a los
  // 180 s (tres veces seguidas con glm-ocr, medido en consola). Se corta acá, en
  // seco, con el nombre de la familia y la salida concreta.
  const cerebro = sirveComoCerebroChat(modelo, tieneImagenes);
  if (!cerebro.ok) return { ok: false, mensaje: cerebro.motivo };

  // v1.57.20 · CAPACIDAD POR CONTENIDO: si el turno trae imágenes, la capacidad se
  // verifica contra Ollama. Si el motor NO reporta capacidades (versión vieja), no
  // se bloquea lo que no se puede verificar: se deja pasar (y el 400, si llega,
  // ya no es una sorpresa).
  if (tieneImagenes) {
    const capacidades = await capacidadesDeModelo(targetUrl, modelo, fetchImpl);
    if (capacidades && !capacidades.includes("vision")) {
      return {
        ok: false,
        mensaje: `«${modelo}» no acepta imágenes (capacidades de Ollama: ${capacidades.join(", ") || "ninguna"}). Probá con un modelo de visión (qwen2.5vl, gemma3, llava…) o sacá la imagen del pedido.`,
      };
    }
  }
  let instalados: string[] = [];
  try {
    // v2.0.1 · 2.500 ms abortaba SIEMPRE: en esta máquina /api/tags tarda ~4.500 ms
    // de forma estable (45 manifiestos, 124 blobs, sin GPU). El preflight devolvía
    // {ok:true} por timeout, así que nunca detectaba un nombre mal escrito — y el
    // IDE, al no ver la lista, saltaba de proveedor creyendo que Ollama no tenía
    // modelos. 9 s es el mismo plazo que ya usa diagnostico.ts para esta ruta.
    // v2.3.4 · 9 s no alcanza con 40+ modelos y NEMESIS:latest (62,4 GB):
    // /api/tags tarda 21-37 s. Sin esta subida el preflight siempre aborta y
    // el IDE salta de proveedor creyendo que Ollama no tiene modelos.
    const r = await fetchImpl(`${targetUrl}/api/tags`, { signal: AbortSignal.timeout(40000) });
    if (!r.ok) return { ok: true };
    const d: any = await r.json();
    instalados = (d?.models || [])
      .map((m: any) => String(m?.name || m?.model || ""))
      .filter(Boolean);
  } catch {
    return { ok: true };
  }

  // Ollama vivo pero sin modelos: no es culpa del nombre, no se opina aquí.
  if (instalados.length === 0) return { ok: true };

  const buscado = sinEtiqueta(modelo);
  const existe = instalados.some(
    (n) => sinEtiqueta(n) === buscado || n.toLowerCase() === modelo.toLowerCase()
  );
  if (existe) return { ok: true };

  const parecidos = instalados
    .map((n) => ({ n, d: distanciaSimple(buscado, sinEtiqueta(n)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => `\`${x.n}\``)
    .join(", ");

  return {
    ok: false,
    mensaje:
      `❌ Ollama no reconoce el modelo "${modelo}".\n\n` +
      `No hace falta \`ollama pull\`: ese nombre no coincide con ninguno de los ${instalados.length} ` +
      `modelos que tienes instalados. Suele ser un nombre de la lista de la UI que ya no existe, o un sufijo de más.\n\n` +
      (parecidos ? `Los más parecidos en tu Ollama: ${parecidos}.\n\n` : "") +
      `Elige el nombre EXACTO —con su etiqueta si la tiene— del selector de modelo (o cópialo de \`ollama list\`).`,
  };
}

/**
 * Traduce un fallo crudo del motor a algo que una persona pueda leer y usar.
 * `null` significa «no hay nada que traducir»: el mensaje original ya vale.
 */
export function mensajeLegibleDeError(mensajeCrudo: unknown, nombre?: unknown): string | null {
  const crudo = String(mensajeCrudo ?? "");
  const porNombre = nombre === "AbortError";
  const esAborto = porNombre || /aborted|abort|BodyStreamBuffer was aborted/i.test(crudo);
  if (!esAborto) {
    if (crudo.trim()) return null;
    return (
      "El motor no devolvió una respuesta y tampoco un motivo. " +
      "Vuelve a enviar el mensaje o cambia de modelo en el selector."
    );
  }
  return (
    "Se detuvo la generación antes de terminar (cambio de modelo, cancelación o espera agotada). " +
    "Vuelve a enviar el mensaje para reintentar; si se repite, elige otro modelo en el selector."
  );
}

/** Aviso honesto para un turno que cerró sin devolver ni un carácter. */
export function avisoTurnoVacio(modelo: string): string {
  return (
    `⚠️ ${modelo} cerró el turno sin devolver ni un carácter.\n\n` +
    `Suele pasar con modelos diminutos (0.5B–1.5B) que se quedan pensando sin llegar a escribir. ` +
    `Prueba con un modelo mayor (4B o más) o vuelve a enviar el mensaje; si se repite, elige otro modelo en el selector.`
  );
}
