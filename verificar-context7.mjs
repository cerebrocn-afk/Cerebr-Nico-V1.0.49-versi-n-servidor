/**
 * verificar-context7.mjs — PRUEBA END-TO-END DEL SERVIDOR MCP «context7»
 * ======================================================================
 * No simula: arranca el servidor REAL por stdio con el mismo algoritmo que
 * `clienteMcp.ts` (resolver → cmd.exe /d /s /c ""<ruta>" <args>") y habla el
 * protocolo MCP de verdad:
 *
 *   1. initialize            → el servidor debe contestar con su serverInfo
 *   2. notifications/initialized
 *   3. tools/list            → debe declarar al menos una herramienta
 *
 * Si las tres pasan, `context7` deja de estar muerto y sus herramientas entran
 * al modelo. Si falla, se dice el motivo EXACTO (stderr del servidor incluido),
 * no un «no cargó».
 *
 * Uso:  node verificar-context7.mjs
 * Sale 0 si el servidor responde; 1 si no (con el motivo real).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TIMEOUT_MS = 90000; // npx descarga el paquete la primera vez: puede tardar

// ── Réplica del algoritmo de clienteMcp.ts ──────────────────────────────────
function resolverEjecutableWindows(comando) {
  if (process.platform !== "win32") return null;
  const tieneRuta = comando.includes("/") || comando.includes("\\");
  if (tieneRuta) return fs.existsSync(comando) ? comando : null;
  const exts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => Boolean(e));
  const dirs = (process.env.PATH || "").split(path.delimiter).filter((d) => Boolean(d));
  const yaTieneExt = exts.some((e) => comando.toLowerCase().endsWith(e));
  const candidatos = yaTieneExt ? [comando] : [...exts.map((e) => comando + e), comando];
  for (const dir of dirs) {
    for (const nombre of candidatos) {
      const ruta = path.join(dir, nombre);
      try {
        if (fs.existsSync(ruta) && fs.statSync(ruta).isFile()) return ruta;
      } catch {
        /* ilegible */
      }
    }
  }
  return null;
}

function esScriptCmd(ruta) {
  const bajo = ruta.toLowerCase();
  return bajo.endsWith(".cmd") || bajo.endsWith(".bat");
}

function citarParaCmd(arg) {
  const s = String(arg);
  if (s === "" || /[\s&|<>^()"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ── Arranque con el MISMO camino que el módulo ──────────────────────────────
const COMANDO = "npx";
const ARGS = ["-y", "@upstash/context7-mcp"];
const RAIZ = "C:\\Users\\BirdBox\\Downloads\\untitled";

const resuelto = resolverEjecutableWindows(COMANDO);
let comandoFinal = resuelto || COMANDO;
let argsFinales = ARGS;
if (resuelto && esScriptCmd(resuelto)) {
  const linea = [resuelto, ...ARGS].map(citarParaCmd).join(" ");
  comandoFinal = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
  argsFinales = ["/d", "/s", "/c", '"' + linea + '"'];
}

console.log(`[prueba] comando resuelto: ${resuelto || "(no resuelto)"}`);
console.log(`[prueba] lanzando: ${comandoFinal} ${argsFinales.join(" ")}`);
console.log("");

const hijo = spawn(comandoFinal, argsFinales, {
  cwd: RAIZ,
  env: { ...process.env },
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  ...(resuelto && esScriptCmd(resuelto) ? { windowsVerbatimArguments: true } : {}),
});

let buffer = "";
let stderrAcum = "";
let fase = "initialize";
let herramientas = [];
let serverInfo = null;
let terminado = false;

const temporizador = setTimeout(() => {
  if (terminado) return;
  terminado = true;
  console.log(`FALLA · timeout de ${TIMEOUT_MS} ms en la fase «${fase}»`);
  if (stderrAcum.trim()) console.log(`stderr del servidor:\n${stderrAcum.trim().slice(0, 1500)}`);
  try { hijo.kill(); } catch { /* ya murió */ }
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
    try {
      msg = JSON.parse(linea);
    } catch {
      continue; // ruido de npx en stdout
    }
    procesar(msg);
  }
});

hijo.stderr.setEncoding("utf8");
hijo.stderr.on("data", (t) => {
  stderrAcum += t;
  if (process.env.CN_MCP_DEBUG === "1") process.stderr.write(t);
});

hijo.on("error", (err) => {
  if (terminado) return;
  terminado = true;
  clearTimeout(temporizador);
  console.log(`FALLA · no se pudo lanzar: ${err.code || err.message}`);
  process.exit(1);
});

hijo.on("exit", (codigo) => {
  if (terminado) return;
  terminado = true;
  clearTimeout(temporizador);
  console.log(`FALLA · el servidor terminó con código ${codigo} antes de responder`);
  if (stderrAcum.trim()) console.log(`stderr:\n${stderrAcum.trim().slice(0, 1500)}`);
  process.exit(1);
});

function procesar(msg) {
  if (fase === "initialize" && msg.id === 1) {
    if (msg.error) {
      terminado = true;
      clearTimeout(temporizador);
      console.log(`FALLA · initialize devolvió error: ${JSON.stringify(msg.error)}`);
      try { hijo.kill(); } catch { /* ya */ }
      process.exit(1);
    }
    serverInfo = msg.result?.serverInfo || {};
    console.log(`OK   · initialize respondido — servidor: ${serverInfo.name || "?"} v${serverInfo.version || "?"}`);
    console.log(`OK   · protocolo: ${msg.result?.protocolVersion || "?"}`);
    enviar({ jsonrpc: "2.0", method: "notifications/initialized" });
    fase = "tools/list";
    enviar({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    return;
  }
  if (fase === "tools/list" && msg.id === 2) {
    if (msg.error) {
      terminado = true;
      clearTimeout(temporizador);
      console.log(`FALLA · tools/list devolvió error: ${JSON.stringify(msg.error)}`);
      try { hijo.kill(); } catch { /* ya */ }
      process.exit(1);
    }
    herramientas = msg.result?.tools || [];
    terminado = true;
    clearTimeout(temporizador);
    if (herramientas.length === 0) {
      console.log("FALLA · el servidor arrancó pero NO declara herramientas");
      try { hijo.kill(); } catch { /* ya */ }
      process.exit(1);
    }
    console.log(`OK   · tools/list: ${herramientas.length} herramienta(s)`);
    for (const h of herramientas) console.log(`       · ${h.name}`);
    console.log("");
    console.log(`VEREDICTO: context7 VIVO — ${herramientas.length} herramienta(s) disponibles para el modelo`);
    try { hijo.kill(); } catch { /* ya */ }
    process.exit(0);
  }
}

// Saludo del protocolo
enviar({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verificador-cerebronico", version: "1.0.42" },
  },
});
