/**
 * ejecucionEspeculativa.ts — ADELANTAR PASOS MIENTRAS EL MODELO AÚN DECIDE (v1.53.8)
 * ====================================================================================
 * PASO 4 de la HOJA DE RUTA v1.54 (capacidad · riesgo ALTO). Depende del PASO 3
 * (ciclo real) estable y, sobre todo, de la mitigación OBLIGATORIA que el propio
 * roadmap exige: NADA especulativo toca el mundo real sin pasar por una
 * TRANSACCIÓN (rollback atómico) y sin un PRESUPUESTO que lo acote y lo pueda
 * CANCELAR. Este módulo es esa mecánica — PURA y testeable sin modelo ni red.
 *
 * EL PROBLEMA (de raíz): mientras el modelo «piensa» cuál es el próximo paso, la
 * máquina está OCIOSA. Se podrían ir adelantando los candidatos más probables.
 * Pero hacerlo «a pelo» es peligrosísimo: dos problemas que el proyecto ya
 * conoce —«consumo DOBLE de tokens» y «commits a medias si se aborta»— arruinarían
 * la billetera y dejarían el árbol a mitad. Por eso aquí:
 *
 *   1) PRESUPUESTO (seleccionarCandidatos): sólo se especulan las ramas que caben
 *      — tope de ramas, tope de tokens POR rama (un intento caro NO se dispara,
 *      mismo criterio que presupuestoReparacion) y tope de tokens TOTAL. Lo que
 *      no cabe se descarta con motivo HONESTO.
 *   2) AISLAMIENTO: cada rama corre sobre su PROPIO clon del mundo, dentro de una
 *      `capaTransaccion` (fuente única — no se reimplementa). Las ramas no se ven
 *      entre sí y el mundo real no se toca.
 *   3) CANCELACIÓN: en cuanto el modelo decide, las ramas que no sean la elegida
 *      se cancelan (señal) y se REVIERTEN.
 *   4) RECONCILIACIÓN ATÓMICA (reconciliar): si la decisión real coincide con una
 *      rama LISTA y sana, se REUTILIZA su trabajo (ahorro de tokens) y se compromete
 *      sobre el mundo real en UNA transacción (si el commit falla, se revierte: NADA
 *      a medias). Si no coincide, o la rama no quedó lista, o el modelo no eligió
 *      nada (replan) → se revierte TODO y la ruta real ejecuta el paso.
 *
 * PUREZA Y HONESTIDAD: la lógica de decisión (presupuesto, selección, reconcilia-
 * ción, cancelación, parte) y el orquestador `ejecutarEspeculativo` son PUROS
 * respecto al SO: no hay modelo, ni red, ni disco, ni reloj. El ejecutor de una
 * rama es un LANZADOR INYECTABLE y la decisión real llega por una función inyectada
 * — por eso el harness .mjs lo prueba entero en Node v16 con ramas SIMULADAS.
 * El COMPORTAMIENTO ESPECULATIVO REAL (lanzar de verdad al modelo/herramientas en
 * paralelo a su propia decisión, con concurrencia real) queda SIN VERIFICAR en el
 * entorno dev y debe correrlo Mario end-to-end en su máquina.
 *
 * CABLE MÍNIMO (NO toca server.ts — trinquete; NO se inserta en planRunner.ts a
 * ciegas). Para engancharlo, el `PlanRunner` puede, en el hueco en que espera la
 * decisión del modelo para el próximo paso, llamar:
 *     import { ejecutarEspeculativo } from "./ejecucionEspeculativa";
 *     const r = await ejecutarEspeculativo({ candidatos, mundo, lanzador, decidir, presupuesto });
 *     // si r.reconciliacion.reutilizado → el paso ya está hecho (ahorro r.reconciliacion.ahorroTokens)
 * donde `mundo` es el mapa ruta→texto que ya maneja capaTransaccion. Mientras ese
 * cable no exista, el módulo es HUÉRFANO a propósito (probado, no cableado) — lo
 * correcto para una capacidad de riesgo ALTO: primero la mecánica segura y probada.
 */

import { iniciar, aplicar, confirmar, revertir, type Transaccion, type Parche } from "./capaTransaccion";

// ──────────────────────────────────────────────────────────────
// PRESUPUESTO
// ──────────────────────────────────────────────────────────────

/** Límites por defecto de la especulación (conservadores: la billetera primero). */
export const DEFECTOS = { maxRamas: 2, tokensPorRama: 40_000, tokensTotal: 60_000 };

export interface PresupuestoEspeculativo {
  /** cuántas ramas como mucho se especulan a la vez. */
  maxRamas: number;
  /** tope de tokens de UNA rama: por encima, no se especula (intento caro). */
  tokensPorRama: number;
  /** tope de tokens de TODAS las ramas juntas. */
  tokensTotal: number;
}

/** Normaliza un presupuesto parcial a enteros ≥1, cayendo a DEFECTOS. */
function normalizarPresupuesto(p?: Partial<PresupuestoEspeculativo>): PresupuestoEspeculativo {
  const base = p || {};
  return {
    maxRamas: Math.max(1, Math.floor(base.maxRamas ?? DEFECTOS.maxRamas)),
    tokensPorRama: Math.max(1, Math.floor(base.tokensPorRama ?? DEFECTOS.tokensPorRama)),
    tokensTotal: Math.max(1, Math.floor(base.tokensTotal ?? DEFECTOS.tokensTotal)),
  };
}

// ──────────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────────

/** Un candidato a adelantar: el próximo paso que el modelo PODRÍA elegir. */
export interface CandidatoEspeculativo {
  id: string;
  titulo: string;
  /** probabilidad estimada 0..1 de que el modelo elija este paso (para priorizar). */
  probabilidad: number;
  /** tokens que se prevé consumirá adelantarlo. */
  tokensEstimados: number;
}

/** Señal de cancelación pura (sin AbortController: testeable en Node v16 plano). */
export interface SenalEspeculativa { cancelada: boolean; }

/** Lo que el lanzador devuelve tras adelantar una rama. */
export interface ResultadoEspeculacion {
  ok: boolean;
  /** cambios propuestos (ruta→texto|null) a aplicar si esta rama gana. */
  parches: Parche[];
  tokensAprox: number;
  resumen: string;
}

/** Ejecuta UNA rama especulativa. Inyectable ⇒ testeable sin modelo ni red. */
export type LanzadorEspeculativo = (candidato: CandidatoEspeculativo, senal: SenalEspeculativa) => Promise<ResultadoEspeculacion>;

export type EstadoRama = "en_curso" | "lista" | "cancelada" | "revertida" | "comprometida";

/** Una rama especulativa viva: su transacción, su clon del mundo y su señal. */
export interface RamaEspeculativa {
  id: string;
  titulo: string;
  tx: Transaccion;
  mundoRama: Map<string, string>;
  senal: SenalEspeculativa;
  estado: EstadoRama;
  tokensGastados: number;
  parches: Parche[];
  resultado?: ResultadoEspeculacion;
  motivo?: string;
}

export interface SeleccionEspeculativa {
  elegidos: CandidatoEspeculativo[];
  descartados: Array<{ id: string; motivo: string }>;
  tokensComprometidos: number;
  presupuesto: PresupuestoEspeculativo;
  motivo: string;
}

export interface ReconciliacionEspeculativa {
  /** rama a comprometer sobre el mundo real, o null si no se reutiliza nada. */
  aplicar: string | null;
  /** ramas a revertir (todo lo no comprometido). */
  revertir: string[];
  reutilizado: boolean;
  ahorroTokens: number;
  motivo: string;
}

export interface ResultadoCicloEspeculativo {
  mundo: Map<string, string>;
  decisionReal: string | null;
  seleccion: SeleccionEspeculativa;
  reconciliacion: ReconciliacionEspeculativa;
  ramas: RamaEspeculativa[];
  parte: string;
}

// ──────────────────────────────────────────────────────────────
// LÓGICA PURA — testeable sin SO
// ──────────────────────────────────────────────────────────────

/** ¿Conviene especular AHORA? Sólo si no hay decisión y queda presupuesto/ramas. */
export function debeEspecular(estado: { decidido: boolean; saldoTokens: number; ramasActivas: number; maxRamas?: number }): boolean {
  if (!estado) return false;
  if (estado.decidido) return false; // ya hay decisión: no hay nada que adelantar
  if ((estado.ramasActivas || 0) >= (estado.maxRamas ?? DEFECTOS.maxRamas)) return false;
  if ((estado.saldoTokens || 0) <= 0) return false;
  return true;
}

/**
 * Elige QUÉ candidatos adelantar sin reventar el presupuesto. Ordena por
 * probabilidad (desempata por menor coste y por id) y va metiendo mientras
 * quepan: respeta el tope de ramas, el tope POR rama (un intento caro NO entra)
 * y el tope TOTAL. Lo descartado se explica.
 */
export function seleccionarCandidatos(candidatos: CandidatoEspeculativo[], presupuesto?: Partial<PresupuestoEspeculativo>): SeleccionEspeculativa {
  const pre = normalizarPresupuesto(presupuesto);
  const ordenados = [...(candidatos || [])].sort((a, b) =>
    (b.probabilidad || 0) - (a.probabilidad || 0) ||
    (a.tokensEstimados || 0) - (b.tokensEstimados || 0) ||
    String(a.id).localeCompare(String(b.id)));
  const elegidos: CandidatoEspeculativo[] = [];
  const descartados: Array<{ id: string; motivo: string }> = [];
  let tokensComprometidos = 0;
  for (const c of ordenados) {
    const est = Math.max(0, Math.floor(c.tokensEstimados || 0));
    if (elegidos.length >= pre.maxRamas) { descartados.push({ id: c.id, motivo: `tope de ${pre.maxRamas} rama(s) alcanzado` }); continue; }
    if (est > pre.tokensPorRama) { descartados.push({ id: c.id, motivo: `estimado ${est} > tope por rama ${pre.tokensPorRama} (no se especula un intento caro)` }); continue; }
    if (tokensComprometidos + est > pre.tokensTotal) { descartados.push({ id: c.id, motivo: `no cabe en el presupuesto total (${tokensComprometidos}+${est} > ${pre.tokensTotal})` }); continue; }
    elegidos.push(c); tokensComprometidos += est;
  }
  const motivo = elegidos.length
    ? `Especular ${elegidos.length} rama(s) por ~${tokensComprometidos} tokens (de ${pre.tokensTotal}); ${descartados.length} descartada(s).`
    : `No se especula ninguna rama: ${descartados.length ? "ninguna cabe en el presupuesto." : "no hay candidatos."}`;
  return { elegidos, descartados, tokensComprometidos, presupuesto: pre, motivo };
}

/**
 * RECONCILIA la decisión real del modelo con las ramas especuladas. REGLA DE ORO:
 * jamás se compromete nada a medias. Sólo se reutiliza una rama que (a) coincide
 * con la decisión, (b) quedó LISTA y (c) sana. En cualquier otro caso se revierte
 * TODO y la ruta real ejecuta el paso.
 */
export function reconciliar(decisionReal: string | null, ramas: RamaEspeculativa[]): ReconciliacionEspeculativa {
  const revertirIds: string[] = [];
  const todas = ramas || [];
  if (!decisionReal) {
    for (const r of todas) revertirIds.push(r.id);
    return { aplicar: null, revertir: revertirIds, reutilizado: false, ahorroTokens: 0, motivo: "el modelo no eligió ninguna rama especulada (o pidió replan): se revierte TODO (cero commits a medias)" };
  }
  const match = todas.find((r) => r.id === decisionReal);
  if (!match) {
    for (const r of todas) revertirIds.push(r.id);
    return { aplicar: null, revertir: revertirIds, reutilizado: false, ahorroTokens: 0, motivo: `el modelo eligió «${decisionReal}», que NO se había especulado: se revierte todo y la ruta real debe ejecutarla` };
  }
  if (match.estado !== "lista") {
    for (const r of todas) revertirIds.push(r.id);
    return { aplicar: null, revertir: revertirIds, reutilizado: false, ahorroTokens: 0, motivo: `la rama elegida «${decisionReal}» no quedó lista (estado ${match.estado}): no se compromete nada a medias; la ruta real la ejecuta` };
  }
  for (const r of todas) if (r.id !== match.id) revertirIds.push(r.id);
  return { aplicar: match.id, revertir: revertirIds, reutilizado: true, ahorroTokens: match.tokensGastados, motivo: `la rama «${match.id}» coincide con la decisión real: se REUTILIZA su trabajo (ahorro ~${match.tokensGastados} tokens) y se revierten ${revertirIds.length} rama(s) especuladas de más` };
}

/** Marca para cancelar todas las ramas menos la exceptuada (muta las señales). */
export function cancelarRamas(ramas: RamaEspeculativa[], exceptoId?: string): string[] {
  const cancelados: string[] = [];
  for (const r of ramas || []) {
    if (r.id === exceptoId) continue;
    if (r.estado === "comprometida" || r.estado === "revertida" || r.estado === "cancelada") continue;
    r.senal.cancelada = true;
    cancelados.push(r.id);
  }
  return cancelados;
}

/** Parte HONESTO de la ronda especulativa. */
export function parteEspeculacion(sel: SeleccionEspeculativa, rec: ReconciliacionEspeculativa, ramas: RamaEspeculativa[], decisionReal: string | null): string {
  const icono: Record<string, string> = { comprometida: "\u2713", lista: "\u25c6", cancelada: "\u2298", revertida: "\u21a9", en_curso: "\u2026" };
  const lineas = (ramas || []).map((r) => `${icono[r.estado] || "?"} ${r.id}: ${r.estado}${r.motivo ? ` — ${r.motivo}` : ""} [~${r.tokensGastados} tok]`);
  const cab = rec.reutilizado
    ? `ESPECULACIÓN ÚTIL: se reutilizó «${rec.aplicar}» (ahorro ~${rec.ahorroTokens} tok).`
    : `ESPECULACIÓN DESCARTADA: ${decisionReal ? `la decisión «${decisionReal}» no reutilizó trabajo` : "sin decisión / replan"} — todo revertido, nada a medias.`;
  return `${cab}\n${sel.motivo}\n${lineas.join("\n")}\n${rec.motivo}`;
}

// ──────────────────────────────────────────────────────────────
// ORQUESTADOR — encadena presupuesto + transacción + reconciliación (sin SO)
// ──────────────────────────────────────────────────────────────
// NO spawnea ni llama al modelo: el `lanzador` y la `decidir` son INYECTADOS. El
// comportamiento especulativo REAL (concurrencia real contra modelo/herramientas)
// queda SIN VERIFICAR en dev; aquí se verifica la MECÁNICA segura (presupuesto,
// aislamiento transaccional, reconciliación atómica, reversión total).

export interface OpcionesEspeculativas {
  candidatos: CandidatoEspeculativo[];
  /** mapa vivo ruta→texto (el mismo que maneja capaTransaccion). Se MUTA sólo con el ganador. */
  mundo: Map<string, string>;
  lanzador: LanzadorEspeculativo;
  /** resuelve con el id de la decisión real del modelo (o null = ninguno/replan). */
  decidir: () => Promise<string | null>;
  presupuesto?: Partial<PresupuestoEspeculativo>;
}

export async function ejecutarEspeculativo(opts: OpcionesEspeculativas): Promise<ResultadoCicloEspeculativo> {
  const sel = seleccionarCandidatos(opts.candidatos, opts.presupuesto);
  const pre = sel.presupuesto;
  const ramas: RamaEspeculativa[] = sel.elegidos.map((c) => ({
    id: c.id, titulo: c.titulo, tx: iniciar(), mundoRama: new Map(opts.mundo),
    senal: { cancelada: false }, estado: "en_curso", tokensGastados: 0, parches: [],
  }));

  // Lanza cada rama sobre SU clon del mundo, dentro de SU transacción.
  const trabajos = ramas.map(async (rama) => {
    try {
      const r = await opts.lanzador({ id: rama.id, titulo: rama.titulo, probabilidad: 0, tokensEstimados: 0 }, rama.senal);
      rama.resultado = r;
      rama.tokensGastados = Math.max(0, Math.floor(r.tokensAprox || 0));
      if (rama.tokensGastados > pre.tokensPorRama) {
        rama.estado = "revertida";
        rama.motivo = `excedió el tope de ${pre.tokensPorRama} tokens (gastó ${rama.tokensGastados}): intento caro, no se reutiliza`;
        revertir(rama.tx, rama.mundoRama);
        return;
      }
      if (rama.senal.cancelada) {
        rama.estado = "cancelada";
        rama.motivo = "cancelada antes de terminar (el modelo ya decidió otra cosa)";
        revertir(rama.tx, rama.mundoRama);
        return;
      }
      if (!r.ok) {
        rama.estado = "revertida";
        rama.motivo = `la rama falló: ${r.resumen || "sin detalle"}`;
        revertir(rama.tx, rama.mundoRama);
        return;
      }
      for (const p of r.parches || []) aplicar(rama.tx, rama.mundoRama, p);
      rama.parches = (r.parches || []).slice();
      rama.estado = "lista";
    } catch (e: any) {
      rama.estado = "revertida";
      rama.motivo = `error en la rama: ${String(e?.message || e)}`;
      try { revertir(rama.tx, rama.mundoRama); } catch { /* ya revertida */ }
    }
  });

  // El modelo decide EN PARALELO con la especulación.
  const decisionReal = await opts.decidir();
  // Cancela lo que no sea la elegida (si sigue en vuelo) y espera a que todo cierre.
  cancelarRamas(ramas, decisionReal ?? undefined);
  await Promise.allSettled(trabajos);

  const rec = reconciliar(decisionReal, ramas);

  // COMMIT ATÓMICO del ganador sobre el mundo REAL (si el commit falla, se revierte).
  let mundoFinal = opts.mundo;
  if (rec.aplicar) {
    const ganadora = ramas.find((r) => r.id === rec.aplicar);
    if (ganadora) {
      const txReal = iniciar();
      try {
        for (const p of ganadora.parches) aplicar(txReal, mundoFinal, p);
        confirmar(txReal, true);
        ganadora.estado = "comprometida";
      } catch (e: any) {
        revertir(txReal, mundoFinal); // deshace lo aplicado a medias
        ganadora.estado = "revertida";
        ganadora.motivo = `commit del ganador abortado: ${String(e?.message || e)}`;
        rec.aplicar = null;
        rec.reutilizado = false;
        rec.ahorroTokens = 0;
        rec.motivo += " · el commit falló y se revirtió (nada a medias): la ruta real ejecuta el paso";
      }
    }
  }

  // Revierte las perdedoras: una que terminó (lista) se DESCARTA (revertida); una
  // que seguía en vuelo y se canceló queda «cancelada» (el worker ya la marca así).
  for (const rama of ramas) {
    if (rama.id === rec.aplicar) continue;
    if (rama.estado === "lista") {
      try { revertir(rama.tx, rama.mundoRama); } catch { /* ya revertida */ }
      rama.estado = "revertida";
      if (!rama.motivo) rama.motivo = "el modelo eligió otra rama: trabajo descartado";
    } else if (rama.estado === "en_curso") {
      try { revertir(rama.tx, rama.mundoRama); } catch { /* ya revertida */ }
      rama.estado = "cancelada";
    }
  }

  const parte = parteEspeculacion(sel, rec, ramas, decisionReal);
  return { mundo: mundoFinal, decisionReal, seleccion: sel, reconciliacion: rec, ramas, parte };
}
