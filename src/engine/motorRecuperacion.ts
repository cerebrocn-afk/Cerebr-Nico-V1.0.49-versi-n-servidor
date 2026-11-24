/**
 * motorRecuperacion.ts — LA RECUPERACIÓN QUE CAMBIA DE TÁCTICA SOLA (v1.35.0 · FASE 5)
 * =====================================================================================
 * QUÉ ES: el Recovery Engine de la hoja de ruta (§5 escalera 2.0 + §17 anti-bucle
 * 3.0). El proyecto YA sabía detectar el bucle: v1.30 reconoce la misma firma de
 * error y v1.31 fuerza el peldaño a partir de 2 repeticiones. Lo que faltaba —y
 * pide la ruta textualmente— es que esa detección CAMBIE LA ESTRATEGIA sola, no
 * que solo la registre. Este módulo es esa decisión.
 *
 * LA ESCALERA 2.0 (§5), con estrategia por nivel (REPAIR ya no es «vuelve a
 * escribir», SELECCIONA estrategia):
 *   Nivel 0 — corrección local        (error → archivo → línea → corrección)
 *   Nivel 1 — corrección estructural  (error → dependencia → contrato → módulo)
 *   Nivel 2 — rollback                (snapshot → deshacer → nuevo enfoque)
 *   Nivel 3 — cambio de arquitectura  (diagnóstico → alternativa A → prueba → B)
 *   Nivel 4 — bloqueo                 (causa/evidencia/estrategias/decisión)
 *
 * LA FIRMA DE TAREA (§17): hash(objetivo + archivos + error + estrategia +
 * estado). Si la firma reaparece → REPETICIÓN. Si solo cambia el texto pero no la
 * estrategia → MISMA ESTRATEGIA → STOP + CHANGE_STRATEGY. Umbrales configurables
 * por perfil (2→cambiar táctica, 3→rollback, 4→investigar arquitectura, 5→humano).
 *
 * FUENTE ÚNICA: la firma DEL ERROR sigue siendo de reconocimientoError; el
 * peldaño por fallos sigue siendo de bucleAutonomo. Este módulo aporta la firma
 * DE TAREA (que incluye estrategia y estado, no solo el error) y la decisión de
 * recuperación. Es PURO: sin disco, sin red, memoria de módulo para el conteo.
 */

import { firmaError } from "./reconocimientoError";

// ═════════════════════════════════════════════════════════════════
// LA ESCALERA 2.0
// ═════════════════════════════════════════════════════════════════

export type NivelReparacion = 0 | 1 | 2 | 3 | 4;

export interface EstrategiaNivel {
  nivel: NivelReparacion;
  nombre: string;
  /** La secuencia concreta que ESE nivel intenta (no «vuelve a escribir»). */
  pasos: string[];
  /** Qué NO hacer en este nivel. */
  prohibiciones: string[];
}

export const ESCALERA: Record<NivelReparacion, EstrategiaNivel> = {
  0: { nivel: 0, nombre: "corrección local", pasos: ["error → archivo", "archivo → línea citada", "corrección mínima en esa línea"], prohibiciones: ["NO reescribir el archivo entero por un error localizado"] },
  1: { nivel: 1, nombre: "corrección estructural", pasos: ["error → dependencia", "dependencia → contrato", "contrato → módulo afectado"], prohibiciones: ["NO parchear la hoja sin mirar la rama que la sostiene"] },
  2: { nivel: 2, nombre: "rollback", pasos: ["recuperar snapshot previo", "deshacer la tanda que no funcionó", "empezar un enfoque nuevo desde el estado sano"], prohibiciones: ["NO seguir apilando parches sobre un estado ya roto"] },
  3: { nivel: 3, nombre: "cambio de arquitectura", pasos: ["diagnóstico del enfoque actual", "alternativa A", "prueba de A", "alternativa B si A no cierra"], prohibiciones: ["NO otra variante del mismo enfoque", "NO ampliar presupuesto sin medir progreso (§21)"] },
  4: { nivel: 4, nombre: "bloqueo", pasos: ["declarar causa", "adjuntar evidencia", "listar estrategias probadas", "proponer alternativas", "pedir la decisión humana"], prohibiciones: ["NO reintentar en silencio", "NO decidir por el humano en lo indecidible objetivamente (§25)"] },
};

// ═════════════════════════════════════════════════════════════════
// LA FIRMA DE TAREA (§17) — más que el error: incluye estrategia y estado
// ═════════════════════════════════════════════════════════════════

export interface DescriptorTarea {
  objetivo: string;
  archivos?: string[];
  /** El último error (se normaliza con la firma de reconocimientoError). */
  error?: string | null;
  /** La estrategia que se está aplicando (nombre de nivel o etiqueta libre). */
  estrategia?: string;
  /** Estado del intento (fase). */
  estado?: string;
}

/** Hash estable y corto (djb2) — sin dependencias, determinista. */
function hashCorto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * La firma de TAREA del §17: objetivo + archivos + FIRMA-de-error + estrategia +
 * estado. Ata la firma del error (fuente única) para que el mismo error cuente
 * como «mismo» aunque cambie la línea; y AGREGA estrategia+estado, que es lo que
 * distingue «misma estrategia» de «cambié el enfoque».
 */
export function firmaTarea(t: DescriptorTarea): string {
  const arch = (t.archivos ?? []).map((a) => a.trim()).filter(Boolean).sort().join(",");
  const err = t.error ? firmaError(t.error) : "";
  const base = [t.objetivo?.trim() || "", arch, err, (t.estrategia || "").trim(), (t.estado || "").trim()].join("|");
  return hashCorto(base);
}

/** La firma de ESTRATEGIA: objetivo+archivos+error SIN estrategia — para ver si
 * el enfoque cambió de verdad o solo la redacción del intento. */
export function firmaEnfoque(t: DescriptorTarea): string {
  const arch = (t.archivos ?? []).map((a) => a.trim()).filter(Boolean).sort().join(",");
  const err = t.error ? firmaError(t.error) : "";
  return hashCorto([t.objetivo?.trim() || "", arch, err].join("|"));
}

// ═════════════════════════════════════════════════════════════════
// EL ANTI-BUCLE 3.0 — la detección QUE CAMBIA DE TÁCTICA SOLA
// ═════════════════════════════════════════════════════════════════

export interface UmbralesRecuperacion {
  cambiarTactica: number; // §17: 2
  rollback: number;       // §17: 3
  investigar: number;     // §17: 4
  bloquear: number;       // §17: 5
}

/** Umbrales por perfil (§17: «los números deberían ser configurables por perfil»). */
export const PERFILES: Record<string, UmbralesRecuperacion> = {
  base:      { cambiarTactica: 2, rollback: 3, investigar: 4, bloquear: 5 },
  agresivo:  { cambiarTactica: 1, rollback: 2, investigar: 3, bloquear: 4 },
  paciente:  { cambiarTactica: 3, rollback: 5, investigar: 7, bloquear: 9 },
};

export type AccionRecuperacion =
  | "continuar" | "cambiar_tactica" | "rollback" | "investigar_arquitectura" | "bloquear";

export interface DecisionRecuperacion {
  accion: AccionRecuperacion;
  nivel: NivelReparacion;
  repeticiones: number;
  /** true si es la MISMA estrategia repetida (no solo el mismo error). */
  mismaEstrategia: boolean;
  razon: string;
  estrategia: EstrategiaNivel;
}

// Memoria de módulo: cuántas veces vimos cada firma de tarea y de enfoque.
const conteoTarea = new Map<string, number>();
const conteoEnfoque = new Map<string, number>();

/**
 * Registra un intento y DECIDE la recuperación. Aquí está el salto pedido: no
 * solo cuenta — devuelve la acción que cambia el rumbo, con su nivel de escalera.
 */
export function registrarYdecidir(t: DescriptorTarea, perfil: keyof typeof PERFILES | UmbralesRecuperacion = "base"): DecisionRecuperacion {
  const u = typeof perfil === "string" ? (PERFILES[perfil] ?? PERFILES.base) : perfil;
  const fT = firmaTarea(t);
  const fE = firmaEnfoque(t);
  const nT = (conteoTarea.get(fT) ?? 0) + 1;
  const nE = (conteoEnfoque.get(fE) ?? 0) + 1;
  conteoTarea.set(fT, nT);
  conteoEnfoque.set(fE, nE);
  // «misma estrategia»: el enfoque (sin estrategia) se repitió igual o más que la
  // tarea exacta — es decir, insistimos en el mismo problema cambiando poco.
  const mismaEstrategia = nE >= nT && nE >= u.cambiarTactica;
  const rep = nE;
  let accion: AccionRecuperacion;
  let nivel: NivelReparacion;
  if (rep >= u.bloquear) { accion = "bloquear"; nivel = 4; }
  else if (rep >= u.investigar) { accion = "investigar_arquitectura"; nivel = 3; }
  else if (rep >= u.rollback) { accion = "rollback"; nivel = 2; }
  else if (rep >= u.cambiarTactica) { accion = "cambiar_tactica"; nivel = 1; }
  else { accion = "continuar"; nivel = 0; }
  const razon = accion === "continuar"
    ? `primer intento sobre este enfoque (rep ${rep}): corrección local`
    : `el enfoque se repitió ${rep} veces — §17 exige ${accion.replace(/_/g, " ")} (no la ${rep + 1}ª variante del mismo parche)`;
  return { accion, nivel, repeticiones: rep, mismaEstrategia, razon, estrategia: ESCALERA[nivel] };
}

/** El bloqueo honesto (§5 nivel 4): el parte que va al humano. */
export interface ParteBloqueo {
  causa: string;
  evidencia: string;
  estrategiasProbadas: string[];
  alternativas: string[];
  decisionRequerida: string;
}

export function formatearBloqueo(p: ParteBloqueo): string {
  return [
    "BLOQUEADO (motorRecuperacion v1.35.0 · §5 nivel 4):",
    `  causa: ${p.causa}`,
    `  evidencia: ${p.evidencia}`,
    `  estrategias probadas: ${p.estrategiasProbadas.join(" · ") || "(ninguna registrada)"}`,
    `  alternativas: ${p.alternativas.join(" · ") || "(a proponer)"}`,
    `  decisión requerida: ${p.decisionRequerida}`,
  ].join("\n");
}

/** La directiva que el juez inyecta con la decisión de recuperación. */
export function directivaDeRecuperacion(d: DecisionRecuperacion): string {
  const e = d.estrategia;
  const partes = [`RECUPERACIÓN (v1.35.0 · §5/§17): ${d.accion.toUpperCase()} — ${d.razon}`];
  partes.push(`  escalera nivel ${e.nivel} (${e.nombre}): ${e.pasos.map((p, i) => `${i + 1}) ${p}`).join(" · ")}`);
  if (e.prohibiciones.length) partes.push("  PROHIBIDO: " + e.prohibiciones.join(" · "));
  if (d.mismaEstrategia) partes.push("  ALERTA §17: MISMA ESTRATEGIA repetida — STOP + CHANGE_STRATEGY, no otra redacción del mismo intento.");
  return partes.join("\n");
}

/** Pruebas y arranque limpio: vacía los conteos (un turno, una memoria). */
export function reiniciarRecuperacion(): void {
  conteoTarea.clear();
  conteoEnfoque.clear();
}

/** Solo lectura para tests/panel. */
export function verConteos(): { tareas: number; enfoques: number } {
  return { tareas: conteoTarea.size, enfoques: conteoEnfoque.size };
}

