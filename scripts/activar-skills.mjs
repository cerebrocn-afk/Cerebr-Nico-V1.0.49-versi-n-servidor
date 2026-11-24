#!/usr/bin/env node
// activar-skills.mjs — Activación interactiva de Skills MCP con OAuth
// ================================================================
// Automatiza los 4 pasos manuales de ACTIVAR-SKILLS-OAUTH.md:
//   1. Verificar versión de Node
//   2. Editar mcp_servers.json (enabled: true/false)
//   3. Añadir variables al .env
//   4. Disparar recarga de packs (POST /api/tools/packs/recargar)
//
// Uso:
//   node scripts/activar-skills.mjs                  # modo interactivo
//   node scripts/activar-skills.mjs --context7       # activar Context7 con API key
//   node scripts/activar-skills.mjs --unblocked       # activar Unblocked (OAuth)
//   node scripts/activar-skills.mjs --webflow         # activar Webflow (OAuth)
//   node scripts/activar-skills.mjs --todas          # activar las 3
//   node scripts/activar-skills.mjs --estado          # ver estado actual
//   node scripts/activar-skills.mjs --reset-oauth     # borrar tokens ~/.mcp-auth
//   node scripts/activar-skills.mjs --desactivar <id>  # desactivar una skill
//
// Diseñado para CerebroNico IDE v1.53.0+

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import http from "node:http";
import readline from "node:readline";

// ── Constantes ──────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_FILE = path.join(ROOT, "mcp_servers.json");
const ENV_FILE = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const MCP_AUTH_DIR = path.join(os.homedir(), ".mcp-auth");
const NODE_MIN_GENERAL = 18;
const NODE_MIN_WEBFLOW = 22.3;

const SKILLS = {
  context7: {
    nombre: "Context7",
    desc: "Docs actualizadas de librerías — evita alucinaciones de APIs obsoletas",
    auth: "API key opcional (sin ella funciona con rate limits bajitos)",
    nodeMin: NODE_MIN_GENERAL,
    envKey: "CONTEXT7_API_KEY",
    oauth: false,
  },
  unblocked: {
    nombre: "Unblocked",
    desc: "Contexto organizacional — código, PRs, issues, docs de equipo",
    auth: "OAuth en navegador (1.ª vez) o Personal/Team API Token",
    nodeMin: NODE_MIN_GENERAL,
    envKey: "UNBLOCKED_API_TOKEN",
    oauth: true,
    oauthNote: "La 1.ª llamada abre el navegador para OAuth. Token se guarda en ~/.mcp-auth/",
  },
  webflow: {
    nombre: "Webflow",
    desc: "Diseño y gestión de sitios Webflow vía IA",
    auth: "OAuth en navegador (1.ª vez) o API key local (solo Data API)",
    nodeMin: NODE_MIN_WEBFLOW,
    envKey: "WEBFLOW_API_KEY",
    oauth: true,
    oauthNote: "⚠️  Requiere Node ≥22.3.0. Solo owners/admins pueden autorizar. Designer API necesita OAuth remoto.",
  },
};

// ── Utilidades ──────────────────────────────────────────────
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const err = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);
const bold = (m) => console.log(`\n  \x1b[1m${m}\x1b[0m`);
const sep = () => console.log("  " + "─".repeat(56));

function parseNodeVersion(v) {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.?\d*/);
  return m ? { major: +m[1], minor: +m[2], raw: v } : null;
}

function loadMCP() {
  try {
    return JSON.parse(fs.readFileSync(MCP_FILE, "utf-8"));
  } catch {
    err(`No se pudo leer ${MCP_FILE}`);
    return null;
  }
}

function saveMCP(data) {
  fs.writeFileSync(MCP_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const txt = fs.readFileSync(ENV_FILE, "utf-8");
  const env = {};
  for (const line of txt.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

function saveEnv(env) {
  // Leer .env.example como base para conservar comentarios y orden
  let base = "";
  if (fs.existsSync(ENV_EXAMPLE)) base = fs.readFileSync(ENV_EXAMPLE, "utf-8");
  else if (fs.existsSync(ENV_FILE)) base = fs.readFileSync(ENV_FILE, "utf-8");

  // Añadir/actualizar las keys de skills que estén en `env`
  const skillKeys = ["CONTEXT7_API_KEY", "UNBLOCKED_API_TOKEN", "WEBFLOW_API_KEY"];
  const lines = base.split("\n");
  let seccionSkills = false;
  let seccionEncontrada = false;

  for (const key of skillKeys) {
    if (key in env && env[key]) {
      // Buscar la línea existente y actualizarla
      const re = new RegExp(`^${key}=`);
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          lines[i] = `${key}=${env[key]}`;
          found = true;
          break;
        }
      }
      if (!found) {
        // Añadir al final de la sección skills
        if (!seccionEncontrada) {
          lines.push("", "# ── Skills MCP (añadido por activar-skills.mjs) ───");
          seccionEncontrada = true;
        }
        lines.push(`${key}=${env[key]}`);
      }
    }
  }

  fs.writeFileSync(ENV_FILE, lines.join("\n") + "\n", "utf-8");
}

async function pregunta(prompt, defaultVal = "") {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : "";
    rl.question(`  ${prompt}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

async function confirmar(prompt) {
  const r = await pregunta(`${prompt} (s/n)`, "s");
  return r.toLowerCase() === "s" || r.toLowerCase() === "y";
}

async function postRecargar() {
  const bridgeToken = process.env.CN_BRIDGE_TOKEN || loadEnv().CN_BRIDGE_TOKEN || "";
  const port = process.env.CN_BRIDGE_PORT || loadEnv().CN_BRIDGE_PORT || "5000";
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: +port, path: "/api/tools/packs/recargar", method: "POST",
        headers: { "Content-Type": "application/json", "X-Cerebro-Token": bridgeToken } },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.ok) {
              ok(`Packs recargados: ${data.herramientas_remotas} herramientas remotas en ${data.packs.length} packs`);
              if (data.fallidos.length) warn(`Fallidos: ${data.fallidos.join(", ")}`);
            } else {
              warn(`Recarga respondió con error: ${data.error}`);
            }
          } catch { warn("Recarga respondió con formato inesperado"); }
          resolve();
        });
      }
    );
    req.on("error", (e) => {
      warn(`No se pudo recargar packs (¿IDE arrancada?): ${e.message}`);
      info("Puedes recargar manualmente: reinicia el IDE o POST /api/tools/packs/recargar");
      resolve();
    });
    req.setTimeout(5000, () => {
      warn("Timeout al recargar packs");
      req.destroy();
      resolve();
    });
    req.end();
  });
}

async function getEstado() {
  const bridgeToken = process.env.CN_BRIDGE_TOKEN || loadEnv().CN_BRIDGE_TOKEN || "";
  const port = process.env.CN_BRIDGE_PORT || loadEnv().CN_BRIDGE_PORT || "5000";
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: +port, path: "/api/tools/packs/estado", method: "GET",
        headers: { "X-Cerebro-Token": bridgeToken } },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ── Comandos ────────────────────────────────────────────────

async function cmdEstado() {
  bold("Estado de Skills MCP");
  sep();

  const nodeV = parseNodeVersion(process.version);
  info(`Node: ${process.version}`);
  if (nodeV) {
    const generalOK = nodeV.major >= NODE_MIN_GENERAL;
    const webflowOK = nodeV.major >= 22 && nodeV.minor >= 3;
    ok(generalOK ? "Node suficiente para Context7 y Unblocked" : `⚠ Node ${NODE_MIN_GENERAL}+ requerido para skills MCP`);
    if (!webflowOK) warn(`Webflow MCP necesita Node ≥${NODE_MIN_WEBFLOW} (tienes ${nodeV.raw})`);
  }

  const mcp = loadMCP();
  if (!mcp) return;
  console.log("");
  for (const s of mcp.servidores) {
    const skill = SKILLS[s.id]; const esSkill = !!skill;
    const icon = s.enabled ? "🟢" : "⚫"; const tag = esSkill ? " [MCP+OAuth]" : "";
    const label = skill ? skill.nombre : s.id;
    console.log(`  ${icon} ${label.padEnd(14)} enabled=${s.enabled}${tag}  ${skill?.desc || s.label}`);
    if (skill?.oauthNote && s.enabled) info(`     ${skill.oauthNote}`);
  }

  const env = loadEnv();
  console.log("");
  info("Variables de entorno:");
  for (const [id, skill] of Object.entries(SKILLS)) {
    const val = env[skill.envKey];
    const status = val ? `= ${val.slice(0, 8)}…` : "(vacía)";
    console.log(`  ${skill.envKey.padEnd(22)} ${status}`);
  }

  // Estado del servidor (si está arrancado)
  const estado = await getEstado();
  if (estado?.ok) {
    console.log("");
    info("Packs registrados en el servidor:");
    for (const p of estado.packs) {
      console.log(`  📦 ${p.id}: ${p.herramientas.length} herramientas, auth=${p.autenticado}`);
    }
  } else {
    info("(IDE no arrancada — no se pudo consultar estado de packs)");
  }

  // OAuth tokens
  if (fs.existsSync(MCP_AUTH_DIR)) {
    const files = fs.readdirSync(MCP_AUTH_DIR);
    if (files.length) {
      info(`Tokens OAuth en ~/.mcp-auth/: ${files.length} archivo(s)`);
    }
  }
}

async function cmdActivar(skillId) {
  const skill = SKILLS[skillId];
  if (!skill) { err(`Skill "${skillId}" no reconocida. Usa: ${Object.keys(SKILLS).join(", ")}`); return false; }

  bold(`Activar ${skill.nombre}`);
  sep();
  info(skill.desc);
  info(`Auth: ${skill.auth}`);
  console.log("");

  // 1. Verificar Node
  const nodeV = parseNodeVersion(process.version);
  if (nodeV) {
    const needMajor = Math.floor(skill.nodeMin);
    const needMinor = Math.round((skill.nodeMin - needMajor) * 10);
    const okNode = nodeV.major > needMajor || (nodeV.major === needMajor && nodeV.minor >= needMinor);
    if (!okNode) {
      err(`Node ${skill.nodeMin}+ requerido para ${skill.nombre} (tienes ${nodeV.raw})`);
      info("Instala con: nvm install 22.3.0 && nvm alias default 22.3.0");
      const continuar = await confirmar("¿Continuar de todas formas?");
      if (!continuar) return false;
    } else {
      ok(`Node ${nodeV.raw} — suficiente para ${skill.nombre}`);
    }
  }

  // 2. Editar mcp_servers.json
  const mcp = loadMCP();
  if (!mcp) return false;

  const srv = mcp.servidores.find((s) => s.id === skillId);
  if (!srv) { err(`No se encontró "${skillId}" en mcp_servers.json`); return false; }

  if (srv.enabled) {
    ok(`${skill.nombre} ya está activado en mcp_servers.json`);
  } else {
    srv.enabled = true;
    saveMCP(mcp);
    ok(`mcp_servers.json: ${skillId} → enabled: true`);
  }

  // 3. Variables de entorno
  const env = loadEnv();
  if (skill.oauth) {
    const tieneToken = !!env[skill.envKey];
    if (tieneToken) {
      ok(`${skill.envKey} ya configurada en .env`);
    } else {
      console.log("");
      const usarToken = await confirmar(
        `${skill.nombre} usa OAuth (se abre el navegador la 1.ª vez).\n  ¿Quieres configurar un ${skill.envKey} como alternativa?`
      );
      if (usarToken) {
        const token = await pregunta(`  Pega tu ${skill.envKey}`);
        if (token) {
          env[skill.envKey] = token;
          saveEnv(env);
          ok(`${skill.envKey} guardada en .env`);
        }
      } else {
        info(`OAuth se completará en el navegador la 1.ª vez que uses ${skill.nombre}`);
      }
    }
  } else {
    // Context7: API key opcional
    const tieneKey = !!env[skill.envKey];
    if (tieneKey) {
      ok(`${skill.envKey} ya configurada en .env`);
    } else {
      console.log("");
      const ponerKey = await confirmar(
        `${skill.nombre} funciona SIN API key (rate limits bajitos).\n  ¿Quieres poner tu API key para rate limits más altos?`
      );
      if (ponerKey) {
        const key = await pregunta(`  Pega tu ${skill.envKey}`);
        if (key) {
          env[skill.envKey] = key;
          saveEnv(env);
          ok(`${skill.envKey} guardada en .env`);
        }
      } else {
        info(`${skill.nombre} activa sin API key (rate limits estándar)`);
      }
    }
  }

  // 4. Recargar packs
  console.log("");
  const recargar = await confirmar("¿Recargar packs ahora? (necesita IDE arrancada)");
  if (recargar) await postRecargar();
  else info("Recarga manual: POST /api/tools/packs/recargar o reinicia el IDE");

  console.log("");
  ok(`${skill.nombre} lista para usar 🎉`);
  if (skill.oauthNote) info(skill.oauthNote);
  return true;
}

async function cmdDesactivar(skillId) {
  const mcp = loadMCP();
  if (!mcp) return;
  const srv = mcp.servidores.find((s) => s.id === skillId);
  if (!srv) { err(`Skill "${skillId}" no encontrada`); return; }
  if (!srv.enabled) { info(`${skillId} ya estaba desactivada`); return; }

  srv.enabled = false;
  saveMCP(mcp);
  ok(`${skillId} → enabled: false en mcp_servers.json`);

  const recargar = await confirmar("¿Recargar packs ahora?");
  if (recargar) await postRecargar();
}

async function cmdResetOAuth() {
  if (fs.existsSync(MCP_AUTH_DIR)) {
    const files = fs.readdirSync(MCP_AUTH_DIR);
    if (files.length === 0) { info("~/.mcp-auth/ está vacío — no hay tokens que borrar"); return; }
    warn(`Se eliminarán ${files.length} archivo(s) de tokens OAuth en ~/.mcp-auth/`);
    const confirm = await confirmar("¿Borrar tokens OAuth?");
    if (confirm) {
      for (const f of files) fs.unlinkSync(path.join(MCP_AUTH_DIR, f));
      ok("Tokens OAuth borrados. La próxima llamada abrirá el navegador para re-autorizar.");
    }
  } else {
    info("~/.mcp-auth/ no existe — no hay tokens OAuth almacenados");
  }
}

async function cmdTodas() {
  bold("Activar las 3 Skills MCP");
  sep();
  for (const id of Object.keys(SKILLS)) {
    await cmdActivar(id);
    console.log("");
  }
  ok("¡Las 3 skills están configuradas!");
  info("Reinicia el IDE para que los cambios surtan efecto.");
  info("Unblocked y Webflow abrirán el navegador la 1.ª vez que las uses (OAuth).");
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "";

  console.log(`\n\x1b[36m━━ CerebroNico · Activación de Skills MCP ━━\x1b[0m`);

  if (cmd === "--estado" || cmd === "-s") {
    await cmdEstado();
  } else if (cmd === "--context7") {
    await cmdActivar("context7");
  } else if (cmd === "--unblocked") {
    await cmdActivar("unblocked");
  } else if (cmd === "--webflow") {
    await cmdActivar("webflow");
  } else if (cmd === "--todas" || cmd === "--all") {
    await cmdTodas();
  } else if (cmd === "--desactivar" || cmd === "--disable") {
    const id = args[1];
    if (!id) { err("Especifica la skill: context7, unblocked, webflow"); process.exit(1); }
    await cmdDesactivar(id);
  } else if (cmd === "--reset-oauth") {
    await cmdResetOAuth();
  } else if (cmd === "--help" || cmd === "-h") {
    console.log(`
  Uso:
    node scripts/activar-skills.mjs --context7     Activar Context7 (API key opcional)
    node scripts/activar-skills.mjs --unblocked    Activar Unblocked (OAuth/API Token)
    node scripts/activar-skills.mjs --webflow      Activar Webflow (OAuth/API key)
    node scripts/activar-skills.mjs --todas        Activar las 3
    node scripts/activar-skills.mjs --estado        Ver estado actual
    node scripts/activar-skills.mjs --reset-oauth   Borrar tokens OAuth (~/.mcp-auth/)
    node scripts/activar-skills.mjs --desactivar <id>  Desactivar una skill

  Sin argumentos: modo interactivo (menú)
`);
  } else {
    // Modo interactivo
    bold("Modo interactivo");
    console.log("  ¿Qué quieres hacer?");
    console.log("");
    console.log("  1. Ver estado de skills");
    console.log("  2. Activar Context7");
    console.log("  3. Activar Unblocked");
    console.log("  4. Activar Webflow");
    console.log("  5. Activar las 3");
    console.log("  6. Resetear tokens OAuth");
    console.log("  7. Salir");
    console.log("");

    const opcion = await pregunta("Elige (1-7)");
    switch (opcion) {
      case "1": await cmdEstado(); break;
      case "2": await cmdActivar("context7"); break;
      case "3": await cmdActivar("unblocked"); break;
      case "4": await cmdActivar("webflow"); break;
      case "5": await cmdTodas(); break;
      case "6": await cmdResetOAuth(); break;
      default: info("¡Hasta luego!");
    }
  }
}

main().catch((e) => {
  err(`Error inesperado: ${e.message}`);
  process.exit(1);
});
