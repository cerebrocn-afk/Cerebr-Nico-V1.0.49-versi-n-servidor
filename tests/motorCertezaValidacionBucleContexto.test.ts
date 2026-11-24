// ============================================================
// v1.58.5 — REGRESIÓN: MOTOR DE CERTEZA / VALIDACIÓN / BUCLE / CONTEXTO (x5)
// ------------------------------------------------------------
// Cinco mejoras acotadas, puras y deterministas, una por pilar + un puente:
//
//   C1 · CERTEZA   — `certezaConjunta`: la certeza de N evidencias es la de la
//                    pieza MÁS DÉBIL; lista vacía → `sin_verificar` (no sube).
//   C2 · VALIDACIÓN— `herramientasPendientes`: expone capa→herramienta de las
//                    obligatorias sin correr, como dato (no texto parseado).
//   C3 · BUCLE     — `herramientaAtascada`: la herramienta que falla `umbral`
//                    veces SEGUIDAS (racha), no la que suma; corta con otra
//                    herramienta o un cierre.
//   C4 · CONTEXTO  — `resumenRecorteContexto`: el `recortadas[]` crudo vuelto
//                    frase honesta (uso de presupuesto + capas sacrificadas,
//                    distinguiendo el veto de L5 por jerarquía del hambre).
//   C5 · PUENTE    — `certezaDeMatriz`: el veredicto de la matriz de QA en la
//                    moneda de la certeza (obligatoria VERIFICADO=ejecutado;
//                    si falta una, el conjunto baja a sin_verificar).
//
// Ejecutar:  npx tsx tests/motorCertezaValidacionBucleContexto.test.ts
// ============================================================
import { certezaConjunta, masDebil, type Certeza } from "../src/engine/certeza";
import {
  evaluarMatriz,
  herramientasPendientes,
  certezaDeMatriz,
  type EvidenciasPorCapa,
} from "../src/engine/matrizVerificacion";
import {
  crearRegistro,
  registrarDecision,
  herramientaAtascada,
} from "../src/engine/auditoriaBucle";
import type { Decision } from "../src/engine/bucleAutonomo";
import { ensamblarContexto, resumenRecorteContexto } from "../src/engine/motorContexto";

let fallos = 0;
let total = 0;
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  total++;
  if (cond) {
    console.log(`  \u2714 ${nombre}`);
  } else {
    fallos++;
    console.error(`  \u2716 ${nombre}${detalle ? ` \u2014 ${detalle}` : ""}`);
  }
}

// ───────────────────────────────────────────────────────────────────────
console.log("\n1) \u2605 C1 \u2014 certezaConjunta: manda la pieza m\u00e1s d\u00e9bil\n");

comprobar(
  "lista vac\u00eda \u2192 sin_verificar (no sube de nivel por estar vac\u00eda)",
  certezaConjunta([]) === "sin_verificar"
);
comprobar(
  "todo ejecutado \u2192 ejecutado",
  certezaConjunta(["ejecutado", "ejecutado", "ejecutado"]) === "ejecutado"
);
comprobar(
  "un solo sin_verificar arrastra el conjunto a sin_verificar",
  certezaConjunta(["ejecutado", "leido", "sin_verificar"]) === "sin_verificar"
);
comprobar(
  "ejecutado + leido \u2192 leido (el m\u00e1s d\u00e9bil de los dos)",
  certezaConjunta(["ejecutado", "leido"]) === "leido"
);
comprobar(
  "un elemento \u2192 ese mismo nivel",
  certezaConjunta(["leido"]) === "leido"
);
comprobar(
  "coincide con el pliegue manual de masDebil",
  certezaConjunta(["ejecutado", "leido", "ejecutado"]) ===
    ["leido", "ejecutado"].reduce((a, b) => masDebil(a as Certeza, b as Certeza), "ejecutado" as Certeza)
);

// ───────────────────────────────────────────────────────────────────────
console.log("\n2) \u2605 C2 \u2014 herramientasPendientes: capa\u2192herramienta de lo que falta correr\n");

// Perfil base: obligatorias son sintaxis/tipos/dependencias/unit/seguridad.
const sinEvidencia: EvidenciasPorCapa = {};
const dBase = evaluarMatriz(sinEvidencia, "base");
const pend = herramientasPendientes(dBase);
comprobar(
  "sin evidencia, hay obligatorias pendientes",
  pend.length > 0 && pend.length === dBase.obligatoriasPendientes.length
);
comprobar(
  "cada pendiente trae su herramienta no vac\u00eda",
  pend.every((p) => typeof p.herramienta === "string" && p.herramienta.length > 0)
);
comprobar(
  "la capa 'tipos' pendiente mapea a 'tsc --noEmit'",
  pend.some((p) => p.capa === "tipos" && /tsc/.test(p.herramienta)),
  JSON.stringify(pend)
);

// ───────────────────────────────────────────────────────────────────────
console.log("\n3) \u2605 C3 \u2014 herramientaAtascada: racha de la MISMA herramienta\n");

const rep = (tool: string): Decision => ({
  accion: "continuar",
  motivo: `reparar ${tool}`,
  directiva: "x",
  fase: "reparar",
  escalon: 1,
});
const avance = (): Decision => ({ accion: "continuar", motivo: "modificar", directiva: "x", fase: "modificar", escalon: 0 });
const cierre = (): Decision => ({ accion: "cerrar", motivo: "listo", informe: "" });

// Tres fallos SEGUIDOS de tsc → atascada en tsc.
const r1 = crearRegistro("t1");
[rep("tsc"), rep("tsc"), rep("tsc")].forEach((d, i) => registrarDecision(r1, i, d, { herramientaFallo: "tsc", ts: i }));
comprobar("3 fallos seguidos de tsc \u2192 'tsc'", herramientaAtascada(r1, 3) === "tsc");

// Dos de tsc, uno de eslint, otro de tsc: ninguna llega a 3 seguidas.
const r2 = crearRegistro("t2");
const sec: Array<[Decision, string]> = [[rep("tsc"), "tsc"], [rep("tsc"), "tsc"], [rep("eslint"), "eslint"], [rep("tsc"), "tsc"]];
sec.forEach(([d, tool], i) => registrarDecision(r2, i, d, { herramientaFallo: tool, ts: i }));
comprobar("racha cortada por otra herramienta \u2192 null", herramientaAtascada(r2, 3) === null);

// Un cierre en medio corta la racha.
const r3 = crearRegistro("t3");
registrarDecision(r3, 0, rep("tsc"), { herramientaFallo: "tsc", ts: 0 });
registrarDecision(r3, 1, rep("tsc"), { herramientaFallo: "tsc", ts: 1 });
registrarDecision(r3, 2, cierre(), { ts: 2 });
registrarDecision(r3, 3, rep("tsc"), { herramientaFallo: "tsc", ts: 3 });
comprobar("un cierre en medio corta la racha \u2192 null", herramientaAtascada(r3, 3) === null);

// Un avance sin fallo (sin herramientaFallo) también corta.
const r4 = crearRegistro("t4");
registrarDecision(r4, 0, rep("test"), { herramientaFallo: "test", ts: 0 });
registrarDecision(r4, 1, avance(), { ts: 1 });
registrarDecision(r4, 2, rep("test"), { herramientaFallo: "test", ts: 2 });
comprobar("un avance limpio en medio corta la racha \u2192 null", herramientaAtascada(r4, 3) === null);

comprobar("acta vac\u00eda \u2192 null", herramientaAtascada(crearRegistro("v"), 3) === null);
comprobar("umbral 2 dispara con 2 seguidas", herramientaAtascada(r1, 2) === "tsc");

// ───────────────────────────────────────────────────────────────────────
console.log("\n4) \u2605 C4 \u2014 resumenRecorteContexto: el hambre, auditable y legible\n");

// Sin recortes: objetivo corto, presupuesto holgado.
const ensSano = ensamblarContexto({ objetivo: "Arreglar un bot\u00f3n", limiteCaracteres: 6000 });
const notaSana = resumenRecorteContexto(ensSano);
comprobar("sin recortes lo dice y reporta el uso", /sin recortes/.test(notaSana) && /\/6000 car\./.test(notaSana), notaSana);

// L5 vetado por jerarquía (hay L1 y L4): NO es hambre, se distingue.
const ensL5 = ensamblarContexto({
  objetivo: "Tarea",
  contenidoAfectado: "const x = 1;",
  memoria: "nota previa",
  conocimiento: "dato general que NO debe entrar",
  limiteCaracteres: 6000,
});
const notaL5 = resumenRecorteContexto(ensL5);
comprobar("L5 vetado por jerarqu\u00eda se nombra como veto, no como presupuesto",
  ensL5.recortadas.includes(5) && /vetado/.test(notaL5) && !/presupuesto: .*L5/.test(notaL5), notaL5);

// Recorte por presupuesto: techo chico fuerza dejar niveles fuera.
const ensApretado = ensamblarContexto({
  objetivo: "O".repeat(400),
  contexto: undefined,
  memoria: "M".repeat(900),
  limiteCaracteres: 500,
});
const notaApretada = resumenRecorteContexto(ensApretado);
comprobar("con presupuesto chico, el uso nunca supera el presupuesto",
  ensApretado.caracteres <= ensApretado.presupuesto, `${ensApretado.caracteres}/${ensApretado.presupuesto}`);
comprobar("la nota es determinista (misma entrada, misma frase)",
  resumenRecorteContexto(ensApretado) === notaApretada);

// ───────────────────────────────────────────────────────────────────────
console.log("\n5) \u2605 C5 \u2014 certezaDeMatriz: el veredicto de QA en la moneda de la certeza\n");

comprobar("sin evidencia (hay obligatorias pendientes) \u2192 sin_verificar",
  certezaDeMatriz(dBase) === "sin_verificar");
comprobar("la matriz pendiente coincide: no puede decir terminado",
  dBase.puedeDecirTerminado === false);

// Mientras falte UNA obligatoria, el conjunto no sube a ejecutado.
const parcial: EvidenciasPorCapa = {
  sintaxis: "tsc ok: 0 errores",
  tipos: "tsc --noEmit ok",
};
const dParcial = evaluarMatriz(parcial, "base");
comprobar("con s\u00f3lo algunas obligatorias \u2192 sigue sin_verificar",
  certezaDeMatriz(dParcial) === "sin_verificar");

if (fallos > 0) {
  console.error(`\n\u2716 ${fallos} fallidas (de ${total} comprobaciones).`);
  process.exit(1);
}
console.log(`\n\u2714 Todo verde \u2014 ${total} correctas, 0 fallidas: motor de certeza/validaci\u00f3n/bucle/contexto (x5) congelado.\n`);
