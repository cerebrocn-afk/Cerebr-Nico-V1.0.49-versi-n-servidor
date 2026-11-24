/**
 * tests/puertosArranque.test.ts — LOS SIETE PUERTOS EN EL ARRANQUE (v2.3.12)
 * =========================================================================
 * Queja de Mario del 6/11, textual: «el arranque no muestra los 7 puertos».
 *
 * MEDIDO antes de tocar nada (`tsx server.ts` + `GET /api/health/deep` sobre la
 * v2.3.11 real): cinco filas, y sólo TRES nombraban un puerto (:11434, :3500,
 * :5000). La barra de estado traía los siete desde v2.3.9. Dos verdades del mismo
 * sistema, y la que el usuario ve primero era la corta.
 *
 * La causa no fue un olvido aislado: el inventario estaba escrito A MANO en seis
 * archivos (`PORTS`, `PUERTOS_CLAVE`, `Header.tsx`, `telemetria.ts`, `MAPA_PUERTOS`,
 * `arranque-diagnostico.mjs` y la ruta de salud). Cada uno envejecía por su cuenta.
 * Por eso esta suite arranca de la SEMILLA (`PORTS`) y no de una copia: una valla
 * que copia la lista certifica la lista, no la verdad — el defecto que la casa le
 * acaba de corregir a `lanzadorRepliegue.test.ts`, que exigía seis porque copió al
 * script en vez de copiar la fuente.
 *
 * Cuatro partes:
 *   1 · el plano puro (`src/engine/puertosArranque.ts`): siete, sin duplicados,
 *       con dueño, sin literales de número.
 *   2 · el texto que comparten el banner, la memoria y el prompt.
 *   3 · LA RUTA REAL. Se monta `registrarDiagnostico` contra un `app` de mentira y
 *       se le pide `/api/health/deep` de verdad: no se busca la palabra «siete» en
 *       el fuente, se cuentan las filas que la ruta PRODUCE.
 *   4 · EL TELON. Los siete no pueden secuestrar la entrada: si mostrar dos packs
 *       opcionales obligara a esperarlos, el arreglo seria otro defecto mejor vestido.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath as _fup, fileURLToPath } from "node:url";
import { PORTS } from "../src/constants";
import { PUERTOS_CLAVE } from "../src/engine/rutasSistema";
import {
  PUERTOS_DE_ARRANQUE,
  SONDA_PROPIA,
  nombreDeFila,
  puertosDeArranque,
  puertosFaltantesEnArranque,
  textoDeMapaDePuertos,
} from "../src/engine/puertosArranque";
import { debeEntrar, PLAZO_MAXIMO_MS } from "../src/arranque/guionArranque";
import { registrarDiagnostico } from "../server/routers/diagnostico";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");


const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf8") : "");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const PUERTOS_SEMILLA = Object.values(PORTS) as number[];

console.log("\n1) El plano puro: siete filas derivadas, no copiadas\n");

c("\u2605 el plano tiene SIETE puertos", PUERTOS_DE_ARRANQUE.length === 7, "tiene " + PUERTOS_DE_ARRANQUE.length);
c("\u2605 y son exactamente los números de PORTS (una sola verdad)",
  puertosDeArranque().slice().sort((a, b) => a - b).join() === PUERTOS_SEMILLA.slice().sort((a, b) => a - b).join(),
  "plano " + puertosDeArranque().join(",") + " vs semilla " + PUERTOS_SEMILLA.join(","));
c("no hay puerto duplicado en el plano", new Set(puertosDeArranque()).size === PUERTOS_DE_ARRANQUE.length);
c("no hay clave duplicada (la clave es el nombre en la muestra de telemetría)",
  new Set(PUERTOS_DE_ARRANQUE.map((p) => p.clave)).size === PUERTOS_DE_ARRANQUE.length);
c("cada clave se nombra como su número (port5103 es el 5103)",
  PUERTOS_DE_ARRANQUE.every((p) => p.clave === "port" + p.puerto),
  PUERTOS_DE_ARRANQUE.map((p) => p.clave).join(","));
c("\u2605 ningún puerto del mapa del system prompt queda fuera del arranque",
  puertosFaltantesEnArranque().length === 0, "faltan: " + puertosFaltantesEnArranque().join(","));
c("el plano cubre todos los nombres de PUERTOS_CLAVE",
  PUERTOS_CLAVE.every((k) => puertosDeArranque().includes(k.puerto)));
c("cada fila dice qué es (sin detalle la fila es un número y no se puede apagar lo que no se nombra)",
  PUERTOS_DE_ARRANQUE.every((p) => p.servicio.trim().length > 0 && p.detalle.trim().length > 0));
c("cada fila sabe dónde se mide", PUERTOS_DE_ARRANQUE.every((p) => p.sonda.trim().length > 0));
c("bloqueante es booleano explícito, nunca undefined (ausente = bloqueante por descarte)",
  PUERTOS_DE_ARRANQUE.every((p) => typeof p.bloqueante === "boolean"));
c("el IDE :3000 no es bloqueante: si él no está, esta pantalla no existe para contarlo",
  PUERTOS_DE_ARRANQUE.find((p) => p.puerto === PORTS.IDE)?.bloqueante === false);
c("los packs que el lanzador levanta —y que se pueden apagar a propósito— no bloquean la entrada",
  PUERTOS_DE_ARRANQUE.filter((p) => p.nacimiento === "lanzador").every((p) => p.bloqueante === false),
  PUERTOS_DE_ARRANQUE.filter((p) => p.nacimiento === "lanzador" && p.bloqueante).map((p) => p.puerto).join(","));
c("el motor del cerebro (:5103, nace bajo demanda) no bloquea la entrada",
  PUERTOS_DE_ARRANQUE.find((p) => p.puerto === PORTS.CEREBRO)?.bloqueante === false);
c("el sandbox sí puede bloquear: sólo se pinta rojo cuando HAY proceso y no contesta (el gris no bloquea)",
  PUERTOS_DE_ARRANQUE.find((p) => p.puerto === PORTS.SANDBOX)?.bloqueante === true &&
  /a\u00fan no arrancado[\s\S]{0,120}estado: "sin-arrancar"/.test(leer("server/routers/diagnostico.ts")));
c("lo que sí se necesita para trabajar está marcado como bloqueante (puente y Ollama)",
  [PORTS.BRIDGE, PORTS.OLLAMA].every((n) => PUERTOS_DE_ARRANQUE.find((p) => p.puerto === n)?.bloqueante === true));
c("lo bloqueante trae remedio escrito (un rojo sin salida es ansiedad, no diagnóstico)",
  PUERTOS_DE_ARRANQUE.filter((p) => p.bloqueante).every((p) => p.remedio.trim().length > 0));
c("el número del puerto NO está escrito a mano en el plano (sale de PORTS)",
  !/\n\s*puerto:\s*\d/.test(leer("src/engine/puertosArranque.ts")));
c("el orden exhibido es ascendente: la casa se recorre de adentro hacia afuera",
  puertosDeArranque().every((n, i, v) => i === 0 || v[i - 1] < n));
c("el marcador de sonda propia existe y es único en su especie",
  SONDA_PROPIA === "self" && PUERTOS_DE_ARRANQUE.filter((p) => p.sonda === SONDA_PROPIA).length === 1);

console.log("\n2) El texto que comparten el banner, la memoria y el prompt\n");

const mapa = textoDeMapaDePuertos();
c("el banner del arranque nombra los SIETE puertos",
  PUERTOS_SEMILLA.every((n) => mapa.includes(":" + n)), mapa.replace(/\n/g, " | "));
c("el banner NO afirma estado (sería mentir antes de sondear)",
  !/(\bOK\b|vivo|escuchando|ca[ií]do)/.test(mapa), mapa.replace(/\n/g, " | "));
c("declara su fuente única, para que se sepa dónde se cambia", /src\/constants\.ts/.test(mapa));
c("el nombre de fila lleva el servicio y su número",
  nombreDeFila(PUERTOS_DE_ARRANQUE[0]) === PUERTOS_DE_ARRANQUE[0].servicio + " :" + PUERTOS_DE_ARRANQUE[0].puerto);

const cuerpoMapa = (leer("src/constants.ts").match(/export const MAPA_PUERTOS = \[([\s\S]*?)\]\.join/) || ["", ""])[1];
c("\u2605 MAPA_PUERTOS declara los siete (acá estaba la omisión del motor del cerebro)",
  (cuerpoMapa.match(/PORTS\.[A-Z]+/g) || []).length === 7,
  "declara " + (cuerpoMapa.match(/PORTS\.[A-Z]+/g) || []).length);
c("el motor del cerebro por fin está nombrado en el mapa del prompt", /PORTS\.CEREBRO/.test(cuerpoMapa));
c("el mapa sigue separando los puertos reservados del usuario (no son de la app)",
  /PUERTOS_RESERVADOS_USUARIO/.test(cuerpoMapa));

console.log("\n3) La ruta de verdad: /api/health/deep produce siete filas de puerto\n");

/**
 * Se monta el router de diagnóstico contra un `app` de juguete y se le pide la
 * salud profunda. Nada de leer el fuente buscando la palabra «siete»: se cuentan
 * las filas que la ruta entrega. Si alguien vuelve a la lista literal de tres,
 * esta comprobación es la que se pone roja.
 */
async function pedirHealthDeep(): Promise<any> {
  const rutas: Record<string, (req: any, res: any) => Promise<void> | void> = {};
  // El router monta GET y POST (`/api/diagnostico/autocurar` es un POST). El
  // doble de mentira imita las dos: si montara una tercera cosa, el `get`/`post`
  // ausente revienta acá y la suite lo cuenta, en vez de taparlo con un `if`.
  const appFalsa = {
    get: (p: string, h: any) => { rutas["GET " + p] = h; },
    post: (p: string, h: any) => { rutas["POST " + p] = h; },
  };
  registrarDiagnostico(appFalsa as any, {
    ollamaUrl: "http://127.0.0.1:11434",
    ramGb: 8,
    cpuCores: 4,
    sandboxVivo: () => false,
    sandboxPort: PORTS.SANDBOX,
  } as any);
  const handler = rutas["GET /api/health/deep"];
  if (!handler) throw new Error("el router no registró GET /api/health/deep");
  let cuerpo: any = null;
  await handler({ method: "GET", originalUrl: "/api/health/deep" }, { json: (b: any) => { cuerpo = b; } });
  return cuerpo;
}

let muestra: any = null;
let errorDeRuta = "";
try {
  muestra = await pedirHealthDeep();
} catch (e: any) {
  errorDeRuta = String(e?.message || e);
}

c("\u2605 la ruta responde sin lanzar excepciones", !!muestra, errorDeRuta);
if (muestra) {
  const filas: any[] = muestra.checks || [];
  const conPuerto = filas.filter((f) => /:\d{3,5}$/.test(String(f.name || "")));
  c("\u2605 el arranque muestra los SIETE puertos", conPuerto.length === 7,
    "muestra " + conPuerto.length + ": " + conPuerto.map((f) => f.name).join(" | "));
  c("cada puerto del plano tiene su fila, nombrado con número",
    PUERTOS_DE_ARRANQUE.every((p) => filas.some((f) => f.name === nombreDeFila(p))),
    PUERTOS_DE_ARRANQUE.map(nombreDeFila).filter((n) => !filas.some((f) => f.name === n)).join(" | "));
  c("el orden de las filas es el del plano, no el de llegada de las sondas",
    conPuerto.map((f) => f.name).join() === PUERTOS_DE_ARRANQUE.map(nombreDeFila).join());
  c("las siete filas declaran estado explícito",
    conPuerto.every((f) => ["vivo", "sin-arrancar", "caido"].includes(f.estado)),
    conPuerto.map((f) => f.name + "=" + f.estado).join(" "));
  c("el IDE :3000 se reporta vivo sin gastar un sondeo de red",
    filas.some((f) => f.name === nombreDeFila(PUERTOS_DE_ARRANQUE[0]) && f.estado === "vivo"));
  c("una fila gris explica por qué está gris (nunca verde inventado, nunca rojo inmerecido)",
    conPuerto.filter((f) => f.estado === "sin-arrancar").every((f) => /nace|aún no/.test(String(f.detail || ""))));
  c("ningún servicio de los que nacen bajo demanda se pinta caído por el solo hecho de no estar",
    PUERTOS_DE_ARRANQUE.filter((p) => p.nacimiento === "bajo-demanda" && p.sonda !== SONDA_PROPIA)
      .every((p) => !filas.some((f) => f.name === nombreDeFila(p) && f.estado === "caido" && /no hay nadie/.test(String(f.detail || "")))));
  c("puertosMedidos viaja en la respuesta (nadie vuelve a contar a mano)",
    muestra.puertosMedidos === 7, String(muestra.puertosMedidos));
  c("las dos filas de sistema siguen ahí: memoria de la máquina y cortacircuitos",
    filas.some((f) => f.name === "Memoria") && filas.some((f) => f.name === "Cortacircuitos"));
  c("el resumen nombra sólo los problemas bloqueantes",
    typeof muestra.summary === "string" && muestra.summary.length > 0, String(muestra.summary));
  c("los rojos no bloqueantes viajan aparte, como avisos", Array.isArray(muestra.avisos),
    JSON.stringify(muestra.avisos));
  const rojosBloqueantes = filas.filter((f) => !f.ok && f.bloqueante !== false);
  c("\u2605 `ok` refleja sólo los rojos bloqueantes: un aviso no puede tumbar la salud",
    muestra.ok === (rojosBloqueantes.length === 0),
    "ok=" + muestra.ok + " · bloqueantes rojos=" + (rojosBloqueantes.map((f) => f.name).join(",") || "ninguno") +
    " · avisos=" + (muestra.avisos || []).join(","));
  c("el resumen nombra los bloqueantes y deja los avisos fuera del conteo de problemas",
    rojosBloqueantes.every((f) => String(muestra.summary || "").includes(f.name)) &&
    (muestra.summary || "").indexOf(String((muestra.avisos || [])[0] || "\u0000")) === -1,
    String(muestra.summary));
}

console.log("\n4) La ruta ya no tiene su propia lista de puertos\n");

const diag = leer("server/routers/diagnostico.ts");
c("importa el plano de la casa", /from "\.\.\/\.\.\/src\/engine\/puertosArranque"/.test(diag));
c("\u2605 recorre PUERTOS_DE_ARRANQUE en vez de armar el array a mano", /PUERTOS_DE_ARRANQUE\.map/.test(diag));
c("DEFECTO SEMBRADO: no volvió la lista literal de tres filas con puerto",
  !/\[\s*cOllama,\s*cSandbox,\s*cPuente\s*[,\]]/.test(diag));
c("las tres sondas con detalle propio siguen intactas (no se perdió información en el arreglo)",
  /async function sondaOllama/.test(diag) && /async function sondaSandbox/.test(diag) && /async function sondaPuente/.test(diag));
c("la sonda genérica distingue «no hay nadie» de «tardó demasiado»",
  /AbortSignal\.timeout\(3000\)/.test(diag) && /TIMEOUT/.test(diag));
c("la pasada sigue topada por un plazo (siete sondas no son siete esperas)",
  /PLAZO_PASADA_MS/.test(diag) && /Promise\.all\(/.test(diag));

console.log("\n5) El telón: informar siete no es retener al usuario doce segundos\n");

const en = (ms: number) => ({ ahora: ms, inicio: 0 });
const verde = (bloqueante = true) => ({ ok: true, bloqueante });
const rojo = (bloqueante = true) => ({ ok: false, bloqueante });

c("\u2605 con los siete puertos en verde entra ya (no espera de más)",
  debeEntrar({ ...en(120), checks: [verde(), verde(false), verde(false), verde()], ultimoError: "" }).entrar === true);
c("\u2605 un pack opcional caído NO retiene la entrada: es la diferencia entre informar y chantajear",
  debeEntrar({ ...en(120), checks: [verde(), rojo(false), rojo(false), verde()], ultimoError: "" }).entrar === true,
  JSON.stringify(debeEntrar({ ...en(120), checks: [verde(), rojo(false), rojo(false), verde()], ultimoError: "" })));
c("\u2605 un bloqueante caído SÍ la retiene (el contrato de siempre, intacto)",
  debeEntrar({ ...en(1_000), checks: [verde(), rojo(true)], ultimoError: "" }).entrar === false);
c("sin `bloqueante` declarado la fila sigue siendo bloqueante (compatibilidad con quien no lo conozca)",
  debeEntrar({ ...en(1_000), checks: [{ ok: false }], ultimoError: "" }).entrar === false);
c("sin ninguna fila no se entra «porque sí»: se sigue sondeando",
  debeEntrar({ ...en(120), checks: [], ultimoError: "" }).entrar === false);
c("el vigilante sigue ganando: a los 12 s se entra pase lo que pase",
  debeEntrar({ ...en(PLAZO_MAXIMO_MS), checks: [rojo(true), rojo(false)], ultimoError: "" }).entrar === true);
c("siete filas grises no bloqueantes tampoco dejan el telón cerrado",
  debeEntrar({ ...en(120), checks: [rojo(false), rojo(false), rojo(false), rojo(false), rojo(false)], ultimoError: "" }).entrar === true);

console.log("\n6) Las demás superficies: ninguna puede volver a mostrarse corta\n");

// La barra de estado (Header) ya traía los siete desde v2.3.9. Se comprueba que no
// se le cayó ninguno al tocar la telemetría, porque la ruta y la barra se editan
// por separado y es la pareja que más fácil se desincroniza.
const header = leer("src/components/Header.tsx");
c("la barra de estado pinta los SIETE chips",
  PUERTOS_SEMILLA.every((n) => header.includes(":" + n)),
  PUERTOS_SEMILLA.filter((n) => !header.includes(":" + n)).join(","));

const tele = leer("server/routers/telemetria.ts");
c("la muestra de telemetría sondea los SIETE (la tabla SONDAS, v2.3.9)",
  PUERTOS_SEMILLA.filter((n) => n !== PORTS.IDE).every((n) => tele.includes("port" + n)),
  PUERTOS_SEMILLA.filter((n) => !tele.includes("port" + n)).join(","));
c("la telemetría conserva su criterio de siete (valla propia no se toca acá)",
  PUERTOS_CLAVE.length === 7);

const splash = leer("src/components/BootSplash.tsx");
c("\u2605 el splash habla con el plano, no con una lista propia",
  /from "\.\.\/engine\/puertosArranque"/.test(splash));
c("el splash dice cuántos puertos comprueba, con el número del plano",
  /PUERTOS_DE_ARRANQUE\.length/.test(splash));
c("el splash tiene TRES estados pintados (verde, gris, rojo)",
  /function semaforo/.test(splash) && /semaforo\(c\) === "gris"/.test(splash) && /semaforo\(c\) === "rojo"/.test(splash));
c("DEFECTO SEMBRADO: el splash no volvió a un dos-colores `c.ok ? … : …` en la fila",
  !/\{c\.ok \? \(\s*<span className="mt-0\.5 flex/.test(splash));
c("el splash lee `estado` y `bloqueante` de la fila",
  /estado\?:/.test(splash) && /bloqueante\?:/.test(splash));

const serverSrc = leer("server.ts");
c("\u2605 el arranque por consola también imprime el mapa de los siete",
  /textoDeMapaDePuertos\(\)/.test(serverSrc) && /import \{ textoDeMapaDePuertos \}/.test(serverSrc));
c("y lo hace SIN agrandar el monolito (comparte la línea del import)",
  (serverSrc.match(/textoDeMapaDePuertos/g) || []).length === 2 &&
  /admisionRam"; import \{ textoDeMapaDePuertos \}/.test(serverSrc));

const sidebar = leer("src/components/LeftSidebar.tsx");
c("ninguna etiqueta suelta vuelve a anunciar una lista corta de puertos",
  !/Puertos \(3000, 3500, 5000, 5100, 5102, 11434\)/.test(sidebar),
  "LeftSidebar otra vez promete seis");

const diag2 = leer("scripts/arranque-diagnostico.mjs");
c("el diagnóstico por consola lee PORTS en vez de confiar en su memoria",
  /puertosDeConstants/.test(diag2) && /ESTÁ VIEJA/.test(diag2));

// v2.3.22 · NINGÚN TEXTO QUE SE MANDA AL MODELO PUEDE ENUMERAR MENOS DE SIETE.
// El `nucleo` de los modelos chicos (`brain.ts`) decía «Puertos: IDE 3000 · sandbox
// 3500 · puente 5000 · Ollama 11434» y la semilla de `README.md` que se escribe en
// cada proyecto nuevo, lo mismo. Cuatro de siete. Un modelo al que se le enumeran
// cuatro niega los otros tres citando, y acá la cita le llega hasta al `micro`.
//
// La valla mira SÓLO líneas de código, con los comentarios removidos: es la CUARTA
// vez en esta hoja de ruta que una valla de «buscar esta cadena» se dispara contra el
// texto que la explica (el escalón, el auditor, el registro de validar, y acá el
// propio comentario que cuenta qué se corrigió). Sin exclusión de comentarios, la
// valla castiga documentar.
//
// Y NO toca `RightSidebar`: esa línea dice «IDE en :3500… App en :3500» en el panel
// del sandbox, nombrando los dos extremos que ESE panel usa. No es una afirmación
// sobre la casa y reescribirla a siete sería meter ruido en una etiqueta correcta.
{
  const sinComentarios = (t: string) =>
    t
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
  const SIETE = [3000, 3500, 5000, 5100, 5102, 5103, 11434];
  const archivos = ["src/engine/brain.ts", "src/App.tsx", "src/engine/rutasSistema.ts", "src/constants.ts"];
  for (const rel of archivos) {
    const cuerpo = sinComentarios(leer(rel));
    const enumeraciones = (cuerpo.match(/Puertos[^\n"]{0,300}/g) || []).filter((s) => /\b(3000|3500|5000|5100|5102|5103|11434)\b/.test(s));
    const cortas = enumeraciones.filter((s) => SIETE.filter((p) => s.includes(String(p))).length < 7);
    c(`★ ${rel}: ninguna enumeración de puertos queda corta`, cortas.length === 0, cortas.join(" | ").slice(0, 120));
  }
  const readme = leer("src/App.tsx");
  c("la semilla de README que recibe cada proyecto nuevo nombra los siete",
    [":3000", ":3500", ":5000", ":5100", ":5102", ":5103", ":11434"].every((p) => readme.includes(p)));
  c("★ el puente :5000 NO comparte el documento de sesión (medido, no asumido)",
    !readFileSync(path.join(RAIZ, "agent_bridge_5000.py"), "utf8").includes("planes.json"));
}

c("la suite está registrada en la valla maestra (si no, no corre nunca)",
  leer("scripts/validar.mjs").includes("puertosArranque.test.ts"));

console.log("\n" + "─".repeat(56));
console.log(`PUERTOS DEL ARRANQUE (v2.3.12): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
