/**
 * patronesFallo.ts — CONTADOR DE FALLOS REPETIDOS POR PATRÓN — v1.76.0
 * =====================================================================
 * LA DEUDA QUE PAGA: `auto_propose` del laboratorio decía «falta el contador
 * de fallos repetidos por patrón y la redacción automática» (y era cierto:
 * `Brain.detectarPropuestas`/`guardarPropuesta` vivían HUÉRFANOS en la casa —
 * nadie los llamaba nunca). Este módulo aporta las dos piezas puras:
 *
 *   1. `clasificarFallo`  — normaliza el texto del error (la MISMA regla de
 *      normalización que `learnFromToolFailure` usa para la KB: refs→<ref>,
 *       dígitos→<n>) y le pone NOMBRE a la familia del fallo (ruta, permiso,
 *       timeout, red, cuota, argumentos…). Clasificar es medir, no opinar:
 *       cada patrón es un regex anclado a texto real de errores del lazo.
 *
 *   2. `contarPatron` / `decidirPropuesta` — el contador que pide el motivo
 *      pendiente: ocurrencias DISTINTAS por herramienta+patrón, registradas
 *       por TURNO (el mismo turno que reintenta diez veces la misma llamada
 *       suma UNA ocurrencia, no diez — el reintento dentro de un turno ya lo
 *       cuidan las guardas del bucle; acá nos importa la reincidencia entre
 *       turnos, que es la que dolió a Mario).
 *
 *   3. `redactarPropuesta` — la redacción automática. Emite el bloque con el
 *      formato exacto que `Brain.detectarPropuestas` parsea
 *      ([PROPUESTA DE AUTO-MEJORA CEREBRO] / - Motivo: / - Línea a modificar:
 *      / - Nuevo bloque a inyectar: — un bullet por campo, en UNA línea,
 *      porque el captor de Brain lee hasta el fin de línea), para que la
 *      propuesta entre por la vía que YA existía en la casa y termine en
 *      `.cerebro-db/proposals/` — NUNCA se aplica sola: `cerebro.md` es el
 *      núcleo inmutable y la aprueba un humano.
 *
 * CONTROL DE FALSO POSITIVO (regla de la casa):
 *   · un turno con reintentos múltiples cuenta UNA vez por herramienta+patrón;
 *   · `ocurrencias` es una ventana acotada — la memoria vieja no propone para
 *     siempre: para decidir se piden ocurrencias en umbrales de TURNOS y un
 *     texto que siga vivo (evidencia reciente);
 *   · la re-propuesta exige COOLDOWN desde la última propuesta, o el motor
 *     inundaría `.cerebro-db/proposals/` de la misma sugerencia;
 *   · clasificación conservadora: error desconocido → `desconocido` con la
 *     nota normalizada, y `desconocido` SÍ puede proponer (es justo: lo
 *     repetido merece propuesta aunque no tenga familia), pero con el mismo
 *     umbral — no se inventan excepciones.
 *
 * Puro: sin red, sin fs, sin estado global. El estado lo pasa el llamador.
 */

export interface ReglaPatron {
  id: string;
  titulo: string;
  /** Qué hacer en su lugar (viaja en la propuesta para el cerebro). */
  consejo: string;
  re: RegExp;
}

/**
 * Familias de fallo medidas sobre texto real del lazo y del puente.
 * El ORDEN importa: la primera que gana describe el defecto —
 * p. ej. ENOENT dice a la vez "no such file" y "enoent"; gana ruta.
 */
export const REGLAS_PATRON: ReglaPatron[] = [
  {
    id: "ruta_inexistente",
    titulo: "ruta o archivo inexistente",
    consejo: "verificar la ruta con list_files o leer el árbol ANTES de escribir; no asumir carpetas que no se vieron",
    re: /enoent|no such file|cannot find the path|file (does not exist|not found)|ruta inexistente|no existe/i,
  },
  {
    id: "permiso",
    titulo: "permiso denegado",
    consejo: "elegir una ruta dentro de las raíces permitidas del puente o pedir la promoción correspondiente; no reintentar la misma ruta",
    re: /eacces|eperm|permission denied|acceso denegado|permiso denegado|operación no permitida/i,
  },
  {
    id: "timeout",
    titulo: "tiempo de espera agotado",
    consejo: "subir el timeout o dividir el comando en partes más chicas; un timeout no se cura reintentando igual",
    re: /timed?\s*out|etimedout|timeout|exceeded the.*time|tiempo (de espera|límite)/i,
  },
  {
    id: "red",
    titulo: "fallo de red del destino",
    consejo: "relevar a otro modelo/proveedor (el marcador ya existe) o declarar el destino caído; no insistir en el mismo host",
    // «red» suelto estaba PROHIBIDO como señal: tras la normalización,
    // cualquier «request…» cae dentro de un <ref> y el regex lo muerde
    // («<ref>» contiene "red") — falso positivo medido en el test. Solo
    // palabras compuestas o frases que no pueden vivir dentro de un ref.
    re: /econnreset|econnrefused|econn|enotfound|eai_again|etimedout|fetch failed|network|socket hang|no se pudo conectar|fallo de red|error de red/i,
  },
  {
    id: "cuota",
    titulo: "cuota o presupuesto agotado",
    consejo: "bajar el presupuesto del turno o cambiar de proveedor con clave; el tope de la cuenta no cede por reintentar",
    // OJO: tras la normalización los dígitos son <n> — el literal «429» solo
    // puede aparecer en texto NO normalizado; se mantiene por si el llamador
    // pasa el error crudo, y las señales reales son las palabras (medidas en
    // el rechazo de OpenRouter: «requires more credits», v1.75.0).
    re: /429|quota|rate.?limit|requires more credits|insufficient credit|free usage limit|cuota|l[íi]mite de uso/i,
  },
];

export interface ClasificacionFallo {
  /** id de la familia (`ruta_inexistente`, `timeout`, …) o `desconocido`. */
  patron: string;
  /** Nombre legible de la familia. */
  titulo: string;
  /** Texto normalizado (refs→<ref>, dígitos→<n>) — firma estable del fallo. */
  nota: string;
  /** Consejo accionable que irá en la propuesta. */
  consejo: string;
}

/**
 * Normaliza texto de error con la MISMA regla que `learnFromToolFailure`
 * (server.ts): tokens largos → <ref>, dígitos → <n>. Así la firma del patrón
 * sobrevive a que cambie el path o el número de línea del próximo fallo.
 */
export function normalizarErrorFallo(errorTexto: string): string {
  return String(errorTexto || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[A-Za-z0-9_./\\-]{8,}/g, "<ref>")
    .replace(/\d+/g, "<n>")
    .slice(0, 180);
}

/** Clasifica un texto de error en una familia (o `desconocido`). Determinista. */
export function clasificarFallo(errorTexto: string): ClasificacionFallo {
  const nota = normalizarErrorFallo(errorTexto);
  // Las señales se buscan sobre el texto CRUDO: la normalización que da
  // estabilidad a la FIRMA es destructiva para la CLASIFICACIÓN (devora
  // «request requires» dentro de un <ref>, pierde el literal 429 — falso
  // negativo medido en el rechazo real de OpenRouter, v1.75.0). Firma y
  // familia son problemas distintos y cada uno lee donde debe.
  const crudo = String(errorTexto || "").replace(/\s+/g, " ").slice(0, 400);
  for (const r of REGLAS_PATRON) {
    if (r.re.test(crudo) || r.re.test(nota)) {
      return { patron: r.id, titulo: r.titulo, nota, consejo: r.consejo };
    }
  }
  return {
    patron: "desconocido",
    titulo: "fallo repetido sin familia conocida",
    nota,
    consejo: "revisar la evidencia del lazo y anotar en el cerebro qué causa produce este error y qué alternativa usar",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Contador por turno (el estado lo pasa y persiste el llamador)
// ────────────────────────────────────────────────────────────────────────────

export interface EntradaPatron {
  herramienta: string;
  patron: string;
  /** Turnos distintos (ids) en que este par falló — ventana acotada. */
  turnos: string[];
  /** Total histórico de ocurrencias (cada turno suma como mucho 1). */
  total: number;
  primeraVez: number;
  ultimaVez: number;
  /** Último texto normalizado visto (evidencia fresca para la propuesta). */
  ultimoNota: string;
  /** Timestamp de la última propuesta generada (0 = nunca). */
  propuestoEn: number;
  /** Cuántas propuestas generó este par en total. */
  vecesPropuesto: number;
}

export type EstadoPatrones = Record<string, EntradaPatron>;

export const UMBRAL_OCURRENCIAS = 3;
/** Ventana de turnos que se recuerda por patrón (no se acumula para siempre). */
export const VENTANA_TURNOS = 12;
/** Re-propuesta recién después de 7 días desde la anterior. */
export const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Techo de patrones en memoria (LRU por ultimaVez) — la casa no acumula basura. */
export const TOPE_PATRONES = 300;

export const clavePatron = (herramienta: string, patron: string): string =>
  `${String(herramienta || "").toLowerCase()}::${String(patron || "desconocido").toLowerCase()}`;

/**
 * Registra una ocurrencia. Si `turnoId` ya está en la ventana, NO suma total
 * (falso positivo curado: el lazo que reintentó 10 veces la misma ruta dentro
 * del mismo turno es UN hecho, no diez). Devuelve la entrada actualizada.
 */
export function contarPatron(
  estado: EstadoPatrones,
  herramienta: string,
  clasif: ClasificacionFallo,
  turnoId: string,
  ahora: number
): EntradaPatron {
  const clave = clavePatron(herramienta, clasif.patron);
  const existente = estado[clave];
  const turno = String(turnoId || "turno");
  let entrada: EntradaPatron;
  if (!existente) {
    entrada = {
      herramienta: String(herramienta),
      patron: clasif.patron,
      turnos: [turno],
      total: 1,
      primeraVez: ahora,
      ultimaVez: ahora,
      ultimoNota: clasif.nota,
      propuestoEn: 0,
      vecesPropuesto: 0,
    };
  } else {
    entrada = { ...existente };
    if (!entrada.turnos.includes(turno)) {
      entrada.turnos = [...entrada.turnos.slice(-(VENTANA_TURNOS - 1)), turno];
      entrada.total += 1;
    }
    entrada.ultimaVez = ahora;
    entrada.ultimoNota = clasif.nota || entrada.ultimoNota;
  }
  estado[clave] = entrada;
  // LRU honesto: si explota el techo, se va el más viejo en tiempo de uso.
  const claves = Object.keys(estado);
  if (claves.length > TOPE_PATRONES) {
    const viejas = claves
      .filter((k) => !(estado[k].vecesPropuesto > 0))
      .sort((a, b) => estado[a].ultimaVez - estado[b].ultimaVez);
    for (const k of viejas) {
      delete estado[k];
      if (Object.keys(estado).length <= TOPE_PATRONES) break;
    }
  }
  return entrada;
}

export interface DecesionPropuesta {
  generar: boolean;
  /** `nueva` | `reincidencia` | motivo de no generar. */
  motivo: string;
  entrada: EntradaPatron;
}

/**
 * Decide si la entrada ya merece propuesta. Umbrales del motivo pendiente de
 * `auto_propose`: repetición REAL entre turnos (≥ UMBRAL_OCURRENCIAS turnos
 * distintos) y reincidencia después de cooldown. Nunca propone dos veces por
 * la misma ventana.
 */
export function decidirPropuesta(
  entrada: EntradaPatron,
  ahora: number,
  umbrales?: { ocurrencias?: number; cooldownMs?: number }
): DecesionPropuesta {
  const umbral = Math.max(2, Number(umbrales?.ocurrencias) || UMBRAL_OCURRENCIAS);
  const cooldown = Math.max(0, Number(umbrales?.cooldownMs ?? COOLDOWN_MS));
  const turnosDistintos = entrada.turnos.length;
  if (entrada.propuestoEn === 0) {
    if (turnosDistintos >= umbral) return { generar: true, motivo: "nueva", entrada };
    return { generar: false, motivo: `ventana de ${turnosDistintos}/${umbral} turnos`, entrada };
  }
  if (ahora - entrada.propuestoEn >= cooldown && turnosDistintos >= umbral) {
    return { generar: true, motivo: "reincidencia", entrada };
  }
  return { generar: false, motivo: "cooldown", entrada };
}

// ────────────────────────────────────────────────────────────────────────────
// Redacción automática (formato que Brain.detectarPropuestas parsea)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Redacta el bloque de auto-mejora con el formato EXACTO que
 * `Brain.detectarPropuestas` lee: la línea `- Nuevo bloque a inyectar:` abre
 * un bullet único (el regex captor toma hasta el fin de línea, así el consejo
 * debe viajar en una sola línea) y el marcador va dentro del bloque para que
 * la propuesta se identifique sola en el .md.
 *
 * Una línea suelta de un `- xxx:` a mitad de bloque NO puede contener saldos
 * de línea: la redacción es de una línea y punto — honesto y acotado.
 */
export function redactarPropuesta(
  herramienta: string,
  entrada: EntradaPatron,
  clasif: ClasificacionFallo,
  motivoDecision: string
): string {
  const esc = (s: string) => String(s || "").replace(/\s+/g, " ").trim();
  return [
    `[PROPUESTA DE AUTO-MEJORA CEREBRO]`,
    `- Motivo: ${esc(herramienta)} volvió a fallar con el mismo patrón (${entrada.patron} — ${clasif.titulo}) en ${entrada.turnos.length} turnos distintos · total ${entrada.total} · decisión: ${motivoDecision}`,
    `- Línea a modificar: cerebro.md — sección de reglas operativas (añadir al final)`,
    `- Nuevo bloque a inyectar: [auto-propuesta ${entrada.patron}] cuando \`${esc(herramienta)}\` falle con «${esc(entrada.ultimoNota)}», ${esc(clasif.consejo)} — en lugar de repetir la misma llamada.`,
  ].join("\n");
}
