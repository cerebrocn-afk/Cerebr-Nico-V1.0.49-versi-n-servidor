/**
 * repeticionLectura.ts — GUARDA DE REPETICIÓN DE SOLO-LECTURA (v1.63.0)
 * ======================================================================
 * EL DEFECTO QUE CURA, con números reales del chat exportado:
 *   - msg5 (328K caracteres) y msg7 (91K) repitieron OCHO veces seguidas el
 *     ciclo idéntico  memory_estado → memory_listar_pages → read_file → read_file,
 *     volcando CADA vez el mismo JSON entero. No hubo obra entre vuelta y
 *     vuelta: el modelo re-leía lo mismo, obtenía byte por byte el mismo
 *     resultado, y lo metía otra vez en la ventana. Ruido puro.
 *
 * POR QUÉ EL LAZO SUAVE EXISTENTE NO LO CAZABA:
 *   `anotarRepeticion` (cicloHerramientasOpenAICompat.ts) solo cuenta la MISMA
 *   clave CONSECUTIVA. Como el modelo ROTABA entre cuatro herramientas, dos
 *   llamadas idénticas nunca caían pegadas y el contador se reiniciaba en cada
 *   vuelta. Por eso el bucle sobrevivía ocho veces.
 *
 * QUÉ HACE ESTE MÓDULO (capa PURA, sin red ni disco, testeable en aislado):
 *   Lleva un libro de firmas por TURNO. La firma de una lectura es
 *   (herramienta + argumentos + SALIDA cruda). Si la MISMA lectura con la MISMA
 *   salida reaparece — aunque sea intercalada con otras — se deduplica: se deja
 *   de reinyectar el volcado y se responde con una nota breve. Si insiste hasta
 *   el tope, se corta el turno con un cierre honesto.
 *
 * EL FALSO POSITIVO QUE HAY QUE CUIDAR (y se cuida):
 *   Releer un archivo DESPUÉS de escribirlo es legítimo — el contenido cambió,
 *   el modelo DEBE confirmar su obra. Por eso toda escritura a un `path` deja
 *   una marca; la siguiente lectura de ESE path NO se penaliza y reinicia su
 *   cuenta. Así distinguimos «bucle estéril» de «verificación tras cambio».
 */

/**
 * Herramientas de LECTURA cuyo resultado idéntico repetido es ruido.
 * Deliberadamente NO incluye herramientas de obra (write/edit/…): esas tienen
 * su propio circuito (reescritura idéntica) y además cambian el mundo.
 */
const LECTURAS = new Set<string>([
  "read_file",
  "read_file_range",
  "list_files",
  "search_in_files",
  "find_symbol",
  "git_status",
  "git_diff",
  "revisar_cambios",
  "pc_read_file",
  "pc_list_dir",
  "pc_info",
]);

/**
 * ¿Es una herramienta de solo-lectura (incluidas las de diagnóstico por packs
 * externos tipo `memory_*`)? Las `memory_*` / `mem_*` / `h_*` del cerebro son
 * consultas de estado: leer el mismo estado diez veces no aporta nada nuevo.
 */
export function esHerramientaLectura(nombre: string): boolean {
  if (LECTURAS.has(nombre)) return true;
  return /^(memory_|mem_|h_)/.test(nombre);
}

/** Libro de firmas de lectura de UN turno (se crea nuevo en cada turno). */
export interface EstadoLectura {
  /** firma de lectura → cuántas veces se ha visto idéntica en el turno. */
  vistas: Map<string, number>;
  /** paths escritos cuya PRÓXIMA relectura es legítima (no se penaliza). */
  escritasRecientes: Set<string>;
}

/** ¿A la cuántas lecturas idénticas se deja de reinyectar el volcado? */
export const UMBRAL_LECTURA_REPETIDA = 2;
/** ¿A la cuántas se corta el turno con cierre honesto? */
export const TOPE_LECTURA_REPETIDA = 4;

export function nuevoEstadoLectura(): EstadoLectura {
  return { vistas: new Map(), escritasRecientes: new Set() };
}

/** Hash FNV-1a de 32 bits — barato y suficiente para firmar salidas largas. */
function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/** Separador imposible dentro de un path, para delimitar campos de la firma. */
const SEP = "\u0000";

/**
 * Registra una ESCRITURA: marca el path para que su próxima lectura sea
 * legítima (falso positivo a cuidar). No-op si la herramienta no es de obra o
 * no trae path. El criterio de «es obra» lo decide quien llama (se le pasa
 * `esObra`), para no acoplar este módulo a la lista de herramientas de obra.
 */
export function registrarEscrituraLectura(
  estado: EstadoLectura,
  esObra: boolean,
  path?: string,
): void {
  if (esObra && path) estado.escritasRecientes.add(path);
}

export interface VeredictoLectura {
  /** cuántas veces se ha visto esta lectura idéntica (incluida la actual). */
  veces: number;
  /** true → NO reinyectar el volcado crudo; usar `nota` en su lugar. */
  deduplicar: boolean;
  /** true → cerrar el turno: el modelo está atascado releyendo lo mismo. */
  cortar: boolean;
  /** texto breve con el que sustituir el volcado (cuando `deduplicar`). */
  nota?: string;
}

const SIN_VEREDICTO: VeredictoLectura = { veces: 0, deduplicar: false, cortar: false };

/**
 * Evalúa una lectura recién ejecutada. Devuelve si hay que deduplicar (no
 * reinyectar el volcado) o cortar el turno. `salidaCruda` es la salida ANTES
 * de compactar (es la que de verdad se repite byte a byte).
 */
export function evaluarLectura(
  estado: EstadoLectura,
  nombre: string,
  argsStr: string,
  salidaCruda: string,
  path?: string,
): VeredictoLectura {
  if (!esHerramientaLectura(nombre)) return SIN_VEREDICTO;

  // FALSO POSITIVO — relectura legítima tras escribir el MISMO path: no se
  // penaliza y se reinician las firmas de ese path (su contenido cambió).
  if (path && estado.escritasRecientes.has(path)) {
    estado.escritasRecientes.delete(path);
    const prefijo = path + SEP;
    for (const clave of [...estado.vistas.keys()]) {
      if (clave.startsWith(prefijo)) estado.vistas.delete(clave);
    }
    return SIN_VEREDICTO;
  }

  const firma = (path || "") + SEP + nombre + SEP + hash32(argsStr) + SEP + hash32(salidaCruda);
  const veces = (estado.vistas.get(firma) || 0) + 1;
  estado.vistas.set(firma, veces);

  if (veces >= TOPE_LECTURA_REPETIDA) {
    return {
      veces,
      deduplicar: true,
      cortar: true,
      nota:
        `[🛑 BUCLE DE LECTURA CORTADO] «${nombre}» ha devuelto EXACTAMENTE lo mismo ` +
        `${veces} veces en este turno sin que haya cambiado nada en disco. Releer no ` +
        `va a dar un resultado distinto. Actúa con lo que ya tienes (escribe/edita) o ` +
        `explica qué te falta; para re-leer, hazlo DESPUÉS de escribir el archivo.`,
    };
  }

  if (veces >= UMBRAL_LECTURA_REPETIDA) {
    return {
      veces,
      deduplicar: true,
      cortar: false,
      nota:
        `[🔁 lectura repetida ×${veces}] «${nombre}» ya devolvió este MISMO contenido ` +
        `antes en este turno; no reinyecto el volcado para no llenar la ventana. Usa ` +
        `lo que ya leíste. Si acabas de escribir este archivo, re-léelo (esa relectura ` +
        `sí cuenta como legítima).`,
    };
  }

  return { veces, deduplicar: false, cortar: false };
}
