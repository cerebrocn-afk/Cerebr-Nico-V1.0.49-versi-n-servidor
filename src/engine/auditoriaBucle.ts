/**
 * auditoriaBucle.ts — EL LIBRO DE ACTAS DEL BUCLE DE CORRECCIÓN (v1.28.0 · Tarea 3)
 * ================================================================================
 * El bucle autónomo (bucleAutonomo.ts) DECIDE en cada paso: continuar sin que se
 * lo pidan, escalar la reparación, o cerrar. Esas decisiones se veían de refilón
 * en el log del terminal ("🔁 sigo sin que me lo pidas") y desaparecían: no había
 * forma de AUDITAR después por qué un turno dio nueve vueltas, en qué escalón de
 * reparación se quedó, o qué herramienta fue la que no cedía.
 *
 * Este módulo es ese libro de actas: una capa PURA que recibe cada `Decision` del
 * juez del bucle y la anota como una entrada estructurada. Después se puede
 * resumir (cuántas continuaciones, en qué fases, escalón máximo, qué herramientas
 * fallaron) y formatear para leerlo. Lo que no se anota no se puede auditar; lo
 * que no se puede auditar, en este proyecto, no se puede afirmar.
 *
 * No toca red, ni disco, ni reloj del sistema salvo por el `ts` inyectable (para
 * poder probar sin depender de la hora). Es lógica pura y se prueba entera
 * (tests/auditoriaBucle.test.ts).
 */

import type { Decision, FaseBucle } from "./bucleAutonomo";

/** Una línea del acta: qué decidió el juez en un paso, y por qué. */
export interface EntradaAuditoria {
  /** Paso del bucle (0-based, como el `for`). */
  paso: number;
  accion: "continuar" | "cerrar";
  /** Solo en "continuar": en qué fase iba el turno. */
  fase?: FaseBucle;
  /** Solo en "continuar": el escalón de reparación (0..3). */
  escalon?: number;
  /** El motivo textual que dio el juez. */
  motivo: string;
  /** La herramienta cuyo último fallo motivó la reparación, si la hubo. */
  herramientaFallo?: string;
  /** Marca de tiempo (inyectable en pruebas). */
  ts: number;
}

export interface RegistroAuditoria {
  /** Id del turno auditado (el id de la petición o del plan). */
  turnoId: string;
  abiertoEn: number;
  entradas: EntradaAuditoria[];
}

/** Tope de entradas por registro: un turno desbocado no se come la memoria. */
export const MAX_ENTRADAS = 500;

/** Abre un acta nueva para un turno. */
export function crearRegistro(turnoId: string, ahora: number = Date.now()): RegistroAuditoria {
  return { turnoId: String(turnoId || "turno"), abiertoEn: ahora, entradas: [] };
}

/**
 * Anota una decisión del juez del bucle. MUTA el registro (append) y devuelve la
 * entrada creada, para que el que llama pueda registrarla también en su log.
 *
 * El `ts` se inyecta (por defecto `Date.now()`) para que las pruebas no dependan
 * del reloj. Si se supera el tope, se descarta la entrada MÁS ANTIGUA: el final
 * de un turno largo (donde se decide cerrar) es más útil que su arranque.
 */
export function registrarDecision(
  reg: RegistroAuditoria,
  paso: number,
  decision: Decision,
  extra?: { herramientaFallo?: string; ts?: number }
): EntradaAuditoria {
  const entrada: EntradaAuditoria =
    decision.accion === "continuar"
      ? {
          paso,
          accion: "continuar",
          fase: decision.fase,
          escalon: decision.escalon,
          motivo: decision.motivo,
          herramientaFallo: extra?.herramientaFallo,
          ts: extra?.ts ?? Date.now(),
        }
      : {
          paso,
          accion: "cerrar",
          motivo: decision.motivo,
          ts: extra?.ts ?? Date.now(),
        };

  reg.entradas.push(entrada);
  if (reg.entradas.length > MAX_ENTRADAS) {
    reg.entradas.splice(0, reg.entradas.length - MAX_ENTRADAS);
  }
  return entrada;
}

export interface ResumenAuditoria {
  pasos: number;
  continuaciones: number;
  cierres: number;
  /** Conteo por fase (solo de las continuaciones, que son las que tienen fase). */
  porFase: Record<FaseBucle, number>;
  /** Conteo por escalón de reparación 0..3. */
  porEscalon: Record<number, number>;
  /** Cuántas entradas fueron reparación de verdad (fase "reparar" o escalón>0). */
  reparaciones: number;
  /** El escalón más alto al que llegó el turno (0 si nunca reparó). */
  escalonMaximo: number;
  /** Herramientas que motivaron una reparación, con cuántas veces. */
  herramientasQueFallaron: Record<string, number>;
}

/**
 * El agregado honesto del acta: cuántas vueltas, de qué tipo, hasta qué escalón
 * y qué herramientas fueron el problema. Puro sobre el registro.
 */
export function resumenAuditoria(reg: RegistroAuditoria): ResumenAuditoria {
  const porFase: Record<FaseBucle, number> = { crear: 0, modificar: 0, reparar: 0 };
  const porEscalon: Record<number, number> = {};
  const herramientasQueFallaron: Record<string, number> = {};
  let continuaciones = 0;
  let cierres = 0;
  let reparaciones = 0;
  let escalonMaximo = 0;

  for (const e of reg.entradas) {
    if (e.accion === "cerrar") {
      cierres += 1;
      continue;
    }
    continuaciones += 1;
    if (e.fase) porFase[e.fase] += 1;
    const esc = e.escalon ?? 0;
    porEscalon[esc] = (porEscalon[esc] || 0) + 1;
    if (esc > escalonMaximo) escalonMaximo = esc;
    if (e.fase === "reparar" || esc > 0) {
      reparaciones += 1;
      if (e.herramientaFallo) {
        herramientasQueFallaron[e.herramientaFallo] = (herramientasQueFallaron[e.herramientaFallo] || 0) + 1;
      }
    }
  }

  return {
    pasos: reg.entradas.length,
    continuaciones,
    cierres,
    porFase,
    porEscalon,
    reparaciones,
    escalonMaximo,
    herramientasQueFallaron,
  };
}

/** ¿Este turno tuvo que reparar algo? (una pregunta que se hace mucho). */
export function huboReparacion(reg: RegistroAuditoria): boolean {
  return reg.entradas.some((e) => e.accion === "continuar" && (e.fase === "reparar" || (e.escalon ?? 0) > 0));
}

/**
 * HERRAMIENTA ATASCADA: la que falla EN SEGUIDA, no la que suma (v1.58.5 · C3).
 * `herramientasQueFallaron` cuenta el total acumulado; pero un bucle de verdad
 * improductivo se reconoce por la MISMA herramienta cayendo `umbral` veces
 * SEGUIDAS. Esta función recorre el acta en orden y devuelve el nombre de la
 * primera herramienta que encadena `umbral` fallos consecutivos (una reparación
 * con otra herramienta, o un cierre, cortan la racha). Devuelve `null` si nadie
 * se atasca. Puro sobre el registro: es la señal para retirar esa herramienta o
 * escalar, en vez de seguir dando vueltas.
 */
export function herramientaAtascada(reg: RegistroAuditoria, umbral = 3): string | null {
  const tope = Math.max(1, Math.floor(umbral));
  let actual: string | null = null;
  let racha = 0;
  for (const e of reg.entradas) {
    const esReparacion = e.accion === "continuar" && (e.fase === "reparar" || (e.escalon ?? 0) > 0);
    const tool = esReparacion ? e.herramientaFallo : undefined;
    if (!tool) {
      actual = null;
      racha = 0;
      continue;
    }
    if (tool === actual) {
      racha += 1;
    } else {
      actual = tool;
      racha = 1;
    }
    if (racha >= tope) return tool;
  }
  return null;
}

/**
 * El acta en texto, para leerla en el registro o en el panel. Determinista: la
 * misma entrada siempre produce la misma línea. No inventa hora legible si no
 * hay `abiertoEn` útil — usa el delta en ms desde que se abrió el acta, que es
 * lo que de verdad importa para auditar la duración de un bucle.
 */
export function formatearAuditoria(reg: RegistroAuditoria): string {
  const r = resumenAuditoria(reg);
  const cabecera =
    `—— Acta del bucle «${reg.turnoId}» ——\n` +
    `${r.pasos} decisión/es · ${r.continuaciones} continuación/es · ${r.cierres} cierre/s · ` +
    `${r.reparaciones} reparación/es (escalón máx ${r.escalonMaximo}) · ` +
    `fases c:${r.porFase.crear}/m:${r.porFase.modificar}/r:${r.porFase.reparar}`;

  const lineas = reg.entradas.map((e) => {
    const delta = Math.max(0, e.ts - reg.abiertoEn);
    const cab = `  [+${delta}ms] paso ${e.paso}`;
    if (e.accion === "cerrar") return `${cab} · CERRAR — ${e.motivo}`;
    const esc = (e.escalon ?? 0) > 0 ? ` · escalón ${e.escalon}` : "";
    const tool = e.herramientaFallo ? ` · falló ${e.herramientaFallo}` : "";
    return `${cab} · CONTINUAR [${e.fase}${esc}]${tool} — ${e.motivo}`;
  });

  const cola = Object.keys(r.herramientasQueFallaron).length
    ? "\nHerramientas que fallaron: " +
      Object.entries(r.herramientasQueFallaron)
        .map(([k, v]) => `${k}×${v}`)
        .join(", ")
    : "";

  return `${cabecera}\n${lineas.join("\n")}${cola}`;
}
