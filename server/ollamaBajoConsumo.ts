/**
 * ollamaBajoConsumo.ts — LO QUE VIVE EN RAM AHORA MISMO, Y SALIR DE ELLA
 * ======================================================================
 * v1.16.3.1 · MODO BAJO CONSUMO. El informe MEJORA_MODO_BAJO_CONSUMO_v1 §2.3
 * lo pedía con estas palabras: «el usuario ve por qué se apaga la máquina y
 * tiene la salida sin abrir la consola».
 *
 * QUÉ ES: el único sitio del servidor que habla con `GET /api/ps` de Ollama y
 * el único que expulsa modelos. Tres piezas:
 *   · `sondearOllamaPs()`   → lista normalizada de modelos RESIDENTES (no
 *                             instalados: cargados ahora, ocupando RAM/VRAM).
 *   · `expulsarModelos()`   → POST /api/generate con keep_alive:0 por modelo
 *                             (la orden de descarga INMEDIATA de Ollama).
 *   · la caché de muestra   → el stats del frontend se pide cada 5 s; machacar
 *                             Ollama con /api/ps en cada muestra es justo el
 *                             ruido que este módulo viene a quitar.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN server.ts: el trinquete de líneas del monolito
 * (SUPERFICIE: server.ts no crece). Todo lo nuevo que quepa en un módulo con
 * API propia vive en un módulo; al monolito solo le llegan las tres líneas
 * que montan la ruta y el delegador de la herramienta.
 *
 * HONESTIDAD DEL MEDIDOR: `ollama ps` responde tamaños en bytes ya parseados
 * por Ollama (`size_vram`, `size`); si un campo falta o llega basura, el
 * modelo se informa SIN tamaño (null) — nunca se inventa un número redondo.
 * El total `residenteMb` suma solo lo medido. Y si Ollama no está, el estado
 * es `vivo: false`, no un silencio.
 */

export interface ModeloResidente {
  /** Nombre exacto con tag tal como lo reporta Ollama. */
  model: string;
  /** Bytes totales ocupados (size de /api/ps). null = Ollama no lo informó. */
  sizeBytes: number | null;
  /** Porción declarada en VRAM. null = no informada. */
  vramBytes: number | null;
  /** Cuándo caduca la residencia (texto de Ollama, p. ej. "About a minute"). */
  until: string;
  /** true si Ollama ya lo marcó expirado (se descargará solo). */
  expirado: boolean;
}

export interface EstadoOllamaPs {
  vivo: boolean;
  modelos: ModeloResidente[];
  /** Suma de sizeBytes de los modelos medidos. */
  residenteMb: number;
  /** Momento de la muestra (epoch ms). */
  muestreadoEn: number;
  /** Motivo legible cuando vivo=false (para el chip de Puertos). */
  error?: string;
}

/** Caducidad de la muestra: 5 s iguala el polling del frontend, ni más fino. */
export const PS_CADUCIDAD_MS = 5_000;
/** Sondeo corto: /api/ps es local y responde en milisegundos; 2 s es holgado. */
export const PS_TIMEOUT_MS = 2_000;

let ultimaMuestra: EstadoOllamaPs | null = null;

function bytes(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Normaliza la respuesta cruda de /api/ps. Función PURA: se prueba en seco. */
export function normalizarPs(crpudo: unknown, ahora = Date.now()): ModeloResidente[] {
  const lista = Array.isArray((crpudo as any)?.models) ? (crpudo as any).models : [];
  const out: ModeloResidente[] = [];
  for (const m of lista) {
    if (!m || typeof m.model !== "string" || !m.model.trim()) continue;
    out.push({
      model: m.model.trim(),
      sizeBytes: bytes(m.size ?? m.size_vram),
      vramBytes: bytes(m.size_vram),
      until: typeof m.until === "string" ? m.until : "",
      expirado: (() => {
        const t = m.until ? Date.parse(m.until) : NaN;
        return Number.isFinite(t) ? t <= ahora : false;
      })(),
    });
  }
  return out;
}

/** Suma solo lo medido; un modelo sin tamaño no infla el total. Pura también. */
export function sumarResidenteMb(modelos: ModeloResidente[]): number {
  return Math.round(modelos.reduce((s, m) => s + (m.sizeBytes ?? 0), 0) / 1024 / 1024);
}

/** Invalida la muestra (la expulsión y el refresh la llaman para no mentir). */
export function invalidarMuestraPs(): void {
  ultimaMuestra = null;
}

export interface DepsPs {
  /** URL base de Ollama (OLLAMA_HOST del proceso, ya normalizada sin barra). */
  ollamaUrl: string;
  /** Inyectable para pruebas en seco. */
  fetchImpl?: typeof fetch;
  ahora?: () => number;
}

/**
 * Sondeo de modelos residentes con caché de 5 s. Nunca lanza: responde
 * { vivo:false, error } si Ollama está caído o tarda (un medor que no
 * responde no puede detener el panel de Puertos).
 */
export async function sondearOllamaPs(deps: DepsPs, forzar = false): Promise<EstadoOllamaPs> {
  const ahora = (deps.ahora ?? Date.now)();
  if (!forzar && ultimaMuestra && ahora - ultimaMuestra.muestreadoEn < PS_CADUCIDAD_MS) {
    return ultimaMuestra;
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  let vivo = false;
  let modelos: ModeloResidente[] = [];
  let error: string | undefined;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PS_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${deps.ollamaUrl}/api/ps`, { signal: controller.signal });
      if (res.ok) {
        vivo = true;
        modelos = normalizarPs(await res.json().catch(() => ({})), Date.now());
      } else {
        error = `Ollama respondió HTTP ${res.status} a /api/ps`;
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err: any) {
    error = `Ollama no respondió al sondeo de residencia (${err?.message || "conexión"}).`;
  }
  ultimaMuestra = {
    vivo,
    modelos,
    residenteMb: sumarResidenteMb(modelos),
    muestreadoEn: ahora,
    ...(error ? { error } : {}),
  };
  return ultimaMuestra;
}

/**
 * Expulsión inmediata: la receta oficial es un generate con keep_alive:0 —
 * Ollama interpreta «termina esta petición y descarga el modelo» sin esperar
 * la caducidad. `modelos` vacío = expulsar TODO lo residente. Devuelve el
 * antes/después medido, no una promesa de fe.
 */
export async function expulsarModelos(
  deps: DepsPs,
  modelos?: string[]
): Promise<{ ok: boolean; expulsados: string[]; fallidos: { model: string; error: string }[]; despues: EstadoOllamaPs }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const antes = await sondearOllamaPs(deps, true);
  const objetivo = (modelos && modelos.length ? modelos : antes.modelos.map((m) => m.model)).filter(Boolean);
  const expulsados: string[] = [];
  const fallidos: { model: string; error: string }[] = [];
  for (const model of objetivo) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), PS_TIMEOUT_MS * 5);
      try {
        const res = await fetchImpl(`${deps.ollamaUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }),
          signal: controller.signal,
        });
        if (res.ok) expulsados.push(model);
        else fallidos.push({ model, error: `HTTP ${res.status}` });
      } finally {
        clearTimeout(t);
      }
    } catch (err: any) {
      fallidos.push({ model, error: err?.message || String(err) });
    }
  }
  invalidarMuestraPs();
  const despues = await sondearOllamaPs(deps, true);
  return { ok: fallidos.length === 0, expulsados, fallidos, despues };
}
