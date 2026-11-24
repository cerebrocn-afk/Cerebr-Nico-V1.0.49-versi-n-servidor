/**
 * admisionRam.ts — v1.56.4 · ADMISIÓN POR RAM ANTES DE CARGAR UN MODELO LOCAL
 * ============================================================================
 * RAÍZ del problema que reportó Mario (Dell E6430, 8 GB, sin GPU):
 *   elegía a mano un modelo local y la IDE lo mandaba a cargar aunque NO cupiera
 *   en la RAM libre. Resultado: Ollama tiraba de swap, la primera palabra tardaba
 *   minutos y a veces colgaba la PC. El watchdog (180 s) solo CORTABA el síntoma
 *   tarde; nunca evitaba la causa.
 *
 * Este módulo NO carga nada ni habla con la red: es una función PURA que, dado el
 * tamaño del modelo (el que Ollama ya reporta en /api/tags -> models[].size) y la
 * RAM libre/total de la máquina, decide un veredicto honesto ANTES de enviar:
 *
 *   · "ok"     → cabe con holgura, adelante sin ruido.
 *   · "justo"  → cabe pero al límite: va a ir lento / puede tocar swap. Se avisa
 *               y se sugiere expulsar lo residente, pero NO se bloquea.
 *   · "riesgo" → no cabe: cargarlo va a ahogar la máquina. Se avisa fuerte y se
 *               sugiere un modelo más chico o expulsar; `admite=false` para que
 *               la UI pueda pintarlo en rojo. Sigue SIN ser un bloqueo duro: la
 *               decisión final es del usuario (misma filosofía que preflightLocal).
 *
 * POR QUÉ ESTOS NÚMEROS (justificación del umbral, pedida por el usuario):
 *   - `OVERHEAD_RUNTIME_GB = 1.0`: con la IDE arriba (servidor Node + puente
 *     Python :5000 + memoria :5100 + creador :5102 + navegador) ya hay ~1 GB
 *     comprometido antes de cargar el modelo. Medido en el log real de Mario:
 *     qwen3.5:4b (archivo ~2.6 GB) quedó residente en 2.95 GB → el extra sobre el
 *     archivo (KV-cache + runtime de Ollama) ronda +0.3–0.4 GB, que aquí se
 *     absorbe dentro del colchón de holgura.
 *   - `HOLGURA_OK_GB = 1.0`: por encima de «justo» hace falta margen para que el
 *     SO y el navegador no empujen el modelo a swap a media respuesta.
 *   Subir/bajar estos valores cambia cuándo salta el aviso; se dejan nombrados y
 *   justificados aquí, no como números sueltos repartidos por el código.
 */

export type NivelAdmision = "ok" | "justo" | "riesgo";

export interface AdmisionRam {
  nivel: NivelAdmision;
  /** `false` solo en "riesgo": seña para que la UI avise fuerte. No es bloqueo duro. */
  admite: boolean;
  mensaje: string;
  sugerencia?: string;
  ramLibreGb: number;
  requeridoGb: number;
}

export interface EntradaAdmision {
  ramLibreGb: number;
  ramTotalGb: number;
  /** Tamaño del modelo en bytes (Ollama lo da en /api/tags). 0/desconocido => no se opina. */
  tamModeloBytes: number;
  /** Nombre, solo para el texto del aviso. */
  modelo?: string;
}

/** Colchón ya comprometido por la propia IDE (ver justificación en la cabecera). */
export const OVERHEAD_RUNTIME_GB = 1.0;
/** Margen libre que se exige por encima de «justo» para considerarlo «ok». */
export const HOLGURA_OK_GB = 1.0;

const GB = 1024 * 1024 * 1024;

/** Bytes → GiB con dos decimales, nunca negativo. */
export function gbDesdeBytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / GB) * 100) / 100;
}

/**
 * RAM que, de forma realista, va a querer el modelo una vez cargado:
 * tamaño del archivo de pesos + el colchón de runtime ya comprometido.
 */
export function estimarRequeridoGb(tamModeloBytes: number, overheadGb = OVERHEAD_RUNTIME_GB): number {
  const modeloGb = gbDesdeBytes(tamModeloBytes);
  if (modeloGb <= 0) return 0;
  return Math.round((modeloGb + overheadGb) * 100) / 100;
}

/**
 * Veredicto de admisión. PURO: no toca red, disco ni procesos.
 * Si no se conoce el tamaño del modelo, devuelve "ok" sin inventar (no se opina
 * sobre lo que no se puede medir, igual que hace el preflight de existencia).
 */
export function evaluarAdmisionRam(e: EntradaAdmision): AdmisionRam {
  const nombre = e.modelo ? `"${e.modelo}"` : "el modelo";
  const requeridoGb = estimarRequeridoGb(e.tamModeloBytes);
  const libre = Math.max(0, Math.round((e.ramLibreGb || 0) * 100) / 100);

  if (requeridoGb <= 0) {
    return {
      nivel: "ok",
      admite: true,
      mensaje: `No se pudo medir el tamaño de ${nombre}; se procede sin estimar RAM.`,
      ramLibreGb: libre,
      requeridoGb: 0,
    };
  }

  if (libre >= requeridoGb + HOLGURA_OK_GB) {
    return {
      nivel: "ok",
      admite: true,
      mensaje: `${nombre} cabe con holgura (necesita ≈${requeridoGb} GB, libres ${libre} GB).`,
      ramLibreGb: libre,
      requeridoGb,
    };
  }

  if (libre >= requeridoGb) {
    return {
      nivel: "justo",
      admite: true,
      mensaje:
        `⚠️ ${nombre} entra JUSTO en RAM (necesita ≈${requeridoGb} GB, libres ${libre} GB). ` +
        `Puede ir lento o tocar swap en la primera respuesta.`,
      sugerencia:
        `Para que vaya fino: usa el botón Expulsar (pestaña Puertos) para liberar lo residente, ` +
        `o cierra el navegador pesado antes de pedirle.`,
      ramLibreGb: libre,
      requeridoGb,
    };
  }

  return {
    nivel: "riesgo",
    admite: false,
    mensaje:
      `⛔ ${nombre} NO cabe en la RAM libre (necesita ≈${requeridoGb} GB, libres ${libre} GB). ` +
      `Cargarlo ahora va a ahogar la máquina (swap) y la primera palabra puede tardar minutos.`,
    sugerencia:
      `Mejor: expulsa lo residente (botón Expulsar / \`ollama_expulsar\`) o elige un modelo más chico ` +
      `(p. ej. gemma3:270m o qwen2.5:0.5b). Para trabajo intenso, GLM-4.7-Flash (Z.ai) no gasta tu RAM.`,
    ramLibreGb: libre,
    requeridoGb,
  };
}
