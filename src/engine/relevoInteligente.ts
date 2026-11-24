/**
 * relevoInteligente.ts — v1.87.0 · ETAPA 1 (ideas de OmniRoute, hechas de la casa)
 * ============================================================================
 * QUÉ ES: el cerebro PURO que le faltaba al relevo de modelos gratis. Porta las
 * dos mejores ideas del gateway OmniRoute (v3.6.1) a las reglas de esta casa,
 * SIN su marca y SIN su código: sólo la capacidad, reescrita, probable y honesta.
 *
 * DE DÓNDE SALE (estudio de `omniroute-main/src/domain/`):
 *   1) `modelAvailability.markModelAsProblematic` → `cooldownAdaptativo()`.
 *      OmniRoute no pausa SIEMPRE lo mismo: cuanto más falla un modelo dentro de
 *      una ventana, más larga la pausa (backoff exponencial con tope). CerebroNico
 *      hasta v1.86.6 usaba un TTL FIJO por clase de fallo (`fusibleProveedores`):
 *      un 429 daba 15 min, fallara 1 o 10 veces. Para modelos GRATIS —que viven
 *      rate-limitados— eso o castiga de más al primer tropiezo, o castiga de menos
 *      al que está claramente caído. El backoff lo mide.
 *   2) `comboResolver` → `elegirVozReparto()`.
 *      OmniRoute reparte entre modelos con estrategias (priority/round-robin/
 *      weighted/least-used) para NO quemar la cuota de uno solo. CerebroNico
 *      relevaba en el ORDEN de la carpeta de ⭐ Favoritos (priority puro): el
 *      primero se lleva toda la carga y agota su cuota gratis mientras los demás
 *      miran. `menos-usado` y `rotacion` reparten el gasto.
 *
 * QUÉ NO ES: no hace red, ni fs, ni mira el reloj por su cuenta (el `ahora` y el
 * conteo de usos se inyectan). Por eso se prueba entero en `tests/relevoInteligente.test.ts`.
 * No reemplaza a `fusibleProveedores`/`relevoFavoritos`/`pivotProveedores`: les
 * presta el cálculo que les faltaba.
 *
 * REGLAS DE LA CASA QUE APLICÁ:
 *   · Nada inventado: si no hay candidatos sanos, se devuelve null y se dice por qué
 *     aguas arriba. Un relevo a un modelo fantasma no es relevo.
 *   · Determinista donde importa: `rotacion` y `menos-usado` no usan azar; el
 *     único azar es `ponderado`, y sólo si el llamante lo pide explícito.
 *   · Topes justificados en el propio código, no ajustes mudos.
 */

// ─── 1) BACKOFF ADAPTATIVO (← OmniRoute modelAvailability) ─────────────────

/**
 * Tope duro del backoff. JUSTIFICACIÓN (no es un número al azar): media hora es
 * el mismo techo que ya usaba `fusibleProveedores` para la clase `capacidad`
 * (30 min), y es el mismo `MAX_PROBLEMATIC_COOLDOWN_MS` de OmniRoute. Más allá
 * de 30 min, pausar «más» no aporta: el usuario ya cambió de modelo o de tarea,
 * y un modelo gratis suele resetear su ventana de cuota dentro de esa media hora.
 */
export const TOPE_COOLDOWN_MS = 30 * 60_000;

/**
 * Piso del backoff. JUSTIFICACIÓN: por debajo de 1 min, reintentar un proveedor
 * que acaba de fallar por cuota/red es tirar el turno del usuario a la basura
 * (la red real no se recupera en 20 s). Es el `MIN_PROBLEMATIC_COOLDOWN_MS` de
 * OmniRoute, misma medida.
 */
export const PISO_COOLDOWN_MS = 60_000;

/**
 * cooldownAdaptativo — cuánto pausar un modelo según CUÁNTAS veces falló.
 *
 * Backoff exponencial: `base * 2^(fallos-1)`, acotado entre PISO y TOPE. El
 * primer fallo cobra `base` (o el piso, lo que sea mayor); cada reincidencia
 * dentro de la ventana DUPLICA, hasta el techo. Es exactamente la curva de
 * `markModelAsProblematic`, pero respetando el TTL por clase que la casa ya medía.
 *
 * @param ttlBaseMs  TTL base de la clase de fallo (lo trae `fusibleProveedores`).
 * @param fallosEnVentana  fallos recientes del modelo (>=1 cuando se llama al fallar).
 * @param topeMs  tope duro (default TOPE_COOLDOWN_MS); nunca por debajo del piso.
 * @returns milisegundos de pausa, finito y > 0.
 */
export function cooldownAdaptativo(
  ttlBaseMs: number,
  fallosEnVentana: number,
  topeMs: number = TOPE_COOLDOWN_MS,
): number {
  const base = Number.isFinite(ttlBaseMs) && ttlBaseMs > 0 ? ttlBaseMs : PISO_COOLDOWN_MS;
  const fallos = Number.isFinite(fallosEnVentana) && fallosEnVentana > 0 ? Math.floor(fallosEnVentana) : 1;
  const tope = Number.isFinite(topeMs) && topeMs > 0 ? topeMs : TOPE_COOLDOWN_MS;
  // El exponente se acota para que `2^n` no desborde a Infinity con rachas largas:
  // con base >= 1 min, 2^20 ya supera cualquier tope humano, así que 20 es de sobra.
  const exp = Math.min(Math.max(0, fallos - 1), 20);
  const crudo = Math.max(base, PISO_COOLDOWN_MS) * Math.pow(2, exp);
  return Math.min(crudo, tope);
}

// ─── 2) REPARTO DE VOCES (← OmniRoute comboResolver) ──────────────────────

export type EstrategiaReparto = "prioridad" | "rotacion" | "menos-usado" | "ponderado";

export interface VozCandidata {
  /** id exacto del modelo (p.ej. "glm-4.5-flash"). */
  modelo: string;
  /** proveedor ("zai", "gemini", "openrouter"…). */
  proveedor: string;
  /** peso para `ponderado` (default 1). Más peso = más probable. */
  peso?: number;
}

export interface ContextoReparto {
  /** usos por modelo, para `menos-usado` (lo lleva el servidor). */
  usosPorModelo?: Record<string, number>;
  /** fuente de azar inyectable, sólo para `ponderado` (default Math.random). */
  aleatorio?: () => number;
}

/** El contador de rotación por clave de pool (round-robin determinista). */
const contadoresRotacion = new Map<string, number>();

export interface VozElegida {
  voz: VozCandidata;
  indice: number;
  motivo: string;
}

/**
 * elegirVozReparto — cuál de los modelos sanos usar, según la estrategia.
 *
 * `prioridad`   → el primero (comportamiento histórico: orden de la carpeta).
 * `rotacion`    → round-robin determinista por `clavePool` (reparte parejo).
 * `menos-usado` → el de menor conteo en `ctx.usosPorModelo` (empareja la cuota).
 * `ponderado`   → azar ponderado por `peso` (único con azar; inyectable).
 *
 * Devuelve null si no hay candidatos (el aviso honesto lo da el llamante).
 *
 * @param clavePool  identifica el pool para el contador de `rotacion`.
 */
export function elegirVozReparto(
  candidatos: VozCandidata[],
  estrategia: EstrategiaReparto = "prioridad",
  ctx: ContextoReparto = {},
  clavePool = "default",
): VozElegida | null {
  const sanos = (candidatos || []).filter((c) => c && c.modelo && c.proveedor);
  if (sanos.length === 0) return null;

  switch (estrategia) {
    case "rotacion": {
      const previo = contadoresRotacion.get(clavePool) ?? 0;
      const indice = previo % sanos.length;
      contadoresRotacion.set(clavePool, previo + 1);
      return { voz: sanos[indice], indice, motivo: `rotación · turno #${previo} del pool «${clavePool}»` };
    }
    case "menos-usado": {
      const usos = ctx.usosPorModelo || {};
      let min = Infinity;
      let idx = 0;
      for (let i = 0; i < sanos.length; i++) {
        const u = Number(usos[sanos[i].modelo]) || 0;
        if (u < min) {
          min = u;
          idx = i;
        }
      }
      return { voz: sanos[idx], indice: idx, motivo: `menos-usado · ${min} uso(s) medidos` };
    }
    case "ponderado": {
      const azar = ctx.aleatorio || Math.random;
      const total = sanos.reduce((s, c) => s + (Number(c.peso) > 0 ? Number(c.peso) : 1), 0);
      let r = azar() * total;
      for (let i = 0; i < sanos.length; i++) {
        r -= Number(sanos[i].peso) > 0 ? Number(sanos[i].peso) : 1;
        if (r <= 0) return { voz: sanos[i], indice: i, motivo: `ponderado · peso ${sanos[i].peso ?? 1}/${total}` };
      }
      return { voz: sanos[0], indice: 0, motivo: "ponderado · caída a prioridad" };
    }
    case "prioridad":
    default:
      return { voz: sanos[0], indice: 0, motivo: "prioridad · primero del orden" };
  }
}

/**
 * cadenaRelevoSinProbados — quita de la cadena lo que ya se intentó este turno.
 * Hermano del `resolveFallbackChain(excludeProviders)` de OmniRoute, pero por
 * modelo (id exacto), que es la unidad con la que la casa cuenta los intentos.
 */
export function cadenaRelevoSinProbados(
  candidatos: VozCandidata[],
  modelosProbados: string[] = [],
): VozCandidata[] {
  const probados = new Set((modelosProbados || []).map((m) => String(m)));
  return (candidatos || []).filter((c) => c && c.modelo && !probados.has(c.modelo));
}

/** Solo para pruebas: reinicia los contadores de rotación. */
export function reiniciarRepartoParaPruebas(): void {
  contadoresRotacion.clear();
}
