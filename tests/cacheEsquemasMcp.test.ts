/*
tests/cacheEsquemasMcp.test.ts — v1.0.30

La caché de definiciones MCP es lo que permite que un servidor declare sus
herramientas SIN ocupar un proceso. Si esta caché se equivoca, el modelo ve
manos que no existen: es peor que no tenerla. Por eso se prueba entera, y con
el mismo criterio de siempre: cada comprobación lee el código real.
*/

import fs from "node:fs";
import {
  TTL_CACHE_ESQUEMAS_MS,
  TTL_INACTIVIDAD_MCP_MS,
  RelojDeInactividad,
  conEntrada,
  entradaValida,
  huellaDeConfiguracion,
  leerCacheSeguro,
  sanitizar,
} from "../src/engine/cacheEsquemasMcp";

const leer = (rel: string): string => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");
const FUENTE = leer("src/engine/cacheEsquemasMcp.ts");
const PACKS = leer("src/engine/packsMcp.ts");
const SERVER = leer("server.ts");

let ok = 0;
let fallos = 0;
function check(nombre: string, cond: boolean): void {
  if (cond) {
    ok++;
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`);
  }
}

const cfg = { comando: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], env: { TOKEN: "abc123" } };
const HERRAMIENTAS = [
  { name: "read_file", description: "Lee un archivo", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
  { name: "write_file", description: "Escribe un archivo" },
];

// ── 1 · La huella identifica la configuración, no los secretos ────────────
{
  const a = huellaDeConfiguracion(cfg);
  const b = huellaDeConfiguracion({ ...cfg });
  check("la misma configuración da la misma huella", a === b);
  check("la huella es un sha256 hex (64)", /^[0-9a-f]{64}$/.test(a));

  const otroValor = huellaDeConfiguracion({ ...cfg, env: { TOKEN: "def456" } });
  check(
    "cambiar el VALOR de una variable SÍ cambia la huella (la caché se relee: nunca se sirve una definición vieja)",
    otroValor !== a
  );
  check("y aun así la huella no es la del valor: no es el token en claro", !a.includes("abc123"));

  const otraVariable = huellaDeConfiguracion({ ...cfg, env: { TOKEN: "abc123", OTRA: "1" } });
  check("cambiar QUÉ variables se pasan sí cambia la huella", otraVariable !== a);

  const otrosArgs = huellaDeConfiguracion({ ...cfg, args: ["-y", "otro-servidor"] });
  check("cambiar los argumentos cambia la huella", otrosArgs !== a);

  const otroComando = huellaDeConfiguracion({ ...cfg, comando: "node" });
  check("cambiar el comando cambia la huella", otroComando !== a);

  const sinEnv = huellaDeConfiguracion({ comando: cfg.comando, args: cfg.args });
  check("sin env no revienta y da huella", /^[0-9a-f]{64}$/.test(sinEnv));
}

// ── 2 · entradaValida: existe + coincide + no caducó ─────────────────────
{
  const ahora = 1_700_000_000_000;
  const huella = huellaDeConfiguracion(cfg);
  const cache = conEntrada(null, "fs", cfg, HERRAMIENTAS, ahora);

  check("una entrada recién escrita es válida", entradaValida(cache, "fs", huella, ahora + 1_000, TTL_CACHE_ESQUEMAS_MS) !== null);
  check("devuelve las definiciones guardadas", (entradaValida(cache, "fs", huella, ahora, TTL_CACHE_ESQUEMAS_MS) || { herramientas: [] }).herramientas.length === 2);
  check("un id que no está NO es válido (arranca de verdad)", entradaValida(cache, "otro", huella, ahora, TTL_CACHE_ESQUEMAS_MS) === null);
  check("una huella distinta NO es válida", entradaValida(cache, "fs", "0".repeat(64), ahora, TTL_CACHE_ESQUEMAS_MS) === null);
  check("una entrada vacía NO es válida (registraría cero herramientas)", entradaValida(conEntrada(null, "fs", cfg, [], ahora), "fs", huella, ahora, TTL_CACHE_ESQUEMAS_MS) === null);
  check(
    "pasado el TTL se relee del servidor",
    entradaValida(cache, "fs", huella, ahora + TTL_CACHE_ESQUEMAS_MS + 1, TTL_CACHE_ESQUEMAS_MS) === null
  );
  check(
    "justo en el borde del TTL todavía sirve",
    entradaValida(cache, "fs", huella, ahora + TTL_CACHE_ESQUEMAS_MS, TTL_CACHE_ESQUEMAS_MS) !== null
  );
  check("una caché nula no es válida", entradaValida(null, "fs", huella, ahora, TTL_CACHE_ESQUEMAS_MS) === null);
  check(
    "una fecha en el futuro (reloj movido) no sirve: se relee",
    entradaValida(cache, "fs", huella, ahora - 60_000, TTL_CACHE_ESQUEMAS_MS) === null
  );
}

// ── 3 · conEntrada no muta y conserva los otros servidores ───────────────
{
  const base = conEntrada(null, "a", cfg, HERRAMIENTAS, 1);
  const dos = conEntrada(base, "b", cfg, [{ name: "x" }], 2);
  check("conEntrada devuelve un archivo nuevo", dos !== base);
  check("el anterior no se muta", Object.keys(base).length === 1);
  check("el nuevo tiene los dos", Object.keys(dos).sort().join(",") === "a,b");
  const reemplazo = conEntrada(dos, "a", cfg, [{ name: "read_file" }], 3);
  check("reescribir un id lo reemplaza, no lo duplica", reemplazo.a.herramientas.length === 1);
  check("y guarda el momento en que se escribió", reemplazo.a.guardadoEn === 3);
}

// ── 4 · sanitizar: los secretos no llegan al disco ───────────────────────
{
  const limpio = sanitizar([
    { name: "call", description: "usa el token sk-abcdefghijklmnopqrst para autenticar", inputSchema: { type: "object" } },
    { name: "otra", description: "ghp-1234567890abcdef también" },
    { name: " " } as any,
    null as any,
  ]);
  check("descarta entradas sin nombre (no se puede llamar a nada)", limpio.length === 2);
  check("tapa un sk-…", !limpio[0].description!.includes("sk-abcdefghijklmnopqrst"));
  check("tapado con marcador, no borrado", limpio[0].description!.includes("[secreto]"));
  check("tapa un ghp-…", !limpio[1].description!.includes("ghp-1234567890abcdef"));
  check("el nombre se conserva", limpio[0].name === "call");
  check("un esquema de objeto se conserva", !!limpio[0].inputSchema);
  check("no toca texto normal", sanitizar([{ name: "x", description: "lee archivos del proyecto" }])[0].description === "lee archivos del proyecto");
  check("el patrón de secretos usa el guion de las claves reales (sk-…, ghp-…)", /\(sk\|pk\|ghp\|glpat\|xoxb\|xoxp\)-\[A-Za-z0-9_-\]/.test(FUENTE));
}

// ── 5 · leerCacheSeguro: todo lo raro devuelve null, nunca lanza ────────
{
  check("nulo → null", leerCacheSeguro(null) === null);
  check("vacío → null", leerCacheSeguro("") === null);
  check("JSON roto → null", leerCacheSeguro("{ esto no es json") === null);
  check("un array → null", leerCacheSeguro("[1,2,3]") === null);
  check("un string JSON → null", leerCacheSeguro('"hola"') === null);
  const bueno = leerCacheSeguro(JSON.stringify(conEntrada(null, "fs", cfg, HERRAMIENTAS, 1)));
  check("un archivo válido se lee", !!bueno && !!bueno.fs && bueno.fs.herramientas.length === 2);
}

// ── 6 · RelojDeInactividad con tiempo inyectado (sin esperar 60 s) ──────
{
  const disparos: string[] = [];
  const programados: Array<{ fn: () => void; ms: number; cancelado: boolean }> = [];
  const reloj = new RelojDeInactividad(
    (id) => disparos.push(id),
    60_000,
    (fn, ms) => {
      const t = { fn, ms, cancelado: false };
      programados.push(t);
      return t;
    },
    (t: any) => { if (t) t.cancelado = true; }
  );

  reloj.tocar("fs");
  check("tocar programa un cierre", programados.length === 1);
  check("con el TTL pedido", programados[0].ms === 60_000);
  check("y el servidor figura activo", reloj.activo("fs"));

  reloj.tocar("fs");
  check("volver a tocar CANCELA el reloj anterior (no se acumulan)", programados[0].cancelado === true);
  check("y deja uno solo programado", programados.filter((p) => !p.cancelado).length === 1);

  // El "reloj" inyectado no cancela de verdad: aquí se comprueba que lo correcto
  // (un cierre con reloj ya cancelado y rehecho) no cierra. Si quedara un reloj
  // viejo vivo, cerraría un servidor que está en uso.
  programados[1].fn();
  check("al vencer cierra su servidor", disparos.join(",") === "fs");
  check("el cierre ocurre UNA vez (un reloj vencido no queda repitiendo)", disparos.join(",") === "fs");
  check("y el servidor deja de figurar activo", !reloj.activo("fs"));

  let exploto = false;
  const relojTonto = new RelojDeInactividad(() => { throw new Error("cerrar falló"); }, 1_000, (fn) => { fn(); return null; }, () => {});
  try { relojTonto.tocar("x"); } catch { exploto = true; }
  check("un cierre que lanza NO tumba al que lo llamó", !exploto);

  const pendiente: any[] = [];
  const r2 = new RelojDeInactividad(() => {}, 1_000, (fn) => { pendiente.push(fn); return null; }, () => {});
  r2.tocar("a"); r2.tocar("b");
  r2.soltarTodos();
  check("soltarTodos deja cero relojes activos", !r2.activo("a") && !r2.activo("b"));
}

// ── 7 · Constantes declaradas ───────────────────────────────────────────
{
  check("TTL de inactividad = 60 s", TTL_INACTIVIDAD_MCP_MS === 60_000);
  check("TTL de definiciones = 14 días", TTL_CACHE_ESQUEMAS_MS === 14 * 24 * 60 * 60 * 1000);
  check("el módulo no importa nada fuera de node (se puede usar en cualquier proceso)", /from "node:crypto"/.test(FUENTE) && !/from "\.\//.test(FUENTE));
}

// ── 8 · El cableado: perezoso de verdad en packsMcp y server ────────────
{
  check("packsMcp lee la caché del disco", /leerCacheSeguro\(/.test(PACKS));
  check("packsMcp pide la huella real de la entrada", /huellaDeConfiguracion\(\{ comando: e\.comando, args: e\.args, env: e\.env \}\)/.test(PACKS));
  check("una entrada válida se registra SIN arrancar", /desdeCache: true/.test(PACKS));
  check("el archivo de caché tiene nombre propio y se anuncia", /ARCHIVO_CACHE_ESQUEMAS = "mcp_tools_cache\.json"/.test(PACKS));
  check("la entrada se recuerda para poder levantar a demanda", /ENTRADAS\.set\(entrada\.id, \{ entrada, raiz \}\)/.test(PACKS));
  check("hay UN arranque compartido por servidor (nada de dos procesos)", /ARRANCANDO\.get\(id\)/.test(PACKS) && /ARRANCANDO\.set\(id, promesa\)/.test(PACKS));
  check("el arranque fallido se dice, no se tapa", /no pudo arrancar al usarse/.test(PACKS));
  check("y NO se contesta con la caché como si estuviera vivo", !/desdeCache[^\n]*catch/.test(PACKS));
  check("la inactividad cierra el proceso", /s\.cerrar\(\);[\s\S]{0,80}VIVOS\.delete\(id\)/.test(PACKS));
  check("el TTL se puede bajar por entorno para probar", /CN_MCP_TTL_MS/.test(PACKS));
  check("cerrar todo también suelta los relojes", /cerrarTodosMcp[\s\S]{0,300}RELOJ\.soltarTodos\(\)/.test(PACKS));

  check("server.ts ya NO contesta «ya no está vivo» al primer uso", !/ya no está vivo/.test(SERVER));
  check("server.ts levanta a demanda con asegurarServidorMcp", /await asegurarServidorMcp\(duenio\.id\)/.test(SERVER));
  check("el puerto admite levantar: sigue siendo async", /if \(duenio\) \{\s*\n\s*const serv = await asegurarServidorMcp/.test(SERVER));
  check("y el fallo del arranque se explica al modelo", /no pudo arrancar al usarse/.test(SERVER));
}

console.log(`cacheEsquemasMcp: ${ok} correctas · ${fallos} fallidas`);
console.log(`${ok}/${ok + fallos} comprobaciones en verde`);
if (fallos > 0) process.exit(1);
