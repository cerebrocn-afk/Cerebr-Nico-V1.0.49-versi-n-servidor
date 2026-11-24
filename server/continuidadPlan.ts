/**
 * continuidadPlan.ts — EL PLAN NO SE REINICIA CADA MENSAJE (v1.16.5 · B1.2)
 * El usuario: «le contesto LEE y comienza la tarea otra vez». El plan vivía
 * solo dentro de runOllamaAgentLoop: mensaje nuevo = plan vacío y el modelo
 * (flash-lite sobre todo) volvía a planificar desde cero. Aquí queda el último
 * plan con pendientes, 30 min de vigencia, una ventana = una conversación
 * (mismo patrón que contextCache). Puro estado en memoria: nada toca el disco.
 */
import { tareasPendientes, type TareaPlan } from "../src/engine/bucleAutonomo";
let ultimo: { plan: TareaPlan[]; cuando: number } | null = null;
export function registrarPlanTurno(plan: TareaPlan[]): void {
  if (plan.length > 0) ultimo = { plan: plan.map((t) => ({ ...t })), cuando: Date.now() };
}
export function notaContinuidad(): string | null {
  if (ultimo && Date.now() - ultimo.cuando <= 30 * 60 * 1000 && tareasPendientes(ultimo.plan).length > 0)
    return "PLAN ANTERIOR SIN TERMINAR — no lo reinicies: continúalo donde quedó; si ahora piden otra cosa, reemplázalo con set_plan.\n" + ultimo.plan.map((t) => `${t.status === "done" ? "[x]" : t.status === "failed" ? "[!]" : "[ ]"} ${t.description}`).join("\n");
  return null;
}

// ── v1.69.0 · TURNO = CONTRATO (pedido de Mario, 24/10) ──────────────────────
// «Ahí es donde se centra el plan… hasta que no termine no se corta o se auto
// pregunta para continuar el turno; hacer coincidir el turno con la tarea y la
// entrega». El juez local ya lo hacía (decidirBucle: plan abierto ⇒ continuar).
// El ciclo OpenAI-compat —once proveedores de nube— no: cerraba el turno con
// etapas colgando y el usuario escribía «sigue». Esta es LA DIRECTIVA con la
// que el motor se auto-pregunta, y su tope. Pura y testeable en seco.

/** Exigencias de «cerrá las etapas del plan» por turno. Acotado: no es bucle. */
export const MAX_CONTINUIDAD_PLAN = 3;

/** El plan como lista de etapas con su marca: tachadas las hechas, abiertas las demás. */
export function etapasDelPlan(plan: TareaPlan[]): string {
  return plan.map((t) => `${t.status === "done" ? "[x]" : t.status === "failed" ? "[!]" : t.status === "running" ? "[▶]" : "[ ]"} #${t.id} ${t.description}`).join("\n");
}

/**
 * LA AUTO-PREGUNTA que el motor se hace (e inyecta como mensaje) cuando el
 * modelo quiere cerrar el turno con etapas del plan todavía abiertas. Devuelve
 * null si no hay nada que exigir — turno sin plan tocado es turno libre.
 */
export function directivaDePlanPendiente(
  plan: TareaPlan[],
  intento: number,
  tope: number = MAX_CONTINUIDAD_PLAN,
): string | null {
  const pendientes = tareasPendientes(plan);
  if (pendientes.length === 0) return null;
  const ultimatum = intento >= tope - 1;
  return (
    `▶️ CONTRATO DE PLAN — querés cerrar el turno y el Planificador todavía tiene ` +
    `${pendientes.length} etapa(s) SIN TACHAR:\n${etapasDelPlan(plan)}\n` +
    (ultimatum
      ? `ÚLTIMA EXIGENCIA del turno: tachá la etapa que puedas cerrar AHORA con update_task(status:"completed") y ` +
        `de las demás entrégale al usuario o el informe honesto de qué falta y por qué, o un replanteo concreto. ` +
        `No vuelvas a cantar «listo» con etapas abiertas.`
      : `Seguí en este mismo hilo con la primera etapa abierta: ejecutala con herramientas reales y ` +
        `tachala con update_task (status "completed", y "evidencia" con la prueba de que quedó hecha). ` +
        `El turno cierra CUANDO EL PLAN ESTÁ TACHADO, no antes. Si una etapa es imposible, decilo con causa ` +
        `y marcala "failed" — eso también es cerrar la etapa.`) +
    `\n(El motor no te está pidiendo permiso: es la hoja de ruta que VOS escribiste con set_plan.)`
  );
}
