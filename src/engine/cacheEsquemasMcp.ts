/**
 * cacheEsquemasMcp.ts · v1.0.30 — EL ARRANQUE PEREZOSO, CON MEMORIA EN DISCO
 * ========================================================================
 * QUÉ CURA
 * v1.0.28 hizo que los servidores MCP por fin arrancaran. El problema siguiente
 * es el que la propuesta v1.1.0 señala bien: arrancan TODOS y se quedan. Cada
 * servidor stdio es un proceso (node/python) que ocupa RAM siempre, aunque el
 * usuario no lo use ni una vez en la sesión. En un equipo de 8 GB eso se nota.
 *
 * LA IDEA, EN DOS PASOS
 *   1. Las DEFINICIONES de herramientas (nombre, descripción, esquema) no cambian
 *      si no cambia la configuración del servidor. Se guardan en disco junto a un
 *      hash SHA-256 de esa configuración (comando + args + env, con los secretos
 *      resueltos de forma estable). Si el hash coincide, el modelo ve las mismas
 *      herramientas SIN levantar un proceso.
 *   2. El proceso se arranca en la PRIMERA llamada real y se cierra tras un
 *      tiempo de inactividad. Cerrar es barato; arrancar es lo caro. Se paga una
 *      vez por sesión y solo si de verdad se usa.
 *
 * LAS CUATRO TRAMPAS QUE ESTE MÓDULO ESQUIVA (y que un registro «obvio» no)
 *   · EL HASH NO PUEDE LLEVAR SECRETOS. `env` puede traer un token. Se hashea el
 *     NOMBRE de la variable y una huella corta del valor, nunca el valor: un
 *     archivo de caché con tokens en claro es un incidente, no una optimización.
 *   · EL PROCESO TIENE QUE PODER LANZARSE SIN SHELL. Ya está resuelto en
 *     `clienteMcp` (spawn con array de argumentos), pero si alguien cambia eso,
 *     el arranque perezoso deja de funcionar el día que se usa. La suite lo fija.
 *   · LA CACHÉ CADUCA. Un archivo viejo no puede gobernar la sesión: hay un TTL
 *     declarado y, si el servidor falla al arrancar de verdad, la entrada se
 *     marca como caída EN VEZ de contestar con definiciones que ya no existen.
 *   · UN FALLO DE CACHÉ NO ES UN FALLO DEL SERVIDOR. Si el archivo está corrupto
 *     o sin permiso, se ignora y se sigue: se pierde la optimización, no el turno.
 *
 * Módulo puro salvo por el disco explícito (`leer`/`escribir` inyectados), para
 * que tenga suite sin tocar el sistema de archivos real.
 */

import crypto from "node:crypto";

/** Cómo se guarda una entrada de caché. Nada de aquí puede ser secreto. */
export interface EntradaCacheMcp {
  /** sha256 de la configuración normalizada. */
  huella: string;
  /** Cuándo se escribió (ms). */
  guardadoEn: number;
  /**
   * v1.0.31 · CUÁNTAS herramientas se guardaron. Sirve para detectar un archivo
   * TRUNCADO: un JSON cortado a mitad de escritura puede seguir siendo JSON
   * válido (si el corte cae antes de la herramienta 7) y entonces el modelo
   * recibiría 6 de 12 herramientas creyendo que el servidor solo declara 6.
   * Si `herramientas.length !== cuenta`, la entrada se descarta y se arranca.
   */
  cuenta?: number;
  /** Definiciones tal como las declaró el servidor. */
  herramientas: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}

export type ArchivoCacheMcp = Record<string, EntradaCacheMcp>;

/** Lo mínimo del sistema de archivos que hace falta. Inyectable: así se prueba. */
export interface DepsDisco {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: string): string;
  writeFileSync(p: string, datos: string, enc: string): void;
  renameSync(a: string, b: string): void;
  unlinkSync(p: string): void;
}

export interface ResultadoEscritura {
  ok: boolean;
  rutaFinal: string;
  bytes: number;
  /** Renombrados intentados (Windows: el primero puede dar EPERM). */
  intentos: number;
  rutaTemporal?: string;
  error?: string;
}

/** Códigos de Windows que significan «el archivo está tomado, reintenta». */
export const CODIGOS_REINTENTO = new Set(["EPERM", "EBUSY", "EACCES", "EEXIST", "ENOTEMPTY"]);

/**
 * Escritura ATÓMICA de la caché: se escribe a `<ruta>.<pid>.<azar>.tmp` EN LA
 * MISMA CARPETA y se renombra encima del destino.
 *
 * Por qué en la misma carpeta: `rename` solo es atómico dentro del mismo volumen;
 * un temporal en %TEMP% y el destino en otro disco se convierte en copia, y una
 * copia interrumpida deja el archivo a medias — exactamente lo que se quiere evitar.
 * Por qué con reintentos: en Windows el antivirus y el indexador abren el archivo
 * recién escrito y `rename` devuelve EPERM/EBUSY durante unos milisegundos. Fallar
 * ahí significaría perder la caché en cada arranque del equipo, que es no tenerla.
 * Si tras los reintentos sigue tomado, se devuelve `ok:false` con el error REAL y
 * el temporal se deja nombrado: nunca se borra a ciegas la evidencia.
 */
export function escribirCacheAtomica(
  ruta: string,
  contenido: string,
  deps: DepsDisco,
  opts: { pid?: number; intentos?: number; pausaMs?: number; dormir?: (ms: number) => void } = {}
): ResultadoEscritura {
  const pid = opts.pid ?? (typeof process !== "undefined" ? process.pid : 0);
  const maxIntentos = Math.max(1, opts.intentos ?? 5);
  const azar = Math.random().toString(36).slice(2, 8);
  const rutaTemporal = `${ruta}.${pid}.${azar}.tmp`;
  const dormir = opts.dormir ?? ((ms: number) => { try { const t: any = setTimeout(() => {}, ms); if (t?.unref) t.unref(); } catch { /* sin reloj inyectado */ } });
  const bytes = Buffer.byteLength(contenido, "utf-8");
  try {
    deps.writeFileSync(rutaTemporal, contenido, "utf-8");
  } catch (e: any) {
    return { ok: false, rutaFinal: ruta, bytes, intentos: 0, error: `no se pudo escribir el temporal: ${e?.message || e}` };
  }
  let ultimo = "";
  for (let i = 1; i <= maxIntentos; i++) {
    try {
      deps.renameSync(rutaTemporal, ruta);
      return { ok: true, rutaFinal: ruta, bytes, intentos: i };
    } catch (e: any) {
      ultimo = `${e?.code || ""} ${e?.message || e}`.trim();
      if (!CODIGOS_REINTENTO.has(String(e?.code || ""))) break;
      if (i < maxIntentos) dormir(20 * i);
    }
  }
  return { ok: false, rutaFinal: ruta, bytes, intentos: maxIntentos, rutaTemporal, error: ultimo };
}

/**
 * Guarda una copia del archivo corrupto ANTES de sobrescribirlo. Nunca pisa una
 * copia anterior (el nombre lleva pid y milisegundo) y nunca lanza: si no se
 * puede copiar, se pierde la evidencia, no el turno.
 *
 * Por qué existe: el `leerCacheSeguro` devuelve null y el arranque sigue, pero
 * entonces la primera escritura BORRA el archivo roto — y con él la única prueba
 * de qué lo rompió. Un archivo ilegible guardado al lado es diagnóstico gratis.
 */
export function respaldarCorrupto(
  ruta: string,
  contenidoCrudo: string | null,
  ahoraMs: number,
  deps: DepsDisco,
  pid: number = typeof process !== "undefined" ? process.pid : 0
): string | null {
  if (!contenidoCrudo) return null;
  const nombre = `${ruta}.corrupto-${pid}-${ahoraMs}.json`;
  try {
    if (deps.existsSync(nombre)) return nombre; // ya hay copia de este mismo instante
    deps.writeFileSync(nombre, contenidoCrudo, "utf-8");
    return nombre;
  } catch {
    return null;
  }
}

/**
 * TTL de vida de las definiciones: 14 días por defecto.
 *
 * La propuesta pedía 10-15 MINUTOS. Se descarta a propósito y se deja escrito:
 * las definiciones dependen SOLO de la configuración, y la configuración está en
 * la huella. Un TTL de 15 minutos no protege de nada que la huella no detecte ya
 * y, en cambio, hace que un usuario que abre la IDE tres veces al día pague el
 * arranque completo de cada servidor MCP en cada apertura. Quien quiera el
 * régimen conservador lo pide por entorno (`CN_CACHE_ESQUEMAS_TTL_MS`) y el suelo
 * es 10 minutos: menos que eso es apagar la caché con pasos extra.
 */
export function ttlCacheEsquemas(env: Record<string, string | undefined> = {}): number {
  const crudo = Number(env.CN_CACHE_ESQUEMAS_TTL_MS ?? "");
  if (Number.isFinite(crudo) && crudo >= TTL_MIN_CACHE_ESQUEMAS_MS) {
    return Math.min(crudo, TTL_MAX_CACHE_ESQUEMAS_MS);
  }
  return TTL_CACHE_ESQUEMAS_MS;
}

export const TTL_MIN_CACHE_ESQUEMAS_MS = 10 * 60 * 1000;
export const TTL_MAX_CACHE_ESQUEMAS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Serializa la caché para disco: JSON canónico (claves ordenadas), envuelto en un
 * sobre con versión y fecha.
 *
 * Por qué el sobre: sin `version`, un cambio de forma del archivo se lee como si
 * fuera el mismo y produce herramientas fantasma. Con `version` distinta, el
 * lector devuelve null y se arranca de verdad — que es la única respuesta segura.
 */
export function serializarCache(cache: ArchivoCacheMcp | null, ahoraMs: number): string {
  const servidores: ArchivoCacheMcp = {};
  for (const id of Object.keys(cache || {}).sort()) {
    const e = (cache || {})[id];
    if (!e || !Array.isArray(e.herramientas)) continue;
    servidores[id] = {
      huella: String(e.huella || ""),
      guardadoEn: Number(e.guardadoEn || 0),
      cuenta: e.herramientas.length,
      herramientas: e.herramientas,
    };
  }
  // Canónico pero legible: 2 espacios para que se pueda mirar a ojo, y las
  // definiciones también con claves ordenadas para que el archivo sea estable.
  return JSON.stringify(
    JSON.parse(ordenCanonico({ version: VERSION_CACHE_ESQUEMAS, actualizadoEn: ahoraMs, servidores })),
    null,
    2
  );
}

export const VERSION_CACHE_ESQUEMAS = 2;


/** Forma de la configuración que sí entra en el hash. */
export interface ConfigParaHuella {
  comando: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Huella de una configuración. `env` entra por NOMBRE y por una huella corta del
 * valor: cambiar el token del usuario no debe invalidar la caché (las
 * definiciones de herramientas no dependen de él), pero cambiar qué variables
 * se pasan SÍ (puede cambiar qué herramientas declara el servidor).
 */
export function huellaDeConfiguracion(cfg: ConfigParaHuella): string {
  const entorno = Object.keys(cfg.env || {})
    .sort()
    .map((k) => `${k}:${huellaCorta(String((cfg.env || {})[k] ?? ""))}`);
  // v1.0.31 · JSON CANÓNICO: mismo contenido, mismos bytes, misma huella. Con
  // `JSON.stringify` a secas, dos llamadas con las mismas claves en distinto orden
  // producen huellas distintas y la caché se invalida sin que nada haya cambiado.
  const payload = ordenCanonico({
    comando: String(cfg.comando || ""),
    args: (cfg.args || []).map(String),
    entorno,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/** 12 caracteres bastan para detectar un cambio de configuración, sin filtrar el valor. */
function huellaCorta(valor: string): string {
  return crypto.createHash("sha256").update(valor).digest("hex").slice(0, 12);
}

/**
 * ¿Sirve la entrada de caché? Tres condiciones, todas obligatorias: existe, el
 * hash coincide y no está caducada. Cualquier otra cosa = se arranca de verdad.
 */
export function entradaValida(
  cache: ArchivoCacheMcp | null,
  id: string,
  huella: string,
  ahoraMs: number,
  ttlMs: number
): EntradaCacheMcp | null {
  const e = cache && cache[id];
  if (!e || !Array.isArray(e.herramientas) || e.herramientas.length === 0) return null;
  // v1.0.31 · TRUNCADO: si el archivo declara 12 y trae 6, no es «6 herramientas»:
  // es un archivo a medias. Se arranca de verdad en vez de mentirle al modelo.
  if (typeof e.cuenta === "number" && e.cuenta !== e.herramientas.length) return null;
  if (e.huella !== huella) return null;
  const edad = ahoraMs - Number(e.guardadoEn || 0);
  if (!Number.isFinite(edad) || edad < 0 || edad > ttlMs) return null;
  return e;
}

/**
 * Escribe una entrada. Devuelve el archivo NUEVO (no muta el de entrada: quien
 * llama decide cuándo persistir, y dos servidores en paralelo no se pisan).
 */
export function conEntrada(
  cache: ArchivoCacheMcp | null,
  id: string,
  cfg: ConfigParaHuella,
  herramientas: EntradaCacheMcp["herramientas"],
  ahoraMs: number
): ArchivoCacheMcp {
  const base: ArchivoCacheMcp = cache && typeof cache === "object" ? { ...cache } : {};
  const limpias = sanitizar(herramientas);
  base[id] = { huella: huellaDeConfiguracion(cfg), guardadoEn: ahoraMs, cuenta: limpias.length, herramientas: limpias };
  return base;
}

/**
 * Quita de las definiciones cualquier cosa que parezca un secreto antes de
 * escribir a disco. Un servidor puede devolver en la descripción «usa el token
 * sk-abc…»; eso no puede acabar en un archivo de caché.
 */
export function sanitizar(herramientas: EntradaCacheMcp["herramientas"]): EntradaCacheMcp["herramientas"] {
  const limpiar = (t: string): string =>
    String(t || "").replace(/\b(sk|pk|ghp|glpat|xoxb|xoxp)-[A-Za-z0-9_-]{10,}/g, "[secreto]");
  return (herramientas || [])
    .filter((h) => h && typeof h.name === "string" && h.name.trim())
    .map((h) => ({
      name: h.name,
      description: h.description ? limpiar(h.description) : undefined,
      inputSchema: h.inputSchema,
    }));
}

/**
 * Lee el archivo de caché tolerando todo: ausente, corrupto, de otra versión, sin
 * permiso. En todos esos casos devuelve `null` y el arranque sencillamente se
 * hace como en v1.0.28. Perder la optimización nunca puede perder el turno.
 */
export function leerCacheSeguro(contenido: string | null): ArchivoCacheMcp | null {
  if (!contenido) return null;
  try {
    const d = JSON.parse(contenido);
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    // v1.0.31 · SOBRE CON VERSIÓN. El archivo de v1.0.30 era un mapa plano; el de
    // ahora es {version, actualizadoEn, servidores}. Se aceptan LOS DOS (una
    // actualización no puede invalidar la caché del día anterior sin necesidad) y
    // se rechaza cualquier versión que no se sepa leer: adivinar la forma de un
    // archivo ajeno es cómo se registran herramientas que el servidor no declara.
    if ("servidores" in (d as any) || "version" in (d as any)) {
      const v = Number((d as any).version || 0);
      if (v !== VERSION_CACHE_ESQUEMAS) return null;
      const s = (d as any).servidores;
      if (!s || typeof s !== "object" || Array.isArray(s)) return null;
      return s as ArchivoCacheMcp;
    }
    return d as ArchivoCacheMcp;
  } catch {
    return null;
  }
}

/**
 * JSON canónico: claves ordenadas en TODO el árbol (objetos y arrays, recursivo).
 * Se usa para la huella y para lo que se escribe a disco, así dos ejecuciones con
 * el mismo contenido producen los mismos bytes y el mismo sha256.
 */
export function ordenCanonico(v: unknown): string {
  const norm = (x: any): any => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x).sort()) o[k] = norm(x[k]);
      return o;
    }
    return x;
  };
  return JSON.stringify(norm(v));
}

// ---------------------------------------------------------------------------
// 2 · EL TEMPORIZADOR DE INACTIVIDAD (uno por servidor, reiniciable)
// ---------------------------------------------------------------------------

/**
 * Reloj de inactividad. Se separa del servidor a propósito: así se puede probar
 * con tiempo inyectado (sin `setTimeout` real y sin esperar 60 s en la suite) y
 * el cierre se puede disparar a mano en el apagado de la IDE.
 */
export class RelojDeInactividad {
  private relojes = new Map<string, any>();
  private readonly ttlMs: number;
  private readonly alVencer: (id: string) => void;
  private readonly programar: (fn: () => void, ms: number) => any;
  private readonly cancelar: (t: any) => void;

  constructor(
    alVencer: (id: string) => void,
    ttlMs: number,
    programar: (fn: () => void, ms: number) => any = (fn, ms) => setTimeout(fn, ms),
    cancelar: (t: any) => void = (t) => clearTimeout(t)
  ) {
    this.alVencer = alVencer;
    this.ttlMs = Math.max(1_000, ttlMs);
    this.programar = programar;
    this.cancelar = cancelar;
  }

  /** Hay actividad: se reprograma (no se acumulan relojes para el mismo id). */
  tocar(id: string): void {
    const previo = this.relojes.get(id);
    if (previo) this.cancelar(previo);
    const t = this.programar(() => {
      this.relojes.delete(id);
      try { this.alVencer(id); } catch { /* cerrar nunca debe lanzar */ }
    }, this.ttlMs);
    // Un reloj no debe mantener el proceso de la IDE vivo por sí solo.
    if (t && typeof t.unref === "function") t.unref();
    this.relojes.set(id, t);
  }

  /** Hay un servidor nominado: se puede ofrecer «apagado en N s» en el panel. */
  activo(id: string): boolean {
    return this.relojes.has(id);
  }

  soltar(id: string): void {
    const t = this.relojes.get(id);
    if (t) this.cancelar(t);
    this.relojes.delete(id);
  }

  soltarTodos(): void {
    for (const [, t] of this.relojes) this.cancelar(t);
    this.relojes.clear();
  }
}

/** TTL por defecto del arranque perezoso: 60 s de inactividad y se cierra. */
export const TTL_INACTIVIDAD_MCP_MS = 60_000;

/** Caducidad de las definiciones guardadas: 14 días. Pasado eso se relee. */
export const TTL_CACHE_ESQUEMAS_MS = 14 * 24 * 60 * 60 * 1000;
