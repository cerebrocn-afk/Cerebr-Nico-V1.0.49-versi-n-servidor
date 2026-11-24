/**
 * sondeoEmbedderDirecto.ts — PREGUNTAR POR UN MODELO SIN LISTAR EL ALMACÉN (v2.3.4)
 * =================================================================================
 * EL DEFECTO QUE CIERRA (log de Mario, 8/11 18:39-18:42):
 *
 *   [GIN] 200 | 34.0s | GET "/api/tags"
 *   [GIN] 500 | 12.4s | GET "/api/tags"
 *   [GIN] 200 |  2.4s | POST "/api/show"
 *
 * Con 40+ modelos en el almacén y `NEMESIS:latest` pesando 62,4 GB, `GET /api/tags`
 * recorre TODOS los manifiestos para calcular capacidades. En este equipo tarda
 * entre 12 y 37 s y a veces devuelve 500. El panel del embedder cortaba a los 12 s
 * (luego 30 s) y pintaba «sin embedder · sin-medir» con `snowflake-arctic-embed:33m`
 * PRESENTE en el disco.
 *
 * Subir el timeout no arregla nada: es un parche que hace esperar medio minuto al
 * panel para decir algo que se puede saber en 2 s. La pregunta real del embedder es
 * UNA SOLA: «¿existe este modelo concreto?». Y eso se responde con `POST /api/show`
 * sobre ese nombre, que NO recorre el almacén.
 *
 * Este módulo hace exactamente eso, y nada más:
 *   · recibe una lista corta de nombres candidatos (el preferido, el recomendado);
 *   · pregunta por cada uno con `/api/show` y un timeout corto;
 *   · devuelve los que EXISTEN, con su tamaño leído del manifiesto si viene;
 *   · si ninguno responde, devuelve `fallo` — nunca «no hay», que es la mentira
 *     que el panel venía contando.
 *
 * Puro respecto del transporte: `fetchImpl` se inyecta. Sin fs, sin reloj propio.
 */

/** Lo que se pregunta por cada candidato. */
export interface SondeoDirecto {
  /** Nombres que existen en Ollama (verificados uno por uno). */
  existentes: string[];
  /** Bytes por nombre, si `/api/show` los reporta. */
  tamanos: Record<string, number>;
  /** `ok` si al menos una pregunta se pudo contestar; `fallo` si ninguna. */
  leyenda: "ok" | "fallo";
  /** Cuántas preguntas se hicieron y cuántas contestaron (para el motivo). */
  preguntados: number;
  contestados: number;
}

export interface OpcionesSondeoDirecto {
  /** URL base de Ollama, sin barra final. */
  baseUrl: string;
  /** Nombres a verificar, en orden de preferencia. */
  candidatos: string[];
  /** Timeout por pregunta. Medido: `/api/show` responde en 2,4 s. */
  timeoutMs?: number;
  /** Inyectable para probar en seco. */
  fetchImpl?: typeof fetch;
}

/** Timeout por defecto de UNA pregunta. 2,4 s medidos + margen de 4x. */
export const TIMEOUT_SHOW_MS = 10_000;

/**
 * Pregunta por UN modelo con `POST /api/show`.
 * Devuelve `null` si no existe (404) o si la pregunta no se pudo contestar.
 * El segundo caso se distingue por `contestado`.
 */
async function preguntarUno(
  baseUrl: string,
  nombre: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ existe: boolean; contestado: boolean; bytes?: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nombre }),
      signal: ctrl.signal,
    });
    if (r.status === 404) return { existe: false, contestado: true };
    if (!r.ok) return { existe: false, contestado: false };
    const j: any = await r.json().catch(() => null);
    if (!j || typeof j !== "object") return { existe: false, contestado: false };
    // Un modelo fantasma (manifiesto sin pesos) responde 200 con `model_info` vacío.
    // Se considera existente igual: la pregunta era «¿está?», no «¿sirve?».
    let bytes: number | undefined;
    const sz = Number(j?.size);
    if (Number.isFinite(sz) && sz > 0) bytes = sz;
    return { existe: true, contestado: true, ...(bytes === undefined ? {} : { bytes }) };
  } catch {
    return { existe: false, contestado: false }; // abort o rechazo: NO afirma ausencia
  } finally {
    clearTimeout(t);
  }
}

/**
 * Verifica los candidatos uno por uno. Se detiene en el primero que existe
 * (el orden de la lista ES la preferencia), pero sigue preguntando el resto
 * sólo si el primero falló por transporte — así un timeout no enmascara un
 * modelo que sí está.
 */
export async function sondearEmbedderDirecto(op: OpcionesSondeoDirecto): Promise<SondeoDirecto> {
  const base = String(op.baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const fetchImpl = op.fetchImpl ?? fetch;
  const timeoutMs = Math.max(500, Math.floor(op.timeoutMs ?? TIMEOUT_SHOW_MS));
  const candidatos = (op.candidatos || []).map((c) => String(c || "").trim()).filter(Boolean);

  const existentes: string[] = [];
  const tamanos: Record<string, number> = {};
  let preguntados = 0;
  let contestados = 0;

  for (const nombre of candidatos) {
    preguntados++;
    const r = await preguntarUno(base, nombre, timeoutMs, fetchImpl);
    if (r.contestado) contestados++;
    if (r.existe) {
      existentes.push(nombre);
      if (r.bytes !== undefined) tamanos[nombre] = r.bytes;
    }
  }

  return {
    existentes,
    tamanos,
    // `ok` sólo si AL MENOS una pregunta se contestó: con cero respuestas no se
    // puede afirmar nada, ni presencia ni ausencia.
    leyenda: contestados > 0 ? "ok" : "fallo",
    preguntados,
    contestados,
  };
}
