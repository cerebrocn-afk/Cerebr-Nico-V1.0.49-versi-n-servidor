/**
 * embedderLocal.ts — EL EMBEDDER QUE NO SE RINDE A UN 404 (v1.97.2)
 * =================================================================
 * El log de Mario (30/10) trae en CADA turno:
 *   🧠 cerebro: fallback por palabra (error: embedder HTTP 404) — vector no disponible
 * O sea: la memoria vectorial del cerebro estuvo muerta todo el tiempo, degradada a
 * búsqueda por palabra, y nadie lo avisó con el comando para arreglarlo.
 *
 * Causa probable y doble, ambas reales según la versión de Ollama del usuario:
 *   1. Ollama MOVIÓ el endpoint de embeddings: `/api/embed` es el canónico y
 *      `/api/embeddings` quedó como alias que las versiones nuevas ya no sirven → 404.
 *   2. El modelo `embeddinggemma` puede no estar descargado (`ollama pull` pendiente).
 *
 * Este módulo prueba los DOS endpoints y, si ambos dan 404, dice la verdad accionable
 * en vez de tragarse el fallo: «¿está descargado X? probá `ollama pull X`».
 * Se sacó de `server.ts` por la misma regla que el puente: una máquina, su módulo, y el
 * monolito solo la monta (el presupuesto de 12174 líneas obliga a partir, no a engordar).
 *
 * `fetchImpl` entra inyectable para poder probar la caída de endpoint EN SECO: una valla
 * que depende de si Ollama está vivo en la máquina que testea no es una valla.
 */

// v2.2.2 · misma regla que el server: OLLAMA_HOST puede ser una direccion de
// ESCUCHA (0.0.0.0) y localhost puede resolver a ::1. El embedder quedaba
// "sin medir" por llamar a un sitio imposible, no por falta de modelo.
const BASE_POR_DEFECTO = () => urlBaseOllama(process.env);
const MODELO_POR_DEFECTO = () => String(process.env.CN_EMBED_MODEL || "snowflake-arctic-embed:33m").trim() || "snowflake-arctic-embed:33m";

import { urlBaseOllama } from "./direccionOllama";
export interface OpcionesEmbedder {
  modelo?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /**
   * v1.99.0 · CUÁNTO lo deja Ollama en RAM después de responder (ms).
   * Sin este campo el pedido no dice nada y manda el escalón global
   * (`OLLAMA_KEEP_ALIVE`, que el lanzador pone en 5 m PENSANDO EN EL CHAT). El
   * resultado medido en la pestaña Puertos de la sesión del 31/10: «Ollama:
   * 0.0 GB · Nada residente» con `snowflake-arctic-embed:22m` y `all-minilm:22m`
   * enfriados, así que CADA tanda de calentado volvía a pagar la carga del modelo
   * desde cero dentro de una ventana de 4 s — que es exactamente la forma en que
   * el calentado se cae y la deuda de vectores nunca baja.
   * `0` = libéralo ya (el camino del turno, para no pelear con el modelo de chat
   * en una máquina de 8 GB); `>0` = retenelo lo justo para terminar la tanda.
   */
  keepAliveMs?: number;
}

/** Extrae la lista de vectores de cualquiera de las dos formas de respuesta de Ollama. */
function extraerVectores(j: any): any[] {
  if (Array.isArray(j?.embeddings)) return j.embeddings; // /api/embed (batch) y /api/embeddings (batch)
  if (Array.isArray(j?.embedding)) return [j.embedding]; // /api/embeddings (un solo prompt)
  return [];
}

export async function embedCerebroLocal(
  textos: string[],
  senal?: AbortSignal,
  opciones: OpcionesEmbedder = {}
): Promise<Array<number[] | null>> {
  const modelo = (opciones.modelo || MODELO_POR_DEFECTO()).trim() || "embeddinggemma";
  const base = (opciones.baseUrl || BASE_POR_DEFECTO()).replace(/\/$/, "");
  const fetchReal = opciones.fetchImpl || fetch;

  // v1.97.2 · el canónico primero; el alias viejo solo si el canónico no está (404).
  const endpoints = [`${base}/api/embed`, `${base}/api/embeddings`];
  let ultimoError = "";

  for (const url of endpoints) {
    try {
      const cuerpo: Record<string, unknown> = { model: modelo, input: textos };
      // v1.99.0 · el keep_alive SÓLO se manda si alguien lo decidió: sin el campo,
      // el comportamiento es idéntico al de siempre (los tests viejos siguen valiendo).
      if (typeof opciones.keepAliveMs === "number" && Number.isFinite(opciones.keepAliveMs)) {
        cuerpo.keep_alive = Math.max(0, Math.floor(opciones.keepAliveMs));
      }
      const r = await fetchReal(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: senal,
      });
      if (r.ok) {
        const j: any = await r.json().catch(() => null);
        const lista = extraerVectores(j);
        return textos.map((_t, i) => (Array.isArray(lista[i]) && lista[i].length > 0 ? lista[i].map(Number) : null));
      }
      ultimoError = `embedder HTTP ${r.status} en ${url.replace(base, "")}`;
      if (r.status !== 404) break; // un 500/401 no se arregla probando el otro endpoint
    } catch (e: any) {
      ultimoError = String(e?.message || e);
      break;
    }
  }

  throw new Error(
    `${ultimoError} — ¿está descargado «${modelo}» en Ollama? Probá \`ollama pull ${modelo}\` o apuntá CN_EMBED_MODEL a un embedder que sí tengas. Mientras tanto, el cerebro sigue por palabra.`
  );
}
