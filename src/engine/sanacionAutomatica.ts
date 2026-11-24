/**
 * sanacionAutomatica.ts — v1.57.19 · F1.5: LA SANACIÓN AUTOMÁTICA (el cerebro)
 * ==============================================================================
 * RAÍZ (idea del usuario, sumada a la hoja de ruta ANTES del pivot): hoy la
 * cuarentena del fusible sólo VENCE por TTL — al minuto 2 el modelo vuelve a
 * estar disponible sin que nadie haya comprobado que volvió. La sanación
 * VERIFICA en vez de suponer: una sonda fantasma (prompt de 1 token) cada 5
 * minutos con backoff, y re-entrada sólo si responde dentro de su presupuesto.
 *
 * CANDADOS QUE LA IDEA ORIGINAL NO TRAÍA (y el hardware exige):
 *  1. LOCAL ACTIVO, NUBE PASIVA: la sonda local casi no cuesta (carga y se
 *     descarga); la de nube quema cuota real (Gemini free = 20 pedidos/día).
 *     Para nube, la re-entrada es PASIVA: vence el TTL y la primera llamada
 *     real lo prueba.
 *  2. NUNCA MIENTRAS EL MOTOR TRABAJA: si hay un turno generando o un Gradle
 *     vivo, la sonda espera — no compite por CPU/RAM con el usuario.
 *  3. LA SONDA NO ALIMENTA EL p95: un prompt de 1 token carga más rápido que el
 *     trabajo real; su tiempo decide «¿volvió?», jamás el presupuesto.
 *  4. CON EL RESCATE EN NUBE EN «NUNCA», NO HAY SONDAS DE NUBE: sería tráfico
 *     que el usuario no autorizó.
 *
 * Puro y con reloj inyectable (el daemon que dispara las sondas vive en
 * server/, la decisión vive acá). Fixture: los 391 s de gemma4:31b-cloud y los
 * 192 s de presupuesto del DeepSeek-33B del escenario de aceptación.
 */

export interface EstadoSanacion {
  modelo: string;
  esLocal: boolean;
  /** Cuándo entró en cuarentena (ms epoch). */
  enCuarentenaDesde: number;
  /** Sondas fallidas desde que entró: espacian el próximo intento. */
  sondasFallidas: number;
  /** Última sonda lanzada (si hubo). */
  ultimaSonda?: number;
  /** El p95 medido del modelo (o la base por clase si no hay historia). */
  presupuestoMs: number;
}

export interface OpcionesSonda {
  ahora: number;
  /** Hay un turno generando o un Gradle vivo: la sonda espera. */
  ocupado?: boolean;
  /** El ajuste «Permitir rescate en la nube» no está en «Nunca». */
  permiteNube?: boolean;
}

export const SONDA_CADA_MS = 5 * 60_000;
export const SONDA_TECHO_ESPERA_MS = 30 * 60_000;
export const SONDA_TOPE_RESPUESTA_MS = 120_000;
const SONDA_PISO_RESPUESTA_MS = 15_000;
const BACKOFF = 2;

/** El presupuesto de la SONDA: el p95 del modelo, pero nunca más de 120 s. */
export function presupuestoSonda(presupuestoMs: number): number {
  const p = Number(presupuestoMs) || 0;
  if (p <= 0) return SONDA_TOPE_RESPUESTA_MS;
  return Math.max(SONDA_PISO_RESPUESTA_MS, Math.min(SONDA_TOPE_RESPUESTA_MS, Math.round(p)));
}

/** Cadencia con backoff: 5 min, 10, 20, 30 (techo). */
export function agendaDeSonda(e: EstadoSanacion): number {
  const fallidas = Math.max(0, Number(e.sondasFallidas) || 0);
  return Math.min(SONDA_TECHO_ESPERA_MS, SONDA_CADA_MS * Math.pow(BACKOFF, fallidas));
}

/** ¿A quién le toca sonda AHORA? (con los candados 1, 2 y 4) */
export function sondasPendientes(estados: EstadoSanacion[], opts: OpcionesSonda): EstadoSanacion[] {
  if (opts.ocupado) return [];
  return (estados || [])
    .filter((e) => e && e.modelo)
    .filter((e) => e.esLocal || opts.permiteNube === true)
    .filter((e) => {
      const referencia = Number.isFinite(e.ultimaSonda as number) ? (e.ultimaSonda as number) : e.enCuarentenaDesde;
      return opts.ahora - referencia >= agendaDeSonda(e);
    })
    .sort((a, b) => (a.ultimaSonda ?? a.enCuarentenaDesde) - (b.ultimaSonda ?? b.enCuarentenaDesde));
}

export interface VeredictoSonda {
  veredicto: "sana" | "sigue";
  nota: string;
  proximaEnMs: number;
}

/** El veredicto de una sonda: sólo un tiempo dentro del presupuesto la declara sana. */
export function evaluarSonda(e: EstadoSanacion, msSonda: number, opts: { ahora: number }): VeredictoSonda {
  const tope = presupuestoSonda(e.presupuestoMs);
  const medido = Number(msSonda);
  const respiro = (medido > 0 && Number.isFinite(medido) && medido <= tope);
  if (respiro) {
    return {
      veredicto: "sana",
      nota: `🩺 SANACIÓN — «${e.modelo}» respondió la sonda en ${(medido / 1000).toFixed(1)} s (presupuesto ${(e.presupuestoMs / 1000).toFixed(0)} s): sale de cuarentena por verificación, no por reloj.`,
      proximaEnMs: 0,
    };
  }
  const fallidas = Math.max(0, Number(e.sondasFallidas) || 0) + 1;
  const proxima = Math.min(SONDA_TECHO_ESPERA_MS, SONDA_CADA_MS * Math.pow(BACKOFF, fallidas));
  return {
    veredicto: "sigue",
    nota: `🩺 «${e.modelo}» sigue en cuarentena (${fallidas}ª sonda fallida${medido > 0 ? `: respondió en ${(medido / 1000).toFixed(1)} s, más que los ${(tope / 1000).toFixed(0)} s de la sonda` : ": no respondió"}); próximo intento en ${Math.round(proxima / 60_000)} min.`,
    proximaEnMs: proxima,
  };
}

/** El prompt fantasma del daemon: 1 token, sin dejar el modelo en RAM. */
export const PROMPT_FANTASMA = "ok";
export const CUERPO_SONDA = (modelo: string) => ({
  model: modelo,
  prompt: PROMPT_FANTASMA,
  stream: false,
  keep_alive: 0,
  options: { num_predict: 1, temperature: 0 },
});
