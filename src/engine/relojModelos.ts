/**
 * relojModelos.ts — v1.57.18 · EL RELOJ MEDIDO
 * ============================================================
 * RAÍZ (estudio de la sesión 1792103924951, 118,9 min medidos): 9 de 23 turnos
 * con error (39 %), 24,0 min quemados (20 % de la sesión) y un turno fallido
 * costando 5x un acierto. Los relojes que produjeron eso estaban ESCRITOS A MANO
 * —120 s de primer byte en fetchCloud, 180 s de watchdog genérico, 300 s de
 * inactividad local que nunca llega a sonar— y ninguno medía al modelo real:
 *  · glm-4.5-flash murió 2x contra el 120 de Z.ai y 4x con `fetch failed` cuya
 *    CAUSA REAL (ECONNRESET/ETIMEDOUT) viajaba oculta;
 *  · gemma4:31b-cloud (391 s) murió contra el 180 genérico TENIENDO un reloj
 *    local de 300 s pensado para «cargar modelos lentos»;
 *  · gpt-oss:120b-cloud rechazó una imagen (HTTP 400) que el motor podía
 *    prever con isVisionModelName.
 * La ley de la casa —no afirmar lo que no se midió— aplicada al TIEMPO: este
 * módulo mide el primer byte por modelo en la red del usuario y deriva el
 * presupuesto; clasifica el fallo por causa; extrae la causa real de la red.
 * Puro y con reloj inyectable: los 120 s de Z.ai y los 391 s de gemma4 de la
 * sesión real son fixtures de prueba.
 */

/** Clases de fallo que la consola de la sesión dejó ver. */
export type ClaseFallo = "red" | "cuota" | "capacidad" | "tiempo" | "desconocido";

/** Clase de tamaño del modelo: define la base cuando todavía no hay mediciones. */
export type ClaseModelo = "local-chico" | "local-mediano" | "local-grande" | "nube-rapida" | "nube-grande";

export interface Medicion {
  n: number;
  p50: number;
  /** Percentil 95: el presupuesto se deriva de acá, no del promedio. */
  p95: number;
  ultima: number;
}

export interface Presupuesto {
  ms: number;
  fuente: "medido" | "clase";
  etiqueta: string;
}

// ── Bases por clase (solo hasta tener mediciones propias) ────────────────────
// Cada número tiene su porqué, tomado del estudio: un local de 3B carga rápido,
// un 31B en 16 GB no; un `-cloud` es Ollama remoto y NO hereda consejos de RAM.
const BASES: Record<ClaseModelo, number> = {
  "local-chico": 60_000,
  "local-mediano": 120_000,
  "local-grande": 240_000,
  "nube-rapida": 60_000,
  "nube-grande": 180_000,
};

const PISO_MS = 30_000;
const TECHO_MS = 600_000;
/** v1.0.19 · techo de CONEXIÓN con Ollama (server.ts, OLLAMA_CONNECT_TIMEOUT_MS): el presupuesto no puede llegar a rozarlo. */
const TECHO_CONEXION_OLLAMA_MS = 180_000;
const MARGEN_P95 = 1.6;      // el tope es el p95 con aire, no el p95 pelado
const MUESTRAS_MAX = 12;     // ventana: las últimas 12 llamadas del modelo
const MIN_MUESTRAS_MEDIDAS = 3; // con menos, la base por clase manda

// v1.66.1 · PISO DE CARGA FRÍA — LA OTRA MITAD DEL PRIMER BYTE
// ----------------------------------------------------------------------------
// RAÍZ (sesión exportada 1792727665798, 23/10): TODOS los modelos locales chicos
// —qwen2.5:0.5b, qwen3:0.6b, deepseek-coder:1.3b, gemma3:270m, L4_cerebronico
// _master— murieron contra el mismo muro a ~60-64 s con «El modelo local cayó
// demasiado tiempo y se cortó». 60 s es exactamente `BASES["local-chico"]`.
//
// El presupuesto medía el primer byte, pero el primer byte de un modelo local
// FRÍO incluye dos cosas que la base por clase no contempla: volcar los pesos a
// RAM y procesar el prompt entero ANTES de la primera palabra. Ollama avisa lo
// primero con líneas `{"status":"loading model"}` y del segundo no dice nada.
// Como `keep_alive` no mantiene nada cuando el usuario rotó por seis modelos en
// dos minutos (cada rotación expulsa al anterior), el turno SIEMPRE era frío y
// el reloj siempre era el mismo.
//
// La solución no es subir el número a ciegas: es distinguirlo. Si Ollama dijo
// por `/api/ps` que el modelo NO está cargado, se le da el piso de carga fría.
// Si está cargado, el presupuesto medido manda como siempre.
const PISOS_CARGA_FRIA: Partial<Record<ClaseModelo, number>> = {
  // v1.0.19 · RAÍZ (sesión 1794607399689, 14/11): en CPU pura —el log de Ollama
  // de Mario dice `library=cpu` 29 veces— un 1B tarda ~165 s en la PRIMERA
  // palabra: volcar 1.5 GB de pesos + procesar el prompt. 150 s de piso y un
  // techo de conexión de 180 s se solapaban, así que el turno moría justo
  // cuando el modelo estaba por hablar. Ver `presupuestoPrimerByte`.
  "local-chico": 270_000,
  "local-mediano": 300_000,
  "local-grande": 420_000,
};

const muestras = new Map<string, number[]>();

// v1.0.19 · EL PROMPT NO ES GRATIS — ni en la terminal ni en la nube, pero en un
// modelo LOCAL el prefill se paga entero ANTES de la primera palabra. `ollama
// run "hola"` en la terminal de Mario responde en segundos porque lleva cuatro
// caracteres; CerebroNico lleva system + historial + (en modo agente) esquemas de
// herramientas. Cuando el doble llega desde el `done` de Ollama,
// `prompt_eval_duration` cuenta ese costo — medido, no estimado. Se guarda por
// modelo y se SUMA al presupuesto del primer byte del turno siguiente.
const sobrantesPrefill = new Map<string, number[]>(); // v1.0.20 · era Map<string, number> y guardaba un ARRAY de muestras: de ahí venían los 4 errores de tipo
const SOBRANTE_PREFILL_MAX = 6;

/** La parte de `prompt_eval_duration` que NO se come dentro del presupuesto base. */
export function sobranteDePrefill(msPrefill: number, baseMs: number): number {
  if (!Number.isFinite(msPrefill) || msPrefill <= 0) return 0;
  return Math.max(0, Math.round(msPrefill - baseMs));
}

/** Guarda lo que costó procesar el prompt en una llamada que respondió. */
export function registrarPrefill(modelo: string, msPrefill: number, baseMs: number): void {
  const sobrante = sobranteDePrefill(msPrefill, baseMs);
  if (!modelo || sobrante <= 0) return;
  const lista = sobrantesPrefill.get(modelo) ?? ([] as number[]); // v1.0.20 · el `|| []` se ensanchaba a `number | never[]` y rompía el tipo
  lista.push(sobrante);
  while (lista.length > SOBRANTE_PREFILL_MAX) lista.shift();
  sobrantesPrefill.set(modelo, lista);
}

/** Cuánto sumar al presupuesto por el prompt (mediana de lo medido, 0 si nada). */
export function sobranteMedidoDePrefill(modelo: string): number {
  const lista = sobrantesPrefill.get(modelo);
  if (!lista || lista.length === 0) return 0;
  const ordenados: number[] = [...lista].sort((a, b) => a - b);
  return ordenados[Math.floor((ordenados.length - 1) / 2)]; // mediana baja con n par
}

/** Cuántos parámetros indica el nombre (1.5b, 7b, 31b, 120b). 0 si no dice.
 *
 * v1.66.1 · TAMBIÉN EN MILLONES (`270m`, `135m`): Ollama publica así los modelos
 * chicos —`gemma3:270m`, `HuggingFaceTB/SMOLM-2_135M`— y el parser viejo devolvía
 * 0, que más abajo se leía «sin tamaño ⇒ es de nube». Un 270m LOCAL quedaba
 * clasificado como `nube-rapida` y recibía el reloj de la nube. Se aceptan sólo
 * valores entre 10 y 999 999 millones: así `bge-m3` o un apellido con «m» no se
 * confunden con un tamaño. */
export function parametrosDe(nombre: string): number {
  const n = String(nombre || "").toLowerCase();
  const m = n.match(/(\d+(?:\.\d+)?)\s*b(?![a-z])/);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) return v;
  }
  const mm = n.match(/(\d+(?:\.\d+)?)\s*m(?![a-z])/);
  if (mm) {
    const v = Number(mm[1]);
    if (Number.isFinite(v) && v >= 10 && v <= 999_999) return v / 1000; // millones → miles de millones
  }
  return 0;
}

/** Clase del modelo según tamaño y dueño. `-cloud` = Ollama remoto, no local.
 *
 * `esLocal` (v1.66.1): el llamador SABE de qué proveedor viene (el turno ya
 * resolvió `provider === "ollama"`). Sin tamaño en el nombre —un Modelfile
 * propio como `L4_cerebronico_master:latest`— el viejo default era
 * `nube-rapida`, que le daba al modelo local el reloj de un endpoint remoto.
 * Con `esLocal: true` la duda se resuelve a favor de la máquina: `local-chico`.
 * Un `-cloud` declarado en el nombre sigue ganando: su cómputo no toca la PC. */
export function claseDeModelo(nombre: string, esLocal = false): ClaseModelo {
  const n = String(nombre || "").toLowerCase();
  const p = parametrosDe(n);
  const esCloud = /-cloud|:cloud|cloud\b/.test(n) || /gpt-oss/.test(n);
  const esNube = /flash|mini|lite|turbo|haiku|air|nano/.test(n) && p === 0;
  if (esNube) return "nube-rapida";
  if (esCloud) return p >= 30 ? "nube-grande" : "nube-rapida";
  if (p === 0) return esLocal ? "local-chico" : "nube-rapida";
  if (p <= 3) return "local-chico";
  if (p <= 9) return "local-mediano";
  return "local-grande";
}

/** Registra el tiempo real hasta el PRIMER BYTE de una llamada que respondió. */
export function registrarPrimerByte(modelo: string, ms: number, ahora = Date.now()): void {
  if (!modelo || !Number.isFinite(ms) || ms <= 0) return;
  const lista = muestras.get(modelo) || [];
  lista.push(Math.round(ms));
  while (lista.length > MUESTRAS_MAX) lista.shift();
  muestras.set(modelo, lista);
  void ahora;
}

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0;
  const idx = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[idx];
}

/** Medición viva del modelo (null si nunca respondió). */
export function medicionDe(modelo: string): Medicion | null {
  const lista = muestras.get(modelo);
  if (!lista || lista.length === 0) return null;
  const ordenados = [...lista].sort((a, b) => a - b);
  return { n: ordenados.length, p50: percentil(ordenados, 50), p95: percentil(ordenados, 95), ultima: ordenados[ordenados.length - 1] };
}

/** Contexto que el motor SÍ sabe y el nombre solo no puede deducir. */
export interface ContextoPresupuesto {
  /** El turno va contra un proveedor local (Ollama en la máquina del usuario). */
  esLocal?: boolean;
  /**
   * ¿El modelo está cargado en RAM ahora mismo? Sale de `/api/ps`
   * (`inventarioLocal.cargados`). `false` = carga fría: hay que sumar el tiempo
   * de volcar los pesos. `undefined` = nadie lo consultó → no se opina.
   */
  cargadoEnRam?: boolean;
}

/**
 * El presupuesto del primer byte: MEDIDO si hay historia (p95 x margen),
 * si no la base por clase. Siempre entre piso y techo.
 *
 * v1.66.1 · con `cargadoEnRam: false` declarado, el resultado NUNCA baja del
 * piso de carga fría de su clase: los pesos todavía tienen que entrar a RAM.
 * Las mediciones propias siguen mandando por encima de ese piso (si el modelo
 * respondió lento estando frío, el p95 ya lo sabe mejor que esta tabla).
 */
export function presupuestoPrimerByte(modelo: string, ctx: ContextoPresupuesto = {}): Presupuesto {
  const esLocal = ctx.esLocal === true;
  const cargaFria = esLocal && ctx.cargadoEnRam === false;
  const clase = claseDeModelo(modelo, esLocal);
  const base = BASES[clase];
  const piso = cargaFria ? Math.max(PISO_MS, PISOS_CARGA_FRIA[clase] ?? 0) : PISO_MS;
  const acotar = (ms: number, pisoMs = PISO_MS) => Math.max(pisoMs, Math.min(TECHO_MS, Math.round(ms)));
  // v1.0.19 · LA CONEXIÓN Y EL RELOJ NO PUEDEN EMPATAR: si el presupuesto llega
  // al techo de conexión, gana el aborto del fetch y el usuario ve un error de
  // red en vez del reloj diciendo qué pasó. Se deja aire para que el reloj hable
  // primero (y el presupuesto NUNCA baja del piso: preferimos el aviso tardío).
  // El techo de conexión SOLO acota a un modelo LOCAL: es el aborto del fetch a
  // Ollama el que se adelanta. Un `-cloud` vive en el servidor de Ollama.
  const acotarConConexion = (ms: number) =>
    Math.min(esLocal ? TECHO_CONEXION_OLLAMA_MS - 15_000 : TECHO_MS, Math.round(ms));
  const med = medicionDe(modelo);
  const motivoCarga = cargaFria ? " · carga FRÍA (/api/ps no lo muestra)" : "";
  // v1.0.19 · el costo del PROMPT de este modelo, medido en el `done` anterior.
  const sobrante = esLocal ? sobranteMedidoDePrefill(modelo) : 0;
  const motivoPrompt = sobrante > 0 ? ` · +${Math.round(sobrante / 1000)} s de prompt medido` : "";
  if (!med || med.n < MIN_MUESTRAS_MEDIDAS) {
    return {
      // v1.0.19 · los dos recortes van JUNTOS: primero el piso (carga fría) y
      // después el aire bajo el aborto. Si se intercambian, el piso gana y el
      // presupuesto vuelve a rozar el techo de conexión — que es el bug.
      ms: acotarConConexion(acotar(base + sobrante, piso)),
      fuente: "clase",
      etiqueta: `${clase} (sin historia propia: base ${Math.round(base / 1000)} s${piso > PISO_MS ? `, piso de carga fría ${Math.round(piso / 1000)} s` : ""})${motivoCarga}${motivoPrompt}`,
    };
  }
  const porP95 = med.p95 * MARGEN_P95;
  const ms = acotarConConexion(acotar(Math.max(base * 0.8, porP95) + sobrante, piso));
  return {
    ms,
    fuente: "medido",
    etiqueta: `medido en tu máquina (${med.n} llamada(s): p50 ${med.p50 / 1000} s, p95 ${med.p95 / 1000} s x ${MARGEN_P95})${motivoCarga}${motivoPrompt}`,
  };
}

/** Clasifica el fallo por CAUSA — para avisar y para decidir cuarentena. */
export function clasificarFalloProveedor(err: unknown): { clase: ClaseFallo; detalle: string } {
  const msg = `${(err as any)?.message || err || ""} ${(err as any)?.cause?.code || ""} ${(err as any)?.cause?.message || ""}`.toLowerCase();
  if (/does not support image|does not support images|unsupported image|image input|vision/.test(msg)) {
    return { clase: "capacidad", detalle: "el modelo no acepta el contenido enviado (imagen)" };
  }
  if (/429|resource_exhausted|quota|rate.?limit|too many requests/.test(msg)) {
    return { clase: "cuota", detalle: "cuota o límite de velocidad del proveedor" };
  }
  if (/fetch failed|econnreset|econnrefused|enotfound|eai_again|etimedout|socket hang up|network|aborted/.test(msg)) {
    return { clase: "red", detalle: "la conexión con el proveedor se cortó" };
  }
  if (/sin respuesta .{0,60}en los primeros|timeout|timed ?out|watchdog|dejó de enviar|silencio/.test(msg)) {
    return { clase: "tiempo", detalle: "no llegó el primer byte dentro del presupuesto" };
  }
  return { clase: "desconocido", detalle: "causa no clasificada" };
}

/** La causa REAL que Node esconde en err.cause (ECONNRESET, ETIMEDOUT...). */
export function causaReal(err: unknown): string {
  const c = (err as any)?.cause;
  if (!c) return "";
  const code = typeof c === "string" ? c : c.code || c.errno || "";
  const detalle = typeof c === "string" ? "" : c.message || "";
  const texto = [code, detalle].filter(Boolean).join(" · ");
  return texto.slice(0, 120);
}

/** De los candidatos medidos, el más rápido (para proponer alternativa). */
export function sugerirAlternativa(candidatos: string[]): { modelo: string; p50: number; etiqueta: string } | null {
  let mejor: { modelo: string; p50: number } | null = null;
  for (const c of candidatos || []) {
    const med = medicionDe(c);
    if (!med) continue;
    if (!mejor || med.p50 < mejor.p50) mejor = { modelo: c, p50: med.p50 };
  }
  if (!mejor) return null;
  return { modelo: mejor.modelo, p50: mejor.p50, etiqueta: `responde en ${(mejor.p50 / 1000).toFixed(1)} s (medido en tu máquina)` };
}

/** Los modelos con historia de primer byte (para proponer alternativa medida). */
export function modelosMedidos(): string[] {
  return [...muestras.keys()].sort();
}

/** Solo para pruebas: borra la ventana de mediciones. */
export function reiniciarRelojParaPruebas(): void {
  sobrantesPrefill.clear();
  muestras.clear();
}
