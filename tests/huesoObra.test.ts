/**
 * huesoObra.test.ts — v1.23.0 · LA SONDA DEL ANTES/DESPUÉS DEL RECORTE
 * ====================================================================
 * Mide el registro REAL de herramientas con el perfil de un deepseek-r1:7b
 * (tool-capable, 7B, local) — el mismo caso que en v1.22.2 devolvía 8
 * herramientas SIN write_file, SIN run_command, SIN run_tests, SIN deshacer
 * y SIN las MCP. Esta suite fija el contrato nuevo:
 *   · el HUESO DE OBRA (11 herramientas de construcción) nunca se recorta
 *   · los packs EXTERNOS (MCP/plugins) tienen 4 huecos reservados
 *   · el tope para modelo chico pasó de 8 a 14
 *   · el recorte se EXPLICA (nunca silencioso)
 *
 * Se ejecuta con:   npx tsx tests/huesoObra.test.ts
 */
import {
  HUESO_DE_OBRA,
  HUECOS_RESERVADOS_EXTERNO,
  TOPE_MODELO_PEQUENO,
  esPackExterno,
  explicarRecorte,
  getAllToolNames,
  getActiveToolSpecs,
  registerBuiltinPacks,
  registerToolPack,
  selectToolsForModel,
  type ToolSpec,
} from "../src/engine/toolRegistry";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} · ${detalle}`); }
}

registerBuiltinPacks();

console.log("\n[0] El hueso declarado");
comprobar("el hueso tiene 11 herramientas", HUESO_DE_OBRA.size === 11, String(HUESO_DE_OBRA.size));
for (const n of ["write_file", "run_command", "run_tests", "revisar_cambios", "deshacer_cambios", "edit_file", "read_file", "list_files", "search_in_files", "set_plan", "update_task"]) {
  comprobar(`el hueso incluye ${n}`, HUESO_DE_OBRA.has(n));
}
comprobar("tope modelo chico = 14 (antes 8)", TOPE_MODELO_PEQUENO === 14);
comprobar("huecos reservados para externo = 4", HUECOS_RESERVADOS_EXTERNO === 4);

console.log("\n[1] Clasificación de packs");
comprobar("core/pc/git/web/data/sistema NO son externos", ["core", "pc", "git", "web", "data", "sistema"].every((p) => !esPackExterno(p)));
comprobar("un pack 'mcp-puente' SÍ es externo", esPackExterno("mcp-puente"));
comprobar("las extensiones locales (ext:*) no consumen el hueco MCP", !esPackExterno("ext:cn.aduana"));

console.log("\n[2] LA SONDA: perfil 7B tool-capable sobre el registro real");
const specs = getActiveToolSpecs({ pcMode: true, vision: false, network: true, git: true, sandbox: true });
registerToolPack({
  id: "mcp-demo",
  label: "MCP demo",
  description: "pack externo de prueba",
  tools: [
    { name: "mcp_web_search", pack: "mcp-demo", description: "buscar", parameters: { type: "object", properties: {}, required: [] } },
    { name: "mcp_fetch", pack: "mcp-demo", description: "traer", parameters: { type: "object", properties: {}, required: [] } },
  ],
});
const specsConMcp = getActiveToolSpecs({ pcMode: true, vision: false, network: true, git: true, sandbox: true });
const perfil7b = { toolCapable: true, paramsB: 7, remote: false };
const seleccion = selectToolsForModel(specsConMcp, perfil7b);
const nombres = new Set(seleccion.map((s) => s.name));

comprobar("el 7B recibe AL MENOS el hueso completo (11)", [...HUESO_DE_OBRA].every((n) => nombres.has(n)),
  `faltan: ${[...HUESO_DE_OBRA].filter((n) => !nombres.has(n)).join(", ") || "ninguna"}`);
comprobar("write_file está en la selección (el ANTES decía NO)", nombres.has("write_file"));
comprobar("run_command está en la selección", nombres.has("run_command"));
comprobar("run_tests está en la selección", nombres.has("run_tests"));
comprobar("deshacer_cambios está en la selección", nombres.has("deshacer_cambios"));
comprobar("las 2 MCP del pack externo llegan al modelo", nombres.has("mcp_web_search") && nombres.has("mcp_fetch"));
comprobar("la selección cabE en el tope o es exactamente el hueso+externas", seleccion.length <= TOPE_MODELO_PEQUENO, String(seleccion.length));

console.log("\n[3] El recorte se explica, nunca silencia");
const fuera = explicarRecorte(seleccion, specsConMcp);
comprobar("si algo quedó fuera, se NOMBRA", fuera.length === specsConMcp.length - seleccion.length && (fuera.length === 0 || fuera.every((n) => typeof n === "string" && n.length > 0)));
comprobar("nada del hueso quedó fuera de la lista de recorte", !fuera.some((n) => HUESO_DE_OBRA.has(n)));

console.log("\n[4] Los demás perfiles no sufren regresión");
comprobar("modelo sin tool-calling: cero herramientas (igual que antes)", selectToolsForModel(specsConMcp, { toolCapable: false, paramsB: 1, remote: false }).length === 0);
comprobar("modelo nube: todas las del contexto, sin recorte", selectToolsForModel(specsConMcp, { toolCapable: true, paramsB: null, remote: true }).length === specsConMcp.length);
comprobar("modelo local grande (>8B): sin recorte", selectToolsForModel(specsConMcp, { toolCapable: true, paramsB: 14, remote: false }).length === specsConMcp.length);
comprobar("hueco MCP acotado: con 10 externas, solo 4 entran", (() => {
  const muchas: ToolSpec[] = Array.from({ length: 10 }, (_, i) => ({
    name: `x_mcp_${i}`, pack: "mcp-demo", description: "d", parameters: { type: "object", properties: {}, required: [] },
  }));
  const sel = selectToolsForModel([...muchas], { toolCapable: true, paramsB: 7, remote: false });
  return sel.filter((s) => s.pack === "mcp-demo").length === HUECOS_RESERVADOS_EXTERNO;
})());

console.log(`\n${pasan}/${pasan + fallan} correctas`);
if (fallan > 0) { console.error("FALLOS:", fallos); process.exit(1); }
