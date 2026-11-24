/**
 * pivotProveedores.test.ts — v1.57.19 · SUITE DE CERTEZA: EL PIVOT (F1)
 * =======================================================================
 * Fixture de aceptación: el escenario del usuario, con sus números.
 *   DeepSeek-Coder-33B local (p95 120 s → presupuesto 192 s) se cuelga a los 192 s
 *   → cuarentena → PIVOT a Gemini Flash (2 s medidos) → respuesta + acta.
 * Contra un orquestador común: timeout fijo de 30 s → «Request Timeout» → frustración.
 * Entradas hostiles nombradas: ranking vacío, todo en cuarentena, candidato sin
 * medición, contenido ya entregado, y un candidato de calidad insuficiente.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../src/engine/pivotProveedores";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const T0 = 1_800_000_000_000;

let correctas = 0; let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `— ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

console.log("\n🔀 EL PIVOT — v1.57.19 (F1: el cerebro)\n");

// El reparto del usuario: A local de calidad, B nube rápida, C local de emergencia.
const REPARTO: P.Candidato[] = [
  { modelo: "deepseek-coder:33b", proveedor: "ollama", pesoCalidad: 1.0, esLocal: true },
  { modelo: "gemini-1.5-flash", proveedor: "gemini", pesoCalidad: 0.8, esLocal: false },
  { modelo: "phi-3:mini", proveedor: "ollama", pesoCalidad: 0.4, esLocal: true },
];
const MEDIDOS = {
  "deepseek-coder:33b": { p50: 120_000 },
  "gemini-1.5-flash": { p50: 2_000 },
  "phi-3:mini": { p50: 1_500 },
};
const sanos = { medidos: MEDIDOS, enCuarentena: (_m: string) => false, fallado: "" };

seccion("1 · Ranking: calidad primero, medición después, privacidad de fondo");
{
  const r = P.ordenarCandidatos(REPARTO, { ...sanos, enCuarentena: (m) => m === "deepseek-coder:33b", fallado: "deepseek-coder:33b" });
  comprobar("el que falló no se propone a sí mismo", r.every((x) => x.modelo !== "deepseek-coder:33b"));
  comprobar("ENTRADA HOSTIL: calidad 0,4 (Phi-3) filtrada por el piso 0,6", r.every((x) => x.modelo !== "phi-3:mini"), JSON.stringify(r.map((x) => x.modelo)));
  comprobar("sin candidatos de calidad suficiente queda solo la nube buena", r.length === 1 && r[0].modelo === "gemini-1.5-flash");
  const r2 = P.ordenarCandidatos(REPARTO.map((c) => ({ ...c, pesoCalidad: 1.0 })), { ...sanos, enCuarentena: () => false, fallado: "deepseek-coder:33b" });
  comprobar("con calidad pareja: 1500 vs 2000 → gana la nube SOLO si es 3x más rápida (no lo es)", r2[0].modelo === "phi-3:mini", JSON.stringify(r2.map((x) => `${x.modelo}:${x.p50}`)));
  // v1.57.19 · F2 · COSTO DE CONTEXTO (pedido del usuario): manda el tier, no el p50.
  const conTiers = P.ordenarCandidatos(
    [
      { modelo: "gemma3n:e2b", proveedor: "ollama", pesoCalidad: 1.0, esLocal: true, cargado: true },
      { modelo: "qwen3:31b", proveedor: "ollama", pesoCalidad: 1.0, esLocal: true, cargado: false },
      { modelo: "gemini-1.5-flash", proveedor: "gemini", pesoCalidad: 1.0, esLocal: false },
    ],
    { medidos: { "gemma3n:e2b": { p50: 60_000 }, "qwen3:31b": { p50: 40_000 }, "gemini-1.5-flash": { p50: 2_000 } }, enCuarentena: () => false, fallado: "" }
  );
  comprobar("orden por costo de contexto: cargado → frío → nube (aunque la nube sea 20x más rápida)", conTiers.map((r) => r.tier).join(",") === "caliente,frio,nube", conTiers.map((r) => `${r.modelo}[${r.tier}]`).join(" "));
  comprobar("el motivo declara el tier y por qué cuesta", /local cargado/.test(conTiers[0].motivo) && /reenvía todo el prompt/.test(conTiers[2].motivo), conTiers[2].motivo);
  comprobar("un local CARGADO lento le gana al local frío más rápido (costo de carga)", conTiers[0].modelo === "gemma3n:e2b" && conTiers[1].modelo === "qwen3:31b");
}

seccion("2 · ESCENARIO DE ACEPTACIÓN: DeepSeek se cuelga y Gemini rescata");
{
  const ranking = P.ordenarCandidatos(REPARTO, { ...sanos, enCuarentena: (m) => m === "deepseek-coder:33b", fallado: "deepseek-coder:33b" });
  const d = P.decidirPivot({ modeloElegido: "deepseek-coder:33b", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "si" }, ranking);
  comprobar("pivota", d.pivotar === true && d.modelo === "gemini-1.5-flash", JSON.stringify(d).slice(0, 120));
  comprobar("el aviso nombra el fallo y el reemplazo", /RESCATE/.test(d.aviso) && /deepseek-coder:33b/.test(d.aviso) && /gemini-1.5-flash/.test(d.aviso));
  comprobar("el aviso lleva la MEDICIÓN del reemplazo", /2\.0 s/.test(d.aviso), d.aviso);
  const avisos = [d.aviso, ...["si","preguntar","no"].map((c) => P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 0, consentimiento: c as P.ConsentimientoNube }, ranking).aviso)];
  comprobar("PROHIBIDO el «optimizando» en los AVISOS (ley de la casa)", avisos.every((a) => !/optimiz/i.test(a)), avisos.find((a) => /optimiz/i.test(a)) || "");
  comprobar("y el módulo declara la prohibición en su contrato", /Prohibido decir «optimizando»/.test(leer("src/engine/pivotProveedores.ts")));
}

seccion("3 · Matriz de consentimiento (nube) — y el caso local");
{
  const ranking = P.ordenarCandidatos(REPARTO, { ...sanos, enCuarentena: (m) => m === "deepseek-coder:33b", fallado: "deepseek-coder:33b" });
  const conLocal = P.ordenarCandidatos(REPARTO.map((c) => ({ ...c, pesoCalidad: 1.0 })), { ...sanos, enCuarentena: (m) => m === "deepseek-coder:33b", fallado: "deepseek-coder:33b" });
  const si = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "si" }, ranking);
  comprobar("consentimiento «si» → pivota sin preguntar", si.pivotar && !si.requiereConsentimiento);
  const preg = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "preguntar" }, ranking);
  comprobar("«preguntar» → pivota pero pide el clic, con aviso de que sale a la nube", preg.pivotar === true && preg.requiereConsentimiento === true && /saldrían a la nube/.test(preg.pregunta || ""), String(preg.pregunta));
  comprobar("la pregunta ofrece las dos salidas", /\[Sí, rescatá\]/.test(preg.pregunta || "") && /No, mostrame el error/.test(preg.pregunta || ""));
  const no = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "no" }, ranking);
  comprobar("«nunca» → no pivota a la nube y lo dice claro", no.pivotar === false && /Nunca/.test(no.aviso) && /no salen de tu máquina/.test(no.aviso), no.aviso);
  const local = P.decidirPivot({ modeloElegido: "deepseek-coder:33b", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "no" }, conLocal);
  comprobar("local→local pivota aunque el ajuste de nube sea «nunca»", local.pivotar === true && local.esLocal === true && local.modelo === "phi-3:mini", JSON.stringify(local).slice(0, 120));
}

seccion("4 · Candados: 1 por turno, sin contenido entregado, sin candidatos");
{
  const ranking = P.ordenarCandidatos(REPARTO, { ...sanos, enCuarentena: (m) => m === "deepseek-coder:33b", fallado: "deepseek-coder:33b" });
  const d1 = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: true, pivotesUsados: 0, consentimiento: "si" }, ranking);
  comprobar("no pivota si ya hubo contenido (duplicaría)", d1.pivotar === false && /duplicaría/.test(d1.aviso));
  const d2 = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 1, consentimiento: "si" }, ranking);
  comprobar("tope de un rescate por turno", d2.pivotar === false && /tope 1/.test(d2.aviso), d2.aviso);
  const d3 = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "si" }, []);
  comprobar("ENTRADA HOSTIL: sin alternativa medida y sana, lo dice y no inventa", d3.pivotar === false && /no hay alternativa medida y sana/.test(d3.aviso), d3.aviso);
  const d4 = P.decidirPivot({ modeloElegido: "x", contenidoEntregado: false, pivotesUsados: 0, consentimiento: "si" }, P.ordenarCandidatos(REPARTO, { medidos: {}, enCuarentena: () => false, fallado: "" }));
  comprobar("sin mediciones no hay candidatos (no se propone lo no medido)", d4.pivotar === false);
}

seccion("5 · El acta del rescate: quién respondió de verdad");
{
  P.reiniciarRescatesParaPruebas();
  comprobar("sin rescates, el acta va vacía", P.notaRescateDelTurno(T0) === "");
  P.registrarRescateDelTurno({ elegido: "deepseek-coder:33b", rescate: "gemini-1.5-flash", proveedor: "gemini", causa: "silencio del tramo PRIMER BYTE", aLosMs: 192_000 }, T0);
  const nota = P.notaRescateDelTurno(T0 + 1_000);
  comprobar("nombra al que falló, al que rescató y la causa", /deepseek-coder:33b/.test(nota) && /gemini-1\.5-flash/.test(nota) && /PRIMER BYTE/.test(nota), nota);
  comprobar("declara los segundos MEDIDOS del presupuesto", /192 s medidos/.test(nota), nota);
  comprobar("vence a los 15 min (memoria acotada)", P.notaRescateDelTurno(T0 + 16 * 60_000) === "");
}

seccion("6 · Valla: el módulo sigue siendo PURO (lógica fuera del monolito)");
{
  const fuente = leer("src/engine/pivotProveedores.ts");
  comprobar("no importa fs, express ni red", !/from "node:fs"|from "express"|fetch\(/.test(fuente));
}

seccion("7 · Valla F2: el rescate está CABLEADO en el tramo local (y con el tier real)");
{
  const servidor = leer("server.ts");
  const enVivo = leer("server/pivotEnVivo.ts");
  comprobar("el tramo local reintenta con bucle etiquetado", /intentoDelTurno: while \(true\)/.test(servidor) && /continue intentoDelTurno;/.test(servidor));
  comprobar("el modelo del intento vigente viaja al payload", /model: modeloEnVuelo,/.test(servidor));
  comprobar("la decisión vive en el módulo en vivo", /intentarPivotLocal\(\{ modeloEnVuelo/.test(servidor));
  comprobar("el inventario sale de /api/tags + /api/ps (cargados = costo cero)", /api\/tags/.test(enVivo) && /api\/ps/.test(enVivo) && /cargado: cargados\.has\(m\)/.test(enVivo));
  comprobar("el acta y el log se registran UNA sola vez (en el módulo, no duplicados en el monolito)", /registrarRescateDelTurno\(\{ elegido/.test(enVivo) && (servidor.match(/registrarRescateDelTurno/g) || []).length === 0);
  comprobar("el consentimiento se parsea en un solo lugar", /consentimientoDeRescate\(req\.body\)/.test(servidor) && /export function consentimientoDeRescate/.test(enVivo));
  comprobar("el troceo del bucle de agente se extrajo (aire para la valla de líneas)", /enviarEnTrozos\(ctx, agentText\)/.test(servidor) && /export async function enviarEnTrozos/.test(enVivo));
}

seccion("8 · Valla F3: el consentimiento existe en la UI y viaja en el pedido");
{
  const pro = leer("src/utils/proSettings.ts");
  const motor = leer("src/utils/engine.ts");
  const panel = leer("src/components/ProConfigPanel.tsx");
  comprobar("el ajuste existe en los tipos y en los defaults", /orquestacion: \{/.test(pro) && /rescateNube: "si" \| "preguntar" \| "no"/.test(pro) && /rescateNube: "preguntar"/.test(pro));
  comprobar("viaja en AMBAS ramas del pedido (principal y reintento)", (motor.match(/rescateNube: \(\(\) =>/g) || []).length === 2);
  comprobar("el panel lo expone con sus tres opciones", /Rescate en la nube/.test(panel) && /Preguntar la primera vez/.test(panel) && /Nada sale a internet|Nunca \(nada sale a internet\)/.test(panel));
  comprobar("y el servidor lo lee con default preguntar", /consentimientoDeRescate\(req\.body\)/.test(leer("server.ts")) && /return v === "si" \? "si" : v === "no" \? "no" : "preguntar";/.test(leer("server/pivotEnVivo.ts")));
}

console.log(`\n═══ pivotProveedores: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
