/**
 * pivotProveedores.ts — v1.57.19 · EL PIVOT (F1: el cerebro, puro)
 * ==================================================================
 * RAÍZ (idea del usuario + estudio de la sesión 1792103924951): un orquestador
 * común hace petición → timeout fijo (30 s) → «Request Timeout» → usuario
 * frustrado. La evolución que ya vive en la casa (reloj medido, vida por
 * heartbeat, causa clasificada, cuarentena) termina en «propongo alternativa y
 * espero tu respuesta». Este módulo cierra el círculo: decide el CAMBIO DE
 * MODELO en vuelo —misma petición, mismo contexto— con tres candados de la casa:
 *
 *   1. HONESTIDAD: el aviso dice el fallo, su causa y el reemplazo con su
 *      medición. Prohibido decir «optimizando» cuando un modelo se cayó.
 *   2. CONSENTIMIENTO: local→local siempre; local→nube según el ajuste del
 *      usuario (Sí / Preguntar la primera vez / Nunca). Sin consentimiento no
 *      hay pivot — y se dice por qué, en vez de fallar en silencio.
 *   3. AUDITORÍA: 1 pivot por turno, el rescate queda registrado y el `estado`
 *      del turno nunca miente sobre quién respondió.
 *
 * Puro y con reloj inyectable. El escenario del usuario (DeepSeek-33B que se
 * cuelga a los 192 s y Gemini Flash que responde en 2 s) es fixture de prueba.
 */

export type Proveedor = "ollama" | "zai" | "gemini" | "otro";
export type ConsentimientoNube = "si" | "preguntar" | "no";

export interface Candidato {
  modelo: string;
  proveedor: Proveedor;
  /** 0..1 — el usuario (o la casa) declara cuánta calidad exige esta tarea. */
  pesoCalidad: number;
  esLocal: boolean;
  /** v1.57.19 · F2: el modelo ya está cargado en memoria (Ollama /api/ps). */
  cargado?: boolean;
}

/** v1.57.19 · F2 · COSTO DE CONTEXTO: cargado < frío < nube (pedido del usuario). */
export type TierContexto = "caliente" | "frio" | "nube";

export function tierDeContexto(c: Pick<Candidato, "esLocal" | "cargado">): TierContexto {
  if (!c.esLocal) return "nube";
  return c.cargado ? "caliente" : "frio";
}

const ORDEN_TIER: Record<TierContexto, number> = { caliente: 0, frio: 1, nube: 2 };
const ETIQUETA_TIER: Record<TierContexto, string> = {
  caliente: "local cargado (sin costo de carga ni reenvío)",
  frio: "local frío (paga carga, pero tu contexto no sale de la máquina)",
  nube: "nube (reenvía todo el prompt y consume cuota)",
};

export interface Ranking {
  modelo: string;
  proveedor: Proveedor;
  esLocal: boolean;
  p50: number;
  puntaje: number;
  /** v1.57.19 · F2: costo de contexto del candidato. */
  tier: TierContexto;
  motivo: string;
}

/** Piso de calidad: un modelo flojo no rescata una tarea exigente. */
export const PISO_CALIDAD = 0.6;
/** Sesgo de privacidad: la nube debe ser 3x más rápida para ganarle al local. */
export const VENTAJA_NUBE = 3;
export const MAX_PIVOTES_POR_TURNO = 1;

export interface OpcionesRanking {
  medidos: Record<string, { p50: number } | undefined>;
  enCuarentena: (modelo: string) => boolean;
  /** El que acaba de fallar: no se propone a sí mismo. */
  fallado: string;
}

/** Ordena los candidatos sanos y MEDIDOS: costo de contexto, calidad y velocidad. */
export function ordenarCandidatos(candidatos: Candidato[], opts: OpcionesRanking): Ranking[] {
  const utiles = (candidatos || []).filter((c) => {
    if (!c || !c.modelo) return false;
    if (c.modelo === opts.fallado) return false;
    if (opts.enCuarentena(c.modelo)) return false;
    if (Number(c.pesoCalidad) < PISO_CALIDAD) return false;
    const med = opts.medidos[c.modelo];
    return !!(med && Number(med.p50) > 0);
  });
  const armar = (c: Candidato): Ranking => {
    const p50 = Number(opts.medidos[c.modelo]!.p50);
    const tier = tierDeContexto(c);
    return {
      modelo: c.modelo,
      proveedor: c.proveedor,
      esLocal: !!c.esLocal,
      p50,
      puntaje: Math.round((Number(c.pesoCalidad) * 1000) / (p50 / 1000 + 1)),
      tier,
      motivo: `medido ${(p50 / 1000).toFixed(1)} s · calidad ${Number(c.pesoCalidad).toFixed(1)} · ${ETIQUETA_TIER[tier]}`,
    };
  };
  // v1.57.19 · F2 · COSTO DE CONTEXTO (pedido del usuario): primero el tier
  // —cargado < frío < nube—, y dentro del tier manda la calidad medida y la
  // velocidad. La privacidad deja de ser un sesgo aparte: es consecuencia del
  // tier (un local frío le gana a la nube aunque la nube sea más rápida, porque
  // el reenvío del prompt y la cuota son costos que el p50 no muestra).
  return utiles
    .map(armar)
    .sort((a, b) => ORDEN_TIER[a.tier] - ORDEN_TIER[b.tier] || b.puntaje - a.puntaje || a.p50 - b.p50 || a.modelo.localeCompare(b.modelo));
}

export interface EstadoPivot {
  modeloElegido: string;
  /** Si ya se entregó contenido, un pivot duplicaría la respuesta: no se hace. */
  contenidoEntregado: boolean;
  pivotesUsados: number;
  consentimiento: ConsentimientoNube;
}

export interface DecisionPivot {
  pivotar: boolean;
  modelo?: string;
  proveedor?: Proveedor;
  esLocal?: boolean;
  aviso: string;
  requiereConsentimiento?: boolean;
  pregunta?: string;
}

/** La decisión del cambio de modelo, con sus candados. */
export function decidirPivot(estado: EstadoPivot, ranking: Ranking[]): DecisionPivot {
  const elegido = estado.modeloElegido;
  if (estado.contenidoEntregado) {
    return { pivotar: false, aviso: `«${elegido}» falló después de entregar contenido: no se pivota (duplicaría la respuesta). Se informa el error tal cual.` };
  }
  if (estado.pivotesUsados >= MAX_PIVOTES_POR_TURNO) {
    return { pivotar: false, aviso: `ya se usó el rescate de este turno (tope ${MAX_PIVOTES_POR_TURNO}): no hay segundo pivot.` };
  }
  const mejor = (ranking || [])[0];
  if (!mejor) {
    return { pivotar: false, aviso: `«${elegido}» falló y no hay alternativa medida y sana (cuarentena o sin mediciones): elegí otro modelo a mano.` };
  }
  const base = `🔀 RESCATE — «${elegido}» no dio el primer byte. Sigo con «${mejor.modelo}» (${mejor.motivo}).`; // el motivo declara el tier: cargado/frío/nube
  if (mejor.esLocal) {
    return { pivotar: true, modelo: mejor.modelo, proveedor: mejor.proveedor, esLocal: true, aviso: base };
  }
  // Destino nube: manda el consentimiento del usuario.
  if (estado.consentimiento === "no") {
    return { pivotar: false, aviso: `🔀 RESCATE — hay alternativa medida en la nube («${mejor.modelo}», ${(mejor.p50 / 1000).toFixed(1)} s) pero el rescate en la nube está en «Nunca»: tus mensajes no salen de tu máquina.` };
  }
  if (estado.consentimiento === "preguntar") {
    return {
      pivotar: true,
      modelo: mejor.modelo,
      proveedor: mejor.proveedor,
      esLocal: false,
      requiereConsentimiento: true,
      aviso: base,
      pregunta: `🔀 ¿Rescato con «${mejor.modelo}» (nube, ${(mejor.p50 / 1000).toFixed(1)} s medidos)? Tus mensajes saldrían a la nube. [Sí, rescatá] [No, mostrame el error]`,
    };
  }
  return { pivotar: true, modelo: mejor.modelo, proveedor: mejor.proveedor, esLocal: false, aviso: base };
}

// ── Acta del turno: el rescate queda registrado, sin mentir sobre quién respondió ──
const VIGENCIA_RESCATE_MS = 15 * 60_000;
const RESCATES_MAX = 4;
interface Rescate { elegido: string; rescate: string; proveedor: Proveedor; causa: string; aLosMs: number; cuando: number }
let rescates: Rescate[] = [];

export function registrarRescateDelTurno(r: Omit<Rescate, "cuando">, ahora = Date.now()): void {
  rescates.push({ ...r, cuando: ahora });
  while (rescates.length > RESCATES_MAX) rescates.shift();
}

/** El acta: una línea por rescate fresco (vacío si no hubo). */
export function notaRescateDelTurno(ahora = Date.now()): string {
  rescates = rescates.filter((r) => ahora - r.cuando <= VIGENCIA_RESCATE_MS);
  if (rescates.length === 0) return "";
  return rescates
    .map((r) => `🔀 RESCATE DEL TURNO — terminó «${r.rescate}» (${r.proveedor}) porque «${r.elegido}» no respondió: ${r.causa} a los ${Math.round(r.aLosMs / 1000)} s medidos.`)
    .join("\n");
}

export function reiniciarRescatesParaPruebas(): void {
  rescates = [];
}
