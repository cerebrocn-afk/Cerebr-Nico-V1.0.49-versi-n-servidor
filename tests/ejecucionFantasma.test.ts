/**
 * ejecucionFantasma.test.ts — CONTRA LA HERRAMIENTA FANTASMA Y EL BUCLE (v1.44.0)
 * ===============================================================================
 * Se ejecuta con:  npx tsx tests/ejecucionFantasma.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA
 * ------------
 * La directriz que acompaña a la mecánica de herramientas de nube:
 *   1. SIEMPRE prohíbe inventar puentes («consultarEscritorioMCP») y el bucle
 *      «hazlo/no puedo».
 *   2. Con herramientas de PC/archivos: ordena USARLAS.
 *   3. Sin ellas y con Modo PC apagado: dice EXACTAMENTE que hay que activar el
 *      «Modo Agente PC», no que no exista.
 *   4. Con herramientas web: exige autorización previa a descargar.
 *
 * Lógica pura. Corre sin node_modules.
 */
import { directrizEjecucionReal, guardaSinHerramientas } from "../src/engine/ejecucionFantasma";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

console.log("\n[1] La regla anti-fantasma viaja SIEMPRE");
const conPc = directrizEjecucionReal({ herramientas: ["pc_write_file", "pc_list_dir", "web_fetch"], pcMode: true, red: true });
comprobar("proh\u00edbe inventar funciones puente", /NUNCA inventes|no EXISTE|consultarEscritorioMCP/i.test(conPc));
comprobar("proh\u00edbe el bucle hazlo/no puedo", /hazlo|no puedo|ya lo hago/i.test(conPc) && /PROHIBIDO/i.test(conPc));

console.log("\n[2] Con herramientas de PC: ordena usarlas");
comprobar("nombra que hay herramientas reales de archivos", /ARCHIVOS DE LA PC/i.test(conPc) && /\u00daSALAS|USALAS/i.test(conPc));
comprobar("lista las herramientas disponibles", conPc.includes("pc_write_file"));

console.log("\n[3] Sin PC y Modo PC apagado: dice qu\u00e9 activar");
const sinPc = directrizEjecucionReal({ herramientas: [], pcMode: false, red: true });
comprobar("sin herramientas: solo conversar", /solo puedes CONVERSAR|NO tienes herramientas/i.test(sinPc));
comprobar("indica activar el Modo Agente PC", /Modo Agente PC/i.test(sinPc));
comprobar("no finge acceso", /No inventes que ya tienes acceso|No simules/i.test(sinPc));

console.log("\n[4] Web exige autorizaci\u00f3n previa");
comprobar("con web: pide permiso antes de descargar", /AUTORIZACI\u00d3N PREVIA|autoriz/i.test(conPc) && /confirmaci\u00f3n|permiso/i.test(conPc));
const sinRed = directrizEjecucionReal({ herramientas: [], pcMode: false, red: false });
comprobar("sin red: no promete descargas", /sin salida a la red|no prometas/i.test(sinRed));

console.log("\n[5] guardaSinHerramientas: honestidad en TODO turno sin tools (v1.57.1)");
const g = guardaSinHerramientas();
comprobar("declara que el turno no tiene herramientas", /NO tiene herramientas disponibles este turno/i.test(g));
comprobar("prohíbe narrar ejecuciones falsas", /PROHIBIDO escribir que ejecutaste/i.test(g));
comprobar("prohíbe listas de «acciones realizadas» con ✔", /acciones realizadas/i.test(g) && g.includes("✔"));
comprobar("prohíbe inventar rutas y herramientas", /PROHIBIDO inventar/i.test(g) && /pc_quick_action/i.test(g));
comprobar("ordena declarar que el código entregado es TEXTO", /TEXTO/i.test(g) && /pegarlo|guardarlo/i.test(g));
comprobar("vale para cualquier tramo: no habla de micro ni tiny", !/micro|tiny/i.test(g) && g.length > 300);

console.log("\n[6] v1.60.6 — honestidad MCP: no culpar al puente ni inventar ENABLE_FS_TOOLS");
comprobar("guarda prohíbe culpar al puente / packs", /culpar al puente|no exponerlas/i.test(g));
comprobar("guarda prohíbe inventar ENABLE_FS_TOOLS/ENABLE_EXEC", /ENABLE_FS_TOOLS|ENABLE_EXEC/i.test(g) && /NO existen/i.test(g));
comprobar("guarda da el único arreglo honesto: cambiar de modelo", /cambiar a un modelo con herramientas/i.test(g));
const conPcMode = directrizEjecucionReal({ herramientas: [], pcMode: true, red: true });
comprobar("directriz pcMode: no afirma que el puente no ofrece tools", !/no ofreció esas herramientas/i.test(conPcMode) && /ESTE modelo no las recibió/i.test(conPcMode));

console.log(`\n\u2500\u2500\u2500 ejecucionFantasma: ${pasan} \u2713  ${fallan} \u2717 \u2500\u2500\u2500`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
