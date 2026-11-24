/**
 * atascoSandbox.test.ts — v1.87.1 · EL PROYECTO ANTERIOR QUE NO SE IBA NUNCA
 * =========================================================================
 * Sesión 1793219578712, mensaje 18: «en el sandbox no se generó nada, lo que se
 * ve es un proyecto viejo y erróneo». Mensaje 15: «❌ No pude listar: Ruta no
 * encontrada: /api/fs/list».
 *
 * Son dos atascos distintos y los dos se congelan acá:
 *
 *   1. `/api/sandbox/start` devolvía `alreadyRunning` en cuanto el proceso
 *      estaba vivo, SIN mirar qué raíz servía. Con el preview vivo, fijar otra
 *      carpeta no cambiaba nada: nunca había reinicio. La valla exige que el
 *      destino se resuelva ANTES de esa decisión, que se compare con la raíz
 *      arrancada, y que una raíz distinta pare y re-arranque.
 *
 *   2. El puente del PC atendía `/api/fs/read` y `/api/fs/list` SOLO por GET,
 *      mientras la IDE los llama por POST (bridgeFetch manda cuerpo). Leer y
 *      listar morían en 404; escribir funcionaba. El defecto se siembra por
 *      lectura de fuente: si alguien mueve esos bloques fuera de `do_POST`,
 *      esto se pone rojo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

const servidor = leer("server.ts");
const estado = leer("server/estado/sandbox.ts");
const puente = leer("agent_bridge_5000.py");

console.log("\n🧱 EL ATASCO DEL PROYECTO ANTERIOR — v1.87.1\n");

seccion("1 · El estado guarda QUÉ raíz está sirviendo");
{
  comprobar("el módulo tiene el dato (no una variable suelta en el monolito)", /let raizServida: string \| null = null;/.test(estado));
  comprobar("exporta el registro", /export function registrarRaizServida\(raiz: string\): void/.test(estado));
  comprobar("exporta la lectura", /export function raizServidaActual\(\): string \| null/.test(estado));
  comprobar("registrar normaliza a string y admite vacío como null", /raizServida = raiz \? String\(raiz\) : null;/.test(estado));
}

seccion("2 · La decisión de «ya corre» ahora compara raíces");
{
  const modulo = leer("server/sandboxArranque.ts");
  comprobar("la decisión vive en su módulo (el monolito no crece)", /export async function prepararArranque\(deps: DepsArranque\): Promise<DecisionArranque>/.test(modulo));
  comprobar("el monolito le pasa el destino explícito y la carpeta vinculada", /prepararArranque\(\{ base: PROJECT_ROOT, destino: req\.body\?\.destino \?\? null, vinculada: leerRutaVinculada\(PROJECT_ROOT\)/.test(servidor));
  comprobar("y solo corta cuando el módulo dice que YA corre lo pedido", /if \(arranque\.yaCorre\) return res\.json\(\{ ok: true, alreadyRunning: true/.test(servidor));
  comprobar("el módulo resuelve el destino con la MISMA autoridad de siempre", /resolverDestinoSandbox\(deps\.base, deps\.destino, deps\.vinculada\)/.test(modulo));
  comprobar("compara la raíz pedida con la que se está sirviendo", /mismaRaiz\(deps\.raizEnCurso, raiz\)/.test(modulo));
  comprobar("la comparación es por ruta resuelta, no por texto", /path\.resolve\(a\) === path\.resolve\(b\)/.test(modulo));
  comprobar("misma raíz → yaCorre (el caso normal no reinicia nada)", /if \(mismaRaiz\(deps\.raizEnCurso, raiz\)\) return \{ yaCorre: true/.test(modulo));
  comprobar("raíz distinta → se declara en el log con las dos rutas", /El preview servía «\$\{deps\.raizEnCurso \?\? "\(raíz no registrada\)"\}» y la raíz pedida es «\$\{raiz\}»/.test(modulo));
  comprobar("raíz distinta → se para el PID viejo y se sigue (no se retorna yaCorre)", /if \(deps\.pid\) \{[\s\S]{0,900}killPortListeners\(deps\.puerto\)/.test(modulo) && /return \{ yaCorre: false, \.\.\.plano, reiniciado: true \}/.test(modulo));
  comprobar("el puerto se limpia solo si algo quedó escuchando", /if \(await deps\.isPortUp\(deps\.puerto, 1200\)\) await deps\.killPortListeners\(deps\.puerto\)/.test(modulo));
  comprobar("no queda una segunda resolución del destino en el monolito", !/resolverDestinoSandbox\(PROJECT_ROOT/.test(servidor));
}

seccion("3 · La raíz se registra cuando de verdad arrancó");
{
  const registros = (servidor.match(/registrarRaizServida\(raizProyecto\)/g) || []).length;
  comprobar("hay DOS registros: rama estática y rama npm", registros === 2, String(registros));
  comprobar("la estática solo registra si el puerto subió", /if \(staticUp\) registrarRaizServida\(raizProyecto\);/.test(servidor));
  comprobar("la npm solo registra si el proceso quedó vivo", /if \(vivo\) registrarRaizServida\(raizProyecto\);/.test(servidor));
  comprobar("el import trae las dos funciones del estado", /raizServidaActual, registrarRaizServida/.test(servidor));
  comprobar("el monolito ya no resuelve el destino por su cuenta (vive en el módulo)", (servidor.match(/resolverDestinoSandbox/g) || []).length === 0);
}

seccion("4 · El puente contesta POST, que es como lo llama la IDE");
{
  const iPost = puente.indexOf("def do_POST(self):");
  const iGet = puente.indexOf("def do_GET(self):");
  const iReadPost = puente.indexOf('if parsed.path == "/api/fs/read":', iPost);
  const iListPost = puente.indexOf('if parsed.path == "/api/fs/list":', iPost);
  comprobar("POST /api/fs/read existe y vive en do_POST", iReadPost > iPost && iReadPost < puente.indexOf('if parsed.path == "/api/fs/delete":', iPost), String(iReadPost));
  comprobar("POST /api/fs/list existe y vive en do_POST", iListPost > iPost && iListPost < puente.indexOf('if parsed.path == "/api/fs/write":', iPost), String(iListPost));
  comprobar("los dos leen `path` del cuerpo JSON", /_op_fs_read\(\{"path": data\.get\("path", ""\) if isinstance\(data, dict\) else ""\}\)/.test(puente) && /_op_fs_list\(\{"path": data\.get\("path", ""\) if isinstance\(data, dict\) else ""\}\)/.test(puente));
  comprobar("GET no se rompió (compatibilidad con query string)", /if parsed.path == "\/api\/fs\/read":[\s\S]{0,200}qs\.get\("path"/.test(puente) && /if parsed.path == "\/api\/fs\/list":[\s\S]{0,200}qs\.get\("path"/.test(puente));
  // `self._op_*` cuenta SOLO llamadas: la definición (`def _op_fs_read`) no lleva `self.`
  // y contarla daba 3, que es el número que hacía fallar la valla contra el código correcto.
  comprobar("las dos vías usan los MISMOS _op_* (no hay reimplementación)", (puente.match(/self\._op_fs_read\(/g) || []).length === 2 && (puente.match(/self\._op_fs_list\(/g) || []).length === 2);
  comprobar("el 404 del final sigue estando (una ruta desconocida no se finge)", /self\._send_json\(404, \{"error": f"Ruta no encontrada: \{self\.path\}"\}\)/.test(puente));
  comprobar("do_GET y do_POST siguen separados y en ese orden", iGet > 0 && iPost > iGet);
}

seccion("5 · La IDE sigue llamando por POST (el contrato que causó el 404)");
{
  comprobar("bridgeFetch manda POST en cuanto hay cuerpo", /method: body !== undefined \? "POST" : "GET"/.test(servidor));
  comprobar("y las llamadas de leer/listar llevan cuerpo", /bridgeFetch\("\/api\/fs\/read", \{ path: String\(args\?\.path \|\| ""\) \}\)/.test(servidor) && /bridgeFetch\("\/api\/fs\/list", \{ path: String\(args\?\.path \|\| ""\) \}\)/.test(servidor));
}

console.log(`\n═══ atascoSandbox: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
