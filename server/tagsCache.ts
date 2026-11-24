/**
 * caché COMPARTIDA de `/api/tags` de Ollama.
 *
 * El problema que resuelve: el IDE tenía 23 puntos de llamada a `/api/tags`,
 * cada uno con su propio timeout (2.500 ms los más importantes). En esta
 * máquina `/api/tags` tarda ~4.500 ms de forma estable (45 manifiestos,
 * 124 blobs, sin GPU). Resultado: `pivotEnVivo` y `preflightLocal` abortaban
 * SIEMPRE, el IDE creía que Ollama no tenía modelos y saltaba al siguiente
 * proveedor. Ése era el «salta a los que no contestan».
 *
 * Qué hace:
 *   · Una sola petición en vuelo (deduplicación): si 9 componentes piden a la
 *     vez, sale UNA petición a Ollama y los 9 reciben la misma respuesta.
 *   · TTL de 30 s: pasada la ventana, la siguiente llamada refresca.
 *   · Sirve la última lista buena aunque esté vencida si el refresco falla
 *     (stale-while-error): mejor una lista de hace 40 s que ninguna.
 *   · Timeout generoso (12 s) porque la operación real tarda 4,5 s.
 *
 * NO inventa modelos: si nunca hubo respuesta buena, devuelve `null` y quien
 * llama decide. La honestidad del «no sé» se conserva.
 */

export interface ModeloTags {
  name: string;
  model?: string;
  size?: number;
  digest?: string;
  details?: Record<string, unknown>;
}

export interface FotoTags {
  /** Modelos que Ollama reporta. Vacío si nunca hubo respuesta buena. */
  modelos: ModeloTags[];
  /** Cuándo se obtuvo esta foto (epoch ms). 0 = nunca. */
  obtenidaEn: number;
  /** true si la foto viene de una respuesta buena anterior y el refresco falló. */
  vencida: boolean;
  /** Motivo del último fallo, si lo hubo. */
  error?: string;
}

const TTL_MS = 30_000;
/**
 * v2.3.5 · ESTABA EN 12.000 Y CORTABA ANTES DE QUE OLLAMA CONTESTARA.
 *
 * Medido en esta máquina (8/11): `GET /api/tags` responde HTTP 200 entre 18 y 37 s
 * con 40+ modelos en el almacén y uno (`NEMESIS:latest`) de 62,4 GB — Ollama
 * recorre TODOS los manifiestos para calcular capacidades. A 12 s la caché se
 * rendía, marcaba la foto como `vencida` y devolvía lista vacía a los 23 puntos
 * de llamada que dependen de ella: de ahí el «0 de 14 piezas» y el «49 son nada».
 *
 * 30 s cubre el peor caso medido con margen. `CN_TAGS_TIMEOUT_MS` lo ajusta sin
 * recompilar (un almacén más grande o un disco lento pueden necesitar más).
 */
const TIMEOUT_MS = Math.max(
  1_000,
  Math.floor(Number(process.env.CN_TAGS_TIMEOUT_MS ?? 40_000) || 40_000),
);

let foto: FotoTags = { modelos: [], obtenidaEn: 0, vencida: false };
let enVuelo: Promise<FotoTags> | null = null;

function baseDe(targetUrl?: string): string {
  return (targetUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

async function pedir(targetUrl?: string): Promise<FotoTags> {
  const url = `${baseDe(targetUrl)}/api/tags`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) {
      // v1.0.15 · EL 500 DE /api/tags TIENE CAUSA CONCRETA Y SE DICE EN CRISTIANO.
      // Medido en el LOG de Mario: Ollama devuelve HTTP 500 al recorrer los
      // manifiestos cuando UNO está corrupto (blob a medio bajar, manifiesto
      // truncado, descarga cortada). Antes el motor sólo veía «HTTP 500» y
      // saltaba de proveedor como si Ollama no tuviera modelos. Ahora el motivo
      // dice qué pasó y cómo arreglarlo sin perder la lista buena anterior
      // (stale-while-error la conserva).
      let cuerpo = "";
      try { cuerpo = (await r.text()).slice(0, 300); } catch { /* sin cuerpo */ }
      if (r.status === 500) {
        throw new Error(
          `Ollama respondió HTTP 500 al listar modelos (/api/tags). ` +
          `Causa habitual: un modelo del almacén quedó CORRUPTO (descarga cortada o manifiesto a medias). ` +
          `Revísá con «ollama list» y reinstalá el que falle con «ollama rm <modelo>» + «ollama pull <modelo>».` +
          (cuerpo ? ` Detalle de Ollama: ${cuerpo}` : "")
        );
      }
      throw new Error(`HTTP ${r.status}${cuerpo ? ` — ${cuerpo}` : ""}`);
    }
    const j = (await r.json()) as { models?: ModeloTags[] };
    const modelos = Array.isArray(j.models) ? j.models : [];
    foto = { modelos, obtenidaEn: Date.now(), vencida: false };
    return foto;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    // Conservar la última lista buena: mejor vieja que vacía.
    foto = { ...foto, vencida: foto.obtenidaEn > 0, error: motivo };
    return foto;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Devuelve la foto de `/api/tags`, de caché si está fresca.
 * Nunca lanza: en el peor caso devuelve `modelos: []` con `error`.
 */
export async function tagsOllama(targetUrl?: string): Promise<FotoTags> {
  const edad = Date.now() - foto.obtenidaEn;
  if (foto.obtenidaEn > 0 && edad < TTL_MS) return foto;

  // Deduplicación: si ya hay una petición en vuelo, todos esperan la misma.
  if (enVuelo) return enVuelo;

  enVuelo = pedir(targetUrl).finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/** Sólo los nombres, que es lo que casi todos los llamadores necesitan. */
export async function nombresOllama(targetUrl?: string): Promise<string[]> {
  const f = await tagsOllama(targetUrl);
  return f.modelos.map((m) => m.name || m.model || "").filter(Boolean);
}

/** Fuerza un refresco (ignora el TTL). Útil tras instalar o borrar un modelo. */
export async function refrescarTags(targetUrl?: string): Promise<FotoTags> {
  if (enVuelo) return enVuelo;
  enVuelo = pedir(targetUrl).finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/** Estado de la caché, para diagnóstico. */
export function estadoTags(): FotoTags & { edadMs: number; ttlMs: number } {
  return { ...foto, edadMs: Date.now() - foto.obtenidaEn, ttlMs: TTL_MS };
}
