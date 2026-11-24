/**
 * tests/cacheEsquemasV2.test.ts — v1.0.31 · LA CACHÉ QUE NO MIENTE NI SE PIERDE
 * ===========================================================================
 * QUÉ DEFECTO CIERRA (P2 de la propuesta v1.1.0, con las trampas de Windows)
 * ─────────────────────────────────────────────────────────────────────────
 * La caché de definiciones de v1.0.30 ya tenía hash sin secretos, TTL y lectura
 * tolerante. Le faltaban cuatro cosas, y las cuatro se notan en un equipo real:
 *
 *   1. HUELLA NO CANÓNICA. El hash se armaba con `JSON.stringify` de un objeto
 *      cuyo orden dependía de cómo se construyera. Mismo contenido, distinta
 *      huella → caché invalidada sin que nada hubiera cambiado.
 *   2. SIN VERSIÓN. Un archivo de otra forma se leía como si fuera este.
 *   3. ESCRITURA NO ATÓMICA. `writeFileSync` sobre el destino: un corte a mitad
 *      (apagón, cierre forzado) deja un JSON que puede seguir siendo válido con
 *      MENOS herramientas, y el modelo recibe media caja de herramientas.
 *      Y en Windows el `rename` sobre un archivo recién escrito da EPERM/EBUSY
 *      mientras el antivirus lo mira: hay que reintentar, no rendirse.
 *   4. EVIDENCIA BORRADA. Un archivo corrupto se ignoraba y la primera escritura
 *      lo pisaba: se perdía la única prueba de qué lo rompió.
 *
 * Puro: disco INYECTADO (`DepsDisco`), reloj inyectado. `npx tsx tests/cacheEsquemasV2.test.ts`
 */

import {
  VERSION_CACHE_ESQUEMAS,
  TTL_MIN_CACHE_ESQUEMAS_MS,
  TTL_MAX_CACHE_ESQUEMAS_MS,
  TTL_CACHE_ESQUEMAS_MS,
  CODIGOS_REINTENTO,
  ordenCanonico,
  serializarCache,
  leerCacheSeguro,
  escribirCacheAtomica,
  respaldarCorrupto,
  ttlCacheEsquemas,
  entradaValida,
  conEntrada,
  huellaDeConfiguracion,
  type DepsDisco,
} from "../src/engine/cacheEsquemasMcp";

let ok = 0;
let mal = 0;
const fallos: string[] = [];
function check(desc: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${desc}`); }
  else { mal++; fallos.push(desc); console.log(`  \u2717 ${desc}`); }
}

/** Disco de mentira: registra lo que se le pide y puede fallar a pedido. */
function discoFalso(opts: { fallarEscritura?: boolean; fallarRename?: string[]; } = {}) {
  const archivos = new Map<string, string>();
  const llamadas: string[] = [];
  const fallosRename = [...(opts.fallarRename || [])];
  const deps: DepsDisco = {
    existsSync: (p) => archivos.has(p),
    readFileSync: (p) => archivos.get(p) ?? "",
    writeFileSync: (p, d) => {
      llamadas.push(`write:${p}`);
      if (opts.fallarEscritura) { const e: any = new Error("disco lleno"); e.code = "ENOSPC"; throw e; }
      archivos.set(p, d);
    },
    renameSync: (a, b) => {
      llamadas.push(`rename:${a}->${b}`);
      const codigo = fallosRename.shift();
      if (codigo) { const e: any = new Error("tomado por otro proceso"); e.code = codigo; throw e; }
      const contenido = archivos.get(a);
      if (contenido === undefined) { const e: any = new Error("no existe el temporal"); e.code = "ENOENT"; throw e; }
      archivos.set(b, contenido);
      archivos.delete(a);
    },
    unlinkSync: (p) => { archivos.delete(p); },
  };
  return { deps, archivos, llamadas };
}

const HERRAMIENTAS = [
  { name: "fs_read", description: "Lee un archivo" },
  { name: "fs_write", description: "Escribe un archivo" },
];

console.log("\n1. HUELLA CANÓNICA · mismo contenido, mismos bytes");
// ════════════════════════════════════════════════════════════════════════
{
  check("ordenCanonico ordena claves de objetos anidados",
    ordenCanonico({ b: 1, a: { d: 2, c: 3 } }) === ordenCanonico({ a: { c: 3, d: 2 }, b: 1 }));
  check("…y no toca el orden de los ARRAYS (es semántico)", ordenCanonico([2, 1]) !== ordenCanonico([1, 2]));
  check("…y es JSON válido", (() => { try { JSON.parse(ordenCanonico({ a: [1, { b: 2 }] })); return true; } catch { return false; } })());

  const a = huellaDeConfiguracion({ comando: "node", args: ["srv.js"], env: { TOKEN: "abc", OTRA: "1" } });
  const b = huellaDeConfiguracion({ comando: "node", args: ["srv.js"], env: { OTRA: "1", TOKEN: "abc" } });
  check("la huella no depende del orden de las variables de entorno", a === b);
  check("…y sigue siendo sha256", /^[0-9a-f]{64}$/.test(a));
  check("cambiar el orden de los ARGUMENTOS sí cambia la huella (es el comando real)",
    huellaDeConfiguracion({ comando: "node", args: ["a", "b"] }) !== huellaDeConfiguracion({ comando: "node", args: ["b", "a"] }));
  // Decisión de v1.0.30 que se MANTIENE: el valor entra solo como huella corta.
  // Cambiarlo cambia la huella (es otra configuración: otro proyecto, otro
  // endpoint) pero el valor NUNCA está en el archivo, ni entero ni reconocible.
  check("cambiar el VALOR de un token cambia la huella (otra configuración)",
    huellaDeConfiguracion({ comando: "node", env: { TOKEN: "uno" } }) !== huellaDeConfiguracion({ comando: "node", env: { TOKEN: "dos" } }));
  check("…pero el valor no viaja: solo su huella corta",
    !huellaDeConfiguracion({ comando: "node", env: { TOKEN: "sk-secreto-1234567890" } }).includes("secreto"));
}

console.log("\n2. SOBRE CON VERSIÓN · un archivo de otra forma no gobierna la sesión");
// ════════════════════════════════════════════════════════════════════════
{
  const ahora = 1_700_000_000_000;
  const cache = conEntrada(null, "fs", { comando: "node", args: ["srv.js"] }, HERRAMIENTAS, ahora);
  const texto = serializarCache(cache, ahora);
  const d = JSON.parse(texto);
  check("el archivo lleva version", d.version === VERSION_CACHE_ESQUEMAS);
  check("…lleva actualizadoEn", d.actualizadoEn === ahora);
  check("…y las entradas van bajo servidores", !!d.servidores?.fs);
  check("…con la CUENTA de herramientas escrita (detector de truncado)", d.servidores.fs.cuenta === 2);
  check("ida y vuelta: leerCacheSeguro devuelve el mapa plano",
    ordenCanonico(leerCacheSeguro(texto)) === ordenCanonico(cache));
  check("la vuelta conserva la huella", leerCacheSeguro(texto)?.fs.huella === cache.fs.huella);

  const texto2 = serializarCache({ zeta: cache.fs, alfa: cache.fs }, ahora);
  check("los ids de servidor se escriben ordenados (bytes estables)", texto2.indexOf('"alfa"') < texto2.indexOf('"zeta"'));
  const invertido = serializarCache({ alfa: cache.fs, zeta: cache.fs }, ahora);
  check("…y dos mapas con el mismo contenido dan BYTES idénticos", texto2 === invertido);

  check("un archivo de versión desconocida devuelve null (no se adivina la forma)",
    leerCacheSeguro(JSON.stringify({ version: 99, servidores: { fs: cache.fs } })) === null);
  check("un sobre sin servidores devuelve null", leerCacheSeguro(JSON.stringify({ version: 2, servidores: [] })) === null);
  const planoV1 = JSON.stringify(cache);
  check("el archivo PLANO de v1.0.30 se sigue leyendo (actualizar no borra la caché)", leerCacheSeguro(planoV1)?.fs.cuenta === 2);
  check("un array sigue devolviendo null", leerCacheSeguro("[1,2]" ) === null);
}

console.log("\n3. TRUNCADO · seis de doce no son seis");
// ════════════════════════════════════════════════════════════════════════
{
  const ahora = 1_700_000_000_000;
  const huella = huellaDeConfiguracion({ comando: "node" });
  const completa = conEntrada(null, "fs", { comando: "node" }, HERRAMIENTAS, ahora);
  check("una entrada completa es válida", entradaValida(completa, "fs", huella, ahora, TTL_CACHE_ESQUEMAS_MS) !== null);
  const cortada = { fs: { ...completa.fs, cuenta: 12 } };
  check("una entrada que declara 12 y trae 2 se DESCARTA (se arranca de verdad)",
    entradaValida(cortada, "fs", huella, ahora, TTL_CACHE_ESQUEMAS_MS) === null);
  const sinCuenta = { fs: { huella, guardadoEn: ahora, herramientas: HERRAMIENTAS } };
  check("sin cuenta (archivo viejo) se acepta: la cuenta es una mejora, no un requisito de compatibilidad",
    entradaValida(sinCuenta, "fs", huella, ahora, TTL_CACHE_ESQUEMAS_MS) !== null);
}

console.log("\n4. ESCRITURA ATÓMICA · temporal al lado, rename con reintentos");
// ════════════════════════════════════════════════════════════════════════
{
  const { deps, archivos, llamadas } = discoFalso();
  const r = escribirCacheAtomica("C:/datos/mcp_tools_cache.json", "{\"a\":1}", deps, { pid: 4242 });
  check("escribe OK", r.ok === true);
  check("el destino tiene el contenido", archivos.get("C:/datos/mcp_tools_cache.json") === "{\"a\":1}");
  const temporal = llamadas.find((l) => l.startsWith("write:"))?.slice(6) || "";
  check("el temporal se crea EN LA MISMA CARPETA (rename atómico en el mismo volumen)",
    temporal.startsWith("C:/datos/mcp_tools_cache.json.") && temporal.endsWith(".tmp"));
  check("…y lleva el pid en el nombre (dos procesos no se pisan)", temporal.includes(".4242."));
  check("…y no queda ningún temporal vivo", !archivos.has(temporal));
  check("informa los bytes escritos", r.bytes === 7);

  const w = discoFalso({ fallarRename: ["EPERM", "EBUSY"] });
  const rw = escribirCacheAtomica("D:/d/c.json", "x", w.deps, { pid: 1, dormir: () => {} });
  check("EPERM y EBUSY se reintentan (antivirus/indexador de Windows)", rw.ok === true && rw.intentos === 3);
  check("…y el contenido llega igual", w.archivos.get("D:/d/c.json") === "x");

  const f = discoFalso({ fallarRename: Array(6).fill("EPERM") });
  const rf = escribirCacheAtomica("D:/d/c.json", "x", f.deps, { pid: 1, intentos: 3, dormir: () => {} });
  check("si sigue tomado tras los intentos, devuelve ok:false", rf.ok === false);
  check("…con el error REAL (no un «falló la caché» genérico)", /EPERM|tomado/.test(String(rf.error)));
  check("…y deja el temporal NOMBRADO para poder mirarlo", !!rf.rutaTemporal && f.archivos.has(String(rf.rutaTemporal)));

  const nf = discoFalso({ fallarRename: ["ENOSPC"] });
  const rn = escribirCacheAtomica("D:/d/c.json", "x", nf.deps, { pid: 1, dormir: () => {} });
  check("un código que NO es de reintento falla al primer intento", rn.ok === false && nf.llamadas.filter((l) => l.startsWith("rename:")).length === 1);

  const lleno = discoFalso({ fallarEscritura: true });
  const rl = escribirCacheAtomica("D:/d/c.json", "x", lleno.deps, { pid: 1 });
  check("si no se puede ni escribir el temporal, ok:false y sin tocar el destino",
    rl.ok === false && !lleno.archivos.has("D:/d/c.json"));
  check("los códigos de reintento son exactamente los de Windows",
    ["EPERM", "EBUSY", "EACCES", "EEXIST", "ENOTEMPTY"].every((c) => CODIGOS_REINTENTO.has(c)));
}

console.log("\n5. EVIDENCIA · el archivo roto se guarda antes de pisarlo");
// ════════════════════════════════════════════════════════════════════════
{
  const { deps, archivos } = discoFalso();
  const ahora = 1_700_000_000_123;
  const ruta = respaldarCorrupto("C:/datos/mcp_tools_cache.json", "{ roto", ahora, deps, 7777);
  check("devuelve la ruta de la copia", String(ruta).includes("corrupto-7777-1700000000123"));
  check("…con el contenido CRUDO intacto", archivos.get(String(ruta)) === "{ roto");
  check("…en la misma carpeta del original", String(ruta).startsWith("C:/datos/mcp_tools_cache.json"));
  const otra = respaldarCorrupto("C:/datos/mcp_tools_cache.json", "{ roto otra vez", ahora, deps, 7777);
  check("la copia no se pisa con el mismo instante (evidencia intocable)", otra === ruta && archivos.get(String(ruta)) === "{ roto");
  check("sin contenido no hay copia", respaldarCorrupto("C:/x.json", null, ahora, deps) === null);
  check("sin contenido vacío tampoco", respaldarCorrupto("C:/x.json", "", ahora, deps) === null);
  const roto = discoFalso();
  roto.deps.writeFileSync = () => { throw new Error("sin permiso"); };
  check("si no se puede copiar, devuelve null sin lanzar (se pierde la evidencia, no el turno)",
    respaldarCorrupto("C:/x.json", "{ mal", ahora, roto.deps) === null);
}

console.log("\n6. TTL · el de la casa, y el conservador si se pide");
// ════════════════════════════════════════════════════════════════════════
{
  check("por defecto 14 días", ttlCacheEsquemas({}) === TTL_CACHE_ESQUEMAS_MS && TTL_CACHE_ESQUEMAS_MS === 14 * 24 * 60 * 60 * 1000);
  check("un valor razonable se respeta", ttlCacheEsquemas({ CN_CACHE_ESQUEMAS_TTL_MS: String(15 * 60 * 1000) }) === 15 * 60 * 1000);
  check("por debajo del suelo (10 min) se ignora y vuelve el de la casa",
    ttlCacheEsquemas({ CN_CACHE_ESQUEMAS_TTL_MS: "60000" }) === TTL_CACHE_ESQUEMAS_MS);
  check("un valor absurdo se topa al máximo", ttlCacheEsquemas({ CN_CACHE_ESQUEMAS_TTL_MS: String(3650 * 24 * 60 * 60 * 1000) }) === TTL_MAX_CACHE_ESQUEMAS_MS);
  check("basura → el de la casa (no NaN)", Number.isFinite(ttlCacheEsquemas({ CN_CACHE_ESQUEMAS_TTL_MS: "no es un número" })));
  check("el suelo declarado es 10 minutos", TTL_MIN_CACHE_ESQUEMAS_MS === 600_000);
}

console.log(`\n—— cacheEsquemasV2: ${ok} correctas · ${mal} fallidas ——`);
if (mal) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
process.exitCode = mal ? 1 : 0;
