/**
 * tests/manualesCobertura.test.ts — v1.0.31 · LAS 46 CON MANUAL Y SIN MENTIRAS
 * ==========================================================================
 * QUÉ DEFECTO CIERRA (el que la propuesta v1.1.0 marcó como P1a)
 * ──────────────────────────────────────────────────────────────
 * El registro declaraba 46 herramientas; `TOOL_MANUALS` explicaba 30. Las 16 sin
 * entrada no se nombraban nunca con detalle (recibían el esquema JSON y cero
 * prosa), y cuatro de ellas estaban descritas —en la propuesta, en el README y en
 * el catálogo— con capacidades que su ESQUEMA NO TIENE:
 *
 *   · `convertir_formato` «convierte a XML»  → el enum es json|yaml|toml|csv.
 *   · `recursos_maquina` «disco libre»       → mide CPU y RAM; no toca el disco.
 *   · `cerebro_recordar` «la sesión actual»  → es memoria de LARGO PLAZO.
 *   · `git_commit` «solo con tests verdes»   → no hay tal puerta: guarda y ya.
 *
 * Un manual que promete lo que el esquema rechaza es peor que no tener manual: el
 * modelo llama, el motor dice 400, y el turno se quema en una contradicción que
 * escribimos nosotros. Por eso esta suite no cuenta entradas: BATEN el texto del
 * manual contra el esquema REAL de cada herramienta.
 *
 * LO QUE SE PRUEBA
 *   1. Cobertura: 46/46 (registro real, no una lista de adorno).
 *   2. Forma: id único, título que empieza por el nombre, cuerpo con tamaño útil,
 *      el nombre aparece en el cuerpo y en las claves, tag «manual».
 *   3. Esquema: los parámetros OBLIGATORIOS de cada herramienta se nombran en su
 *      manual (en las 16 nuevas) y ninguna promete un enum o una medida ausente.
 *   4. Las cuatro contradicciones concretas, una por una.
 *   5. El abordaje nombra las 46 y ninguna queda sin nota.
 *
 * Puro: sin red, sin fs, sin modelo. `npx tsx tests/manualesCobertura.test.ts`
 */

import { TOOL_MANUALS, ENGINE_LAWS } from "../src/engine/manuals";
import { registerBuiltinPacks, getAllToolNames, getToolSpec } from "../src/engine/toolRegistry";
import { registrarPackDocumentos } from "../src/engine/packDocumentos";
import { registrarPackTerminal } from "../src/engine/packTerminal";
import { construirAbordaje, notaDeHerramienta } from "../src/engine/abordaje";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function comprobar(desc: string, cond: boolean, detalle = "") {
  if (cond) { ok++; }
  else { mal++; fallos.push(desc + (detalle ? ` → ${detalle}` : "")); }
  console.log(`  ${cond ? "\u2713" : "\u2717"} ${desc}${!cond && detalle ? ` → ${detalle}` : ""}`);
}

registerBuiltinPacks();
registrarPackDocumentos();
registrarPackTerminal();
const NOMBRES = getAllToolNames();
const SPECS = NOMBRES.map((n) => ({ name: n, description: getToolSpec(n)?.description }));
const cuerpo = (n: string) => String(TOOL_MANUALS[n]?.body ?? "");

// Las 16 que se escribieron en v1.0.31 contra el esquema real.
const NUEVAS = [
  "pc_write_file", "pc_list_dir", "pc_delete", "git_diff", "git_commit",
  "convertir_formato", "ollama_estado", "ollama_expulsar", "recursos_maquina",
  "cerebro_recordar", "cerebro_consultar", "terminal_abrir", "terminal_enviar",
  "terminal_leer", "terminal_cerrar", "terminal_listar",
];

console.log("\n1. COBERTURA · las 46 del registro, una por una");
// ════════════════════════════════════════════════════════════════════════
{
  comprobar(`el registro declara 46 herramientas (${NOMBRES.length})`, NOMBRES.length === 46, `son ${NOMBRES.length}`);
  const sinManual = NOMBRES.filter((n) => !TOOL_MANUALS[n]);
  comprobar("ninguna se queda sin manual", sinManual.length === 0, sinManual.join(", "));
  comprobar("las 16 de v1.0.31 están, con su nombre exacto", NUEVAS.every((n) => NOMBRES.includes(n) && TOOL_MANUALS[n]));
  comprobar("y el manual no tiene entradas huérfanas (nombres que no son herramientas)",
    Object.keys(TOOL_MANUALS).every((n) => NOMBRES.includes(n)),
    Object.keys(TOOL_MANUALS).filter((n) => !NOMBRES.includes(n)).join(", "));
  const ids = Object.values(TOOL_MANUALS).map((m) => String(m.id));
  comprobar(`los ids son únicos (${ids.length})`, new Set(ids).size === ids.length);
}

console.log("\n2. FORMA · un manual que no se puede leer no se usa");
// ════════════════════════════════════════════════════════════════════════
{
  for (const n of NOMBRES) {
    const m = TOOL_MANUALS[n];
    if (!m) { comprobar(`${n}: existe`, false); continue; }
    const b = String(m.body || "");
    const problemas: string[] = [];
    if (!String(m.title).startsWith(n)) problemas.push("el título no empieza por el nombre");
    if (b.length < 90) problemas.push(`cuerpo muy corto (${b.length})`);
    // El abordaje solo inyecta la PRIMERA frase (`primeraFrase`), así que el
    // cuerpo largo no infla el prompt; 1400 es el techo de lo que el panel muestra.
    if (b.length > 1400) problemas.push(`cuerpo muy largo (${b.length} > 1400)`);
    if ((m.keys || []).length < 3) problemas.push(`pocas claves (${(m.keys || []).length})`);
    if (!(m.tags || []).includes("manual")) problemas.push("falta el tag manual");
    if (/# ?TODO\b|\bFIXME\b|pendiente de escribir/.test(b)) problemas.push("marcador de borrador en el texto");
    if (NUEVAS.includes(n) && b.length > 700) problemas.push(`cuerpo de manual nuevo demasiado largo (${b.length} > 700)`);
    comprobar(`manual de ${n} (${b.length} chars)`, problemas.length === 0, problemas.join("; "));
  }
  const total = NOMBRES.reduce((a, n) => a + cuerpo(n).length, 0);
  comprobar(`el manual completo no se dispara (${total} chars)`, total < 26000, `${total}`);
  comprobar(`las leyes del motor siguen enteras (${ENGINE_LAWS.length})`,
    ENGINE_LAWS.length === 5 && ENGINE_LAWS.every((l) => (l.tags || []).includes("ley")));
}

console.log("\n3. ESQUEMA · el manual no promete lo que la herramienta rechaza");
// ════════════════════════════════════════════════════════════════════════
{
  // 3.1 · Parámetros OBLIGATORIOS nombrados (exigido a las 16 nuevas: están
  // escritas contra el esquema; las 30 viejas son prosa y se auditan aparte).
  for (const n of NUEVAS) {
    const spec = getToolSpec(n);
    const req: string[] = ((spec?.parameters as any)?.required ?? []).map(String);
    const faltan = req.filter((p) => !cuerpo(n).includes(p));
    comprobar(`${n}: nombra sus ${req.length || 0} parámetro(s) obligatorio(s)`, faltan.length === 0, faltan.join(", "));
  }
  // 3.2 · Enum de convertir_formato: SOLO los cuatro del esquema, ni uno más.
  const enumConv: string[] = ((getToolSpec("convertir_formato")?.parameters as any)?.properties?.hacia?.enum) || [];
  comprobar(`convertir_formato declara 4 formatos (${enumConv.join("|")})`, enumConv.length === 4);
  for (const f of enumConv) comprobar(`…y el manual nombra «${f}»`, cuerpo("convertir_formato").includes(f));
  comprobar("…y NO promete XML (no está en el enum)", !/xml/i.test(cuerpo("convertir_formato")));
  for (const otro of ["docx", "pdf", "xlsx"]) {
    comprobar(`…ni promete ${otro} (no está en el enum)`, !cuerpo("convertir_formato").toLowerCase().includes(otro));
  }
  // 3.3 · recursos_maquina: mide CPU/RAM, NO disco ni GPU — y lo declara.
  const propsRec = Object.keys(((getToolSpec("recursos_maquina")?.parameters as any)?.properties) || {});
  comprobar("recursos_maquina no recibe parámetros (no hay filtro de disco que ofrecer)", propsRec.length === 0);
  comprobar("…y su manual declara el límite: «no mide disco»", /no mide disco/i.test(cuerpo("recursos_maquina")));
  comprobar("…sin afirmar cifras de disco (nada de «disco libre / total / disponible»)",
    !/disco\s+(libre|total|disponible)/i.test(cuerpo("recursos_maquina")));
  // 3.4 · cerebro_recordar: largo plazo, no «esta sesión».
  comprobar("cerebro_recordar dice LARGO PLAZO / entre sesiones",
    /largo plazo/i.test(cuerpo("cerebro_recordar") + TOOL_MANUALS["cerebro_recordar"].title) && /entre sesiones|entre turnos/i.test(cuerpo("cerebro_recordar")));
  comprobar("…y no dice «la sesión actual» (no es memoria de sesión)", !/sesi[oó]n actual/i.test(cuerpo("cerebro_recordar")));
  comprobar("cerebro_consultar y cerebro_recordar no se confunden de papel",
    /consulta|consultar/i.test(cuerpo("cerebro_consultar")) && !/guarda en el cerebro/i.test(cuerpo("cerebro_consultar")));
  // 3.5 · git_commit: punto de restauración SIN puerta de tests.
  const descCommit = String(getToolSpec("git_commit")?.description || "");
  comprobar("el esquema de git_commit añade todo y hace commit", /a[nñ]ade todo/i.test(descCommit) && /commit/i.test(descCommit));
  comprobar("…y el manual lo llama PUNTO DE RESTAURACIÓN", /punto de restauraci[oó]n/i.test(cuerpo("git_commit")));
  comprobar("…y dice que NO exige tests verdes (no inventa una puerta)", /no exige tests verdes/i.test(cuerpo("git_commit")));
  comprobar("…y no la presenta como «solo con tests verdes»", !/solo con tests verdes/i.test(cuerpo("git_commit")));
  // 3.6 · El resto de la familia PC/terminal: nada de prometer sandbox donde es PC.
  for (const n of ["pc_write_file", "pc_delete", "pc_list_dir"]) {
    comprobar(`${n} aclara que es la PC real y no el sandbox`, /pc|equipo|m[aá]quina/i.test(cuerpo(n)) && /sandbox/i.test(cuerpo(n)));
  }
}

console.log("\n4. EL ABORDAJE · 46 nombradas y 46 con nota");
// ════════════════════════════════════════════════════════════════════════
{
  const r = construirAbordaje({ nombres: NOMBRES, specs: SPECS, provider: "zai", presupuesto: 200000, canal: "nativo" });
  comprobar(`nombra las 46 en el índice (${r.herramientasEnIndice}/${NOMBRES.length})`, r.herramientasEnIndice === NOMBRES.length);
  comprobar(`y las 46 llevan detalle (${r.herramientasConDetalle})`, r.herramientasConDetalle === NOMBRES.length);
  comprobar("ninguna queda sin nota (antes eran 16)", r.herramientasSinNota.length === 0, r.herramientasSinNota.join(", "));
  comprobar("la nota de las 16 sale del manual, no del esquema",
    NUEVAS.every((n) => notaDeHerramienta(n, SPECS).fuente === "manual"));
  const apretado = construirAbordaje({ nombres: NOMBRES, specs: SPECS, provider: "zai", presupuesto: 800, canal: "nativo" });
  comprobar("apretar el presupuesto sigue sin recortar herramientas (P0)", apretado.herramientasEnIndice === NOMBRES.length);
}

// ════════════════════════════════════════════════════════════════════════
console.log(`\n—— manualesCobertura: ${ok} correctas, ${mal} en rojo ——`);
if (mal) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(`  · ${f}`);
}
process.exitCode = mal ? 1 : 0;
