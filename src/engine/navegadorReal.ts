/**
 * navegadorReal.ts — EL AGENTE DE NAVEGADOR QUE NO MIENTE (v1.37.0 · FASE 7)
 * =====================================================================================
 * QUÉ CURA: la hoja de ruta (§7) promete un "navegador real" — abrir una URL,
 * leer el DOM, hacer clic, escribir, esperar y capturar. El defecto a evitar es
 * el de siempre en agentes: PROMETER capacidad de navegador cuando el runtime
 * no tiene Playwright/Puppeteer instalado, y devolver resultados INVENTADOS
 * ("hice clic en Login") sin haber tocado nada. Aquí la mecánica es honesta:
 *   · si el motor de navegador NO está disponible, el plan de acciones se marca
 *     DEGRADADO y cada paso declara por qué no puede ejecutarse — nunca finge.
 *   · si SÍ está disponible (inyectado), el plan es EJECUTABLE y valida cada
 *     acción ANTES de lanzarla (selector no vacío, URL http(s), timeouts sanos).
 *
 * FUENTE ÚNICA: no reimplementa un navegador. Define el CONTRATO (interfaz
 * BrowserDriver) y un planificador PURO de acciones. El driver real se inyecta
 * desde fuera (server), este módulo solo decide qué es válido y qué no.
 * PURO: recibe datos, devuelve datos. Sin efectos, sin red propia.
 */

// ══════════════════════════════════════════════════════
// CONTRATO DEL DRIVER (se inyecta; aquí solo la forma)
// ══════════════════════════════════════════════════════

export type TipoAccion = "ir" | "clic" | "escribir" | "esperar" | "leer" | "captura";

export interface AccionNavegador {
  tipo: TipoAccion;
  url?: string;
  selector?: string;
  texto?: string;
  timeoutMs?: number;
}

/** El motor real (Playwright/Puppeteer) implementa esto; se inyecta desde fuera. */
export interface BrowserDriver {
  disponible: boolean;
  motor: string; // "playwright" | "puppeteer" | ""
}

export interface PasoPlan {
  accion: AccionNavegador;
  ejecutable: boolean;
  motivo: string;
}

export interface PlanNavegacion {
  degradado: boolean;      // true si no hay driver: nada se puede ejecutar
  motor: string;
  pasos: PasoPlan[];
  ejecutables: number;
  bloqueados: number;
  parte: string;
}

const RE_URL = /^https?:\/\/[^\s]+$/i;
const TIMEOUT_MIN = 100;
const TIMEOUT_MAX = 120_000;
const TIMEOUT_DEF = 30_000;

/** Valida UNA acción de forma pura. No ejecuta nada. */
export function validarAccion(a: AccionNavegador): { ok: boolean; motivo: string } {
  if (!a || !a.tipo) return { ok: false, motivo: "acción sin tipo" };
  const t = a.timeoutMs;
  if (t != null && (typeof t !== "number" || t < TIMEOUT_MIN || t > TIMEOUT_MAX))
    return { ok: false, motivo: `timeout fuera de rango [${TIMEOUT_MIN}–${TIMEOUT_MAX}]ms` };
  switch (a.tipo) {
    case "ir":
      if (!a.url || !RE_URL.test(a.url)) return { ok: false, motivo: "URL debe ser http(s):// válida" };
      return { ok: true, motivo: "navegar a " + a.url };
    case "clic":
      if (!a.selector || !a.selector.trim()) return { ok: false, motivo: "clic sin selector" };
      return { ok: true, motivo: "clic en " + a.selector };
    case "escribir":
      if (!a.selector || !a.selector.trim()) return { ok: false, motivo: "escribir sin selector" };
      if (a.texto == null) return { ok: false, motivo: "escribir sin texto" };
      return { ok: true, motivo: `escribir en ${a.selector}` };
    case "esperar":
      if (!a.selector && a.timeoutMs == null) return { ok: false, motivo: "esperar sin selector ni timeout" };
      return { ok: true, motivo: a.selector ? "esperar selector " + a.selector : `esperar ${a.timeoutMs}ms` };
    case "leer":
      if (!a.selector || !a.selector.trim()) return { ok: false, motivo: "leer sin selector" };
      return { ok: true, motivo: "leer DOM de " + a.selector };
    case "captura":
      return { ok: true, motivo: "captura de pantalla" };
    default:
      return { ok: false, motivo: "tipo de acción desconocido: " + a.tipo };
  }
}

/**
 * Planifica una secuencia de acciones contra el driver dado. Si el driver NO
 * está disponible, TODO el plan queda degradado y ningún paso es ejecutable:
 * la honestidad es no fingir. Si SÍ, cada paso hereda su validez pura.
 */
export function planificarNavegacion(acciones: AccionNavegador[], driver: BrowserDriver): PlanNavegacion {
  const lista = Array.isArray(acciones) ? acciones : [];
  const hayMotor = !!(driver && driver.disponible && driver.motor);
  const pasos: PasoPlan[] = lista.map((a) => {
    const v = validarAccion(a);
    if (!hayMotor)
      return { accion: a, ejecutable: false, motivo: "sin motor de navegador instalado — no se ejecuta (degradado honesto)" };
    return { accion: a, ejecutable: v.ok, motivo: v.motivo };
  });
  const ejecutables = pasos.filter((p) => p.ejecutable).length;
  const bloqueados = pasos.length - ejecutables;
  const motor = hayMotor ? driver.motor : "";
  const parte = hayMotor
    ? `Navegador ${motor}: ${ejecutables} paso(s) ejecutable(s), ${bloqueados} bloqueado(s).`
    : `Sin navegador real disponible: ${pasos.length} paso(s) NO se ejecutan. Instala Playwright para habilitarlo.`;
  return { degradado: !hayMotor, motor, pasos, ejecutables, bloqueados, parte };
}

/** Normaliza el timeout de una acción al valor por defecto si falta. */
export function timeoutEfectivo(a: AccionNavegador): number {
  return a && typeof a.timeoutMs === "number" ? a.timeoutMs : TIMEOUT_DEF;
}
