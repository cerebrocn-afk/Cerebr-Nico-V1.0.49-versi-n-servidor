/**
 * estadoPacksMcp.test.ts — EL CUADRO DE MANDO DE PACKS Y MCP (v1.0.28)
 * ==================================================================
 * POR QUÉ EXISTE
 * v1.0.28 mete servidores MCP por stdio y Cloudflare como ranura de nube, pero
 * todo eso entra APAGADO (`enabled: false`) para no romper lo que ya funciona.
 * Un añadido apagado solo es honesto si el usuario puede ver, sin abrir ficheros,
 * qué se cargó, qué falló, qué está apagado a propósito y qué se descartó.
 * Esa foto es `GET /api/tools/packs/estado`; el botón de releer es
 * `POST /api/mcp/recargar`.
 *
 * LO QUE SÍ PRUEBA
 *   · el bloque `mcp` SIEMPRE viene, aunque no haya estado todavía (un «no hay»
 *     no puede confundirse con «no me lo contaron»);
 *   · `recargar` cierra los procesos viejos ANTES de releer y devuelve los vivos
 *     de verdad, no los que se solicitó cargar;
 *   · un fallo de recarga responde 500 con mensaje, no revienta la petición;
 *   · server.ts monta esto una sola vez, junto al estado del sandbox.
 *
 * LO QUE NO PRUEBA
 *   · No arranca servidores MCP reales: eso es la suite del cliente (spawn,
 *     tools/list, tools/call, kill). Aquí se monta una app de mentira y se
 *     comprueba el contrato HTTP.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registrarEstadoPacksMcp } from "../server/routers/estadoPacksMcp.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => (existsSync(path.join(RAIZ, rel)) ? readFileSync(path.join(RAIZ, rel), "utf8") : "");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, cond: unknown, detalle?: string) => {
  if (cond) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
};

/** App de mentira: guarda handlers y los invoca como Express (req, res). */
function appFalsa() {
  const rutas = new Map<string, (req: any, res: any) => any>();
  const app = {
    get: (ruta: string, fn: any) => rutas.set("GET " + ruta, fn),
    post: (ruta: string, fn: any) => rutas.set("POST " + ruta, fn),
  };
  const responder = async (metodo: string, ruta: string) => {
    const fn = rutas.get(`${metodo} ${ruta}`);
    if (!fn) throw new Error(`no montó ${metodo} ${ruta}`);
    let codigo = 200;
    let cuerpo: any = null;
    const res: any = {
      status(c: number) { codigo = c; return res; },
      json(o: any) { cuerpo = o; return res; },
    };
    await fn({}, res);
    return { codigo, cuerpo };
  };
  return { app, responder, rutas };
}

const ESTADO_VACIO = { cargados: {}, fallidos: [], apagados: [], descartados: [] };

function deps(extra: Record<string, any> = {}) {
  return {
    packsHttp: () => [
      { id: "web", url: "/tools/web", autenticado: false, herramientas: ["buscar_web", "abrir_red"] },
      { id: "pc", url: "/tools/pc", autenticado: true, herramientas: ["leer_archivo"] },
    ],
    reintentosUsados: () => 1,
    reintentoMax: () => 2,
    estadoMcp: () => null as any,
    mcpVivos: () => [],
    recargarMcp: async () => ESTADO_VACIO,
    ...extra,
  };
}

console.log("\n═══ ESTADO DE PACKS Y MCP (v1.0.28) ═══\n");

console.log("1) Se montan las dos rutas");
const { app, responder, rutas } = appFalsa();
registrarEstadoPacksMcp(app, deps() as any);
comprobar("★ GET /api/tools/packs/estado", rutas.has("GET /api/tools/packs/estado"));
comprobar("★ POST /api/mcp/recargar", rutas.has("POST /api/mcp/recargar"));
comprobar("no inventa rutas de más", rutas.size === 2, String(rutas.size));

console.log("\n2) La foto de estado");
{
  const { codigo, cuerpo } = await responder("GET", "/api/tools/packs/estado");
  comprobar("responde 200 y ok:true", codigo === 200 && cuerpo.ok === true);
  comprobar("★ lista los packs HTTP con sus nombres",
    Array.isArray(cuerpo.packs) && cuerpo.packs.length === 2 && cuerpo.packs[0].herramientas.includes("abrir_red"));
  comprobar("★ el bloque mcp viene AUNQUE no haya estado (vacío, no ausente)",
    cuerpo.mcp && Array.isArray(cuerpo.mcp.vivos) && typeof cuerpo.mcp.cargados === "object" && Array.isArray(cuerpo.mcp.fallidos),
    JSON.stringify(cuerpo.mcp));
  comprobar("los reintentos se informan con su máximo", cuerpo.reintentos_usados === 1 && cuerpo.reintento_max === 2);
}
{
  const { responder: r2 } = (() => { const f = appFalsa(); registrarEstadoPacksMcp(f.app, deps({
    estadoMcp: () => ({ cargados: { cloudflare_docs: 2 }, fallidos: ["x"], apagados: ["cloudflare_browser"], descartados: [{ id: "y", motivo: "sin comando" }] }),
    mcpVivos: () => ["cloudflare_docs"],
  }) as any); return { responder: f.responder }; })();
  const { cuerpo } = await r2("GET", "/api/tools/packs/estado");
  comprobar("★ el estado real se cuenta tal cual (cargados/fallidos/apagados/descartados)",
    cuerpo.mcp.cargados.cloudflare_docs === 2 && cuerpo.mcp.fallidos[0] === "x" &&
    cuerpo.mcp.apagados[0] === "cloudflare_browser" && cuerpo.mcp.descartados[0].motivo === "sin comando");
  comprobar("distingue VIVOS de lo que se pidió cargar",
    cuerpo.mcp.vivos.length === 1 && cuerpo.mcp.vivos[0] === "cloudflare_docs");
}

console.log("\n3) La recarga");
{
  const orden: string[] = [];
  const f = appFalsa();
  registrarEstadoPacksMcp(f.app, deps({
    recargarMcp: async () => { orden.push("recarga"); return { cargados: { a: 3 }, fallidos: [], apagados: [], descartados: [] }; },
    mcpVivos: () => { orden.push("vivos"); return ["a"]; },
  }) as any);
  const { codigo, cuerpo } = await f.responder("POST", "/api/mcp/recargar");
  comprobar("responde 200 y ok:true", codigo === 200 && cuerpo.ok === true);
  comprobar("★ devuelve los vivos REALES después de releer",
    Array.isArray(cuerpo.vivos) && cuerpo.vivos[0] === "a" && cuerpo.cargados.a === 3);
  comprobar("los vivos se consultan DESPUÉS de la recarga (no antes)",
    orden.join("<") === "recarga<vivos", orden.join("<"));
}
{
  const f = appFalsa();
  registrarEstadoPacksMcp(f.app, deps({ recargarMcp: async () => { throw new Error("sin comando en la entrada"); } }) as any);
  const { codigo, cuerpo } = await f.responder("POST", "/api/mcp/recargar");
  comprobar("★ un fallo responde 500 con el motivo, no revienta",
    codigo === 500 && cuerpo.ok === false && /sin comando/.test(cuerpo.error), `${codigo} ${cuerpo.error}`);
}

console.log("\n4) Está cableado en server.ts");
{
  const servidor = leer("server.ts");
  comprobar("★★ server.ts monta el router",
    /import \{ registrarEstadoPacksMcp \} from "\.\/server\/routers\/estadoPacksMcp"/.test(servidor));
  const llamadas = (servidor.match(/registrarEstadoPacksMcp\(app, \{/g) || []).length;
  comprobar("★ se monta UNA sola vez (dos registros = rutas duplicadas)", llamadas === 1, String(llamadas));
  comprobar("★ server.ts no reimplementa las rutas (no las vuelve a declarar)",
    !/app\.get\("\/api\/tools\/packs\/estado"/.test(servidor) && !/app\.post\("\/api\/mcp\/recargar"/.test(servidor));
  comprobar("el router no importa server.ts (seguiría atado al monolito)",
    !/from "\.\.\/\.\.\/server"/.test(leer("server/routers/estadoPacksMcp.ts")));
}

console.log(`\n═══ ESTADO DE PACKS Y MCP: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:\n" + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
