/**
 * gobernante.ts — EL GOBERNADOR EN TODAS PARTES (v1.82.0 · FASE 3 del plano)
 * =========================================================================
 * QUÉ CIERRA: el «a propósito» de v1.76.0 — `parallel_workers` medía 4 en una
 * máquina de 4 núcleos cuando el valor esperaba 8, y la recomendación del
 * gobernante se QUEDABA en consejo: nadie la aplicaba. El plano (FASE 3) pide
 * que la máquina mande, no el número fijo:
 *
 *   1. `workersAdaptativos(cores)` = clamp(2, cores-1, 8), medido en runtime.
 *      Máquina nueva → sin tocar nada: 2/4/8/16 núcleos → 2/3/7/8 workers.
 *   2. `presionSostenida(ram)` + la regla del 70 %: si la RAM usada supera el
 *      70 % de forma SOSTENIDA (3 de las últimas 5 muestras), se degrada a 1
 *      worker y se avisa — no se muere. Un pico suelto (abrir un PDF, un
 *      instalador) no degrada nada: la palabra del plano es «sostenido».
 *
 * PUREZA: sin fs, sin red, sin reloj, sin estado global. Las muestras las trae
 * el llamante (el `PlanRunner` las acumula de su `medir()`; los tests las
 * simulan). Por eso la suite `gobernante.test.ts` puede congelar la tabla
 * completa sin encender una máquina.
 *
 * CONVIVENCIA: si la capacidad `parallel_workers` está APAGADA, este módulo
 * devuelve la base vieja del perfil: nadie cambia el comportamiento de una
 * máquina sin permiso. El resolutor de presupuesto (`memoriaResiliente`) sigue
 * mandando sobre el resultado — sus topes de RAM libre y núcleos no se saltean.
 */

export const UMBRAL_RAM = 0.7;
export const VENTANA_RAM = 5;
export const MINIMOS_SOBRE_UMBRAL = 3;

/** clamp(2, cores-1, 8): el número del plano, en una línea y probado. */
export function workersAdaptativos(cores: number): number {
  const c = Math.max(1, Math.floor(Number(cores) || 1));
  return Math.min(8, Math.max(2, c - 1));
}

/**
 * ¿La presión de RAM es SOSTENIDA? Compara las últimas `VENTANA_RAM` muestras
 * (fracción usada 0..1; la más reciente al final). Con menos de
 * `MINIMOS_SOBRE_UMBRAL` muestras NO se degrada: un historial corto no prueba
 * nada, y la casa no castiga con datos que no tiene.
 */
export function presionSostenida(
  muestras: number[],
  opts?: { umbral?: number; ventana?: number; minimos?: number }
): { sostenida: boolean; sobreUmbral: number; ventana: number } {
  const umbral = opts?.umbral ?? UMBRAL_RAM;
  const ventana = Math.max(1, opts?.ventana ?? VENTANA_RAM);
  const minimos = Math.max(1, opts?.minimos ?? MINIMOS_SOBRE_UMBRAL);
  const ultimas = (muestras || []).filter((x) => Number.isFinite(x)).slice(-ventana);
  const sobreUmbral = ultimas.filter((x) => x > umbral).length;
  return { sostenida: sobreUmbral >= minimos, sobreUmbral, ventana: ultimas.length };
}

export interface EntradaGobernante {
  /** Núcleos MEDIDOS (os.cpus().length del llamante). */
  cores: number;
  /** Fracción de RAM usada, más reciente al final. Vacío = sin historial. */
  muestrasRam?: number[];
  /** Capacidad `parallel_workers` del panel: el usuario manda. */
  paralelismoActivo: boolean;
  /** La base vieja del tramo MR (perfil.cpuBase): se respeta si la capacidad está apagada. */
  cpuBasePerfil: number;
}

export interface DecisionGobernante {
  /** Base de tareas de cálculo a la vez que ve el resolutor de presupuesto. */
  cpuBase: number;
  /** true cuando la base viene del governor y no del perfil fijo. */
  adaptado: boolean;
  /** true cuando la presión de RAM sostuvo > umbral y se bajó a 1 worker. */
  degradadoPorRam: boolean;
  /** Una línea legible: se avisa AL cambiar, no en cada medición. */
  motivo: string;
}

/**
 * La decisión del gobernante: cuántos workers de cálculo corresponden AHORA a
 * esta máquina. No aplica topes de RAM libre ni escalado — eso lo hace
 * `resolverPresupuesto` sobre esta base; gobernar no es pisar al vecino.
 */
export function decisionGobernante(i: EntradaGobernante): DecisionGobernante {
  const base = i.paralelismoActivo ? workersAdaptativos(i.cores) : Math.max(1, Math.floor(i.cpuBasePerfil || 1));
  const adaptado = i.paralelismoActivo === true;
  const presion = presionSostenida(i.muestrasRam || []);
  if (presion.sostenida) {
    return {
      cpuBase: 1,
      adaptado,
      degradadoPorRam: true,
      motivo: `🌡 RAM por encima del ${Math.round(UMBRAL_RAM * 100)} % sostenido (${presion.sobreUmbral}/${presion.ventana} muestras): degradado a 1 worker. No se muere; afloja.`,
    };
  }
  const motivo = adaptado
    ? `Workers adaptativos: ${base} (núcleos ${Math.max(1, Math.floor(i.cores || 1))} − 1, techo 8). La constante ya no manda.`
    : "";
  return { cpuBase: base, adaptado, degradadoPorRam: false, motivo };
}
