/**
 * tests/configAgente.test.ts — FASE 5 · «Velocidad y disciplina» (v1.57.4)
 * ============================================================================
 * Verifica las tres piezas de la Fase 5 como CONFIG, no como código suelto:
 *   1. La temperatura del modo agente por defecto es 0.4 (no 0.5).
 *   2. El presupuesto de autonomía es un valor declarado y coincide con pasos=10.
 *   3. El superprompt lleva el prefijo cacheable AL FRENTE y lo dinámico A LA
 *      COLA, con la directriz de autonomía dentro del prefijo estable.
 *
 * Correr:  npx tsx tests/configAgente.test.ts
 */

import {
  CONFIG_AGENTE,
  temperaturaModoAgente,
  directrizPresupuestoAutonomia,
} from "../src/engine/configAgente";
import { buildSuperPrompt } from "../src/engine/superPrompt";
import type { ModelProfile } from "../src/engine/modelTiers";

let pasados = 0;
let fallados = 0;

function ok(cond: boolean, titulo: string, detalle = "") {
  if (cond) {
    pasados++;
    console.log(`  \x1b[32m\u2713\x1b[0m ${titulo}`);
  } else {
    fallados++;
    console.log(`  \x1b[31m\u2717\x1b[0m ${titulo}${detalle ? ` — ${detalle}` : ""}`);
  }
}

// Perfil «grande» para forzar nivel standard/pro (donde viven las directrices).
const perfilGrande: ModelProfile = {
  id: "test-grande",
  name: "test-grande",
  paramsB: 8,
  sizeGB: 5,
  contextTokens: 8192,
  tier: "standard" as any,
} as any;

console.log("\n══ FASE 5 · configAgente ══\n");

console.log("1 · Temperatura del modo agente");
ok(CONFIG_AGENTE.temperatura === 0.4, "CONFIG_AGENTE.temperatura es 0.4", `fue ${CONFIG_AGENTE.temperatura}`);
ok(CONFIG_AGENTE.temperaturaChat === 0.5, "la charla normal sigue en 0.5");
ok(temperaturaModoAgente(undefined) === 0.4, "sin temperatura explícita → 0.4", `fue ${temperaturaModoAgente(undefined)}`);
ok(temperaturaModoAgente(null) === 0.4, "null → 0.4");
ok(temperaturaModoAgente(NaN) === 0.4, "NaN → 0.4");
ok(temperaturaModoAgente(0.7) === 0.7, "usuario fija 0.7 → se respeta", `fue ${temperaturaModoAgente(0.7)}`);
ok(temperaturaModoAgente(5) <= 1.0, "se acota el máximo a 1.0", `fue ${temperaturaModoAgente(5)}`);
ok(temperaturaModoAgente(0) >= 0.05, "se acota el mínimo", `fue ${temperaturaModoAgente(0)}`);

console.log("\n2 · Presupuesto de autonomía");
ok(CONFIG_AGENTE.presupuestoPasos === 10, "presupuestoPasos es 10 (coincide con maxAgentSteps)");
const dir = directrizPresupuestoAutonomia();
ok(/PRESUPUESTO DE AUTONOM/i.test(dir), "la directriz lleva el rótulo [PRESUPUESTO DE AUTONOMÍA]");
ok(dir.includes("10"), "la directriz anuncia el número de pasos");
ok(/no preguntes lo obvio/i.test(dir), "la directriz dice: no preguntes lo obvio");
ok(/act/i.test(dir) || /ejecut/i.test(dir), "la directriz empuja a ACTUAR");
ok(directrizPresupuestoAutonomia(3).includes("3"), "respeta un presupuesto distinto (3 pasos)");

console.log("\n3 · Prefijo cacheable al frente, dinámico a la cola");
const res = buildSuperPrompt({
  profile: perfilGrande,
  responseLanguage: "es",
  toolNames: ["read_file", "edit_file", "write_file"],
  workspaceSummary: "PROYECTO-DINAMICO-XYZ: 42 archivos, raíz /app.",
  historySummary: "HISTORIAL-DINAMICO-XYZ: hablamos de rutas.",
  userRules: "REGLA-DINAMICA-XYZ: responde corto.",
  historyCount: 7,
  totalMessages: 30,
});

ok(typeof res.prefijoEstable === "string" && res.prefijoEstable.length > 0, "expone prefijoEstable");
ok(typeof res.sufijoDinamico === "string" && res.sufijoDinamico.length > 0, "expone sufijoDinamico");
ok(res.prompt === [res.prefijoEstable, res.sufijoDinamico].filter(Boolean).join("\n\n").trim(), "prompt = prefijo + sufijo");

// La directriz de autonomía es ESTABLE: va en el prefijo, no en la cola.
ok(/PRESUPUESTO DE AUTONOM/i.test(res.prefijoEstable), "la directriz de autonomía viaja en el PREFIJO estable");
ok(!/PRESUPUESTO DE AUTONOM/i.test(res.sufijoDinamico), "la directriz de autonomía NO está en la cola dinámica");

// Lo dinámico (proyecto, historial, reglas vivas, conteo) va en la COLA.
ok(res.sufijoDinamico.includes("PROYECTO-DINAMICO-XYZ"), "el resumen del proyecto va en la cola");
ok(res.sufijoDinamico.includes("HISTORIAL-DINAMICO-XYZ"), "el resumen del historial va en la cola");
ok(res.sufijoDinamico.includes("REGLA-DINAMICA-XYZ"), "las reglas del usuario van en la cola");
ok(!res.prefijoEstable.includes("PROYECTO-DINAMICO-XYZ"), "el prefijo NO contiene datos dinámicos del proyecto");
ok(!res.prefijoEstable.includes("7 de 30"), "el conteo de mensajes NO rompe el prefijo");

// En nivel compact el conteo SÍ se emite: debe ir en la cola, nunca en el prefijo.
const perfilCompact: ModelProfile = { ...(perfilGrande as any), tier: "compact" } as any;
const resC = buildSuperPrompt({
  profile: perfilCompact,
  level: "compact",
  responseLanguage: "es",
  toolNames: ["read_file"],
  historyCount: 7,
  totalMessages: 30,
});
ok(resC.sufijoDinamico.includes("7 de 30"), "compact: el conteo de mensajes viaja en la cola dinámica");
ok(!resC.prefijoEstable.includes("7 de 30"), "compact: el conteo NO rompe el prefijo cacheable");

// El prefijo es ESTABLE entre turnos: cambiar sólo lo dinámico no lo altera.
const res2 = buildSuperPrompt({
  profile: perfilGrande,
  responseLanguage: "es",
  toolNames: ["read_file", "edit_file", "write_file"],
  workspaceSummary: "OTRO proyecto completamente distinto, 999 archivos.",
  historySummary: "OTRO historial.",
  userRules: "OTRA regla.",
  historyCount: 12,
  totalMessages: 88,
});
ok(res.prefijoEstable === res2.prefijoEstable, "MISMO prefijo entre dos turnos con distinta cola (cacheable)");
ok(res.sufijoDinamico !== res2.sufijoDinamico, "la cola SÍ cambia entre turnos");

// El tope del contrato del sandbox sigue respetado.
ok(res.estTokens < 4200, "estTokens bajo el tope de 4200", `fue ${res.estTokens}`);

console.log(`\n══ Resultado: ${pasados} ✓  ${fallados} ✗\n`);
if (fallados > 0) process.exit(1);
