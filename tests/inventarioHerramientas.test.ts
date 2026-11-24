/**
 * inventarioHerramientas.test.ts — LA VALLA DEL INVENTARIO (v1.46.2)
 * ==================================================================
 * POR QUÉ EXISTE
 * El usuario arrancó la v1.46.0 y dijo: «noto menos herramientas que antes, o
 * estoy equivocado». Se compararon las dos sesiones de consola y el inventario
 * era IDÉNTICO (4 + 31 + 19). Lo que había cambiado era la EVIDENCIA VISIBLE: al
 * agrupar los avisos de reemplazo se perdieron del arranque los 50 renglones que
 * enumeraban las herramientas una a una. El recuento seguía ahí; los NOMBRES no.
 *
 * Lección: un inventario que solo muestra un número no se puede auditar. Esta
 * suite fija de dónde sale cada cifra y por qué, para que la próxima vez que
 * alguien vea «4» no tenga que abrir seis ficheros para saber si son las 4
 * correctas o si se perdieron 12 por el camino.
 *
 * LO QUE NO PRUEBA (y se dice)
 *   · No levanta el puente :5000 ni los servicios :5100/:5102: eso necesita la
 *     máquina del usuario (Windows + Python embebido). Lo que se fija aquí es la
 *     FUENTE del inventario —los ficheros que lo declaran— y que el arranque lo
 *     imprima. La comprobación en vivo es `GET /api/tools/packs/estado`.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => (existsSync(path.join(RAIZ, rel)) ? readFileSync(path.join(RAIZ, rel), "utf8") : "");
const json = (rel: string) => { try { return JSON.parse(leer(rel)); } catch { return null; } };

const { inventarioDelPack } = await import("../src/engine/toolRegistry.ts");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, cond: unknown, detalle?: string) => {
  if (cond) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
};

console.log("\n═══ INVENTARIO DE HERRAMIENTAS (v1.46.2) ═══\n");

/* ── 1. De dónde sale cada cifra ────────────────────────────────────────── */
console.log("1) Las fuentes del inventario\n");

const toolsCfg = json("tools.config.json");
comprobar("tools.config.json es JSON válido", !!toolsCfg);
const packs: any[] = Array.isArray(toolsCfg?.packs) ? toolsCfg.packs : [];
const porId = (id: string) => packs.find((p) => p?.id === id);

for (const [id, puerto] of [["puente-mcp", "5000"], ["creador-web", "5102"], ["memoria-hindsight", "5100"]] as const) {
  const p = porId(id);
  comprobar(`el pack "${id}" está declarado`, !!p);
  comprobar(`  · apunta al puerto ${puerto}`, String(p?.url || "").includes(`:${puerto}`), String(p?.url));
  comprobar(`  · está ACTIVO (enabled no es false)`, p?.enabled !== false);
}

/* ── 2. Por qué puente-mcp son 4 herramientas (y no 12) ─────────────────── */
console.log("\n2) Por qué «puente-mcp» carga 4 herramientas\n");

const mcp = json("mcp_servers.json");
const servidores: any[] = Array.isArray(mcp?.servidores) ? mcp.servidores : [];
comprobar("mcp_servers.json es JSON válido", !!mcp);
comprobar("declara servidores MCP", servidores.length >= 1, String(servidores.length));

const web = servidores.find((s) => s?.id === "web");
comprobar("el servidor «web» existe", !!web);
comprobar("  · está activo", web?.enabled !== false);
comprobar("  · corre scripts/mcp_fetch.py", JSON.stringify(web?.args || []).includes("scripts/mcp_fetch.py"));

const py = leer("scripts/mcp_fetch.py");
const declaradas = [...new Set((py.match(/"name":\s*"([a-z0-9_]+)"/g) || []).map((m) => m.replace(/.*"([a-z0-9_]+)"$/, "$1")))].sort();
const ESPERADAS = ["buscar_web", "descargar_archivo", "extraer_enlaces", "fetch_url"];
comprobar(
  "scripts/mcp_fetch.py declara EXACTAMENTE las 4 herramientas del pack <- ESTE es el número que ves en el log",
  JSON.stringify(declaradas.filter((n) => n !== "prueba")) === JSON.stringify(ESPERADAS),
  `declaradas: ${declaradas.join(", ")}`
);
comprobar(
  "las 4 son de RED (no son las pc_* del agente de escritorio)",
  ESPERADAS.every((n) => !n.startsWith("pc_"))
);
comprobar(
  "buscar_web y descargar_archivo exigen confirmación (no salen a la red sin orden)",
  /buscar_web[\s\S]{0,1200}confirmar/i.test(py) && /descargar_archivo[\s\S]{0,1200}confirmar/i.test(py)
);

/* ── 3. El inventario se IMPRIME (lo que se perdió en v1.46.0) ───────────── */
console.log("\n3) El arranque muestra los nombres, no solo el número\n");

const servidor = leer("server.ts");
// v1.0.28: las dos rutas de auditoría viven en su router; server.ts solo lo monta.
const routerPacks = leer("server/routers/estadoPacksMcp.ts");
const superficiePacks = servidor + "\n" + routerPacks;
comprobar(
  "★ el cargador imprime el INVENTARIO, no solo el recuento",
  /inventarioDelPack\(/.test(servidor)
);
comprobar(
  "★ y el mensaje sigue diciendo cuántas hay",
  /cargado con \$\{pack\.tools\.length\} herramienta\(s\)/.test(servidor)
);
comprobar(
  "★ el fallo de arranque ya NO se anuncia como definitivo (dice que reintenta)",
  /aún no responde en/.test(servidor) && /Reintento \$\{packsIntentos \+ 1\}\/\$\{PACKS_INTENTOS_MAX\}/.test(servidor)
);
comprobar(
  "★ y el registro NO grita por su cuenta cuando hay reintento (silenciarFallo)",
  /silenciarFallo/.test(servidor) && /silenciarFallo/.test(leer("src/engine/toolRegistry.ts"))
);
comprobar(
  "★ al agotar los reintentos sí avisa en serio",
  /reintentos agotados sin respuesta/.test(servidor)
);

/* ── 4. Hay forma de AUDITAR el inventario en vivo ──────────────────────── */
console.log("\n4) Cómo comprobarlo tú mismo\n");

comprobar(
  "★ existe GET /api/tools/packs/estado (lista cada pack con sus nombres)",
  /app\.get\("\/api\/tools\/packs\/estado"/.test(superficiePacks)
);
comprobar(
  "★ y devuelve los nombres de las herramientas de cada pack",
  /herramientas: \(listToolPacks\(\)|herramientas: deps\.packsHttp\(\)/.test(superficiePacks)
);
comprobar(
  "existe POST /api/mcp/recargar (recarga sin reiniciar; también los packs)",
  /app\.post\("\/api\/mcp\/recargar"/.test(superficiePacks)
);

/* ── 5. La función que arma el inventario ──────────────────────────────── */
console.log("\n5) inventarioDelPack\n");

comprobar(
  "devuelve los nombres ORDENADOS (un log comparable entre arranques)",
  inventarioDelPack({ tools: [{ name: "zeta" }, { name: "alfa" }, { name: "media" }] as any }) === "alfa, media, zeta"
);
comprobar("devuelve null si no hay herramientas (el llamador pone su mensaje)", inventarioDelPack({ tools: [] }) === null);
comprobar("devuelve null si el pack es null", inventarioDelPack(null) === null);
comprobar("aguanta un pack sin `tools`", inventarioDelPack({} as any) === null);
comprobar(
  "ignora entradas sin nombre en vez de imprimir «undefined»",
  inventarioDelPack({ tools: [{ name: "a" }, { name: "" }, {}] as any }) === "a"
);

console.log(`\n═══ INVENTARIO DE HERRAMIENTAS (v1.46.2): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:\n" + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
