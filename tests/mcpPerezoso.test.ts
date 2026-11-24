/*
tests/mcpPerezoso.test.ts — v1.0.30

El arranque perezoso, probado de punta a punta con un servidor MCP REAL (un
script node que habla el protocolo por stdio). No se prueba con dobles: el
valor de esta función está justo en lo que pasa cuando el proceso tarda, falla
o no existe, y un doble siempre tarda, falla y existe como uno quiere.

Los fallos que esta suite impide repetir:
  1. Con caché válida, cargar los packs NO deja ningún proceso vivo.
  2. La primera llamada real SÍ lo levanta (y responde de verdad).
  3. Diez llamadas simultáneas comparten UN solo arranque (no diez procesos).
  4. Un comando que no existe se dice con su motivo, y NO se contesta con la
     caché como si el servidor estuviera vivo.
  5. Sin caché (primera vez), se arranca como en v1.0.28 y se deja la caché escrita.
*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const leer = (rel: string): string => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");
const PACKS = leer("src/engine/packsMcp.ts");
const SERVER = leer("server.ts");
const CLIENTE = leer("src/engine/clienteMcp.ts");

let ok = 0;
const fallos: string[] = [];
function check(nombre: string, cond: boolean, detalle?: string): void {
  if (cond) ok++;
  else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}

// ── 0 · Un servidor MCP de verdad, escrito a disco ─────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cn-mcp-perezoso-"));
const SERVIDOR = path.join(TMP, "servidor-falso.mjs");
fs.writeFileSync(
  SERVIDOR,
  [
    'let buffer = "";',
    'let n = 0;',
    'const enviar = (o) => process.stdout.write(JSON.stringify(o) + "\\n");',
    'process.stdin.on("data", (d) => {',
    '  buffer += d.toString();',
    '  let i;',
    '  while ((i = buffer.indexOf("\\n")) >= 0) {',
    '    const linea = buffer.slice(0, i).trim();',
    '    buffer = buffer.slice(i + 1);',
    '    if (!linea) continue;',
    '    let m; try { m = JSON.parse(linea); } catch { continue; }',
    '    if (m.method === "initialize") enviar({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "falso", version: "1.0.0" } } });',
    '    else if (m.method === "tools/list") enviar({ jsonrpc: "2.0", id: m.id, result: { tools: [',
    '      { name: "eco", description: "Devuelve el texto", inputSchema: { type: "object", properties: { texto: { type: "string" } } } },',
    '      { name: "cuenta", description: "Cuenta llamadas", inputSchema: { type: "object", properties: {} } }',
    '    ] } });',
    '    else if (m.method === "tools/call") { n++; enviar({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "eco:" + JSON.stringify(m.params.arguments || {}) + ":" + n + ":pid" + process.pid }] } }); }',
    '    else if (m.id !== undefined) enviar({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "método no soportado" } });',
    '  }',
    '});',
  ].join("\n"),
  "utf-8"
);

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), "cn-mcp-raiz-"));
const NODE = process.execPath;
const CACHE_FALSO = {
  name: "eco",
  description: "Devuelve el texto",
  inputSchema: { type: "object", properties: { texto: { type: "string" } } },
};

function escribirConfig(id: string, comando: string, args: string[]): void {
  fs.writeFileSync(
    path.join(RAIZ, "mcp_servers.json"),
    JSON.stringify({ servidores: [{ id, comando, args, enabled: true, timeout: 20 }] }, null, 2),
    "utf-8"
  );
}

(async () => {
  // ── Las palabras del contrato, leídas del código real ────────────────
  check("el cliente lanza el proceso sin shell (rutas con espacios)", /shell:\s*false/.test(CLIENTE));
  check("un comando inexistente se explica como «comando no encontrado»", /comando no encontrado/.test(CLIENTE));
  check("packsMcp guarda la entrada para poder levantar a demanda", /ENTRADAS\.set\(entrada\.id, \{ entrada, raiz \}\)/.test(PACKS));
  check("hay UN arranque compartido (dos llamadas no abren dos procesos)", /const enCurso = ARRANCANDO\.get\(id\);\s*\n\s*if \(enCurso\) return enCurso;/.test(PACKS));
  check("server.ts ya no contesta «ya no está vivo»", !/ya no está vivo/.test(SERVER));
  check("server.ts usa el arranque a demanda en el despacho", /await asegurarServidorMcp\(duenio\.id\)/.test(SERVER));

  const {
    cargarPacksMcp,
    asegurarServidorMcp,
    servidorMcp,
    cerrarTodosMcp,
    ARCHIVO_CACHE_ESQUEMAS,
  } = await import("../src/engine/packsMcp");

  // ── A · Primera vez: sin caché, se arranca de verdad y se deja caché ─
  escribirConfig("falso", NODE, [SERVIDOR]);
  const archivoCache = path.join(RAIZ, ARCHIVO_CACHE_ESQUEMAS);
  if (fs.existsSync(archivoCache)) fs.unlinkSync(archivoCache);
  const logs1: string[] = [];
  const r0 = await cargarPacksMcp(RAIZ, { log: (m) => logs1.push(m) });
  check("sin caché: 2 herramientas registradas", r0.cargados.falso === 2, JSON.stringify(r0));
  check("sin caché: el proceso queda vivo (como v1.0.28)", !!servidorMcp("falso"));
  check("★ tras el primer arranque la caché queda escrita", fs.existsSync(archivoCache));
  const sobre = JSON.parse(fs.readFileSync(archivoCache, "utf-8"));
  // v1.0.31 · el archivo pasó a llevar sobre {version, actualizadoEn, servidores}.
  // Se lee el sobre y, si no está, el mapa plano de v1.0.30 (compatibilidad).
  const cacheEscrita = sobre.servidores || sobre;
  check("la caché se escribe con sobre versionado", sobre.version === 2 && !!sobre.servidores);
  check("la caché guarda las DOS definiciones", cacheEscrita.falso?.herramientas?.length === 2);
  check("la caché guarda la CUENTA (detector de truncado)", cacheEscrita.falso?.cuenta === 2);
  check("la caché guarda una huella sha256", /^[0-9a-f]{64}$/.test(String(cacheEscrita.falso?.huella || "")));
  check("no queda ningún temporal de escritura al lado", !fs.readdirSync(RAIZ).some((f) => f.startsWith(ARCHIVO_CACHE_ESQUEMAS) && f.endsWith(".tmp")));
  check("la caché NO guarda el comando en claro (solo la huella)", !fs.readFileSync(archivoCache, "utf-8").includes(NODE));

  // ── B · Segunda carga con caché válida: cero procesos ───────────────
  cerrarTodosMcp();
  check("tras cerrar todo no hay proceso vivo", servidorMcp("falso") === null);
  const logs2: string[] = [];
  const r1 = await cargarPacksMcp(RAIZ, { recargar: true, log: (m) => logs2.push(m) });
  check("con caché: 2 herramientas igual", r1.cargados.falso === 2, JSON.stringify(r1));
  check("★ con caché válida NO se arranca ningún proceso", servidorMcp("falso") === null);
  check("se dice que se levanta al primer uso", logs2.some((m) => /se levanta al primer uso/.test(m)), logs2.join(" | "));

  // ── C · Diez llamadas simultáneas: UN arranque ──────────────────────
  const diez = await Promise.all(Array.from({ length: 10 }, () => asegurarServidorMcp("falso")));
  const vivo = servidorMcp("falso");
  check("★ la primera llamada levanta el proceso", !!vivo && vivo.vivo === true);
  check("★ y las diez reciben ESE mismo servidor (un arranque, no diez)", diez.every((s) => s === vivo));
  const eco = await vivo!.llamarHerramienta("eco", { texto: "hola" });
  check("el servidor levanta a demanda contesta de verdad", eco.ok === true && eco.texto.includes('"texto":"hola"'), eco.texto);
  const pid = Number((/pid(\d+)/.exec(eco.texto) || [])[1]);
  check("y es un proceso node real", pid > 0);
  const otra = await vivo!.llamarHerramienta("cuenta", {});
  check("una segunda llamada no reabre: mismo pid", otra.texto.includes(`pid${pid}`), otra.texto);

  // ── D · El comando deja de existir: se dice, no se finge ────────────
  cerrarTodosMcp();
  escribirConfig("roto", path.join(TMP, "no-existe-jamas"), []);
  const logs3: string[] = [];
  const r2 = await cargarPacksMcp(RAIZ, { recargar: true, log: (m) => logs3.push(m) });
  check("un comando inexistente se marca como fallido", r2.fallidos.includes("roto"), JSON.stringify(r2));
  check("y se explica con su motivo", logs3.some((m) => /no disponible/.test(m)), logs3.join(" | "));
  check("asegurar sobre un servidor que no está da null", (await asegurarServidorMcp("inexistente")) === null);

  // ── E · Recarga: soltar también los relojes ─────────────────────────
  check("cerrarTodosMcp existe y se llama en el apagado del server", /process\.once\("exit", \(\) => \{ try \{ cerrarTodosMcp\(\);/.test(SERVER));

  cerrarTodosMcp();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch {}

  console.log(`mcpPerezoso: ${ok} correctas · ${fallos.length} fallidas`);
  console.log(`${ok}/${ok + fallos.length} comprobaciones en verde`);
  if (fallos.length) process.exit(1);
})();
