// tests/clienteMcp.test.ts — v1.0.28
// EL CLIENTE MCP QUE FALTABA. Hasta v1.0.27 `mcp_servers.json` era un archivo
// que NADIE leía: ningún proceso lanzaba `scripts/mcp_fetch.py`. Esta suite fija
// (a) que el módulo existe y es un cliente JSON-RPC stdio de verdad, (b) que no
// llega a lanzar procesos durante las pruebas (importar no arranca nada), y
// (c) que el cargador del servidor lo usa, para que no vuelva a quedar huérfano.
// Lo que NO prueba: la conversación real con un servidor MCP (eso necesita
// Python en la máquina de Mario).

import assert from "node:assert";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const lee = (rel: string) => fs.readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");
const existe = (rel: string) => fs.existsSync(fileURLToPath(new URL("../" + rel, import.meta.url)));

const { ServidorMcp, esquemaDelRegistro, estaActivo, leerConfiguracion, nombrePublico, resolverRutaArg, resolverVariables, timeoutDe } = await import("../src/engine/clienteMcp.ts");
const { duenioDeHerramienta } = await import("../src/engine/packsMcp.ts");

const casos: Array<{ nombre: string; fn: () => any | Promise<any> }> = [];
const prueba = (nombre: string, fn: () => any | Promise<any>) => casos.push({ nombre, fn });

prueba("el módulo del cliente MCP existe", () => {
  assert.ok(existe("src/engine/clienteMcp.ts"), "falta src/engine/clienteMcp.ts");
});

prueba("es JSON-RPC 2.0 por stdio: initialize / tools/list / tools/call", () => {
  const src = lee("src/engine/clienteMcp.ts");
  assert.ok(src.includes('"initialize"'), "falta initialize");
  assert.ok(src.includes('"tools/list"') || src.includes("tools/list"), "falta tools/list");
  assert.ok(src.includes('"tools/call"') || src.includes("tools/call"), "falta tools/call");
  assert.ok(/protocolVersion/.test(src), "initialize debe declarar protocolVersion");
  assert.ok(/jsonrpc/.test(src) && /"2\.0"/.test(src), "falta el sobre jsonrpc 2.0");
});

prueba("lanza sin shell (Windows: rutas con espacios no se rompen) y limpia al cerrar", () => {
  const src = lee("src/engine/clienteMcp.ts");
  assert.ok(/shell:\s*false/.test(src), "spawn debe ir con shell:false");
  assert.ok(/kill\(/.test(src), "falta matar el proceso al cerrar");
  assert.ok(/timeout/i.test(src), "falta tiempo de espera: un servidor mudo no puede colgar el arranque");
});

prueba("el módulo NO arranca procesos al importarse (importar no tiene efectos)", () => {
  const src = lee("src/engine/clienteMcp.ts");
  const fueraDeFunciones = src.replace(/export function[\s\S]*?\n}/g, "");
  assert.ok(!/spawn\(/.test(fueraDeFunciones.split("export ")[0] || ""), "no puede haber spawn en el nivel superior");
});

prueba("server.ts usa el cliente: mcp_servers.json deja de ser un archivo muerto", () => {
  const srv = lee("server.ts");
  assert.ok(/packsMcp/.test(srv), "server.ts no usa el cargador MCP");
  assert.ok(/cargarPacksMcp\(/.test(srv), "server.ts no llama a cargarPacksMcp");
  assert.ok(/mcp_servers\.json/.test(srv), "server.ts no lee mcp_servers.json");
});

prueba("nombrePublico: prefijo del servidor, sin guiones (el modelo no recibe nombres raros)", () => {
  assert.strictEqual(nombrePublico("web", "fetch_url"), "web_fetch_url");
  assert.strictEqual(nombrePublico("cloudflare-docs", "get page"), "cloudflare_docs_get_page");
});

prueba("enabled:false apaga sin borrar; una entrada sin comando no se arranca", () => {
  assert.strictEqual(estaActivo({ id: "a", comando: "npx", enabled: false }), false);
  assert.strictEqual(estaActivo({ id: "a", comando: "npx" }), true);
  assert.strictEqual(estaActivo({ id: "a", comando: "" } as any), false);
  assert.strictEqual(estaActivo(null), false);
});

prueba("el tiempo de espera se corrige, no rompe el arranque (5-120 s)", () => {
  assert.strictEqual(timeoutDe({ id: "a", comando: "x", timeout: 30 }), 30_000);
  assert.strictEqual(timeoutDe({ id: "a", comando: "x", timeout: 0 }), 30_000);
  assert.strictEqual(timeoutDe({ id: "a", comando: "x", timeout: 1 }), 5_000);
  assert.strictEqual(timeoutDe({ id: "a", comando: "x", timeout: 999 }), 120_000);
});

prueba("leerConfiguracion: descarta y DICE el motivo, nunca hace desaparecer en silencio", () => {
  const r = leerConfiguracion({ servidores: [
    { id: "ok", comando: "python", args: ["x.py"], timeout: 20 },
    { id: "sinComando" },
    { id: "ok", comando: "npx" },
    { comando: "npx" },
  ] });
  assert.deepStrictEqual(r.servidores.map((s) => s.id), ["ok"]);
  assert.strictEqual(r.servidores[0].timeout, 20);
  assert.ok(r.descartados.some((d) => d.id === "sinComando" && d.motivo.includes("comando")), JSON.stringify(r.descartados));
  assert.ok(r.descartados.some((d) => d.id === "ok" && d.motivo.includes("repetido")), JSON.stringify(r.descartados));
  assert.ok(r.descartados.some((d) => d.motivo.includes("id")), JSON.stringify(r.descartados));
});

prueba("resolverVariables: el token NO vive en el archivo y lo que falta se informa", () => {
  const ok = resolverVariables(["--header", "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}", "https://x/mcp"], { CLOUDFLARE_API_TOKEN: "abc123" });
  assert.deepStrictEqual(ok.args, ["--header", "Authorization: Bearer abc123", "https://x/mcp"]);
  assert.deepStrictEqual(ok.faltantes, []);
  const falta = resolverVariables(["--header", "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"], {});
  assert.ok(falta.args[1].includes("${CLOUDFLARE_API_TOKEN}"), "sin valor se deja el texto, no una cadena vacía");
  assert.deepStrictEqual(falta.faltantes, ["CLOUDFLARE_API_TOKEN"]);
  const prefijo = resolverVariables(["$CN_MCP_X"], { CN_MCP_X: "hola" });
  assert.deepStrictEqual(prefijo.args, ["hola"]);
});

prueba("resolverRutaArg: script relativo → absoluto; flags y URLs intactos", () => {
  assert.ok(resolverRutaArg("scripts/mcp_fetch.py", "/tmp/x").endsWith("scripts/mcp_fetch.py"));
  assert.ok(resolverRutaArg("scripts/mcp_fetch.py", process.cwd()).startsWith("/") || /^[A-Za-z]:/.test(resolverRutaArg("scripts/mcp_fetch.py", process.cwd())));
  assert.strictEqual(resolverRutaArg("-y", "/tmp/x"), "-y");
  assert.strictEqual(resolverRutaArg("https://mcp.cloudflare.com/mcp", "/tmp/x"), "https://mcp.cloudflare.com/mcp");
  assert.strictEqual(resolverRutaArg("llama-3.3-70b", "/tmp/x"), "llama-3.3-70b");
});

prueba("esquemaDelRegistro: JSON Schema válido pasa; vacío o raro → objeto vacío", () => {
  assert.deepStrictEqual(esquemaDelRegistro({ type: "object", properties: { url: { type: "string" } }, required: ["url"] }), {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  });
  assert.deepStrictEqual(esquemaDelRegistro(undefined), { type: "object", properties: {} });
  assert.deepStrictEqual(esquemaDelRegistro({ type: "string" }), { type: "object", properties: {} });
});

prueba("duenioDeHerramienta: gana el prefijo MÁS LARGO (cloudflare_docs_ ≠ cloudflare_)", () => {
  const ids = ["cloudflare", "cloudflare_docs"];
  assert.deepStrictEqual(duenioDeHerramienta("cloudflare_docs_get_page", ids), { id: "cloudflare_docs", original: "get_page" });
  assert.deepStrictEqual(duenioDeHerramienta("cloudflare_run", ids), { id: "cloudflare", original: "run" });
  assert.strictEqual(duenioDeHerramienta("otra_cosa", ids), null);
});

prueba("la valla real: un servidor MCP de verdad se lanza, lista y cierra", async () => {
  // Servidor mínimo en JS, sin dependencias: el mismo protocolo que habla
  // Python. Prueba el ciclo completo sin necesitar red ni paquetes.
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-"));
  const srv = path.join(dir, "srv.mjs");
  const fuente = [
    "let buf = \"\";",
    "const responder = (o) => process.stdout.write(JSON.stringify(o) + \"\\n\");",
    "process.stdin.setEncoding(\"utf8\");",
    "process.stdin.on(\"data\", (t) => {",
    "  buf += t;",
    "  let i;",
    "  while ((i = buf.indexOf(\"\\n\")) >= 0) {",
    "    const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);",
    "    if (!linea) continue;",
    "    const m = JSON.parse(linea);",
    "    if (m.id === undefined) continue;",
    "    if (m.method === \"initialize\") responder({ jsonrpc: \"2.0\", id: m.id, result: { protocolVersion: \"2024-11-05\", capabilities: { tools: {} }, serverInfo: { name: \"t\", version: \"1\" } } });",
    "    else if (m.method === \"tools/list\") responder({ jsonrpc: \"2.0\", id: m.id, result: { tools: [{ name: \"eco\", description: \"devuelve el texto\", inputSchema: { type: \"object\", properties: { texto: { type: \"string\" } }, required: [\"texto\"] } }] } });",
    "    else if (m.method === \"tools/call\") responder({ jsonrpc: \"2.0\", id: m.id, result: { content: [{ type: \"text\", text: \"eco: \" + (m.params.arguments?.texto || \"\") }] } });",
    "    else responder({ jsonrpc: \"2.0\", id: m.id, error: { code: -32601, message: \"metodo desconocido\" } });",
    "  }",
    "});",
  ].join("\n");
  fs.writeFileSync(srv, fuente);
  const s = new ServidorMcp({ id: "prueba", comando: process.execPath, args: [srv], enabled: true, timeout: 15 }, dir);
  try {
    const herramientas = await s.listarHerramientas();
    assert.deepStrictEqual(herramientas.map((h) => h.name), ["eco"]);
    const r = await s.llamarHerramienta("eco", { texto: "hola" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.texto, "eco: hola");
  } finally {
    s.cerrar();
  }
  assert.strictEqual(s.vivo, false, "cerrar tiene que matar el proceso");
});

prueba("Cloudflare entra APAGADO: nunca se enciende solo al actualizar", () => {
  const cfg = JSON.parse(lee("mcp_servers.json"));
  const servidores: any[] = Array.isArray(cfg?.servidores) ? cfg.servidores : [];
  const cf = servidores.filter((s: any) => String(s?.id || "").startsWith("cloudflare"));
  assert.ok(cf.length >= 2, `se esperaban al menos 2 entradas de Cloudflare, hay ${cf.length}`);
  for (const s of cf) assert.strictEqual(s.enabled, false, `${s.id} tiene que venir con enabled:false`);
});

prueba("los servidores que YA existían siguen intactos y activos", () => {
  const cfg = JSON.parse(lee("mcp_servers.json"));
  const servidores: any[] = Array.isArray(cfg?.servidores) ? cfg.servidores : [];
  const web = servidores.find((s: any) => s?.id === "web");
  assert.ok(web, "el servidor web desapareció");
  assert.strictEqual(web.enabled, true, "el servidor web no puede quedar apagado");
  assert.ok(JSON.stringify(web.args).includes("scripts/mcp_fetch.py"), JSON.stringify(web.args));
  assert.ok(servidores.some((s: any) => s?.id === "context7"), "context7 desapareció");
});

let fallos = 0;
for (const c of casos) {
  try { await c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 3).join("\n")); }
}
console.log(`\nclienteMcp: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);
