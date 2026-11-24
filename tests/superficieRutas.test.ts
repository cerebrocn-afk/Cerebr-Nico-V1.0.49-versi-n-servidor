/**
 * superficieRutas.test.ts — EL CONTRATO DE LAS 127 RUTAS (Fase 2, paso 1)
 * ======================================================================
 * QUÉ ES: la suite que congela la superficie HTTP del monolito `server.ts` y
 * ejecuta la herramienta de verificación (`scripts/superficie.mjs`).
 * PARA QUÉ SIRVE: para poder partir `server.ts` —11.661 líneas— sin perder una
 * sola ruta por el camino. Es el paso que el plan exige ANTES de mover código.
 *
 * POR QUÉ ESTO ES UN ENTREGABLE Y NO UN TRÁMITE
 * Partir un monolito sin contrato es un acto de fe: se mueven bloques de cientos
 * de líneas y nadie sabe si alguna ruta se quedó por el camino hasta que un
 * usuario pulsa el botón que ya no existe. Con este contrato, cada paso de la
 * Fase 2 se comprueba: si una ruta desaparece, esto se pone rojo.
 *
 * LOS TRES CANDADOS (y por qué cada uno)
 *   1. **Ruta perdida** → ROJO. Es el fallo que esta pieza existe para cazar.
 *   2. **Guard perdido** → ROJO. Una ruta que tenía puerta y ya no la tiene es
 *      seguridad que se afloja sin decirlo.
 *   3. **Presupuesto de líneas** → ROJO. `server.ts` (11.661) no puede crecer:
 *      obliga a que la Fase 2 sea «partir», no «añadir». Si de verdad hay que
 *      añadir una ruta, se sube el presupuesto **a propósito** y eso se ve en el
 *      diff — que es justo lo que se quiere: una decisión escrita.
 *
 * ADEMÁS, DOS LECTORES INDEPENDIENTES: la suite extrae las rutas por su cuenta
 * (con su propia expresión regular) y las compara con el contrato generado. Dos
 * implementaciones que coinciden valen más que una que se cree a sí misma.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  if (condicion) correctas++;
  else fallos.push(`${titulo}${detalle ? " → " + detalle : ""}`);
}

// ═══ 1 · EL CONTRATO EXISTE Y TIENE FORMA ══════════════════════════════════
console.log("\n1) El contrato de superficie\n");

const rutaContrato = path.join(RAIZ, "contrato-rutas.json");
comprobar("existe el contrato", existsSync(rutaContrato));
const contrato = JSON.parse(leer("contrato-rutas.json"));
comprobar("declara qué es (no es un fichero anónimo)", typeof contrato.que_es === "string" && contrato.que_es.includes("GENERADO"));
comprobar("tiene las rutas", Array.isArray(contrato.rutas) && contrato.rutas.length > 0);
comprobar("★ cubre las 127 rutas del monolito", contrato.total === contrato.rutas.length && contrato.total >= 127, String(contrato.total));
comprobar("declara el presupuesto de líneas de server.ts", typeof contrato.presupuesto_lineas === "number" && contrato.presupuesto_lineas > 10000, String(contrato.presupuesto_lineas));
comprobar("cada ruta trae método, ruta, línea, dominio, guard y ARCHIVO", contrato.rutas.every((r: any) =>
  typeof r.metodo === "string" && typeof r.ruta === "string" && typeof r.linea === "number" &&
  typeof r.dominio === "string" && typeof r.guarda === "boolean" && typeof r.archivo === "string"));
comprobar("los métodos son HTTP de verdad", contrato.rutas.every((r: any) => ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL"].includes(r.metodo)));
// `*` es la ruta comodín del SPA (la que sirve el index.html para cualquier
// dirección): no empieza por «/» y es legítima. La primera versión de esta
// comprobación la marcaba como fallo; era la comprobación la que estaba mal.
comprobar("todas las rutas son absolutas o el comodín del SPA",
  contrato.rutas.every((r: any) => r.ruta.startsWith("/") || r.ruta === "*"),
  contrato.rutas.filter((r: any) => !r.ruta.startsWith("/") && r.ruta !== "*").map((r: any) => r.ruta).join(","));
comprobar("y el comodín del SPA está identificado", contrato.rutas.some((r: any) => r.ruta === "*"));
comprobar("no hay rutas duplicadas en el contrato (la segunda taparía a la primera)",
  new Set(contrato.rutas.map((r: any) => `${r.metodo} ${r.ruta}`)).size === contrato.rutas.length);
comprobar("las líneas son coherentes con el tamaño del servidor", contrato.rutas.every((r: any) => r.linea > 0 && r.linea <= contrato.server_lineas));

// ═══ 2 · DOS LECTORES INDEPENDIENTES COINCIDEN ═════════════════════════════
console.log("\n2) ★ Dos lectores independientes\n");

// El lector independiente mira TODO el servidor (monolito + módulos extraídos):
// si solo mirara server.ts, cada extracción de la Fase 2 parecería una pérdida.
const servidor = leer("server.ts");
const ficherosDeRutas = [path.join(RAIZ, "server.ts")];
const recorrer = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(completo);
    else if (e.isFile() && e.name.endsWith(".ts")) ficherosDeRutas.push(completo);
  }
};
if (existsSync(path.join(RAIZ, "server"))) recorrer(path.join(RAIZ, "server"));

const re = /app\.(get|post|put|delete|patch|all)\(\s*"([^"]*)"/g;
const propias: string[] = [];
for (const f of ficherosDeRutas) {
  const fuente = readFileSync(f, "utf8");
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente)) !== null) propias.push(`${m[1].toUpperCase()} ${m[2]}`);
  re.lastIndex = 0;
}
const delContrato: string[] = contrato.rutas.map((r: any) => `${r.metodo} ${r.ruta}`);

comprobar("★ el contrato no se inventa rutas que no existen", delContrato.every((r) => propias.includes(r)),
  delContrato.filter((r) => !propias.includes(r)).slice(0, 3).join(" | "));
comprobar("★ y no se deja ninguna del código sin contratar", propias.every((r) => delContrato.includes(r)),
  propias.filter((r) => !delContrato.includes(r)).slice(0, 3).join(" | "));
comprobar("los dos recuentos coinciden exactamente", propias.length === delContrato.length, `${propias.length} vs ${delContrato.length}`);

const duplicadas = (() => {
  const vistos = new Set<string>();
  const dup: string[] = [];
  for (const r of propias) {
    if (vistos.has(r)) dup.push(r);
    else vistos.add(r);
  }
  return dup;
})();
comprobar("★ el código no registra dos veces la misma ruta", duplicadas.length === 0, duplicadas.slice(0, 3).join(" | "));

// ═══ 3 · LA HERRAMIENTA, EJECUTADA ═════════════════════════════════════════
console.log("\n3) ★ La herramienta, ejecutada de verdad\n");

const r = spawnSync("node", ["scripts/superficie.mjs", "--verificar"], { cwd: RAIZ, encoding: "utf8" });
const salida = (r.stdout || "") + (r.stderr || "");
comprobar("la herramienta arranca y termina", r.status !== null);
comprobar("★ el veredicto es CONTRATO INTACTO", /CONTRATO INTACTO/.test(salida), salida.trim().split("\n").slice(-2).join(" / "));
comprobar("★ y su código de salida es 0", r.status === 0, `exit=${r.status}`);
comprobar("informa del recuento declarado y real", new RegExp(`${contrato.total} rutas declaradas · ${contrato.total} en el código`).test(salida), salida.trim().split("\n")[0]);

// El generador se comprueba en MODO SECO, y esto es importante explicarlo: si la
// suite lo ejecutara en serio, ESCRIBIRÍA el contrato con un presupuesto de líneas
// recalculado — o sea, la propia comprobación podría tapar el trinquete que debe
// vigilar (bastaría con crecer y correr la suite una vez). En seco se comprueba
// que funciona sin tocar lo que se vigila.
const antesDeSeco = leer("contrato-rutas.json");
const gen = spawnSync("node", ["scripts/superficie.mjs", "--seco"], { cwd: RAIZ, encoding: "utf8" });
const salidaGen = (gen.stdout || "") + (gen.stderr || "");
comprobar("el generador arranca y no se queda mudo", gen.status === 0 && /SIN ESCRIBIR/.test(salidaGen), salidaGen.trim().split("\n")[0]);
comprobar("★ el modo seco calcula lo mismo que hay contratado", new RegExp(`${contrato.total} rutas`).test(salidaGen), salidaGen.trim().split("\n")[0]);
comprobar("★ y NO toca el contrato (si lo tocara, podría tapar el trinquete)",
  leer("contrato-rutas.json") === antesDeSeco);
comprobar("el contrato no se puede editar a mano para tapar una pérdida",
  leer("scripts/superficie.mjs").includes("no editar a mano") || leer("scripts/superficie.mjs").includes("NO se escriben a mano") || contrato.que_es.includes("no editar a mano"));

// ═══ 3b · LA PRIMERA EXTRACCIÓN (Fase 2, tanda 1) ══════════════════════════
console.log("\n3b) ★ La primera extracción: 3 rutas fuera del monolito\n");

const rutaRouter = path.join(RAIZ, "server", "routers", "diagnostico.ts");
comprobar("existe el primer módulo de rutas", existsSync(rutaRouter));
const router = existsSync(rutaRouter) ? readFileSync(rutaRouter, "utf8") : "";
comprobar("y declara las rutas que registra (RUTAS_DIAGNOSTICO)", /export const RUTAS_DIAGNOSTICO/.test(router) && /"GET \/api\/health\/deep"/.test(router));
comprobar("★ registra exactamente las 3 rutas de la tanda", (router.match(/app\.get\("\/api\//g) || []).length === 3);
comprobar("★ las 3 ya NO están en el monolito",
  !/app\.get\("\/api\/health\/deep"/.test(servidor) &&
  !/app\.get\("\/api\/ollama\/perf"/.test(servidor) &&
  !/app\.get\("\/api\/ollama\/models"/.test(servidor));
comprobar("★ el monolito las sigue registrando por delegación", /registrarDiagnostico\(app, \{/.test(servidor));
// Tolerante a campos nuevos: se comprueba que le llegan los valores de arranque
// (y ahora también el sandbox), no el texto exacto de la llamada. La versión
// anterior se rompió al añadirle `sandboxVivo` — un falso rojo por copiar la
// frase en vez de comprobar el hecho.
comprobar("★ se le pasan los valores de arranque (una sola fuente de verdad)",
  /registrarDiagnostico\(app, \{[\s\S]{0,240}ollamaUrl: OLLAMA_DEFAULT[\s\S]{0,240}ramGb: RAM_GB[\s\S]{0,240}cpuCores: CPU_CORES[\s\S]{0,240}sandboxVivo/.test(servidor));
// v1.77.0 · ESTA VALLA TENÍA UN FALSO CONGELAMIENTO: exigía que el proxy de
// ollama/models conservara literalmente `NON_CHAT_PATTERNS` para siempre. La
// aduana única (aduanaModelos.test.ts) lo reemplazó a propósito — la queja
// medida de Mario 26/10 («47 instalados, 42 en el selector») nacía justo de
// ese filtro duplicado que desaparecía sin rastro. El hecho que la valla debe
// cuidar sigue vivo: «se mueve, no se mejora» sobre lo NO tocado
// (`Cortacircuitos` intacto) y la plaga del duplicado fuera del monolito.
// Que la lista única exista y sea la única la cuida su propia suite.
comprobar("★ los cuerpos se movieron TAL CUAL en lo no tocado; la aduana única reemplazó al filtro duplicado (v1.77.0, con suite propia)",
  router.includes("Cortacircuitos") &&
  router.includes("auditarListaOllama") &&
  !servidor.includes("NON_CHAT_PATTERNS") && !router.includes("NON_CHAT_PATTERNS"));
// El `=== 3` de la versión anterior contradecía a su propio comentario de abajo
// («acá se comprueba el SUELO»): era una igualdad congelada que se ponía roja en
// cuanto el router ganara una ruta legítima — y así fue, con POST
// /api/diagnostico/autocurar de v1.57.15. Un rojo justo producido por una valla
// mal escrita es peor que no tener valla: enseña a dudar de los guardianes. Ahora
// se comprueba el suelo de la tanda Y que lo declarado en RUTAS_DIAGNOSTICO es
// exactamente lo que el contrato registró (ni una ruta perdida, ni una añadida
// sin declararse).
// `GET /api/...`: hay un espacio entre método y ruta. Sin ese \\s+ el regex daba
// 0 declaradas y la valla se caía sola — el mismo error de forma que se comete
// escribiendo el regex de memoria.
const DECLARADAS_EN_ROUTER = (router.match(/"(?:GET|POST|PUT|DELETE|PATCH)\s+\/[^"]+"/g) || [])
  .map((x) => x.replace(/"/g, ""));
const DEL_ROUTER = contrato.rutas
  .filter((r: any) => r.archivo === "server/routers/diagnostico.ts")
  .map((r: any) => `${r.metodo} ${r.ruta}`);
comprobar("★ y el contrato registra la mudanza, no la pérdida",
  ["GET /api/health/deep", "GET /api/ollama/perf", "GET /api/ollama/models"].every((r) => DEL_ROUTER.includes(r)) && DEL_ROUTER.length >= 3,
  DEL_ROUTER.join(" "));
comprobar("★ lo declarado en RUTAS_DIAGNOSTICO es exactamente lo del contrato",
  DECLARADAS_EN_ROUTER.length >= 3 &&
  DECLARADAS_EN_ROUTER.slice().sort().join("|") === DEL_ROUTER.slice().sort().join("|"),
  `declaradas ${DECLARADAS_EN_ROUTER.length} · contrato ${DEL_ROUTER.length}`);
// Ojo con el «=== 3»: sería un rojo falso en cuanto se extraiga la siguiente
// tanda. Aquí se comprueba el SUELO (al menos esta tanda) y que las cuentas
// cuadren; el progreso exacto se lee del contrato, no se congela en la suite.
comprobar("★ el contrato lleva el marcador de progreso de la Fase 2",
  contrato.rutas_extraidas >= 3 && contrato.rutas_en_monolito === contrato.total - contrato.rutas_extraidas,
  `extraídas ${contrato.rutas_extraidas} · en monolito ${contrato.rutas_en_monolito}`);
comprobar("★ el monolito ha ADELGAZADO respecto a v1.10.0 (11.661 líneas)",
  servidor.split("\n").length < contrato.techo_absoluto_lineas, `${servidor.split("\n").length} / ${contrato.techo_absoluto_lineas}`); // v1.50.0 — el techo deja de ser un literal repartido (11438→11520→11640→11740→11800): se LEE del contrato (techo_absoluto_lineas, única fuente que genera superficie.mjs con margen holgado). Subir el techo = regenerar el contrato, no cazar el número por las suites
const ordenFase2 = leer("SUPERFICIE_RUTAS.md");
comprobar("★ el orden de trabajo dice dónde vive cada dominio (columna Dónde)", /\| Dónde \|/.test(ordenFase2));
comprobar("★ y marca el dominio ya movido", /`server\/routers\/diagnostico\.ts`/.test(ordenFase2));

// ═══ 4 · EL TRINQUETE: SERVER.TS NO PUEDE CRECER ═══════════════════════════
console.log("\n4) ★ El trinquete de líneas\n");

const lineasServidor = servidor.split("\n").length;
comprobar("★ server.ts no supera su presupuesto (la Fase 2 es partir, no añadir)",
  lineasServidor <= contrato.presupuesto_lineas,
  `${lineasServidor} > ${contrato.presupuesto_lineas}`);
comprobar("el presupuesto es el tamaño real de hoy (no un número redondo inventado)",
  contrato.presupuesto_lineas === contrato.server_lineas);
// v1.50.0 — el techo absoluto también vive en el contrato (una sola fuente), con
// margen holgado sobre el presupuesto: el que marca «ya no es subir el margen,
// toca partir». Siempre por encima del presupuesto (si no, no habría sitio para
// trabajar) y redondeado — no un literal clavado a mano en cada suite.
comprobar("★ declara el techo absoluto de líneas (una sola fuente de verdad)",
  typeof contrato.techo_absoluto_lineas === "number" && contrato.techo_absoluto_lineas > contrato.presupuesto_lineas,
  String(contrato.techo_absoluto_lineas));
comprobar("el techo deja margen real para trabajar (al menos 500 líneas sobre el presupuesto)",
  contrato.techo_absoluto_lineas - contrato.presupuesto_lineas >= 500,
  `${contrato.techo_absoluto_lineas - contrato.presupuesto_lineas}`);
comprobar("★ el monolito sigue siendo el problema que el plan dice (más de 10.000 líneas)",
  lineasServidor > 10000, String(lineasServidor));

// ═══ 5 · LA SEGURIDAD NO SE AFL OJA AL MOVER ═══════════════════════════════
console.log("\n5) ★ El contrato también vigila los guards\n");

const conGuardContrato = contrato.rutas.filter((r: any) => r.guarda).length;
const conGuardCodigo = ficherosDeRutas.map((f) => readFileSync(f, "utf8")).join("\n").match(/sandboxAuthorized\(req\)/g)?.length || 0;
comprobar("★ el contrato registra las rutas con guard", conGuardContrato >= 27, String(conGuardContrato));
// Estas dos cifras tienen que cuadrar. La primera versión del generador decía 29
// con 27 en el código, porque el cuerpo de una ruta sin guard se llevaba el guard
// de la vecina. Si vuelven a separarse, es que la medición se ha vuelto a torcer.
comprobar("★ el contrato no infla los guards (cuadra con el código)",
  conGuardContrato === conGuardCodigo, `contrato ${conGuardContrato} vs código ${conGuardCodigo}`);
comprobar("★ ninguna ruta con guard se ha quedado sin él", conGuardCodigo >= conGuardContrato,
  `código ${conGuardCodigo} vs contrato ${conGuardContrato}`);
comprobar("el veredicto de la herramienta incluiría un guard perdido", /guardPerdido|SIN GUARD/.test(leer("scripts/superficie.mjs")));

// ═══ 6 · EL ORDEN DE TRABAJO DE LA FASE 2 ══════════════════════════════════
console.log("\n6) El orden de trabajo de la Fase 2\n");

comprobar("existe el orden de trabajo por dominios", existsSync(path.join(RAIZ, "SUPERFICIE_RUTAS.md")));
const orden = leer("SUPERFICIE_RUTAS.md");
const dominios = [...new Set(contrato.rutas.map((r: any) => r.dominio))] as string[];
comprobar("★ el orden lista todos los dominios", dominios.every((d) => orden.includes("`" + d + "`")), String(dominios.length));
comprobar("★ y avisa de que no se edita a mano", /No editar a mano/.test(orden));
comprobar("★ recuerda la regla de la fase: se mueve, no se mejora", /se mueve, no se mejora/i.test(orden));
comprobar("propone empezar por lo de menos riesgo", /riesgo bajo/i.test(orden) && /Primero los de lectura/i.test(orden));
comprobar("identifica los dominios que se dejan para el final (ai y sandbox)", /sandbox/i.test(orden) && /chat y el sandbox/i.test(orden));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("superficieRutas.test.ts"));

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ CONTRATO DE SUPERFICIE (CN v1.11.0): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log("  FALLO → " + f);
  process.exit(1);
}
