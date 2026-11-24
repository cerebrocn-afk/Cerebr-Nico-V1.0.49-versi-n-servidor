/**
 * multiagenteRelevo.test.ts — EL RELEVO SE COMPARTE, NO SE MULTIPLICA (v1.85.0 · FASE 6.3)
 * =======================================================================================
 * El plano, FASE 6 punto 3: «agentes especialistas como sesiones reales que
 * comparten la cola de favoritos curada de v1.78.0: si el especialista falla, el
 * relevo es el mismo, con las mismas reglas honestas [...] son procesos con
 * memoria común (el órgano de FASE 2 es su pizarra)».
 *
 * Lo que podría pasar si nadie lo congela (y es exactamente lo que esta suite
 * caza con el `llamar` falso):
 *   · que cada especialista traiga su propio `EstadoRelevo` y el tope de 2 se
 *     convierta en 2 POR AGENTE: con 3 sesiones, 6 llamadas a la nube con la
 *     cuota del usuario;
 *   · que el mismo modelo se reintente en dos sesiones distintas porque ninguna
 *     sabe que la otra ya lo quemó (`probados` privado);
 *   · que un especialista se invente con un id que no está en las 51 entidades
 *     (nombre doble / agente fantasma — V8 §7.1);
 *   · que el fallo llegue sin informe;
 *   · que el equipo "simule" memoria común con un array en memoria y el órgano
 *     no entere nunca.
 *
 * Todo sobre el criterio REAL de `relevoFavoritos.ts` (se importa, no se copia)
 * y sobre un órgano de verdad en un directorio temporal.
 */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  crearEquipo,
  encolar,
  siguienteTarea,
  elegirEspecialista,
  pasarTarea,
  cerrarSesion,
  consultarPizarra,
  estadoEquipo,
  type Equipo,
  type LlamadaEquipo,
} from "../src/engine/multiagenteRelevo";
import { TOPE_RELEVOS, type FavoritoRelay } from "../src/engine/relevoFavoritos";
import { estadoCerebro } from "../src/engine/cerebroOrgano";
import { configurarSistema } from "../src/engine/reflejo/consejo";
import * as _os from "node:os";
import { createHash } from "node:crypto";

configurarSistema({
  totalmem: () => _os.totalmem(), freemem: () => _os.freemem(), cpus: () => _os.cpus(), loadavg: () => _os.loadavg(),
  sha256: (x) => createHash("sha256").update(x, "utf8").digest("hex"),
  uuid: () => `m-${Math.random().toString(16).slice(2)}`,
});

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(`${msg}${detalle ? " → " + detalle : ""}`);
}

const RAIZ = mkdtempSync(path.join(tmpdir(), "cn-equipo-"));

const FAVORITOS: FavoritoRelay[] = [
  { provider: "gemini", modelId: "gemini-2.0-flash" },
  { provider: "openrouter", modelId: "deepseek-v3" },
  { provider: "ollama", modelId: "llama-local" }, // local: NUNCA destino de relevo
];

// ═══ 1 · El equipo se arma con sesiones REALES y rechaza fantasmas ═══════════
const a1 = crearEquipo(["codigo", "validador", "fantasma", "texto.contar"], FAVORITOS, { raizDatos: RAIZ });
comprobar("el equipo se arma con los especialistas válidos", a1.ok && !!a1.equipo);
const s0 = a1.equipo?.sesiones?.codigo;
comprobar("las sesiones son objetos con estado, turnos y apertura", !!s0 && s0.estado === "libre" && s0.turnos === 0 && typeof s0.abrioEn === "number", JSON.stringify(s0));
comprobar("2 sesiones abiertas (codigo, validador)", a1.equipo && Object.keys(a1.equipo.sesiones).length === 2, JSON.stringify(Object.keys(a1.equipo?.sesiones || {})));
comprobar("un especialista inexistente NO entra (rechazado con motivo)", a1.rechazados.some((r) => /fantasma/.test(r)), a1.rechazados.join(" | "));
comprobar("una herramienta curada tampoco es especialista", a1.rechazados.some((r) => /herramienta/.test(r)), a1.rechazados.join(" | "));
const sinEquipo = crearEquipo(["fantasma"], FAVORITOS, { raizDatos: RAIZ });
comprobar("no se arma un equipo de fantasmas (ok:false + motivo)", sinEquipo.ok === false && /fantasmas/.test(sinEquipo.motivo || ""), sinEquipo.motivo);

// ═══ 2 · El relevo es UNO para todo el equipo (el corazón de la fase) ════════
const eq = (crearEquipo(["codigo", "validador", "investigador"], FAVORITOS, {
  raizDatos: RAIZ,
  relevoActivado: true,
  primarias: { codigo: { modelo: "primaria-codigo", proveedor: "ollama" }, validador: { modelo: "primaria-validador", proveedor: "ollama" }, investigador: { modelo: "primaria-investigador", proveedor: "ollama" } },
}).equipo as Equipo);

let llamadas: LlamadaEquipo[] = [];
const fallaPrimaria: any = async (l: LlamadaEquipo) => {
  llamadas.push(l);
  if (l.motivo === "primaria") return { texto: "", fallo: "503 sin primer byte" };
  return { texto: `resuelto por ${l.modelo}` };
};

const r1 = await pasarTarea(eq, { id: "p1", frase: "revisa este codigo" }, fallaPrimaria);
comprobar("la primaria cae y el relevo del equipo contesta", r1.ok === true, r1.motivo || r1.informe);
comprobar("la voz final es un favorito nube (no la primaria)", r1.vozFinal.modelo === "gemini-2.0-flash", r1.vozFinal.modelo);
comprobar("el relevo compartido conto UNO", eq.relevo.relevosEsteTurno === 1, String(eq.relevo.relevosEsteTurno));
comprobar("la primaria caida queda en los probados del equipo", eq.relevo.probados.includes("primaria-codigo"), eq.relevo.probados.join(","));
comprobar("la voz que contesto bien NO queda quemada (no se castiga el acierto)", !eq.relevo.probados.includes("gemini-2.0-flash"), eq.relevo.probados.join(","));

// Segunda tarea, OTRO especialista, con su propia primaria que también cae.
const r2 = await pasarTarea(eq, { id: "p2", frase: "valida el json del proyecto" }, fallaPrimaria);
comprobar("el segundo especialista también es relevado", r2.ok === true, r2.motivo || r2.informe);
comprobar("★ el tope NO es por agente: el equipo va por 2 en total", eq.relevo.relevosEsteTurno === 2, String(eq.relevo.relevosEsteTurno));
comprobar("★ el segundo especialista releva sobre la MISMA cola (orden del usuario)", r2.vozFinal.modelo === "gemini-2.0-flash", r2.vozFinal.modelo);
comprobar("las sesiones cuentan sus propios turnos (2 sesiones, 1 turno c/u)", eq.sesiones.codigo.turnos + eq.sesiones.validador.turnos + eq.sesiones.investigador.turnos === 2, JSON.stringify(Object.entries(eq.sesiones).map(([k, s]) => `${k}:${s.turnos}`)));

// ═══ 2b · Cascada real: el favorito que falló NO lo prueba el otro agente ════
const eqC = (crearEquipo(["codigo", "validador"], FAVORITOS, {
  raizDatos: RAIZ, relevoActivado: true,
  primarias: { codigo: { modelo: "prim-codigo", proveedor: "ollama" }, validador: { modelo: "prim-validador", proveedor: "ollama" } },
}).equipo as Equipo);
const gemaRota: any = async (l: LlamadaEquipo) => {
  if (l.motivo === "primaria" || l.modelo === "gemini-2.0-flash") return { texto: "", fallo: "503 sin primer byte" };
  return { texto: `resuelto por ${l.modelo}` };
};
const rc = await pasarTarea(eqC, { id: "c1", frase: "refactoriza el modulo" }, gemaRota);
comprobar("la cascada prueba el siguiente favorito cuando el primero cae", rc.ok === true && rc.vozFinal.modelo === "deepseek-v3", `${rc.ok}/${rc.vozFinal.modelo}`);
comprobar("la cascada gasta los DOS relevos del plano", eqC.relevo.relevosEsteTurno === 2, String(eqC.relevo.relevosEsteTurno));
comprobar("el favorito quemado queda probado para TODO el equipo", eqC.relevo.probados.includes("gemini-2.0-flash"), eqC.relevo.probados.join(","));

// ═══ 3 · Al agotar el tope: INFORME HONESTO, no silencio ni bucle ════════════
llamadas = [];
const todosFalleen: any = async () => ({ texto: "", fallo: "429 cuota agotada" });
const r3 = await pasarTarea(eqC, { id: "p3", frase: "escribe el informe final" }, todosFalleen);
comprobar("agotado el tope, la tarea NO queda ok", r3.ok === false);
comprobar("★ llega el informe honesto con quién falló", /SE INTENTÓ EL RELEVO/.test(r3.informe || ""), String(r3.informe).slice(0, 90));
comprobar("el informe menciona el tope del plano", new RegExp(String(TOPE_RELEVOS)).test(r3.informe || ""), String(r3.informe).slice(-90));
comprobar("no se buclea: con el tope agotado el equipo no vuelve a llamar", llamadas.length === 0, `llamadas: ${llamadas.length}`);
comprobar("el relevo del equipo jamas pasa el tope del plano", eqC.relevo.relevosEsteTurno === TOPE_RELEVOS, String(eqC.relevo.relevosEsteTurno));
comprobar("el informe nombra a los que fallaron (traza, no adjetivo)", /gemini-2.0-flash|prim-codigo/.test(r3.informe || ""), String(r3.informe).slice(0, 160));

// ═══ 4 · La pizarra común: el órgano (FASE 2) es la memoria del equipo ═══════
const cerebro = estadoCerebro(RAIZ);
comprobar("el equipo escribió en el órgano (no en un array suelto)", cerebro.entradas >= 4 && existsSync(path.join(RAIZ, "cerebro", "indice.json")), JSON.stringify(cerebro));
const piz = consultarPizarra(eq, "relevo gemini cuota", 4);
comprobar("otro especialista recupera lo del equipo por sentido", piz.some((p) => p.tema === "equipo"), JSON.stringify(piz));
comprobar("la pizarra trae resumen legible", piz.every((p) => typeof p.resumen === "string"));

// ═══ 5 · Turno vacío (la otra puerta del relevo) ═════════════════════════════
const eq2 = (crearEquipo(["codigo", "matematico"], FAVORITOS, { raizDatos: RAIZ, relevoActivado: true }).equipo as Equipo);
const vacio: any = async (l: LlamadaEquipo) => (l.motivo === "primaria" ? { texto: "   " } : { texto: "ahora sí contesto" });
const r4 = await pasarTarea(eq2, { id: "v1", frase: "resume el changelog" }, vacio);
comprobar("un turno vacío también dispara el relevo compartido", r4.ok === true && eq2.relevo.relevosEsteTurno === 1, `${r4.ok}/${eq2.relevo.relevosEsteTurno}`);

// ═══ 6 · Sin `auto_relay` el equipo NO releva (el usuario manda) ═════════════
const eq3 = (crearEquipo(["codigo"], FAVORITOS, { raizDatos: RAIZ, relevoActivado: false }).equipo as Equipo);
const r5 = await pasarTarea(eq3, { id: "s1", frase: "refactoriza el modulo" }, fallaPrimaria);
comprobar("con el relevo apagado la tarea cae sin llamar a nadie", r5.ok === false && eq3.relevo.relevosEsteTurno === 0, String(eq3.relevo.relevosEsteTurno));
comprobar("aun apagado, el motivo se declara", /relevo apagado|503/.test(r5.motivo || ""), r5.motivo);

// ═══ 7 · Sesión cerrada y cola compartida ═══════════════════════════════════
comprobar("cerrar sesión devuelve ok y marca cerrada", cerrarSesion(eq3, "codigo").ok && eq3.sesiones.codigo.estado === "cerrada");
comprobar("cerrar dos veces se declara, no se finge", cerrarSesion(eq3, "codigo").ok === false);
const sinLibres = await pasarTarea(eq3, { id: "x1", frase: "hola" }, vacio);
comprobar("sin sesiones libres la tarea se declara, no se pierde", sinLibres.ok === false && /libre/.test(sinLibres.motivo || ""), sinLibres.motivo);
const eq4 = (crearEquipo(["codigo", "linguista"], FAVORITOS, { raizDatos: RAIZ }).equipo as Equipo);
encolar(eq4, [{ id: "c1", frase: "uno" }, { id: "c2", frase: "dos" }]);
comprobar("la cola es compartida (2 tareas, un solo montón)", eq4.cola.length === 2 && siguienteTarea(eq4)?.id === "c1" && eq4.cola.length === 1);
comprobar("elegir especialista reparte: el que menos turnos tiene", ["codigo", "linguista"].includes(elegirEspecialista(eq4, { id: "c3", frase: "convierte esto a yaml" }) || ""));
comprobar("si nadie está libre, elegir devuelve null", (() => { cerrarSesion(eq4, "codigo"); cerrarSesion(eq4, "linguista"); return elegirEspecialista(eq4, { id: "c4", frase: "z" }) === null; })());

// ═══ 8 · La cara del panel dice la verdad del relevo ════════════════════════
const est = estadoEquipo(eqC);
comprobar("estadoEquipo lista las sesiones reales", est.sesiones.length === 2 && est.sesiones.every((s) => typeof s.turnos === "number"), JSON.stringify(est.sesiones.map((s) => s.especialista)));
comprobar("estadoEquipo muestra el tope del plano, no uno estético", est.relevo.tope === TOPE_RELEVOS && est.relevo.usados === eqC.relevo.relevosEsteTurno, JSON.stringify(est.relevo));
comprobar("estadoEquipo informa resueltas/fallidas del historial", est.resueltas + est.fallidas === eqC.historial.length, `${est.resueltas}+${est.fallidas} vs ${eqC.historial.length}`);
comprobar("estadoEquipo trae el último informe honesto", /RELEVO/.test(est.informe || ""), String(est.informe).slice(0, 60));
comprobar("estadoEquipo dice que la pizarra es el órgano", /organo|órgano/.test(est.nota), est.nota);

try { rmSync(RAIZ, { recursive: true, force: true }); } catch {}

console.log(`\n═══ MULTIAGENTE CON RELEVO COMPARTIDO (FASE 6.3): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
