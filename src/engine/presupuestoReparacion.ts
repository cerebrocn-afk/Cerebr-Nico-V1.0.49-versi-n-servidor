/**
 * presupuestoReparacion.ts — TOPE DURO + PRESUPUESTO DE TOKENS POR NODO (v1.53.3 · Paso A)
 * =====================================================================================
 * QUÉ CURA: la Hoja de Ruta v1.53.2 (Paso A.2 + Self-Healing #2) pide un TOPE
 * DURO de reparaciones POR NODO del DAG con corte a «Intervención Humana
 * Requerida». El bucle de hoy (bucleAutonomo.ts) ya acota por PASOS (techoDePasos)
 * y por ESCALÓN (0..3), pero eso NO basta: un SOLO intento de reparación con un
 * contexto enorme puede quemar más créditos de Gemini/Z.ai que tres intentos
 * cortos. El tope por número de intentos no cuida la billetera; el que la cuida
 * es un PRESUPUESTO DE TOKENS por rama del grafo.
 *
 * Este módulo es ese contador: por cada nodo (p.ej. "backend/api.ts") lleva un
 * saldo de tokens de inferencia para autorreparación. Cada llamada cloud va
 * restando. Si el saldo llega a cero — o el próximo intento estimado no cabe,
 * o se agotaron los intentos — el nodo se CONGELA: se guarda el estado de error
 * (en evolutionDB lo hace quien llama, aquí solo se decide) y se levanta la
 * bandera de intervención humana. Nunca auto-parchea: coherente con el diseño
 * del proyecto (registra, no aplica a ciegas).
 *
 * PURO: sin red, sin disco, sin reloj. Muta solo el objeto de estado que recibe
 * (como auditoriaBucle). Se prueba entero en tests/presupuestoReparacion.test.ts.
 */

/** Tope duro de intentos de reparación por nodo (además del presupuesto de tokens). */
export const MAX_INTENTOS_POR_NODO = 3;

/** Presupuesto de tokens de inferencia por nodo del DAG, por defecto. */
export const PRESUPUESTO_TOKENS_POR_NODO = 50_000;

/** El saldo vivo de un nodo del grafo mientras se autorrepara. */
export interface EstadoNodoReparacion {
  nodoId: string;
  intentos: number;
  tokensGastados: number;
  maxIntentos: number;
  presupuestoTokens: number;
  /** Se pone a true cuando el nodo se congela (pide intervención humana). */
  congelado: boolean;
  /** Motivo del congelamiento, si lo hubo. */
  motivoCongelado?: string;
}

/** Abre el presupuesto de un nodo. Determinista; sin efectos externos. */
export function crearPresupuestoNodo(
  nodoId: string,
  maxIntentos: number = MAX_INTENTOS_POR_NODO,
  presupuestoTokens: number = PRESUPUESTO_TOKENS_POR_NODO,
): EstadoNodoReparacion {
  return {
    nodoId: String(nodoId || "nodo"),
    intentos: 0,
    tokensGastados: 0,
    maxIntentos: Math.max(1, Math.floor(maxIntentos)),
    presupuestoTokens: Math.max(1, Math.floor(presupuestoTokens)),
    congelado: false,
  };
}

/** Saldo de tokens que le queda al nodo (nunca negativo). */
export function saldoTokens(e: EstadoNodoReparacion): number {
  return Math.max(0, e.presupuestoTokens - e.tokensGastados);
}

/** Intentos que le quedan al nodo (nunca negativo). */
export function intentosRestantes(e: EstadoNodoReparacion): number {
  return Math.max(0, e.maxIntentos - e.intentos);
}

export type AccionReparacion = "reparar" | "congelar";

export interface VeredictoReparacion {
  accion: AccionReparacion;
  motivo: string;
  saldoTokens: number;
  intentosRestantes: number;
  /** Solo true cuando accion === "congelar": pide intervención humana. */
  intervencionHumana: boolean;
}

/**
 * ¿Puede el nodo intentar OTRA reparación? Decide ANTES de gastar la llamada.
 * `estimadoProximo` = tokens que se prevé consumirá el próximo intento (0 si no
 * se sabe). Congela si: ya está congelado, agotó intentos, no le queda saldo, o
 * el próximo intento estimado NO cabe en el saldo. Así nunca se dispara una
 * llamada cara que de todos modos reventaría el presupuesto.
 */
export function decidirReparacion(
  e: EstadoNodoReparacion,
  estimadoProximo = 0,
): VeredictoReparacion {
  const saldo = saldoTokens(e);
  const restantes = intentosRestantes(e);
  const congelar = (motivo: string): VeredictoReparacion => ({
    accion: "congelar", motivo, saldoTokens: saldo, intentosRestantes: restantes, intervencionHumana: true,
  });

  if (e.congelado) return congelar(e.motivoCongelado || `nodo «${e.nodoId}» ya congelado`);
  if (restantes <= 0) return congelar(`nodo «${e.nodoId}» agotó el tope de ${e.maxIntentos} intento(s)`);
  if (saldo <= 0) return congelar(`nodo «${e.nodoId}» agotó su presupuesto de ${e.presupuestoTokens} tokens`);
  if (estimadoProximo > 0 && estimadoProximo > saldo)
    return congelar(`el próximo intento (~${estimadoProximo} tokens) no cabe en el saldo de ${saldo} del nodo «${e.nodoId}»`);

  return {
    accion: "reparar",
    motivo: `nodo «${e.nodoId}»: ${restantes} intento(s) y ${saldo} tokens de saldo`,
    saldoTokens: saldo, intentosRestantes: restantes, intervencionHumana: false,
  };
}

/**
 * Anota el consumo REAL de un intento ya ejecutado (muta el estado). Si tras
 * anotar el nodo se quedó sin intentos o sin saldo, lo CONGELA aquí mismo para
 * que la próxima consulta ya devuelva "congelar". Devuelve el veredicto para la
 * SIGUIENTE vuelta.
 */
export function registrarIntento(
  e: EstadoNodoReparacion,
  tokensDelIntento: number,
): VeredictoReparacion {
  e.intentos += 1;
  e.tokensGastados += Math.max(0, Math.floor(tokensDelIntento || 0));

  const v = decidirReparacion(e);
  if (v.accion === "congelar" && !e.congelado) {
    e.congelado = true;
    e.motivoCongelado = v.motivo;
  }
  return v;
}

/** Congela un nodo a mano (p.ej. fallo crítico no recuperable). Muta e idempotente. */
export function congelarNodo(e: EstadoNodoReparacion, motivo: string): EstadoNodoReparacion {
  if (!e.congelado) {
    e.congelado = true;
    e.motivoCongelado = motivo || `nodo «${e.nodoId}» congelado manualmente`;
  }
  return e;
}

/** ¿Este nodo pide intervención humana? (pregunta de atajo para el panel/log). */
export function pideIntervencionHumana(e: EstadoNodoReparacion): boolean {
  return !!e.congelado;
}
