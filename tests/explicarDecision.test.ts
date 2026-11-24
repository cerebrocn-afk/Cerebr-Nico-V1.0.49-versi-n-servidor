/**
 * explicarDecision.test.ts — «¿POR QUÉ DECIDISTE ESTO?» NO MIENTE (v1.86.0 · FASE 7.3)
 * ==================================================================================
 * La evidencia que exige el plano para FASE 7 es textual: «la respuesta «¿por
 * qué?» SIEMPRE cita artefacto real — test: ninguna cita sin ruta». Esta suite ES
 * ese test, y además la prueba de que el test funciona: se SiMBRA una cita falsa
 * y la auditoría tiene que cazarla. Un contrato que no puede fallar no es un
 * contrato.
 *
 * Qué se congela:
 *   · cada respuesta trae citas {archivo, linea} que RESUELVEN contra el disco en
 *     este instante (se relee el archivo; si la línea cambió de lugar, la cita se
 *     baja y se declara en `sinFuente`);
 *   · hay dos clases de fuente y las dos se citan: la REGLA (el .ts donde vive el
 *     criterio) y el ÓRGANO (el `cerebro/temas/*.md` donde está la memoria que
 *     pesó, que es FASE 2 citando a FASE 6);
 *   · el paso se pide por id o por número (`7`, `#7`) — lo que teclea un humano;
 *   · un paso que no existe NO se explica: `ok:false`, el motivo, y los pasos que
 *     sí existen. Inventar la explicación de algo que no pasó es la mentira madre;
 *   · tras un reinicio (anillo vacío) la explicación sale del JSONL del disco;
 *   · si el archivo del órgano se borró, la cita desaparece y queda nombrada.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { createHash } from "node:crypto";
import {
  explicarPaso,
  explicarUltimoPaso,
  auditarCitas,
  estadoExplicar,
} from "../src/engine/explicarDecision";
import { decidir, _resetTrazas, trazaPorId } from "../src/engine/cicloDecision";
import { verificarCita } from "../src/engine/citaFuente";
import { aprender, cargarIndice } from "../src/engine/cerebroOrgano";
import { configurarSistema } from "../src/engine/reflejo/consejo";

configurarSistema({
  totalmem: () => os.totalmem(), freemem: () => os.freemem(), cpus: () => os.cpus(), loadavg: () => os.loadavg(),
  sha256: (x) => createHash("sha256").update(x, "utf8").digest("hex"),
  uuid: () => `x-${Math.random().toString(16).slice(2)}`,
});

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(`${msg}${detalle ? " → " + detalle : ""}`);
}

// v1.86.2 · `fileURLToPath`, no `.pathname`. En Windows `new URL(import.meta.url)
// .pathname` devuelve `/C:/Users/…` y `path.resolve` lo transforma en `\C:\Users\…`
// (ruta inexistente). Las 32 pruebas que dependen de leer los .ts se volvían
// «sin fuente» y el veredicto de Mario decía «el patrón de «clasificar» no
// aparece en src/engine/cerebroReflejo.ts» cuando el archivo estaba perfecto.
// Un test que solo pasa en un SO no es un test: era un defecto de esta suite.
const RAIZ_FUENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = mkdtempSync(path.join(tmpdir(), "cn-explicar-"));
const CTX = { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ };

_resetTrazas();

// Antes de exigir citas, la suite verifica su propio terreno: si el árbol fuente
// no está, «sin fuente» no es un hallazgo del motor sino un entorno roto. En
// Windows esto era justo lo que pasaba (raíz mal convertida) y el rojo mentía.
comprobar(
  "★ la suite pisa un árbol fuente real (si esto falla, el entorno está roto, no el motor)",
  existsSync(path.join(RAIZ_FUENTE, "src", "engine", "cerebroReflejo.ts")),
  `raizFuente=${RAIZ_FUENTE}`
);

// ═══ 0 · Sin trazas no hay explicación (y lo dice) ═══════════════════════════
const antes = explicarUltimoPaso(CTX);
comprobar("sin ninguna decisión trazada no se responde un «por qué» inventado", antes.ok === false && /no hay ninguna decisión/.test(antes.motivo || ""), antes.motivo);

// Sembramos memoria en el órgano ANTES de decidir, para que la traza la cite.
aprender(RAIZ, {
  tema: "arranque",
  titulo: "el preview levanta solo",
  texto: "El piloto del sandbox levanta el servidor estatico y el watchdog lo reinicia solo; el usuario no ve botones.",
  palabras: ["preview", "sandbox", "arranque"],
});

const traza = decidir("arranca el preview del sandbox", { raizDatos: RAIZ, raizFuente: RAIZ_FUENTE, datos: { texto: "hola" } });
comprobar("hay una traza que explicar", trazaPorId(traza.id)?.id === traza.id);

// ═══ 1 · La respuesta cita regla + órgano, con ruta y línea ═════════════════
const exp = explicarPaso(traza.id, CTX);
comprobar("el modo «por que» responde", exp.ok === true, exp.motivo);
comprobar("la respuesta es citable (texto listo para la UI)", exp.explicacion.length > 120 && /por que|¿por qué/.test(exp.pregunta), exp.explicacion.slice(0, 100));
comprobar("el resumen dice accion, entidad y estado", /«.+»/.test(exp.resumen) && /OK|ok/.test(exp.resumen), exp.resumen);
comprobar("★ la respuesta trae al menos un {archivo, linea} verificable", exp.citas.length >= 1 && exp.citas.every((c) => !!c.archivo && c.linea >= 1), JSON.stringify(exp.citas.map((c) => `${c.archivo}:${c.linea}`)));
comprobar("cada cita resuelve contra el disco REAL (se relee el archivo)", exp.citas.every((c) => verificarCita(c.origen === "organo" ? RAIZ : RAIZ_FUENTE, c)), exp.citas.filter((c) => !verificarCita(c.origen === "organo" ? RAIZ : RAIZ_FUENTE, c)).map((c) => `${c.archivo}:${c.linea}`).join(","));
comprobar("el texto citado es la linea real de ese archivo", exp.citas.every((c) => {
  const abs = path.resolve(c.origen === "organo" ? RAIZ : RAIZ_FUENTE, c.archivo);
  if (!existsSync(abs)) return false;
  const linea = readFileSync2(abs, c.linea);
  return linea.includes(c.texto.slice(0, 24));
}), "ver texto");
function readFileSync2(abs: string, linea: number): string {
  try { return readFileSync(abs, "utf8").split(/\r?\n/)[linea - 1] || ""; } catch { return ""; }
}
comprobar("hay citas de REGLA (el .ts donde vive el criterio)", exp.citas.some((c) => c.origen === "regla" && /\.ts$/.test(c.archivo)), JSON.stringify(exp.citas.map((c) => c.origen)));
comprobar("★ hay citas del ÓRGANO (cerebro/temas/*.md — FASE 2 citada)", exp.citas.some((c) => c.origen === "organo" && /^cerebro\/temas\//.test(c.archivo)), JSON.stringify(exp.citas.map((c) => c.archivo)));
comprobar("la memoria del órgano citada es la que sembramos", exp.citas.some((c) => /arranque/.test(c.sostiene + c.texto + c.archivo)), JSON.stringify(exp.citas.filter((c) => c.origen === "organo").map((c) => c.texto)));
comprobar("la explicacion nombra el voto del especialista", /especialista|vot|reclama|ningun/.test(exp.explicacion), exp.explicacion.slice(0, 200));
comprobar("cada cita dice QUE sostiene", exp.citas.every((c) => !!c.sostiene.trim()), JSON.stringify(exp.citas.map((c) => c.sostiene)));
comprobar("y las citas aparecen en el texto con formato [archivo:linea]", /\[[\w./-]+:\d+\]/.test(exp.explicacion), exp.explicacion.match(/\[[\w./-]+:\d+\]/g)?.join(" "));

// ═══ 2 · El contrato, auditado ═══════════════════════════════════════════════
const auditoria = auditarCitas(exp, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ });
comprobar("★ NINGUNA cita sin ruta (el contrato de FASE 7)", auditoria.ok === true, auditoria.malas.join(" | "));
comprobar("con fuentes sanas no hay nada declarado sin fuente", exp.sinFuente.length === 0, JSON.stringify(exp.sinFuente));

// ═══ 3 · PLAGA SEMBRADA: una cita falsa tiene que romper el contrato ════════
const conCitaFalsa = { ...exp, citas: [...exp.citas, { archivo: "src/engine/no-existe.ts", linea: 42, texto: "export function nada()", origen: "regla" as const, sostiene: "invento una regla", verificada: true }] };
const auditoriaFalsa = auditarCitas(conCitaFalsa, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ });
comprobar("★ el contrato falla si una cita no resuelve a archivo+línea existentes", auditoriaFalsa.ok === false && /no-existe\.ts/.test(auditoriaFalsa.malas.join(" ")), auditoriaFalsa.malas.join(" | "));
const lineaFuera = { ...exp, citas: [{ ...exp.citas[0], linea: 9_999_999 }] };
comprobar("y falla si la línea está fuera del archivo", auditarCitas(lineaFuera, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ }).ok === false);
const citaSinRuta = { ...exp, citas: [{ archivo: "", linea: 0, texto: "x", origen: "regla" as const, sostiene: "sin ruta", verificada: true }] };
comprobar("y falla ante una cita sin ruta", /sin ruta/.test(auditarCitas(citaSinRuta, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ }).malas.join(" ")), JSON.stringify(auditarCitas(citaSinRuta, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ }).malas));

// ═══ 4 · Cómo se pide el paso (lo que teclea un humano) ══════════════════════
comprobar("se puede pedir por numero de paso", explicarPaso(traza.secuencia, CTX).pasoId === traza.id);
comprobar("se puede pedir con almohadilla (#7)", explicarPaso(`#${traza.secuencia}`, CTX).pasoId === traza.id);
const noExiste = explicarPaso("t999999-1", CTX);
comprobar("★ un paso que no existe NO se explica", noExiste.ok === false && /no se explica lo que no pas/.test(noExiste.motivo || ""), noExiste.motivo);
comprobar("y el «no existe» sirve de algo: lista los pasos que si hay", Array.isArray(noExiste.disponibles) && noExiste.disponibles.includes(traza.id), JSON.stringify(noExiste.disponibles));
comprobar("explicarUltimoPaso responde el paso mas reciente", explicarUltimoPaso(CTX).pasoId === traza.id);

// ═══ 5 · Reinicio: la explicacion sale del JSONL del disco ═══════════════════
_resetTrazas();
comprobar("con el anillo vacio la traza sigue en disco (el indice la tiene)", cargarIndice(RAIZ).entradas.length >= 1 && existsSync(path.join(RAIZ, "cerebro", "trazas", "decisiones.jsonl")));
const trasReinicio = explicarPaso(traza.id, CTX);
comprobar("★ tras reiniciar, la explicacion se arma desde el disco", trasReinicio.ok === true && trasReinicio.citas.length >= 1, trasReinicio.motivo);
comprobar("y las citas del disco vuelven a resolver contra el arbol actual", auditarCitas(trasReinicio, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ }).ok === true);

// ═══ 6 · Si la fuente desaparece, la cita se baja y se nombra ════════════════
const entradaOrgano = cargarIndice(RAIZ).entradas.find((e) => e.tema === "arranque")!;
const rutaOrgano = path.join(RAIZ, "cerebro", entradaOrgano.archivo);
unlinkSync(rutaOrgano);
const huerfana = explicarPaso(traza.id, CTX);
comprobar("★ si el archivo del organo se borro, la cita NO se devuelve", !huerfana.citas.some((c) => c.archivo === `cerebro/${entradaOrgano.archivo}`), JSON.stringify(huerfana.citas.map((c) => c.archivo)));
comprobar("y la falta de fuente queda DECLARADA en sinFuente", huerfana.sinFuente.some((s) => /arranque/.test(s)), JSON.stringify(huerfana.sinFuente));
comprobar("el contrato sigue verde: no se devolvio ninguna cita rota", auditarCitas(huerfana, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ }).ok === true, JSON.stringify(auditarCitas(huerfana, { raizFuente: RAIZ_FUENTE, raizDatos: RAIZ }).malas));

// Con la raiz de fuente rota (el arbol empaquetado sin el fuente), la respuesta
// se cae a si misma antes que mentir: cero citas y el motivo dicho.
const sinArbol = explicarPaso(traza.id, { raizFuente: "/ruta/que/no/existe", raizDatos: RAIZ });
comprobar("sin arbol de fuente la respuesta se niega en vez de citar de memoria", sinArbol.ok === false && /ninguna cita/.test(sinArbol.motivo || "") && sinArbol.sinFuente.length >= 2, JSON.stringify(sinArbol.motivo));

// ═══ 7 · La cara del endpoint ════════════════════════════════════════════════
const est = estadoExplicar(CTX);
comprobar("estadoExplicar lista los pasos explicables", est.pasos.length >= 1 && est.pasos.every((p) => !!p.pasoId && typeof p.ok === "boolean"), JSON.stringify(est.pasos.map((p) => p.pasoId)));
comprobar("estadoExplicar dice si hay trazas en disco", est.enDisco === 1, String(est.enDisco));
comprobar("estadoExplicar enuncia el contrato en una linea", /archivo/.test(est.regla) && /sinFuente/.test(est.regla), est.regla.slice(0, 90));

try { rmSync(RAIZ, { recursive: true, force: true }); } catch {}

console.log(`\n═══ EL MODO ¿POR QUE DECIDISTE ESTO? (FASE 7.3): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
