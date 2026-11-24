/**
 * tests/techoDelPrompt.test.ts — v1.0.33 · EL TURNO QUE NO CABE SE DICE, NO SE MANDA
 * =============================================================================
 * La sesión del 19/11 con glm-4.5-flash terminó con «Prompt exceeds max length»
 * (Z.ai 1261) y el chat se quedó mudo. La cuenta del historial ignoraba el prompt
 * de sistema: el historial podía ocupar TODO el presupuesto como si el contrato de
 * acción, el cerebro, la conciencia del turno y los esquemas de las 111
 * herramientas no existieran.
 *
 * `npx tsx tests/techoDelPrompt.test.ts`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  techoDeHistorial,
  veredictoTecho,
  RESERVA_SALIDA_CHARS,
  SUELO_HISTORIAL_CHARS,
} from "../src/engine/techoDelPrompt";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function check(desc: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(desc); console.log(`  \u2717 ${desc}`); }
}

console.log("\n1. LA CUENTA · lo que ya está escrito se descuenta");
// ════════════════════════════════════════════════════════════════════════
{
  check("sin sistema, el historial recibe presupuesto - salida",
    techoDeHistorial({ presupuesto: 12000, sistema: 0 }) === 12000 - RESERVA_SALIDA_CHARS);
  check("el sistema MEDIDO se resta (el defecto del 19/11)",
    techoDeHistorial({ presupuesto: 20000, sistema: 9325 }) === 20000 - 9325 - RESERVA_SALIDA_CHARS);
  check("el resumen del historial descartado también se resta",
    techoDeHistorial({ presupuesto: 20000, sistema: 5000, resumen: 2000 }) === 20000 - 5000 - 2000 - RESERVA_SALIDA_CHARS);
  check("un contexto REAL de la sesión (12000, sistema 9325 + rutas) no deja el historial gigante",
    techoDeHistorial({ presupuesto: 12000, sistema: 12500 }) === SUELO_HISTORIAL_CHARS);
  check("nunca baja del suelo (el turno no se queda sin hilo)",
    techoDeHistorial({ presupuesto: 3000, sistema: 9000 }) === SUELO_HISTORIAL_CHARS);
  check("sin presupuesto devuelve el suelo, no 0 ni negativo",
    techoDeHistorial({ presupuesto: 0, sistema: 500 }) === SUELO_HISTORIAL_CHARS);
  check("acepta valores raros sin devolver NaN",
    Number.isFinite(techoDeHistorial({ presupuesto: NaN as any, sistema: undefined as any })) &&
    Number.isFinite(techoDeHistorial({ presupuesto: -5, sistema: -3 })));
  check("es monótona: más sistema nunca da más historial",
    techoDeHistorial({ presupuesto: 20000, sistema: 4000 }) >= techoDeHistorial({ presupuesto: 20000, sistema: 8000 }));
}

console.log("\n2. EL VEREDICTO · si no cabe, sale con números");
// ════════════════════════════════════════════════════════════════════════
{
  const cabe = veredictoTecho({ presupuesto: 12000, sistema: 4000, historial: 5000 });
  check("lo que cabe no produce aviso (callar cuesta cero)", cabe.cabe && cabe.aviso === null);
  const noCabe = veredictoTecho({ presupuesto: 12000, sistema: 9325, historial: 14000 });
  check("lo que no cabe se declara", !noCabe.cabe && !!noCabe.aviso);
  check("…con los tres sumandos y el presupuesto en el texto",
    /sistema 9325/.test(noCabe.aviso!) && /14000/.test(noCabe.aviso!) && /12000/.test(noCabe.aviso!));
  check("…y dice cuánto sobra", noCabe.sobra === 9325 + 14000 - 12000);
  const conEsquemas = veredictoTecho({ presupuesto: 20000, sistema: 5000, historial: 8000, esquemas: 9000 });
  check("cuenta los esquemas de las herramientas cuando se los pasa", !conEsquemas.cabe && /esquemas 9000/.test(conEsquemas.aviso!));
  check("un turno justo en el borde cabe (sin falsos avisos)",
    veredictoTecho({ presupuesto: 100, sistema: 60, historial: 40 }).cabe);
}

console.log("\n3. EL CABLE · el monolito usa la cuenta y no la resta a mano");
// ════════════════════════════════════════════════════════════════════════
{
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(aqui, "..", "server.ts"), "utf-8");
  check("server.ts llama a techoDeHistorial para presupuestar el historial",
    /techoDeHistorial\(\{\s*presupuesto: _perfilHistorial\.contextCharBudget,\s*sistema: consolidatedSystemInstruction\.length/.test(src));
  check("…y le pasa el tamaño MEDIDO del sistema, no una constante",
    /sistema: consolidatedSystemInstruction\.length/.test(src));
  check("…y ya no queda la resta vieja que ignoraba el sistema",
    !/Math\.max\(1500, _perfilHistorial\.contextCharBudget - _budgetResumen\)/.test(src));
  check("el turno que no cabe deja su línea con números en consola",
    /veredictoTecho\(\{/.test(src) && /_vt\.aviso/.test(src));
  check("la lectura de /api/fs/read no reescribe un socket que el plazo ya cerró",
    /if \(!puedeContestar\(res\)\) return; \/\/ v1\.0\.33/.test(src));
}

console.log(`\n—— techoDelPrompt: ${ok} correctas · ${mal} fallidas ——`);
if (mal) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
process.exitCode = mal ? 1 : 0;
