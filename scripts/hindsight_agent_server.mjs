#!/usr/bin/env node
/**
 * hindsight_agent_server.mjs — wrapper Node del SDK oficial @vectorize-io/hindsight-agent-sdk.
 * (v1.17.0 HÍBRIDO CerebroNico × Hindsight)
 *
 * QUÉ ES
 *   Un microservicio HTTP que habla el contrato de PACKS EXTERNOS de CerebroNico
 *   (GET /tools + POST /tools/call) y expone las 8 herramientas `agent_knowledge_*`
 *   del SDK de agentes de Hindsight, más un `hs_estado`. Es la vía Node: usa el
 *   cliente oficial (con sus detalles de API ya resueltos) en lugar de la pasarela
 *   REST a mano del demonio Python (:5100).
 *
 * CUÁL USAR (los dos conviven; el modelo solo ve los packs `enabled: true`)
 *   · :5100 hindsight_daemon.py  — sin dependencias, con MODO ESPEJO offline. RECOMENDADO.
 *   · :5101 este wrapper         — SDK oficial, exige Hindsight arriba y `npm install`.
 *   Activar uno u otro en tools.config.json; NUNCA los dos (18 herramientas de
 *   memoria confundirían a un modelo pequeño: selectToolsForModel las estrangularía).
 *
 * REQUISITOS
 *   npm install            (trae @vectorize-io/hindsight-agent-sdk, vía file:vendor)
 *   Hindsight corriendo y HINDSITE_API_URL apuntando a él.
 *
 * Variables: HINDSITE_API_URL (obligatoria aquí), HINDSITE_TOKEN, HINDSITE_BANK_ID
 *            (defecto «cerebronico»), CN_HINDSITE_NODE_PORT (defecto 5101).
 *
 * Prueba manual:
 *   node scripts/hindsight_agent_server.mjs --tools   # imprime manifiesto y sale
 *   curl http://127.0.0.1:5101/health
 */

import { createServer } from "node:http";
import { createKnowledgeTools, TOOL_NAMES } from "@vectorize-io/hindsight-agent-sdk";

const PUERTO = Number(process.env.CN_HINDSITE_NODE_PORT || 5101);
const HOST = "127.0.0.1"; // solo loopback, como el puente :5000
const API_URL = String(process.env.HINDSITE_API_URL || "").replace(/\/+$/, "");
const API_TOKEN = String(process.env.HINDSITE_TOKEN || "").trim();
const BANK_ID = String(process.env.HINDSITE_BANK_ID || "cerebronico").trim() || "cerebronico";

const QUIERE_MANIFIESTO = process.argv.includes("--tools");

if (!API_URL && !QUIERE_MANIFIESTO) {
  console.error(
    "[hs-agent] Falta HINDSITE_API_URL. Este wrapper NO tiene modo espejo: para offline usa el pack :5100 (hindsight_daemon.py)."
  );
  process.exit(1);
}

// El SDK es harness-agnostic: entrega {name, description, parameters, execute}.
// Aquí se adaptan al contrato de pack de CerebroNico (execute devuelve
// {content:[{type:"text",text:JSON}]}, que se desenvuelve a objeto plano).
// Para INSPECCIONAR el manifiesto sin servidor (--tools) se usa una URL de
// placeholder: createKnowledgeTools no abre conexiones al construir, solo al ejecutar.
let tools;
try {
  tools = createKnowledgeTools({
    apiUrl: API_URL || "http://127.0.0.1:1",
    apiToken: API_TOKEN || undefined,
    bankId: BANK_ID,
  });
} catch (e) {
  console.error(`[hs-agent] El SDK no pudo crear las herramientas: ${e?.message || e}`);
  process.exit(1);
}

const POR_NOMBRE = new Map(tools.map((t) => [t.name, t]));

// Etiquetas de riesgo/precio para selectToolsForModel (mismos criterios que :5100).
const BARATAS = new Set(["agent_knowledge_recall", "agent_knowledge_list_pages", "agent_knowledge_get_page"]);
const PELIGROSAS = new Set(["agent_knowledge_delete_page"]);

const MANIFIESTO = tools.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters || { type: "object", properties: {}, required: [] },
  cheap: BARATAS.has(t.name),
  destructive: PELIGROSAS.has(t.name),
}));

async function estadoHindsight() {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 4000);
  try {
    const resp = await fetch(`${API_URL}/health/live`, {
      signal: control.signal,
      headers: API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {},
    });
    return { vivo: resp.ok, status: resp.status };
  } catch (e) {
    return { vivo: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

const EJECUTORES = new Map(tools.map((t) => [t.name, (a) => t.execute(a)]));
// BUG CAZADO EN LA PRUEBA: `hs_estado` se registraba como función suelta en el
// mismo mapa que las herramientas del SDK (objeto `.execute`), y el despachador
// llamaba `ejecutor.execute(...)` → «ejecutor.execute is not a function».
// Ahora TODO entrada del mapa es un callable uniforme.
EJECUTORES.set("hs_estado", async () => ({
  servicio: "cerebronico-hindsight-node",
  apiUrl: API_URL,
  bank_id: BANK_ID,
  herramientas_sdk: [...TOOL_NAMES],
  hindsight: await estadoHindsight(),
  nota: "Este pack exige Hindsight arriba. Para modo espejo offline usa el pack Python :5100.",
}));
MANIFIESTO.push({
  name: "hs_estado",
  description: "Estado del wrapper Node: URL del servidor Hindsight, banco, si responde y herramientas SDK cargadas.",
  parameters: { type: "object", properties: {}, required: [] },
  cheap: true,
});

function despacho(res, codigo, payload) {
  const cuerpo = Buffer.from(JSON.stringify(payload), "utf-8");
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Content-Length": cuerpo.length });
  res.end(cuerpo);
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PUERTO}`);
  try {
    if (req.method === "GET" && url.pathname === "/tools") return despacho(res, 200, { tools: MANIFIESTO });
    if (req.method === "GET" && url.pathname === "/health") {
      return despacho(res, 200, { ok: true, ...(await estadoHindsight()), bank_id: BANK_ID });
    }
    if (req.method === "POST" && url.pathname === "/tools/call") {
      const crudo = await new Promise((resolve, reject) => {
        let datos = "";
        req.on("data", (c) => {
          datos += c;
          if (datos.length > 8_000_000) {
            reject(new Error("cuerpo demasiado grande"));
            req.destroy();
          }
        });
        req.on("end", () => resolve(datos));
        req.on("error", reject);
      });
      const { name, arguments: args } = JSON.parse(crudo || "{}");
      const ejecutor = EJECUTORES.get(name);
      if (!ejecutor) return despacho(res, 200, { ok: false, error: `Herramienta desconocida: ${name}` });
      const salida = await ejecutor(args || {});
      // Dos formas de salida conviven: las herramientas del SDK devuelven
      // {content:[{type:"text",text:JSON}]} y las locales un objeto plano.
      // Se desenvuelve la primera; la segunda pasa tal cual.
      if (salida && Array.isArray(salida.content)) {
        const texto = salida.content[0]?.text;
        let valor;
        try {
          valor = JSON.parse(texto);
        } catch {
          valor = { texto };
        }
        return despacho(res, 200, { ok: true, herramienta: name, backend: "hindsight-sdk", resultado: valor });
      }
      return despacho(res, 200, { ok: true, herramienta: name, backend: "hindsight-sdk", resultado: salida });
    }
    return despacho(res, 404, { ok: false, error: "Rutas: GET /tools, GET /health, POST /tools/call." });
  } catch (e) {
    // Ni una excepción escapa: el bucle del agente vería un HTTP 500 y perdería el turno.
    return despacho(res, 200, { ok: false, error: `${e?.message || e}` });
  }
});

if (process.argv.includes("--tools")) {
  console.log(JSON.stringify({ tools: MANIFIESTO }, null, 2));
  process.exit(0);
}

servidor.on("error", (e) => {
  if (e?.code === "EADDRINUSE") {
    console.error(`[hs-agent] El puerto ${PUERTO} está ocupado (¿otro ejemplar del wrapper?).`);
    process.exit(2);
  }
  console.error(`[hs-agent] Error de servidor: ${e?.message || e}`);
  process.exit(1);
});

servidor.listen(PUERTO, HOST, () => {
  console.log(`[hs-agent] Pack Node escuchando en http://${HOST}:${PUERTO} → ${API_URL} (bank=${BANK_ID}, ${MANIFIESTO.length} herramientas)`);
});
