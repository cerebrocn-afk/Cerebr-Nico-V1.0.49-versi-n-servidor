/**
 * verificar-context7-directo.mjs — AÍSLA LA CAUSA
 * ===============================================
 * La prueba anterior (con `cmd /d /s /c ""npx.cmd" -y @upstash/context7-mcp"`)
 * arrancaba el proceso pero `initialize` no respondía en 90 s. Hay dos
 * sospechosos y esta prueba los separa:
 *
 *   A) El SERVIDOR context7 no habla MCP por stdio (o tarda muchísimo).
 *   B) El ENVOLTORIO (cmd.exe + windowsVerbatimArguments) rompe el stdin.
 *
 * Método: se lanza el `dist/index.js` del paquete YA CACHEADO directamente con
 * `node`, sin npx y sin cmd. Si aquí responde, el culpable es el envoltorio.
 * Si tampoco responde, el culpable es el servidor (y la cura del .cmd sigue
 * siendo correcta para los otros cinco, pero context7 necesita otra vía).
 *
 * Uso: node verificar-context7-directo.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CACHE = "C:\\Users\\BirdBox\\AppData\\Local\\npm-cache\\_npx\\eea2bd7412d4593b\\node_modules\\@upstash\\context7-mcp\\dist\\index.js";
const TIMEOUT_MS = 45000;

if (!fs.existsSync(CACHE)) {
  console.log(`FALLA · no existe el entrypoint cacheado: ${CACHE}`);
  process.exit(1);
}
console.log(`[prueba] entrypoint: ${CACHE}`);
console.log(`[prueba] lanzando con node DIRECTO (sin npx, sin cmd)\n`);

const hijo = spawn(process.execPath, [CACHE], {
  cwd: path.dirname(CACHE),
  env: { ...process.env },
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let buffer = "";
let stderrAcum = "";
let fase = "initialize";
let terminado = false;

const temporizador = setTimeout(() => {
  if (terminado) return;
  terminado = true;
  console.log(`FALLA · timeout de ${TIMEOUT_MS} ms en «${fase}»`);
  console.log("  → el servidor NO habla MCP por stdio en ese plazo: la causa es el SERVIDOR, no el envoltorio .cmd");
  if (stderrAcum.trim()) console.log(`stderr:\n${stderrAcum.trim().slice(0, 1200)}`);
  try { hijo.kill(); } catch { /* ya */ }
  process.exit(1);
}, TIMEOUT_MS);

function enviar(msg) {
  hijo.stdin.write(JSON.stringify(msg) + "\n");
}

hijo.stdout.setEncoding("utf8");
hijo.stdout.on("data", (trozo) => {
  buffer += trozo;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const linea = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!linea) continue;
    let msg;
    try { msg = JSON.parse(linea); } catch { continue; }
    if (fase === "initialize" && msg.id === 1) {
      if (msg.error) {
        terminado = true; clearTimeout(temporizador);
        console.log(`FALLA · initialize devolvió error: ${JSON.stringify(msg.error)}`);
        try { hijo.kill(); } catch { /* ya */ }
        process.exit(1);
      }
      console.log(`OK   · initialize — servidor: ${msg.result?.serverInfo?.name || "?"} v${msg.result?.serverInfo?.version || "?"}`);
      console.log(`OK   · protocolo: ${msg.result?.protocolVersion || "?"}`);
      enviar({ jsonrpc: "2.0", method: "notifications/initialized" });
      fase = "tools/list";
      enviar({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      return;
    }
    if (fase === "tools/list" && msg.id === 2) {
      const tools = msg.result?.tools || [];
      terminado = true; clearTimeout(temporizador);
      if (tools.length === 0) {
        console.log("FALLA · arrancó pero no declara herramientas");
        try { hijo.kill(); } catch { /* ya */ }
        process.exit(1);
      }
      console.log(`OK   · tools/list: ${tools.length} herramienta(s)`);
      for (const t of tools) console.log(`       · ${t.name}`);
      console.log("");
      console.log("VEREDICTO: el SERVIDOR está bien. El fallo estaba en el ENVOLTORIO (cmd.exe).");
      try { hijo.kill(); } catch { /* ya */ }
      process.exit(0);
    }
  }
});

hijo.stderr.setEncoding("utf8");
hijo.stderr.on("data", (t) => { stderrAcum += t; });

hijo.on("error", (err) => {
  if (terminado) return;
  terminado = true; clearTimeout(temporizador);
  console.log(`FALLA · no se pudo lanzar: ${err.code || err.message}`);
  process.exit(1);
});

hijo.on("exit", (codigo) => {
  if (terminado) return;
  terminado = true; clearTimeout(temporizador);
  console.log(`FALLA · el servidor terminó con código ${codigo} antes de responder`);
  if (stderrAcum.trim()) console.log(`stderr:\n${stderrAcum.trim().slice(0, 1200)}`);
  process.exit(1);
});

enviar({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verificador-directo", version: "1.0.42" },
  },
});
