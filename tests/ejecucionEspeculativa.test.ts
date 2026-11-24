/**
 * ejecucionEspeculativa.test.ts — SUITE DE LA EJECUCIÓN ESPECULATIVA (PASO 4)
 * ============================================================================
 * PASO 4 de la HOJA DE RUTA v1.54 (capacidad · riesgo ALTO). Se ejecuta con tsx
 * (como el resto del motor). Verifica la MECÁNICA SEGURA — presupuesto, aislamiento
 * transaccional por rama (sobre `capaTransaccion`, fuente única), cancelación,
 * reconciliación atómica y REVERSIÓN TOTAL (cero commits a medias) — con un
 * LANZADOR SIMULADO y una decisión inyectada, sin modelo ni red.
 * El COMPORTAMIENTO ESPECULATIVO REAL (concurrencia real contra modelo/herramientas)
 * queda SIN VERIFICAR en el entorno dev y debe correrlo Mario end-to-end.
 *
 * Registrar en scripts/validar.mjs como:
 *   { id: "ejecucionEspeculativa", archivo: "tests/ejecucionEspeculativa.test.ts", que: "v1.53.8 · ..." }
 */
import assert from "node:assert";
import {
  DEFECTOS, debeEspecular, seleccionarCandidatos, reconciliar, cancelarRamas,
  ejecutarEspeculativo,
} from "../src/engine/ejecucionEspeculativa";
import type {
  CandidatoEspeculativo, RamaEspeculativa, PresupuestoEspeculativo,
  LanzadorEspeculativo, SenalEspeculativa, ResultadoCicloEspeculativo,
} from "../src/engine/ejecucionEspeculativa";
import type { Parche } from "../src/engine/capaTransaccion";

let pasadas = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); pasadas++; }
const J = (x: unknown) => JSON.stringify(x);
const cand = (id: string, probabilidad: number, tokensEstimados = 10): CandidatoEspeculativo => ({ id, titulo: id, probabilidad, tokensEstimados });

// Escenario del orquestador con control de tiempos (rama "lenta" sigue en vuelo al decidir).
interface PlanRama { ok?: boolean; parches?: Parche[]; tokensAprox?: number; resumen?: string; lenta?: boolean; }
function escenario(cfg: { candidatos: CandidatoEspeculativo[]; presupuesto?: Partial<PresupuestoEspeculativo>; plan: Record<string, PlanRama>; decision: string | null; }): Promise<ResultadoCicloEspeculativo> {
  const mundo = new Map<string, string>([["base.ts", "0"]]);
  const lanzador: LanzadorEspeculativo = async (c: CandidatoEspeculativo, _senal: SenalEspeculativa) => {
    const p = cfg.plan[c.id] || {};
    if (p.lenta) await new Promise<void>((r) => setTimeout(r, 0));
    return { ok: p.ok !== false, parches: p.parches || [], tokensAprox: p.tokensAprox ?? 10, resumen: p.resumen || "" };
  };
  const decidir = async () => cfg.decision;
  return ejecutarEspeculativo({ candidatos: cfg.candidatos, mundo, lanzador, decidir, presupuesto: cfg.presupuesto });
}
const estadoDe = (r: ResultadoCicloEspeculativo, id: string) => (r.ramas.find((x) => x.id === id) || ({} as Partial<RamaEspeculativa>)).estado;

// ── 1. debeEspecular ──
ok(debeEspecular({ decidido: false, saldoTokens: 100, ramasActivas: 0, maxRamas: 2 }) === true, "especula si indeciso y con saldo");
ok(debeEspecular({ decidido: true, saldoTokens: 100, ramasActivas: 0 }) === false, "NO si ya decidido");
ok(debeEspecular({ decidido: false, saldoTokens: 0, ramasActivas: 0 }) === false, "NO si sin saldo");
ok(debeEspecular({ decidido: false, saldoTokens: 100, ramasActivas: 2, maxRamas: 2 }) === false, "NO si ramas al tope");

// ── 2. seleccionarCandidatos (presupuesto) ──
{
  const s = seleccionarCandidatos([cand("a", 0.4), cand("b", 0.9), cand("c", 0.6)], { maxRamas: 2, tokensPorRama: 50000, tokensTotal: 100000 });
  ok(J(s.elegidos.map((x) => x.id)) === J(["b", "c"]), "prioriza por probabilidad");
  ok(s.descartados.some((d) => d.id === "a"), "descarta el que no cabe por tope de ramas");
}
{
  const s = seleccionarCandidatos([cand("caro", 0.9, 90000), cand("barato", 0.5, 10000)], { maxRamas: 2, tokensPorRama: 50000, tokensTotal: 100000 });
  ok(!s.elegidos.some((x) => x.id === "caro") && s.descartados.some((d) => d.id === "caro"), "el intento caro (por rama) NO se especula");
  ok(s.elegidos.some((x) => x.id === "barato"), "sí entra el barato");
}
{
  const s = seleccionarCandidatos([cand("a", 0.9, 40000), cand("b", 0.8, 40000)], { maxRamas: 5, tokensPorRama: 50000, tokensTotal: 50000 });
  ok(J(s.elegidos.map((x) => x.id)) === J(["a"]), "corta por presupuesto TOTAL");
  ok(s.descartados.some((d) => d.id === "b" && /presupuesto total/.test(d.motivo)), "el segundo se descarta por total");
}
ok(seleccionarCandidatos([], DEFECTOS).elegidos.length === 0, "sin candidatos no especula");

// ── 3. reconciliar (puro) ──
const ramasFake = [
  { id: "a", estado: "lista", tokensGastados: 12 },
  { id: "b", estado: "revertida", tokensGastados: 7 },
] as unknown as RamaEspeculativa[];
{
  const rec = reconciliar("a", ramasFake);
  ok(rec.aplicar === "a" && rec.reutilizado === true && rec.ahorroTokens === 12, "reutiliza la rama lista que coincide");
  ok(J(rec.revertir) === J(["b"]), "revierte el resto");
}
ok((() => { const r = reconciliar(null, ramasFake); return r.aplicar === null && r.revertir.length === 2 && !r.reutilizado; })(), "sin decisión revierte todo");
ok((() => { const r = reconciliar("z", ramasFake); return r.aplicar === null && r.revertir.length === 2; })(), "decisión no especulada revierte todo");
ok((() => { const r = reconciliar("b", ramasFake); return r.aplicar === null && !r.reutilizado; })(), "rama elegida no-lista NO se compromete");

// ── 4. cancelarRamas ──
{
  const rs = [
    { id: "a", estado: "en_curso", senal: { cancelada: false } },
    { id: "b", estado: "en_curso", senal: { cancelada: false } },
    { id: "c", estado: "revertida", senal: { cancelada: false } },
  ] as unknown as RamaEspeculativa[];
  const canc = cancelarRamas(rs, "a");
  ok(J(canc) === J(["b"]), "cancela todas menos la exceptuada y las ya cerradas");
  ok(rs[1].senal.cancelada === true && rs[0].senal.cancelada === false, "marca la señal de b");
}

// ── 5. ORQUESTADOR — mecánica segura E2E (simulada) ──
async function orquesta() {
  // 5.1 reutilización Útil
  {
    const r = await escenario({
      candidatos: [cand("a", 0.9), cand("b", 0.5)],
      presupuesto: { maxRamas: 2, tokensPorRama: 50000, tokensTotal: 100000 },
      plan: { a: { parches: [{ ruta: "a.ts", contenido: "A" }], tokensAprox: 15 }, b: { parches: [{ ruta: "b.ts", contenido: "B" }] } },
      decision: "a",
    });
    ok(r.reconciliacion.aplicar === "a" && r.reconciliacion.reutilizado === true, "compromete la rama ganadora");
    ok(r.mundo.get("a.ts") === "A" && !r.mundo.has("b.ts"), "el mundo real recibe SOLO el parche ganador");
    ok(r.reconciliacion.ahorroTokens === 15, "ahorro = tokens de la ganadora");
    ok(estadoDe(r, "b") === "revertida", "la perdedora queda revertida");
    ok(estadoDe(r, "a") === "comprometida", "la ganadora queda comprometida");
    ok(/ESPECULACIÓN ÚTIL/.test(r.parte), "el parte lo confiesa");
  }
  // 5.2 decisión NO especulada → todo revertido, mundo intacto
  {
    const r = await escenario({
      candidatos: [cand("a", 0.9), cand("b", 0.5)],
      plan: { a: { parches: [{ ruta: "a.ts", contenido: "A" }] }, b: { parches: [{ ruta: "b.ts", contenido: "B" }] } },
      decision: "c",
    });
    ok(r.reconciliacion.aplicar === null && r.reconciliacion.reutilizado === false, "no reutiliza nada");
    ok(J([...r.mundo]) === J([["base.ts", "0"]]), "el mundo real queda INTACTO");
  }
  // 5.3 replan (sin decisión) → todo revertido
  {
    const r = await escenario({ candidatos: [cand("a", 0.9)], plan: { a: { parches: [{ ruta: "a.ts", contenido: "A" }] } }, decision: null });
    ok(!r.mundo.has("a.ts") && r.reconciliacion.aplicar === null, "sin decisión no toca el mundo");
  }
  // 5.4 la rama ganadora FALLÓ → nada a medias
  {
    const r = await escenario({ candidatos: [cand("a", 0.9)], plan: { a: { ok: false, parches: [{ ruta: "a.ts", contenido: "A" }], resumen: "petardazo" } }, decision: "a" });
    ok(r.reconciliacion.aplicar === null && estadoDe(r, "a") === "revertida", "rama fallida no se reutiliza");
    ok(!r.mundo.has("a.ts"), "mundo intacto tras fallo");
  }
  // 5.5 rama LENTA en vuelo al decidir → cancelada; la rápida gana
  {
    const r = await escenario({
      candidatos: [cand("a", 0.9), cand("b", 0.8)],
      presupuesto: { maxRamas: 2, tokensPorRama: 50000, tokensTotal: 100000 },
      plan: { a: { parches: [{ ruta: "a.ts", contenido: "A" }] }, b: { lenta: true, parches: [{ ruta: "b.ts", contenido: "B" }] } },
      decision: "a",
    });
    ok(estadoDe(r, "b") === "cancelada", "la lenta no elegida se cancela");
    ok(estadoDe(r, "a") === "comprometida" && r.mundo.get("a.ts") === "A", "la rápida gana y se compromete");
    ok(!r.mundo.has("b.ts"), "la cancelada no deja rastro en el mundo");
  }
  // 5.6 presupuesto: el intento caro ni se lanza
  {
    const r = await escenario({
      candidatos: [cand("caro", 0.95, 90000), cand("barato", 0.5, 10000)],
      presupuesto: { maxRamas: 2, tokensPorRama: 50000, tokensTotal: 100000 },
      plan: { barato: { parches: [{ ruta: "ok.ts", contenido: "1" }] } },
      decision: "barato",
    });
    ok(!r.ramas.some((x) => x.id === "caro") && r.seleccion.descartados.some((d) => d.id === "caro"), "el caro no se especuló");
    ok(r.mundo.get("ok.ts") === "1" && r.reconciliacion.aplicar === "barato", "el barato ganó");
  }
  // 5.7 commit ATÓMICO de varios parches del ganador
  {
    const r = await escenario({ candidatos: [cand("a", 0.9)], plan: { a: { parches: [{ ruta: "x.ts", contenido: "X" }, { ruta: "y.ts", contenido: "Y" }] } }, decision: "a" });
    ok(r.mundo.get("x.ts") === "X" && r.mundo.get("y.ts") === "Y", "todos los parches del ganador se aplican juntos");
  }
  // 5.8 overrun en runtime (tokens reales > tope por rama) → no se reutiliza
  {
    const r = await escenario({
      candidatos: [cand("a", 0.9, 10)],
      presupuesto: { maxRamas: 2, tokensPorRama: 50000, tokensTotal: 100000 },
      plan: { a: { tokensAprox: 999999, parches: [{ ruta: "a.ts", contenido: "A" }] } },
      decision: "a",
    });
    ok(estadoDe(r, "a") === "revertida", "la rama que se pasó de tokens queda revertida");
    ok(!r.mundo.has("a.ts"), "y el mundo queda intacto");
  }
}

orquesta().then(() => {
  console.log(`\u2705 ejecucionEspeculativa: ${pasadas} comprobaciones OK`);
}).catch((e) => {
  console.error("\u274c ejecucionEspeculativa FALLÓ:", e);
  process.exit(1);
});
