/**
 * admisionRam.test.ts — v1.56.4 · ADMISIÓN POR RAM (raíz del cuelgue en 8 GB)
 * ==========================================================================
 * Lo que hay que DEMOSTRAR (todo con datos puros, sin red ni Ollama):
 *   · un modelo que cabe con holgura → "ok", sin ruido
 *   · un modelo que entra al límite → "justo": avisa y sugiere expulsar, pero admite
 *   · un modelo que NO cabe → "riesgo": admite=false y sugiere modelo chico
 *   · tamaño desconocido (0) → no se opina ("ok"), igual que el preflight
 *   · el caso REAL del log de Mario: qwen3.5:4b (~2.6 GB) con poca RAM libre
 *   · las conversiones de bytes->GB son estables y nunca negativas
 *
 * Se ejecuta con:  npx tsx tests/admisionRam.test.ts
 */

import {
  evaluarAdmisionRam,
  estimarRequeridoGb,
  gbDesdeBytes,
  OVERHEAD_RUNTIME_GB,
  HOLGURA_OK_GB,
} from "../src/engine/admisionRam";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];

function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) {
    pasan++;
    console.log(`  PASS   ${nombre}`);
  } else {
    fallan++;
    fallos.push(nombre);
    console.log(`  FALLO  ${nombre}${detalle ? `  ·  ${detalle}` : ""}`);
  }
}

console.log("═══ PRUEBAS DE ADMISIÓN POR RAM · CerebroNico v1.56.4 ═══\n");

const GB = 1024 * 1024 * 1024;

// ─── conversiones ────────────────────────────────────────────────
console.log("1) Conversiones de bytes a GB\n");
comprobar("1 GiB exacto", gbDesdeBytes(GB) === 1);
comprobar("bytes negativos no revientan", gbDesdeBytes(-5) === 0);
comprobar("cero es cero", gbDesdeBytes(0) === 0);
comprobar("requerido = modelo + overhead", estimarRequeridoGb(2 * GB) === 2 + OVERHEAD_RUNTIME_GB);
comprobar("requerido 0 cuando no se conoce el tamaño", estimarRequeridoGb(0) === 0);

// ─── veredictos ───────────────────────────────────────────────
console.log("\n2) Veredictos de admisión\n");

// Cabe con holgura: 0.5B (~0.4 GB) en una máquina con 6 GB libres.
const holgado = evaluarAdmisionRam({ ramLibreGb: 6, ramTotalGb: 8, tamModeloBytes: 0.4 * GB, modelo: "qwen2.5:0.5b" });
comprobar("modelo chico con RAM de sobra → ok", holgado.nivel === "ok" && holgado.admite === true, holgado.nivel);

// Justo: requerido = 2 + 1 = 3 GB, libres exactamente 3 GB (>= requerido, < requerido+holgura).
const justo = evaluarAdmisionRam({ ramLibreGb: 3, ramTotalGb: 8, tamModeloBytes: 2 * GB, modelo: "modelo-2gb" });
comprobar("entra al límite → justo + admite", justo.nivel === "justo" && justo.admite === true, justo.nivel);
comprobar("justo trae sugerencia de expulsar", !!justo.sugerencia && /Expulsar/i.test(justo.sugerencia || ""));

// Riesgo: el caso REAL del log de Mario. qwen3.5:4b archivo ~2.6 GB → requerido ~3.6 GB,
// y en el log quedaban 514 MB (~0.5 GB) libres → NO cabe.
const mario = evaluarAdmisionRam({ ramLibreGb: 0.5, ramTotalGb: 8, tamModeloBytes: 2.6 * GB, modelo: "qwen3.5:4b" });
comprobar("caso real Mario (514 MB libres, 4B) → riesgo", mario.nivel === "riesgo" && mario.admite === false, `${mario.nivel}/${mario.requeridoGb}`);
comprobar("riesgo sugiere modelo más chico", /chico|270m|0\.5b/i.test(mario.sugerencia || ""));
comprobar("riesgo NO es bloqueo duro (solo marca admite=false)", typeof mario.admite === "boolean");

// Tamaño desconocido: no se opina.
const desconocido = evaluarAdmisionRam({ ramLibreGb: 1, ramTotalGb: 8, tamModeloBytes: 0, modelo: "misterio" });
comprobar("tamaño 0 → ok sin inventar", desconocido.nivel === "ok" && desconocido.admite === true && desconocido.requeridoGb === 0);

// Frontera exacta ok/justo: holgura justa.
const frontera = evaluarAdmisionRam({ ramLibreGb: 2 + OVERHEAD_RUNTIME_GB + HOLGURA_OK_GB, ramTotalGb: 16, tamModeloBytes: 2 * GB });
comprobar("justo en el umbral de holgura → ok", frontera.nivel === "ok", frontera.nivel);

// ─── veredicto ─────────────────────────────────────────────
console.log(`\n─── RESULTADO: ${pasan} PASS · ${fallan} FALLO ───`);
if (fallan > 0) {
  console.log("Fallaron: " + fallos.join(", "));
  process.exit(1);
}
console.log("TODO EN VERDE.");
