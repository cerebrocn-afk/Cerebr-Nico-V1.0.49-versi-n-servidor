/**
 * tests/permisos.test.ts — FASE 14: LOS PERMISOS EN DOS EJES (v2.3.16)
 * ==================================================================
 * La evidencia de cierre que fija el plano, textual: «cada preset resuelve el par
 * (escribe_dentro, escribe_fuera_sin_preguntar, ejecuta_sin_preguntar); **no
 * existe un camino que escriba fuera del workspace sin pasar por
 * confirmación**» (HOJA_DE_RUTA_EVOLUCION_v2.3.8.md, FASE 14).
 *
 * Qué NO prueba esta suite, y es la parte importante. El plano dice que «cualquier
 * preset que escriba fuera del workspace sin preguntar es cambio de seguridad → lo
 * confirma Mario, no lo aprueba un test». Por eso acá no se valida que la política
 * sea *buena*: se valida que sea **la declarada** y que nadie la cambie de refilón.
 * El candado que hoy se abre al vincular una carpeta sigue abriéndose como antes;
 * la pregunta de si debería abrirse por archivo está escrita en
 * `DECISION_PENDIENTE`, dentro del módulo, para que sobreviva al turno.
 */

import { existsSync, readFileSync as _no, readFileSync } from "node:fs";
void _no;
import path from "node:path";
import { fileURLToPath as _f, fileURLToPath } from "node:url";
import {
  DECISION_PENDIENTE,
  PRESETS,
  PRESET_POR_DEFECTO,
  auditarNucleo,
  lineaDePreset,
  presetDesdePcMode,
  presetPorId,
  presetsQueEscribenFueraSinPreguntar,
  resolver,
  type Accion,
} from "../src/engine/permisos";
import { buildConcienciaTiempoReal } from "../src/engine/conciencia";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

type PresetId = "lectura" | "escritura-workspace" | "acceso-total";
const P = (i: PresetId) => presetPorId(i)!;

console.log("\n1) Forma de los presets: dos ejes, nombre propio, etiqueta que no miente\n");

c("\u2605 hay tres presets y se llaman como los nombra el plano",
  PRESETS.map((p) => p.id).join(",") === "lectura,escritura-workspace,acceso-total",
  PRESETS.map((p) => p.id).join(","));
c("el default es el que menos puede romper", PRESET_POR_DEFECTO === "escritura-workspace", PRESET_POR_DEFECTO);
c("los ids son \u00fanicos", new Set(PRESETS.map((p) => p.id)).size === PRESETS.length);
c("ning\u00fan preset tiene etiqueta o descripci\u00f3n vac\u00eda",
  PRESETS.every((p) => p.etiqueta.trim().length > 2 && p.descripcion.trim().length > 15));
c("los dos ejes son del vocabulario declarado",
  PRESETS.every((p) => ["solo-workspace", "workspace-y-pc"].includes(p.escritura) && ["preguntar", "auto", "prohibida"].includes(p.ejecucion)));
c("\u2605 si un preset escribe fuera sin preguntar, SU ETIQUETA lo dice",
  presetsQueEscribenFueraSinPreguntar().every((p) => /vincul|confirmad/i.test(p.etiqueta + p.descripcion)),
  presetsQueEscribenFueraSinPreguntar().map((p) => p.id).join(","));

console.log("\n2) La evidencia del plano: cada preset resuelve la t\u00edple\n");

const ESPERADA: Record<PresetId, { dentro: boolean; fueraSinPreguntar: boolean; ejecutaFuera: boolean }> = {
  "lectura": { dentro: false, fueraSinPreguntar: false, ejecutaFuera: false },
  "escritura-workspace": { dentro: true, fueraSinPreguntar: false, ejecutaFuera: false },
  "acceso-total": { dentro: true, fueraSinPreguntar: true, ejecutaFuera: true },
};

for (const p of PRESETS) {
  const e = ESPERADA[p.id as PresetId];
  const escribeDentro = resolver(p, "escribir", true).permitido;
  const fuera = resolver(p, "escribir", false);
  const ejecutaFuera = resolver(p, "ejecutar", false);
  c(`${p.id}: escribe dentro = ${e.dentro}`, escribeDentro === e.dentro, JSON.stringify(resolver(p, "escribir", true)));
  c(`${p.id}: escribe fuera sin preguntar = ${e.fueraSinPreguntar}`,
    (fuera.permitido && !fuera.requiereConfirmacion) === e.fueraSinPreguntar, JSON.stringify(fuera));
  c(`${p.id}: ejecuta fuera del workspace = ${e.ejecutaFuera}`, ejecutaFuera.permitido === e.ejecutaFuera, JSON.stringify(ejecutaFuera));
  c(`${p.id}: leer est\u00e1 permitido en todos los presets`, resolver(p, "leer", false).permitido === true);
}

{
  const negadas = PRESETS.filter((p) => !ESPERADA[p.id as PresetId].dentro)
    .map((p) => resolver(p, "escribir", true));
  c("lo que se niega se NIEGA, no se permite en silencio", negadas.every((v) => v.permitido === false && v.motivo.length > 5));
}

console.log("\n3) El n\u00facleo: ning\u00fan camino escribe fuera sin pasar por confirmaci\u00f3n\n");

c("\u2605 el n\u00facleo se sostiene (acta vac\u00eda)", auditarNucleo() === "", auditarNucleo());
{
  const acciones: Accion[] = ["leer", "escribir", "ejecutar"];
  const caminos: string[] = [];
  for (const p of PRESETS) {
    for (const a of acciones) {
      for (const dentro of [true, false]) {
        const v = resolver(p, a, dentro);
        const escribeFuera = a === "escribir" && !dentro;
        const ejecutaFuera = a === "ejecutar" && !dentro;
        if ((escribeFuera || ejecutaFuera) && v.permitido && !v.requiereConfirmacion) caminos.push(`${p.id}/${a}`);
      }
    }
  }
  c("\u2605 todo lo que pasa afuera sin preguntar pertenece al preset confirmado al vincular",
    caminos.every((camin) => camin.startsWith("acceso-total/")), caminos.join(", ") || "ninguno");
  c("y ese preset lo dice en la descripci\u00f3n que ve el usuario",
    /vincul/.test(P("acceso-total").descripcion), P("acceso-total").descripcion);
}

console.log("\n4) Equivalencia con el interruptor de hoy, y el cable sin candados nuevos\n");

c("\u2605 pcMode=false sigue sin poder escribir en la PC",
  presetDesdePcMode(false).id === "escritura-workspace" && resolver(presetDesdePcMode(false), "escribir", false).permitido === false);
c("\u2605 pcMode=true sigue con el acceso que ya ten\u00eda (no se afloja ni se aprieta)",
  presetDesdePcMode(true).id === "acceso-total" && resolver(presetDesdePcMode(true), "escribir", false).permitido === true);
c("sin carpeta vinculada, pcMode=true no escribe fuera",
  resolver(presetDesdePcMode(true, false), "escribir", false).permitido === false);

{
  const con = buildConcienciaTiempoReal({ pcMode: true, objetivo: "t", pasos: [] } as any);
  const sin = buildConcienciaTiempoReal({ pcMode: false, objetivo: "t", pasos: [] } as any);
  c("\u2605 el estado vivo nombra el preset en vez del booleano",
    /Acceso al PC/.test(con) && /Escribir en el proyecto/.test(sin));
  c("la l\u00ednea del preset incluye los dos ejes", /escritura .*ejecuci/.test(lineaDePreset(P("acceso-total"))), lineaDePreset(P("acceso-total")));
}

{
  const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
  const conc = leer("src/engine/conciencia.ts");
  const mod = leer("src/engine/permisos.ts");
  const srv = leer("server.ts");
  const validar = leer("scripts/validar.mjs");
  c("\u2605 conciencia importa la pol\u00edtica (el cable existe)", /from "\.\/permisos"/.test(conc) && /presetDesdePcMode\(/.test(conc));
  c("\u2605 el m\u00f3dulo de pol\u00edtica es puro: cero IO", !/node:fs|node:net|child_process|eval\(/.test(mod));
  c("server.ts no necesita tocarse para esto (y no se toc\u00f3)", !/engine\/permisos/.test(srv));
  c("la suite est\u00e1 registrada en npm run validar", validar.includes("permisos.test.ts"));
  c("la decisi\u00f3n de seguridad queda escrita y atribuida a Mario",
    /Mario/.test(DECISION_PENDIENTE) && /archivo/.test(DECISION_PENDIENTE));
  const contrato = JSON.parse(leer("contrato-rutas.json".replace("contrato", "contrato")));
  c("server.ts sigue dentro del presupuesto", srv.split("\n").length <= contrato.presupuesto_lineas, `${srv.split("\n").length} vs ${contrato.presupuesto_lineas}`);
}

console.log("\n" + "\u2500".repeat(56));
console.log(`PERMISOS EN DOS EJES (v2.3.16): ${correctas} correctas \u00b7 ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit ? process.exit(1) : process.exitCode = 1; }
