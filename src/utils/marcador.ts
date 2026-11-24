/**
 * marcador.ts — EL MARCADOR AUTOMÁTICO (v1.75.0)
 * ===============================================
 * «Como se usan muchos modelos gratis… antes de cortar que haya un relevo a un
 * modelo de la lista de favoritos; si alguno está en cuarentena o no contestó,
 * que se auto-llame CON EL MISMO PROMPT pero a otro modelo» (Mario, 26/10, con
 * captura: glm-4.5-flash en cuarentena y el motor DETENIDO preguntando
 * «¿seguimos con Groq?»).
 *
 * Este módulo es la cola de marcado pura (sin React, sin red): App le pasa sus
 * Favoritos nube con clave disponible y el marcador responde a quién llamar
 * ahora. Reglas:
 *   · Solo se marca ante FALLO DE COMUNICACIÓN (fetch failed, ECONNRESET,
 *     ENOTFOUND, "no pudo responder", "no llegó el primer byte", 429/cuota,
 *     CUARENTENA). Un error de lógica NO dispara el marcador: reintentar un
 *     prompt malo contra 5 modelos es ruido.
 *   · Cada modelo que no contesta entra en CUARENTENA DE HECHO 12 min (no se
 *     remarca en la misma racha ni en rachas cercanas).
 *   · Techo de 5 llamadas por ráfaga (incluida la original): si ni siquiera
 *     esas despiertan, el error honesto de siempre, con la lista de a quién
 *     se marcó — cero bucle infinito pagando reintentos.
 */
export interface Marcada {
  modelo: string;
  provider: string;
}

export type CategoriaFallo = "cuota" | "caida" | "lentitud" | "logica";

/**
 * v2.2.9 · LA CUARENTENA DEJA DE SER UNA SOLA MULTA PARA TODO.
 * Un 429/402 de los planes gratuitos es real: la cuota no se cura en 90
 * segundos, así que 12 min está bien. Pero `timed out` / `no llegó el primer
 * byte` en un modelo de razonamiento NO es una muerte: es un modelo pensando.
 * Castigarlo con 12 min vaciaba la cola (5 saltos de TOPE_LLAMADAS) y el
 * selector quedaba parado sobre el peor candidato - el "se cambia solo y nunca
 * contesta" que Mario reportó el 03/11.
 */
export const CUARENTENA_CUOTA_MS = 12 * 60_000;
export const CUARENTENA_CAIDA_MS = 3 * 60_000;
export const CUARENTENA_LENTO_MS = 0;
/** Alias histórico: `CUARENTENA_MS` seguía referenciado en pruebas y en el doc. */
export const CUARENTENA_MS = CUARENTENA_CUOTA_MS;

/** Clasifica el mensaje de error. Pura y a prueba de texto raro. */
export function categoriaFallo(msg: string): CategoriaFallo {
  const m = String(msg || "").toLowerCase();
  if (!m) return "logica";
  if (/(429|too many|rate ?limit|quota|cuota|cupo|sin fondo|insufficient|credit|402|payment required)/.test(m)) return "cuota";
  if (/(failed to fetch|fetch failed|econnrefused|econnreset|enotfound|eai_again|socket hang up)/.test(m)) return "caida";
  if (/(timed? ?out|timeout|no lleg[oó] el primer byte|aborterror|the operation was aborted|aborted)/.test(m)) return "lentitud";
  return "logica";
}

/** Cuánto castiga cada categoría (0 = no hay cuarentena, es reintentable). */
export function castigoDe(cat: CategoriaFallo): number {
  if (cat === "cuota") return CUARENTENA_CUOTA_MS;
  if (cat === "caida") return CUARENTENA_CAIDA_MS;
  return 0;
}
const TOPE_LLAMADAS = 5;

interface EstadoMarcador {
  cola: Marcada[];
  llamadas: number;
  caidos: Map<string, { ts: number; ms: number }>; // modelo → cuarentena con su castigo
  rachaId: number;
}

const estado: EstadoMarcador = { cola: [], llamadas: 0, caidos: new Map(), rachaId: 0 };

/** ¿Es el tipo de muerte que merece un nuevo disco? (hechos de red/cuota, no lógica) */
export function esFalloDeComunicacion(msg: string): boolean {
  // v2.4.0 · UN SOLO CRITERIO. Antes esta función tenía su propia lista
  // (PATRON_FALLO_COM) que NO coincidía con categoriaFallo: `timeout` y
  // `aborted` entraban acá y NO allá. Consecuencia medida: cancelar un turno
  // o una simple lentitud hacía que el marcador cambiara de modelo, culpando
  // al que no tenía culpa. Ahora manda la clasificación única: solo cuota y
  // caída merecen otro disco; lentitud y lógica se reintentan con el mismo.
  const cat = categoriaFallo(msg);
  return cat === "cuota" || cat === "caida";
}

/** Arranca (o reinicia) la ráfaga con la lista de favoritos ya filtrada. */
export function iniciarMarcado(favoritos: Marcada[], modeloQueFalló: string): void {
  estado.cola = favoritos.filter((f) => f.modelo !== modeloQueFalló);
  estado.llamadas = 0;
  estado.rachaId++;
}

/**
 * v1.78.0 · LA COLA HONESTA (defecto medido por Mario 26/10: «el marcador
 * funciona pero con los modelos incorrectos… sale el modelo
 * fav-model-1792662099324-zlh7 y no existe»).
 * El marcador construía su cola leyendo `f.model` — un campo que NUNCA
 * existió: los favoritos guardan el nombre real en `modelId`. Al no haber
 * `model`, el código caía en `f.id`, que es el identificador interno
 * (`fav-model-<fecha>-<azar>`), y el motor marcaba a un número inventado:
 * todas las tareas terminaban en error.
 * Este filtro puro traduce la carpeta ⭐ Favoritos a una cola de marcado
 * real:
 *   · usa `modelId` (el nombre exacto que espera el proveedor);
 *   · descarta fantasmas internos (`fav-model-…`), locales (ollama/local —
 *     si el hardware no contestó, re-marcarlo no lo hace contestar) y
 *     proveedores sin clave/URL cargada;
 *   · descarta embedders: un modelo de vectores (embeddinggemma, bge-,
 *     nomic-embed, mxbai-) no responde chat, marcarlo es garantía de error.
 */
const MODELO_CEREBRO_LITERAL = "cerebro/auto";
const PATRON_EMBEDDING = /(embedding|embed|bge-|mxbai|nomic-embed|snowflake-arctic-embed|jina-embed)/i;

export function colaDeMarcado(
  favoritos: Array<{ modelId?: string; model?: string; name?: string; provider?: string }>,
  tieneClavePorProvider: Record<string, boolean>
): Marcada[] {
  return (favoritos || [])
    .map((f) => ({
      modelo: String(f.modelId || f.model || "").trim(),
      provider: String(f.provider || "").trim(),
    }))
    .filter(
      (f) =>
        f.modelo &&
        f.provider &&
        !/^(fav-model|cat-|msg-|queue-)-/.test(f.modelo) &&
        f.provider !== "ollama" &&
        f.provider !== "local" &&
        // v2.2.9 · `cerebro/auto` NO es un modelo de proveedor: es el enrutador
        // (CerebroDialecto / el Ecléctico). Meterlo en la cola hacía que el
        // marcador "cambiara solo a Cerebro/Auto" y mandara ese string literal a
        // un endpoint de nube, que por supuesto no contesta. Y encima quedaba
        // cuarentenado 12 min, quemando un puesto de la cola en cada salto.
        // Se escribe el literal a propósito: `ranuraUnificada` importa ESTE
        // módulo, importarlo acá sería un ciclo. La valla
        // marcadorNoMarcaAuto.test.ts compara contra la fuente del motor para
        // que la cadena no pueda derivar.
        f.provider !== "cerebro" &&
        // La misma regla que usa el Ecléctico para reconocerse a sí mismo
        // (`enjambreEclectico.ts:70`): cualquier modelo `cerebro/...` es enrutador,
        // no proveedor. Cubre `cerebro/auto` y cualquier modo futuro sin parche aquí.
        !f.modelo.toLowerCase().startsWith("cerebro/") &&
        !PATRON_EMBEDDING.test(f.modelo) &&
        tieneClavePorProvider[f.provider] === true
    );
}

/** Registro del "no contestó" de un modelo: cuarentena de hecho. */
export function marcarComoNoContesto(modelo: string, cat: CategoriaFallo = "cuota"): void {
  const clave = String(modelo || "").toLowerCase();
  const ms = castigoDe(cat);
  if (ms <= 0) { estado.caidos.delete(clave); return; }  // lentitud: se reintenta, no se castiga
  estado.caidos.set(clave, { ts: Date.now(), ms });
}

/** ¿Todavía está en cuarentena? Cada categoría paga su propia condena. */
export function enCuarentena(modelo: string): boolean {
  const c = estado.caidos.get(String(modelo || "").toLowerCase());
  return !!c && Date.now() - c.ts < c.ms;
}

/**
 * Próximo número: el primer favorito que no esté caído hace <12 min.
 * null = se acabó la lista o se llegó al techo → el llamador muestra el
 * error honesto de siempre.
 */
export function siguienteMarcada(): Marcada | null {
  if (estado.llamadas >= TOPE_LLAMADAS) return null;
  while (estado.cola.length > 0) {
    const c = estado.cola.shift() as Marcada;
    if (enCuarentena(c.modelo)) continue;
    estado.llamadas++;
    return c;
  }
  return null;
}

export function estadoMarcador(): { llamadas: number; pendientes: number; rachaId: number } {
  return { llamadas: estado.llamadas, pendientes: estado.cola.length, rachaId: estado.rachaId };
}

export function resetMarcador(): void {
  estado.cola = [];
  estado.llamadas = 0;
}

/**
 * v2.2.9 · si la cola quedó vacía, el usuario merece saber POR QUÉ. Devuelve el
 * motivo para el chat en vez de dejar que el llamador queme las 5 llamadas y
 * muestre un error genérico.
 */
export function motivoColaVacia(
  favoritos: Array<{ modelId?: string; model?: string; provider?: string }>,
  tieneClavePorProvider: Record<string, boolean>
): string {
  const lista = favoritos || [];
  if (lista.length === 0) return "no tenés ningún favorito de nube cargado";
  const sinClave = lista.filter((f) => !tieneClavePorProvider[String(f.provider || "")]);
  if (sinClave.length === lista.length)
    return `los ${lista.length} favoritos apuntan a proveedores sin clave configurada`;
  const auto = lista.filter((f) => String(f.modelId || f.model || "").toLowerCase() === MODELO_CEREBRO_LITERAL);
  if (auto.length && sinClave.length + auto.length === lista.length)
    return "los favoritos son Cerebro/Auto (el enrutador) o proveedores sin clave: no hay a quién marcar";
  return "no quedan favoritos marcables: la cola se agotó o están todos en cuarentena";
}
