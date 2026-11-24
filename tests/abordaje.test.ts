/**
 * tests/abordaje.test.ts — v1.68.0 · EL MANUAL INFALIBLE
 * ======================================================
 * Cierra los cinco defectos medidos en v1.67.0. El anterior estado del motor
 * (medido ejecutando `buildContratoDeAccion` con los presupuestos reales de
 * server.ts:9972) era:
 *
 *   nube rápida →  6 de 37 herramientas nombradas
 *   local ≤8B   →  6 de 37
 *   grande      → 10 de 37
 *
 * o sea: Gemini Flash, GLM-flash y GPT-4o-mini trabajaban con un sexto del
 * catálogo, y las 16 herramientas sin entrada en `TOOL_MANUALS` no se nombraban
 * NUNCA (el filtro `.filter(n => TOOL_MANUALS[n])` las borraba aunque el
 * presupuesto fuera ilimitado). De ahí el síntoma de Mario: «algunos proveedores
 * encuentran las rutas y herramientas y otros no».
 *
 * EL INVARIANTE QUE SE PRUEBA AQUÍ
 * ────────────────────────────────
 *   ▸ herramientasEnIndice === herramientasTotales, SIEMPRE.
 *   ▸ Antes de recortar una herramienta, se excede el presupuesto — y se DECLARA.
 *
 * Capa PURA: sin red, sin fs, sin modelo. El catálogo es el REGISTRO REAL
 * (`registerBuiltinPacks`), no una lista de adorno: si alguien añade la
 * herramienta 38 sin escribirle manual, este test sigue exigiendo que se la
 * nombre. Se corre con:
 *   npx tsx tests/abordaje.test.ts
 */

import {
  construirAbordaje,
  presupuestoAbordaje,
  auditarManuales,
  charsDetalleDe,
  apareceComoNombre,
  notaDeHerramienta,
} from "../src/engine/abordaje";
import { TOOL_MANUALS, ENGINE_LAWS } from "../src/engine/manuals";
import { registerBuiltinPacks, getAllToolNames, getToolSpec, HUESO_DE_OBRA, esPackExterno } from "../src/engine/toolRegistry";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function comprobar(desc: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(desc); console.log(`  \u2717 ${desc}`); }
}

registerBuiltinPacks();
const NOMES = getAllToolNames();
const SPECS = NOMES.map((n) => ({ name: n, description: getToolSpec(n)?.description }));
const LOG_NOMES = NOMES.join("").length;
const DETALLE = charsDetalleDe(NOMES, SPECS);
const SIN_MANUAL = NOMES.filter((n) => !TOOL_MANUALS[n]);

const abordar = (opts: Partial<Parameters<typeof construirAbordaje>[0]> = {}) =>
  construirAbordaje({
    nombres: NOMES,
    specs: SPECS,
    provider: "zai",
    presupuesto: 1900,
    mcp: { presente: false, nombres: [] },
    ...opts,
  } as Parameters<typeof construirAbordaje>[0]);

/** Nombres TAL CUAL salen por la sección P0 (el índice), no por casualidad. */
function nombresDelIndice(texto: string): string[] {
  const i = texto.indexOf("HERRAMIENTAS DE ESTE TURNO");
  if (i < 0) return [];
  const despues = texto.slice(i);
  const linea = despues.split("\n")[1] || "";
  return linea.split("·").map((s) => s.trim()).filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n1. P0 INTOCABLE · con el presupuesto de la nube rápida entran TODAS");
// ════════════════════════════════════════════════════════════════════════
{
  const r = abordar({ presupuesto: 800 });
  comprobar(`presupuesto 800 → ${NOMES.length}/${NOMES.length} herramientas nombradas`, r.herramientasEnIndice === NOMES.length);
  comprobar("…y medido sobre el texto, no contado por confianza", nombresDelIndice(r.texto).length === NOMES.length);
  for (const n of NOMES) {
    if (!apareceComoNombre(r.texto, n)) { comprobar(`"${n}" está en el bloque`, false); break; }
  }
  comprobar("…ninguna herramienta del registro se queda fuera del índice", NOMES.every((n) => apareceComoNombre(r.texto, n)));
  // Las que el corte viejo se dejaba fuera por estar al final de la lista:
  // v1.0.31 · antes esta lista incluía `SIN_MANUAL[última]`; ya no hay tools sin
  // manual, así que se prueban las dos ÚLTIMAS del registro (el caso real del
  // corte por caracteres) y no un hueco que dejó de existir.
  for (const n of NOMES.slice(-2)) {
    comprobar(`la última de la lista también (${n})`, !!n && apareceComoNombre(r.texto, n));
  }
  const grande = abordar({ presupuesto: 200000 });
  comprobar("con presupuesto holgado el índice sigue siendo el mismo conjunto", grande.herramientasEnIndice === NOMES.length);
  comprobar("…y ahí sí entra el detalle de todas", grande.herramientasConDetalle === NOMES.length);
  comprobar("el invariante no depende del proveedor", ["zai", "groq", "openrouter", "custom", "mistral", "ollama"].every((p) =>
    abordar({ provider: p, presupuesto: 900, ...(p === "ollama" || p === "gemini" ? { canal: "nativo" as const } : {}) }).herramientasEnIndice === NOMES.length));
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n2. EL PRESUPUESTO SE EXCEDE, LA LISTA NO · presupuesto 10");
// ════════════════════════════════════════════════════════════════════════
{
  const r = abordar({ presupuesto: 10 });
  comprobar("con presupuesto 10 las 37 herramientas siguen nombradas", r.herramientasEnIndice === NOMES.length);
  comprobar("…y EXCEDIDO se declara (nunca se oculta)", r.excedido === true);
  comprobar("…y el exceso se cuantifica", r.excesoChars === r.chars - 10 && r.excesoChars > 0);
  comprobar("…y las leyes siguen presentes (P1 no se recorta en densidad mínima)",
    ENGINE_LAWS.every((l) => r.texto.includes(l.title)));
  comprobar("el bloque no muere cortado a mitad", /[.\]…]$/.test(r.texto.trim()));
  // El suelo del estándar: el contrato íntegro viaja incluso con presupuesto irreal.
  comprobar("el CONTRATO DE ACCIÓN viaja completo", r.texto.includes("Si no recibiste resultado, NO la hiciste"));
  for (const p of [10, 800, 1300, 1900, 4000, 200000]) {
    const x = abordar({ presupuesto: p });
    comprobar(`presupuesto ${p}: herramientasEnIndice === herramientasTotales (${x.herramientasEnIndice}/${x.herramientasTotales})`,
      x.herramientasEnIndice === x.herramientasTotales);
  }
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n3. EL MANUAL ESTÁ COMPLETO · y el respaldo del registro sigue vivo");
// ════════════════════════════════════════════════════════════════════════
// v1.0.31 · CAMBIO DE FONDO, NO DE FORMA. Hasta v1.0.30 este bloque comprobaba
// que EXISTIERA un déficit («el déficit existe de verdad»). Desde que las 16
// tienen manual, un déficit ya no es el estado sano: es el defecto. Lo que se
// sigue probando —y es lo que importa— es que el respaldo a la `description` del
// registro funciona cuando aparece una herramienta sin manual, sin tocar el P0.
// El respaldo se prueba con una herramienta SINTÉTICA: exigir un déficit real
// para probar el respaldo convertía el defecto en requisito.
{
  comprobar(`todas las herramientas registradas tienen manual (${NOMES.length - SIN_MANUAL.length}/${NOMES.length})`,
    SIN_MANUAL.length === 0);
  const conManual = NOMES.filter((n) => notaDeHerramienta(n, SPECS).fuente === "manual");
  comprobar(`y la nota sale del manual, no del registro (${conManual.length}/${NOMES.length})`,
    conManual.length === NOMES.length);

  const FANTASMA = "herramienta_de_prueba_sin_manual";
  const specsConFantasma = [...SPECS, { name: FANTASMA, description: "Descripción de registro de prueba. Segunda frase que no viaja." }];
  const notaFantasma = notaDeHerramienta(FANTASMA, specsConFantasma);
  comprobar("una herramienta sin manual cae al registro (el respaldo no se borró)",
    notaFantasma.fuente === "registro" && /Descripción de registro de prueba\./.test(notaFantasma.texto));
  comprobar("…y sin specs ni manual devuelve fuente «ninguna», no texto inventado",
    notaDeHerramienta(FANTASMA, null).fuente === "ninguna" && notaDeHerramienta(FANTASMA, null).texto === "");
  comprobar("…y una herramienta sin manual NI description se NOMBRA igual (P0 manda)",
    construirAbordaje({ nombres: [FANTASMA], specs: null, provider: "zai", presupuesto: 200000, canal: "nativo" }).herramientasEnIndice === 1);

  const r = abordar({ presupuesto: 200000 });
  for (const n of ["revisar_cambios", "deshacer_cambios"]) {
    comprobar(`${n} (HUESO_DE_OBRA) sale con detalle en el manual completo`, new RegExp(`^- ${n}: .+`, "m").test(r.texto));
  }
  comprobar("el hueso de obra no tiene herramientas sin explicación",
    [...HUESO_DE_OBRA].every((n) => notaDeHerramienta(n, SPECS).fuente !== "ninguna"));
  const aud = auditarManuales(NOMES, { specs: SPECS, hueso: HUESO_DE_OBRA, esExterna: (n) => esPackExterno(getToolSpec(n)?.pack || "") });
  comprobar("auditarManuales: sin manual 0 y el invariante se sostiene",
    aud.invarianteOk === true && aud.sinManual.length === 0 && aud.huesoSinManual.length === 0);
  comprobar("…y el parte lo dice con todas las letras", /sin manual 0/.test(aud.parte) && /INVARIANTE/.test(aud.parte) && /CATÁLOGO/.test(aud.parte));
  const conFantasma = auditarManuales([...NOMES, FANTASMA], { specs: specsConFantasma, hueso: HUESO_DE_OBRA });
  comprobar("…y si aparece una sin manual, la NOMBRA en el parte (la auditoría no se apagó)",
    conFantasma.sinManual.length === 1 && conFantasma.sinManual[0] === FANTASMA && conFantasma.parte.includes(FANTASMA));
  const sinSpecs = construirAbordaje({ nombres: [FANTASMA], specs: null, provider: "zai", presupuesto: 300, canal: "nativo" });
  comprobar("sin specs la sin-manual se nombra pero se declara sin nota (P0 ≠ documentación)",
    sinSpecs.herramientasEnIndice === 1 && sinSpecs.herramientasSinNota.length === 1);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n4. MCP · si está se nombra, si no está se dice que no hay");
// ════════════════════════════════════════════════════════════════════════
{
  const mcpNombres = ["web_fetch_url", "context7_docs", "mi_servidor_custom_tool"];
  const conMcp = abordar({
    nombres: [...NOMES, ...mcpNombres],
    mcp: { presente: true, nombres: mcpNombres },
    presupuesto: 900,
  });
  for (const n of mcpNombres) comprobar(`MCP "${n}" aparece por su nombre`, apareceComoNombre(conMcp.texto, n));
  comprobar("…y se declara que hay MCP en este turno", conMcp.texto.includes("MCP EN ESTE TURNO: sí"));
  const sinMcp = abordar({ mcp: { presente: false, nombres: [] }, presupuesto: 900 });
  comprobar("sin MCP se lo dice EXPRESS (no puede inventar una herramienta de MCP)",
    sinMcp.texto.includes("MCP EN ESTE TURNO: no hay servidores MCP cargados"));
  comprobar("…y la frase prohíbe inventar", /No inventes herramientas de MCP/.test(sinMcp.texto));
  const mcpSinManual = auditarManuales([...NOMES, ...mcpNombres], {
    specs: SPECS, hueso: HUESO_DE_OBRA, esExterna: (n) => mcpNombres.includes(n),
  });
  comprobar("las MCP no tienen TOOL_MANUALS y aun así llegan al índice",
    mcpSinManual.mcpSinManual.length === mcpNombres.length && mcpSinManual.invarianteOk);
  const mcpPresupuestoChico = abordar({ nombres: [...NOMES, ...mcpNombres], mcp: { presente: true, nombres: mcpNombres }, presupuesto: 10 });
  comprobar("con presupuesto irreal las MCP tampoco se caen del índice",
    mcpNombres.every((n) => apareceComoNombre(mcpPresupuestoChico.texto, n)));
  // Tercer estado: MCP cargado que este turno NO recibió (modelo pequeño recortado).
  const mcpFueraDelTurno = abordar({ mcp: { presente: true, nombres: mcpNombres }, presupuesto: 4000 });
  comprobar("MCP cargado pero fuera del catálogo del turno se dice EXPRESS (no se promete)",
    /NINGUNA de sus herramientas está en tu catálogo/.test(mcpFueraDelTurno.texto));
  comprobar("…y no se nombra ninguna MCP que el modelo no pueda llamar",
    mcpNombres.every((n) => !apareceComoNombre(mcpFueraDelTurno.texto, n)));
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n5. UN SOLO CONJUNTO · el manual nombra EXACTAMENTE lo que se envía");
// ════════════════════════════════════════════════════════════════════════
{
  // Así nacía el defecto 4: el manual con getToolsForModel(model) y cada rama con
  // su propio nombre (modeloOR / modeloCustom / targetModel). Aquí se simulan los
  // dos conjuntos y se exige identidad de CONJUNTOS, no de longitudes.
  const enviados = NOMES.filter((n) => !n.startsWith("ollama_"));
  const r = abordar({ nombres: enviados, presupuesto: 200000 });
  const delManual = new Set(nombresDelIndice(r.texto));
  comprobar("el índice no menciona ninguna herramienta que no se haya enviado",
    [...delManual].every((n) => enviados.includes(n)));
  comprobar("…y no falta ninguna de las enviadas", enviados.every((n) => delManual.has(n)));
  comprobar("…los dos conjuntos son iguales (cardinalidad)", delManual.size === enviados.length);
  // Idempotencia: el mismo conjunto de entrada, el mismo texto de salida.
  const a = abordar({ presupuesto: 4000 });
  const b = abordar({ presupuesto: 4000 });
  comprobar("determinismo: misma entrada, mismos caracteres", a.texto === b.texto && a.chars === b.chars);
  // Canal: si no hay canal de acción no se promete acción (guardaSinHerramientas).
  const ollamaSinTools = construirAbordaje({ nombres: [], provider: "ollama", presupuesto: 4000, specs: SPECS });
  comprobar("Ollama sin herramientas nativas NO recibe contrato (no hay ejecutor de texto)", ollamaSinTools.texto === "");
  // En canal de texto el CONJUNTO lo decide el servidor (todo lo que el motor sabría
  // ejecutar) y el CANAL es un dato aparte: un solo array viaja a las dos cosas.
  const openrouterSinTools = construirAbordaje({ nombres: NOMES.slice(0, 4), provider: "openrouter", presupuesto: 6000, specs: SPECS, canal: "texto" });
  comprobar("OpenRouter con canal de texto se le dice por dónde llega la acción", openrouterSinTools.texto.includes("Sin canal de funciones"));
  comprobar("…y solo nombra las 4 que se le mandaron", openrouterSinTools.herramientasTotales === 4 && openrouterSinTools.herramientasEnIndice === 4);
  const openrouterAuto = construirAbordaje({ nombres: [], provider: "openrouter", presupuesto: 6000, specs: SPECS });
  comprobar("…y sin ninguna herramienta el estándar sigue llegando (es la cláusula anti-mentira)",
    openrouterAuto.canal === "texto" && openrouterAuto.texto.includes("CONTRATO DE ACCIÓN"));
  comprobar("…pero NO se le promete una mano que el turno no tiene",
    !openrouterAuto.texto.includes("EMITE la accion como TEXTO") && /no hay ninguna herramienta activa/.test(openrouterAuto.texto));
}

// ════════════════════════════════════════════════════════════════════════
console.log("\n6. EL PRESUPUESTO DEJÓ DE SER UN NÚMERO A OJO");
// ════════════════════════════════════════════════════════════════════════
{
  for (const [nivel, perfil] of [
    ["nube rápida", { tier: "cloud", nubeRapida: true }],
    ["local ≤8B", { tier: "small" }],
    ["grande", { tier: "large" }],
    ["micro", { tier: "micro" }],
  ] as Array<[string, { tier: string; nubeRapida?: boolean }]>) {
    const p = presupuestoAbordaje(perfil, NOMES.length, { longitudNombres: LOG_NOMES, charsDetalle: DETALLE });
    const r = abordar({ presupuesto: p.recomendado });
    comprobar(`${nivel}: recomendado ${p.recomendado} cubre el suelo sin declarar exceso`,
      (perfil.tier === "micro" || p.recomendado === 0) ? true : (!r.excedido && r.herramientasEnIndice === NOMES.length));
    comprobar(`…${nivel}: el suelo nunca baja del catálogo completo`, perfil.tier === "micro" || p.sueloTitulos >= LOG_NOMES);
  }
  const p = presupuestoAbordaje({ tier: "cloud", nubeRapida: true }, NOMES.length, { longitudNombres: LOG_NOMES, charsDetalle: DETALLE });
  comprobar("la base vieja (800) queda documentada como insuficiente, no como techo", p.base === 800 && p.suelo > p.base);
  const grande = presupuestoAbordaje({ tier: "large" }, NOMES.length, { longitudNombres: LOG_NOMES, charsDetalle: DETALLE });
  const rGrande = abordar({ presupuesto: grande.recomendado });
  comprobar("el nivel grande lleva el detalle de las 37 herramientas", rGrande.herramientasConDetalle === NOMES.length);
}

if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  · " + f);
  console.log("\nSi una herramienta nueva se queda fuera del índice, el arreglo NO es\naflojar este test: es que el catálogo es P0. Revisa construirAbordaje() — si\nnombra a todas, el modelo las usa; si no, las inventa.");
}
console.log(`\n—— abordaje: ${ok} correctas, ${mal} en rojo ——`);
if (mal > 0) process.exitCode = 1;
