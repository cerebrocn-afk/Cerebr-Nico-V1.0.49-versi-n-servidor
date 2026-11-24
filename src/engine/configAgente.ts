/**
 * configAgente.ts — FASE 5 · «Velocidad y disciplina» (v1.57.4)
 * ============================================================================
 * CONFIG, NO CÓDIGO. Este módulo NO decide nada por su cuenta: sólo DECLARA los
 * valores de la Fase 5 en un único sitio, para que el motor (server.ts) y el
 * prompt (superPrompt.ts) lean de aquí en vez de llevar números sueltos
 * repartidos por el código. Así «la temperatura del modo agente» o «el
 * presupuesto de pasos» se cambian en una línea y valen para todos.
 *
 * Las tres piezas de la Fase 5:
 *   1. `temperatura`        → modo AGENTE a 0.4 (determinismo alto para que las
 *                            llamadas a herramientas no se vuelvan creativas).
 *   2. `temperaturaChat`    → charla normal (sin herramientas) sigue en 0.5.
 *   3. `presupuestoPasos`   → autonomía EXPLÍCITA: cuántos pasos puede dar el
 *                            agente antes de parar (coincide con maxAgentSteps).
 *
 * El punto de la Fase 5 («no preguntes lo obvio, actúa») se materializa en
 * `directrizPresupuestoAutonomia()`, que viaja en el system prompt.
 */

export interface ConfigAgente {
  /** Temperatura del MODO AGENTE (herramientas activas). 0.4 por decisión de la Fase 5. */
  temperatura: number;
  /** Temperatura de la charla normal (sin herramientas). */
  temperaturaChat: number;
  /** Presupuesto de autonomía: pasos que el agente puede encadenar sin volver a preguntar. */
  presupuestoPasos: number;
}

/** Fuente ÚNICA de verdad de los ajustes del modo agente (Fase 5). */
export const CONFIG_AGENTE: ConfigAgente = {
  temperatura: 0.4,
  temperaturaChat: 0.5,
  presupuestoPasos: 10,
};

/** Límites duros de temperatura aceptados por los proveedores (Ollama incluido). */
const TEMP_MIN = 0.05;
const TEMP_MAX = 1.0;

function clampTemp(t: number): number {
  return Math.max(TEMP_MIN, Math.min(TEMP_MAX, t));
}

/**
 * Temperatura a usar en MODO AGENTE.
 * - Si el usuario fijó una temperatura EXPLÍCITA (número finito), se respeta
 *   (su decisión manda, sólo se acota al rango válido).
 * - Si no hay valor (undefined / NaN), se usa el default de la Fase 5 (0.4).
 *
 * `req.body?.temperature` (crudo, sin default) es el argumento correcto a pasar:
 * así se distingue «el usuario eligió 0.5» de «no mandó nada».
 */
export function temperaturaModoAgente(
  temperaturaUsuario?: number | null,
  cfg: ConfigAgente = CONFIG_AGENTE
): number {
  if (typeof temperaturaUsuario === "number" && Number.isFinite(temperaturaUsuario)) {
    return clampTemp(temperaturaUsuario);
  }
  return clampTemp(cfg.temperatura);
}

/**
 * Directriz de PRESUPUESTO DE AUTONOMÍA para el system prompt.
 * Convierte el pedido «que actúe y no pregunte lo obvio» en una regla afirmativa
 * y acotada: tiene un número de pasos para gastar, así que gasta en acciones,
 * no en pedir permiso. Es el refuerzo de la regla 7 de VELOCIDAD, con cifra.
 */
export function directrizPresupuestoAutonomia(
  pasos: number = CONFIG_AGENTE.presupuestoPasos
): string {
  const n = Number.isFinite(pasos) && pasos > 0 ? Math.floor(pasos) : CONFIG_AGENTE.presupuestoPasos;
  return [
    "[PRESUPUESTO DE AUTONOMÍA]",
    `- Tenés hasta ${n} pasos de herramientas en este turno: gastalos en ACCIONES, no en pedir permiso.`,
    "- No preguntes lo obvio. Si el pedido ya fija el destino (ruta, archivo o resultado), ejecutá el paso que sigue sin confirmar.",
    "- Elegir el nombre de un archivo, una ruta por defecto o una convención razonable NO es motivo para parar: decidí y seguí.",
    "- Sólo se devuelve el turno al usuario si falta un dato IMPRESCINDIBLE que no podés deducir, o si ya no queda nada por intentar.",
    "- Si una herramienta falla, no la repitas igual: cambiá de ruta, de herramienta o de enfoque, y seguí hasta agotar el presupuesto.",
  ].join("\n");
}
