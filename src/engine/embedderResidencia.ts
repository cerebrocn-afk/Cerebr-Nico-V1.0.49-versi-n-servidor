/**
 * embedderResidencia.ts — A QUÉ MODELO SE LE PIDE EL VECTOR (v1.98.0)
 * ====================================================================
 * El log de Mario (31/10) repite en CADA turno:
 *   🧠 cerebro: fallback por palabra (tiempo-excedido: el embedder pasó la ventana de 5000 ms)
 * y la pestaña Puertos muestra la razón: lo que está descargado es
 * `snowflake-arctic-embed:22m` y `all-minilm:22m`, mientras el código pedía
 * `embeddinggemma` a rajatablados (el default viejo de `embedderLocal`).
 *
 * Pedir un modelo que Ollama no tiene descargado no da 404 limpio: da una
 * descarga o una carga desde disco DENTRO de la ventana de 5 s. O sea: el
 * órgano vectorial se caía por señalar a la puerta equivocada, no por no haber
 * puertas. Y como el timeout tiraba los vectores a la basura (ver
 * `cerebroOrgano.calentarVectores`), el turno siguiente volvía a intentar los
 * mismos 150 textos: bucle perfecto de cinco segundos muertos por turno.
 *
 * Este módulo decide, SIN tocar la red:
 *   · qué candidatos hay (reusa la aduana de roles — dueño único de «esto es un
 *     embedding», no se inventa una segunda clasificación acá);
 *   · CUÁL elegir: cargado en RAM prima sobre la familia preferida, porque en
 *     un equipo en Modo 8 GB cargar un modelo cuesta exactamente la ventana;
 *   · cuánto calentar por pasada, para que el índice se termine DE A POCO y no
 *     en un solo pedido imposible de 151 textos.
 *
 * Pura: sin fs, sin fetch, sin reloj. Las listas entran ya leídas.
 */

import { clasificarModeloOllama, crearClasificador, type Declarados } from "./aduanaModelos";

/**
 * Cuántos cuerpos se vectorizan por lote.
 * v2.1.3 · 16 -> 8. MEDIDO en este equipo con `snowflake-arctic-embed:33m`:
 *   1 texto -> 588 ms · 4 -> 585 ms · 8 -> 1.404 ms · 16 -> 4.000 ms (justo el límite)
 * El lote de 16 caía SIEMPRE por tiempo-excedido: estaba calibrado al borde de la
 * ventana, así que cualquier variación (texto más largo, CPU ocupada) lo tumbaba.
 * Con 8 el margen es 5,7x sobre la ventana, y la deuda se cierra igual porque
 * `MAX_CUERPOS_POR_PASADA` reparte en más lotes.
 */
export const POR_LOTE_POR_DEFECTO = 8;
/** Techo de cuerpos por pasada: la deuda se cierra de a poco, nunca en el turno. */
export const MAX_CUERPOS_POR_PASADA = 64;
/**
 * Ventana de UN lote. Es más corta que la del turno: un lote chico o responde o se suelta.
 * v2.1.3 · 4000 -> 8000. Con el lote de 8 (1.404 ms medidos) sobran 6,6 s de margen;
 * con el de 16 (4.000 ms medidos) los 4 s no alcanzaban ni en el mejor caso.
 */
export const VENTANA_LOTE_MS = 8000;
/** El embedder que la casa recomienda tener (aparece en el aviso de arreglo). */
export const EMBEDDER_RECOMENDADO = "snowflake-arctic-embed:33m";

/**
 * Preferencia de familia: multilingüe y liviano primero. El usuario escribe en
 * español y el índice es de sesiones en español, así que un modelo que sólo
 * entiende inglés vectoriza peor que uno más chico pero multilingüe.
 * Peso 0-100; la residencia suma +50 arriba (ver `listarEmbedders`).
 */
const FAMILIAS: Array<{ re: RegExp; peso: number; familia: string }> = [
  { re: /qwen3-embedding|qwen3.?embed/i, peso: 100, familia: "qwen3-embedding (multilingüe, el de la casa)" },
  { re: /embeddinggemma/i, peso: 95, familia: "embeddinggemma (multilingüe)" },
  { re: /snowflake-arctic-embed/i, peso: 82, familia: "snowflake-arctic-embed (rápido, multilingüe)" },
  { re: /nomic-embed-text|nomic-embed/i, peso: 76, familia: "nomic-embed" },
  { re: /mxbai-embed/i, peso: 70, familia: "mxbai-embed" },
  { re: /bge-m3|bge-large/i, peso: 68, familia: "bge grande" },
  { re: /jina-embed/i, peso: 60, familia: "jina-embed" },
  { re: /nvl-embed/i, peso: 58, familia: "nvl-embed" },
  { re: /(^|[-_.:])bge([-_.:]|$)/i, peso: 54, familia: "bge" },
  { re: /(^|[-_.:])minilm/i, peso: 48, familia: "minilm (corto, sesgado al inglés)" },
  { re: /(^|[-_.:])e5([-_.:]|$)/i, peso: 44, familia: "e5" },
];

export interface CandidatoEmbedder {
  nombre: string;
  /** Está cargado en RAM/VRAM AHORA (`/api/ps`): responderle es inmediato. */
  cargado: boolean;
  puntos: number;
  familia: string;
  /**
   * v2.3.2 · MB que ocupa, MEDIDOS por `/api/tags` (`size`). Antes ese campo se
   * tiraba a la basura: el orden decidía por familia sin mirar el peso, así que en
   * el equipo del usuario (i5, 16 GB, "no me contesta nada de más de 1B", y el
   * vectorizador lo quiere EN SEGUNDO PLANO) `qwen3-embedding:0.6b` — 639 MB —
   * le ganaba a `snowflake-arctic-embed:33m` — 67 MB — siendo los dos multilingües.
   * Y sin el número en pantalla tampoco se podía discutir: el panel decía el nombre
   * y callaba el costo.
   */
  mb?: number;
}

/**
 * v2.3.1 · faltaba `"sin-medir"` en la unión: v2.2.8 agregó la rama de lectura
 * caída (`resolverEmbedder` devuelve `fuente: "sin-medir"` cuando el sondeo de
 * `/api/tags` no terminó) sin ensanchar el tipo, y `tsc` tiraba TS2322 acá y en
 * `server/routers/embedderCerebro.ts`. La rama es correcta —es justo la que
 * impide afirmar que un modelo falta cuando lo que falló la medición—; el que
 * estaba mal era el tipo.
 */
export type FuenteResolucion = "preferido" | "estricto" | "residencia" | "descargado" | "ninguno" | "sin-medir";

export interface OpcionesResolucion {
  /** "fallo": la lista viene de un sondeo que no termino (no afirmar ausencias). */
  lectura?: "ok" | "fallo";
  /** Modelos descargados (Ollama `/api/tags`). */
  instalados?: Array<string | null | undefined> | null;
  /** Modelos cargados en RAM ahora (Ollama `/api/ps`). */
  cargados?: Array<string | null | undefined> | null;
  /** Nombre explícito del usuario (`CN_EMBED_MODEL`). */
  preferido?: string;
  /** `CN_EMBED_STRICT=1`: acatar el preferido aunque la lista no lo muestre. */
  estricto?: boolean;
  /** v2.3.2 · `CN_EMBEDS_EXTRA` / `CN_CHAT_EXTRA`: alias que ningún regex puede ver. */
  declarados?: Declarados | null;
  /** v2.3.2 · MB por modelo, leídos de `/api/tags`. */
  tamanos?: Tamanos | null;
  /** v2.3.2 · `CN_EMBED_TECHO_MB`: en equipos apretados, el más chico que sirve. */
  techoMb?: number;
}

export interface ResolucionEmbedder {
  /** Lo que hay que usar. `null` = no hay embedder: el cerebro va por palabra. */
  modelo: string | null;
  fuente: FuenteResolucion;
  /** Una línea honesta de POR QUÉ ese modelo (o por qué ninguno). Va al panel. */
  motivo: string;
  candidatos: CandidatoEmbedder[];
}

/** El nombre sin etiqueta de versión: `all-minilm:22m` ≈ `all-minilm`. */
function raizDelNombre(nombre: string): string {
  return String(nombre || "").trim().toLowerCase().replace(/:[^:]+$/, "");
}

/** Mismo modelo escrito de dos formas (`qwen3-embedding` vs `qwen3-embedding:0.6b`). */
function esElMismo(a: string, b: string): boolean {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const rx = raizDelNombre(x);
  const ry = raizDelNombre(y);
  return !!rx && rx === ry;
}

/** Los MB que `/api/tags` reportó para este nombre (tolera `:latest` y raíz). */
export function tamanoDe(tamanos: Tamanos | null | undefined, nombre: string): number | undefined {
  if (!tamanos) return undefined;
  const n = String(nombre || "").trim().toLowerCase();
  const raiz = n.replace(/:[^:]+$/, "");
  for (const [k, v] of Object.entries(tamanos)) {
    const kk = String(k).toLowerCase();
    if (kk === n || kk.replace(/:[^:]+$/, "") === raiz) return Number(v) / (1024 * 1024);
  }
  return undefined;
}

/** Peso de familia (0 si no se reconoce la familia pero SÍ es embedding). */
function pesoFamilia(nombre: string): { peso: number; familia: string } {
  for (const f of FAMILIAS) if (f.re.test(nombre)) return { peso: f.peso, familia: f.familia };
  return { peso: 20, familia: "embeddings (familia no catalogada)" };
}

/**
 * Candidatos ordenados, mejor primero. Dos reglas que no se discuten:
 *   1. sólo entran lo que la aduana declara `embeddings` — un modelo de chat
 *      jamas se ofrece como vectorizador (respondería con basura o 404);
 *   2. estar cargado suma +BONUS_CARGADO: la residencia le gana a la elegancia.
 *      El bonus es MAS GRANDE que el salto entre familias (100 → 48) a proposito:
 *      en un equipo en Modo 8 GB cargar el modelo «mejor» cuesta exactamente la
 *      ventana de 5 s que el plano no quiere gastar.
 * El orden de llegada desempata (determinismo: dos pasadas, misma respuesta).
 */
export const BONUS_CARGADO = 60;

export const PREMIO_DENTRO_DEL_TECHO = 30;
export const CASTIGO_FUERA_DEL_TECHO = 40;

/** Lo que `/api/tags` reporta en `size` (bytes) por nombre. */
export type Tamanos = Record<string, number>;

export interface OpcionesListado {
  /** `CN_EMBEDS_EXTRA` / `CN_CHAT_EXTRA` ya parseados (ver `aduanaModelos`). */
  declarados?: Declarados | null;
  /** MB reales por modelo. Sin esto no hay criterio de peso: orden de siempre. */
  tamanos?: Tamanos | null;
  /** Techo deseable del vectorizador (`CN_EMBED_TECHO_MB`). 0/ausente = no aplica. */
  techoMb?: number;
}

export function listarEmbedders(
  instalados?: Array<string | null | undefined> | null,
  cargados?: Array<string | null | undefined> | null,
  op: OpcionesListado = {}
): CandidatoEmbedder[] {
  const listaCargados = (cargados || []).map((c) => String(c || "").trim()).filter(Boolean);
  const clasificar = crearClasificador(op.declarados);
  const vistos = new Set<string>();
  const out: CandidatoEmbedder[] = [];
  const techo = Math.max(0, Math.floor(op.techoMb || 0));
  for (const bruto of instalados || []) {
    const nombre = String(bruto || "").trim();
    if (!nombre) continue;
    if (clasificar(nombre).rol !== "embeddings") continue;
    if (vistos.has(nombre.toLowerCase())) continue; // Ollama reporta el mismo tag dos veces
    vistos.add(nombre.toLowerCase());
    const { peso, familia } = pesoFamilia(nombre);
    const cargado = listaCargados.some((c) => esElMismo(c, nombre));
    const mb = tamanoDe(op.tamanos, nombre);
    // El techo NO es `RAM_LIMITADA_GB`: esa palabra significa "el equipo es pobre"
    // (8 GB) y el del usuario tiene 16. Lo que duele acá es el costo de CARGAR y
    // dejar residente al vectorizador mientras todo lo demás va a la nube, y eso se
    // mide en MB del modelo, no en GB de la máquina. Palabra distinta, umbral
    // propio, y dicho en el motivo.
    let puntos = peso + (cargado ? BONUS_CARGADO : 0);
    if (techo > 0 && mb !== undefined) puntos += mb <= techo ? PREMIO_DENTRO_DEL_TECHO : -CASTIGO_FUERA_DEL_TECHO;
    out.push({ nombre, cargado, puntos, familia, ...(mb === undefined ? {} : { mb }) });
  }
  // Sort ESTABLE a propósito: `Array.sort` no lo garantiza en todos los motores,
  // así que se desempata a mano por índice de llegada.
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.puntos - a.c.puntos || a.i - b.i)
    .map((x) => x.c);
}

/**
 * LA DECISIÓN. Jerarquía (determinista, sin sorpresas):
 *   1. `preferido` descargado → manda el usuario, aunque esté frío;
 *   2. `preferido` NO descargado → NO se usa (ese es justo el bug del log): se
 *      avisa y se elige otro; sólo con `estricto` se acata a ciegas;
 *   3. el mejor candidato por residencia+familia;
 *   4. ninguno → `modelo: null` con el comando de arreglo en el motivo.
 */
export function resolverEmbedder(op: OpcionesResolucion = {}): ResolucionEmbedder {
  const candidatos = listarEmbedders(op.instalados, op.cargados, {
    declarados: op.declarados,
    tamanos: op.tamanos,
    techoMb: op.techoMb,
  });
  const preferido = String(op.preferido || "").trim();

  // v2.2.8 - "lectura: fallo" significa que la lista viene de un sondeo que no
  // termino. Ahi esta PROHIBIDO afirmar que el modelo no esta descargado: es el
  // falso negativo del log de Mario, con cinco embedders instalados.
  if (op.lectura === "fallo") {
    return {
      modelo: null,
      fuente: "sin-medir",
      motivo: "la lista de modelos no se pudo leer: no se puede afirmar que falte " + preferido,
      candidatos: [],
    };
  }

  if (preferido) {
    const instalado = candidatos.find((c) => esElMismo(c.nombre, preferido));
    if (instalado) {
      return {
        modelo: instalado.nombre,
        fuente: "preferido",
        motivo: `«${instalado.nombre}» declarado y descargado${instalado.cargado ? " (además está cargado: responde sin cargar nada)" : " (frío: el primer pedido lo carga)"}`,
        candidatos,
      };
    }
    if (op.estricto) {
      return {
        modelo: preferido,
        fuente: "estricto",
        motivo: `CN_EMBED_STRICT: se acata «${preferido}» aunque Ollama no lo liste (si da 404, la culpa es de la valla, no del cerebro)`,
        candidatos,
      };
    }
    if (candidatos.length > 0) {
      const mejor = candidatos[0];
      return {
        modelo: mejor.nombre,
        fuente: mejor.cargado ? "residencia" : "descargado",
        motivo: `«${preferido}» NO está descargado en Ollama — usarlo es lo que vaciaba la ventana de 5 s cada turno. Se usa «${mejor.nombre}» (${mejor.familia}${mejor.cargado ? ", cargado" : ", descargado"}). Para volver al declarado: ollama pull ${preferido}`,
        candidatos,
      };
    }
    return {
      modelo: null,
      fuente: "ninguno",
      motivo: `«${preferido}» no está descargado y no hay ningún otro modelo de embeddings en Ollama. Bajá uno con \`ollama pull ${EMBEDDER_RECOMENDADO}\` — mientras tanto el cerebro enruta por palabra, que es lo que siempre hizo.`,
      candidatos,
    };
  }

  if (candidatos.length === 0) {
    return {
      modelo: null,
      fuente: "ninguno",
      motivo: `No hay ningún modelo de embeddings en Ollama (\`ollama list\` no muestra ninguno). Bajá \`${EMBEDDER_RECOMENDADO}\` con \`ollama pull ${EMBEDDER_RECOMENDADO}\` y el cerebro deja de degradar a palabra.`,
      candidatos,
    };
  }

  const mejor = candidatos[0];
  return {
    modelo: mejor.nombre,
    fuente: mejor.cargado ? "residencia" : "descargado",
    motivo: `Elegido por residencia: «${mejor.nombre}» ${mejor.cargado ? "está cargado en RAM ahora mismo" : "es el mejor descargado"} (${mejor.familia}). Se puede forzar otro con CN_EMBED_MODEL.`,
    candidatos,
  };
}

/**
 * Cuánto calentar por pasada: lotes chicos de un universo acotado, en el orden
 * en que llegaron. La deuda completa se cierra en varias pasadas; NINGÚN lote
 * vuelve a medir 151 textos, que es lo que hacía explotar la ventana.
 */
export function planCalentado<T>(
  pendientes: T[],
  opciones: { porLote?: number; maxTextos?: number } = {}
): T[][] {
  const porLote = Math.max(1, Math.floor(opciones.porLote ?? POR_LOTE_POR_DEFECTO));
  const maxTextos = Math.max(0, Math.floor(opciones.maxTextos ?? MAX_CUERPOS_POR_PASADA));
  const universo = (Array.isArray(pendientes) ? pendientes : []).slice(0, maxTextos);
  const lotes: T[][] = [];
  for (let i = 0; i < universo.length; i += porLote) lotes.push(universo.slice(i, i + porLote));
  return lotes;
}
