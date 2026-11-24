/**
 * tests/ordenDeObra.test.ts — v1.22.2 «ORDEN DE OBRA»: lista antes de crear, certeza en el disco
 * ==============================================================================================
 * Se ejecuta con:  npx tsx tests/ordenDeObra.test.ts
 *
 * El pedido del usuario: «a la hora de crear se equivoca mucho; resolver certeza;
 * inyectar orden al motor de hacer lista de archivos antes de comenzar».
 *
 * Esta suite prueba EN SECO las tres piezas puras (listado, manifiesto, certeza)
 * y luego mira los cables del monolito: que la lista la ejecute el motor antes
 * del paso 0, que cada escritura se registre y que el cierre pegue el acta.
 * Nada levanta un servidor: el disco entra como sonda falsa, como el tiempo
 * entraba en `estado.ts`.
 */
import {
  HERRAMIENTAS_DE_OBRA,
  formatearListado,
  directivaDeObra,
  registrarObra,
  resolverCertezaObra,
  cierreDeObra,
  type ManifiestoObra,
  type SondaDisco,
} from "../src/engine/ordenDeObra";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const modulo = leer("src/engine/ordenDeObra.ts");
const server = leer("server.ts");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

console.log("\n═══ V1.22.2 · ORDEN DE OBRA ═══");

// 1 · LA LISTA ANTES DE COMENZAR — forma, cota y higiene ─────────────────────
console.log("\n1) formatearListado: la verdad del sandbox, acotada");
{
  const v = formatearListado(["b.ts", "a.ts", "a.ts", "src/x.ts"]);
  comprobar("cuenta los archivos reales (sin duplicados)", /3 archivo\(s\) reales/.test(v), v.split("\n")[0]);
  comprobar("sale ordenada (dos turnos se comparan de un vistazo)", v.indexOf("  a.ts") < v.indexOf("  b.ts"));
  const basura = formatearListado(["p/node_modules/express/index.js", "p/.git/HEAD", "p/src/app.ts"]);
  comprobar("node_modules y .git no ensucian el listado", !/node_modules/.test(basura) && !/\.git\//.test(basura));
  comprobar("lo útil de la lista con basura sobrevive", /p\/src\/app\.ts/.test(basura));
  const vacia = formatearListado([]);
  comprobar("proyecto vacío se declara, no se calla", /proyecto vacío/.test(vacia));
  const grande = formatearListado(Array.from({ length: 200 }, (_, i) => `f${String(i).padStart(3, "0")}.ts`), 140);
  comprobar("la cota protege la ventana del micro-modelo", (grande.match(/^ {2}f/gm) || []).length === 140);
  comprobar("y el recorte se confiesa", /60 archivo\(s\) más sin listar/.test(grande));
  comprobar("las contrabarras de Windows se normalizan", formatearListado(["a\\b.ts"]).includes("a/b.ts"));
}

// 2 · LA DIRECTIVA — corta, imperativa, con las cuatro reglas ────────────────
console.log("\n2) directivaDeObra: el orden que recibe el modelo");
{
  const d = directivaDeObra(formatearListado(["main.ts"]));
  comprobar("arrastra la lista real delante de las reglas", d.indexOf("main.ts") < d.indexOf("Reglas del turno"));
  comprobar("prohíbe inventar rutas", /No inventes rutas/.test(d));
  comprobar("pide manifiesto con set_plan para obra de 3+ archivos", /set_plan/.test(d) && /3 o más/.test(d));
  comprobar("ordena leer antes de pisar y preferir edit_file", /read_file/.test(d) && /edit_file/.test(d));
  comprobar("le quita al modelo el derecho de afirmar «creado»", /no los decís vos/.test(d));
  // v1.31.0 — LA VALLA SE DIVIDE, NO SE AFLOJA: el ORDEN de reglas sigue
  // atado a ≤1400; el RETRATO del motorContexto es un bloque aparte con su
  // propio tope de 900 (notaDeContexto lo corta). Total máximo: 2300.
  const orden = d.split("\n\n[CONTEXTO DEL PROYECTO")[0];
  comprobar("el orden de reglas sigue atado a ≤1400 (valla histórica intacta)", orden.length <= 1400, String(orden.length));
  comprobar("directiva + retrato caben en el presupuesto dividido (≤2300)", d.length <= 2300, String(d.length));
  // v1.31.0 — el RETRATO entra por parámetro (ordenDeObra sigue puro: no lee disco).
  const conRetrato = directivaDeObra(formatearListado(["main.ts"]), "[CONTEXTO DEL PROYECTO · motorContexto v1.31]\nstack: React");
  comprobar("con retrato, el orden viejo queda intacto delante", conRetrato.startsWith(d));
  comprobar("el retrato se pega detrás del orden, no mezclado", conRetrato.indexOf("Reglas del turno") < conRetrato.indexOf("[CONTEXTO DEL PROYECTO ·"));
  comprobar("sin retrato no hay bloque fantasma", !d.includes("[CONTEXTO DEL PROYECTO ·"));
  comprobar("la regla 5 manda leer hubs antes de tocarlos", /HUBS son lo fr\u00e1gil/.test(conRetrato) || /HUBS son lo frágil/.test(conRetrato));
}

// 3 · EL MANIFIESTO — qué se registró, cuántas veces, cómo terminó ───────────
console.log("\n3) registrarObra: el manifiesto del turno");
{
  const m: ManifiestoObra = new Map();
  registrarObra(m, "read_file", { path: "a.ts" }, true);
  comprobar("leer no es crear: read_file no entra al manifiesto", m.size === 0);
  registrarObra(m, "pc_write_file", { path: "C:\\fuera.ts" }, true);
  comprobar("pc_write_file queda fuera: el fs local no puede probarla", m.size === 0);
  comprobar("HERRAMIENTAS_DE_OBRA no promete lo que no puede verificar", !HERRAMIENTAS_DE_OBRA.has("pc_write_file") && HERRAMIENTAS_DE_OBRA.has("write_file"));
  registrarObra(m, "write_file", { path: "a.ts" }, false, "sintaxis: llaves sin cerrar");
  registrarObra(m, "write_file", { path: "a.ts" }, true);
  comprobar("la misma ruta cuenta intentos, no entradas", m.size === 1 && m.get("a.ts")!.intentos === 2);
  comprobar("el último resultado manda", m.get("a.ts")!.ultimoOk === true && m.get("a.ts")!.ultimoError === undefined);
  registrarObra(m, "write_file", { path: "b.ts" }, false, "guard bloqueó");
  comprobar("una falla queda confesa con su error", m.get("b.ts")!.ultimoOk === false && /guard/.test(m.get("b.ts")!.ultimoError || ""));
  registrarObra(m, "make_dir", { path: "src\\util" }, true);
  comprobar("make_dir se registra como carpeta y normaliza la ruta", m.get("src/util")!.tipo === "carpeta");
  registrarObra(m, "write_file", { path: "  " }, true);
  comprobar("ruta vacía no ensucia el manifiesto", m.size === 3);
}

// 4 · LA CERTEZA RESUELTA — el disco tiene la última palabra ─────────────────
console.log("\n4) resolverCertezaObra: ejecución ok + prueba en disco = ejecutado");
{
  const sonda = (archivos: Record<string, number>, carpetas: string[] = []): SondaDisco => (r) =>
    r in archivos ? { existe: true, esCarpeta: false, bytes: archivos[r] } : carpetas.includes(r) ? { existe: true, esCarpeta: true, bytes: 0 } : { existe: false, esCarpeta: false, bytes: 0 };
  const m: ManifiestoObra = new Map();
  registrarObra(m, "write_file", { path: "ok.ts" }, true);
  registrarObra(m, "write_file", { path: "fantasma.ts" }, true);
  registrarObra(m, "write_file", { path: "vacio.ts" }, true);
  registrarObra(m, "edit_file", { path: "roto.ts" }, false, "ancla no encontrada");
  registrarObra(m, "make_dir", { path: "carpeta" }, true);
  const r = resolverCertezaObra(m, sonda({ "ok.ts": 120, "vacio.ts": 0, "roto.ts": 99 }, ["carpeta"]));
  const porRuta = Object.fromEntries(r.map((c) => [c.ruta, c]));
  comprobar("escrito, presente y con bytes → ejecutado", porRuta["ok.ts"].certeza === "ejecutado" && /120 bytes/.test(porRuta["ok.ts"].nota));
  comprobar("la herramienta dijo ok pero el disco lo niega → sin verificar", porRuta["fantasma.ts"].certeza === "sin_verificar" && /no está en disco/.test(porRuta["fantasma.ts"].nota));
  comprobar("archivo de 0 bytes se informa, no se esconde", porRuta["vacio.ts"].certeza === "ejecutado" && /0 bytes/.test(porRuta["vacio.ts"].nota));
  comprobar("lo que hay en disco de un intento fallido es de antes → sin verificar", porRuta["roto.ts"].certeza === "sin_verificar" && /ancla no encontrada/.test(porRuta["roto.ts"].nota));
  comprobar("carpeta verificada → ejecutado", porRuta["carpeta"].certeza === "ejecutado");
  const m2: ManifiestoObra = new Map();
  registrarObra(m2, "make_dir", { path: "choque" }, true);
  const r2 = resolverCertezaObra(m2, sonda({ "choque": 5 }));
  comprobar("un archivo que ocupa el nombre de la carpeta no da ejecutado", r2[0].certeza === "sin_verificar" && /no una carpeta/.test(r2[0].nota));
}

// 5 · EL CIERRE — el acta que ve el usuario ──────────────────────────────────
console.log("\n5) cierreDeObra: sin obra no hay acta; con obra, nombres y apellidos");
{
  comprobar("turno sin creación no recibe acta (cero ruido)", cierreDeObra(new Map(), () => ({ existe: false, bytes: 0 })) === "");
  const m: ManifiestoObra = new Map();
  registrarObra(m, "write_file", { path: "a.ts" }, true);
  registrarObra(m, "write_file", { path: "b.ts" }, true);
  const todoFirme = cierreDeObra(m, (r) => ({ existe: true, esCarpeta: false, bytes: r === "a.ts" ? 10 : 20 }));
  comprobar("obra firme: acta con «ejecutado» y las dos rutas", /certeza: ejecutado/.test(todoFirme) && /a\.ts/.test(todoFirme) && /b\.ts/.test(todoFirme), todoFirme);
  const m2: ManifiestoObra = new Map();
  registrarObra(m2, "write_file", { path: "a.ts" }, true);
  registrarObra(m2, "write_file", { path: "b.ts" }, false, "x");
  registrarObra(m2, "write_file", { path: "b.ts" }, false, "y");
  for (let i = 0; i < 8; i++) registrarObra(m2, "write_file", { path: `flojo${i}.ts` }, true);
  const acta = cierreDeObra(m2, (r) => ({ existe: r === "a.ts", esCarpeta: false, bytes: 5 }));
  comprobar("obra floja: dice SIN VERIFICAR con el motivo", /SIN VERIFICAR/.test(acta) && /b\.ts/.test(acta));
  comprobar("un archivo reintentado muestra sus intentos en el acta", /b\.ts \(2 intentos\)/.test(acta), acta);
  comprobar("la acta no afirma lo que no está: cierra con la regla", /No se afirma lo que no está/.test(acta));
  comprobar("más de 6 flojos se resumen, no se vuelcan", /y \d+ más/.test(acta));
}

// 6 · LOS CABLES DEL MONOLITO — inyección, registro y cierre ─────────────────
console.log("\n6) Cables en server.ts: la lista ANTES del paso 0 y el acta al cerrar");
{
  const cuerpo = server.slice(server.indexOf("async function cuerpoBucleAgente"));
  const inicio = cuerpo.slice(0, cuerpo.indexOf("for (let step = 0"));
  comprobar("el motor ejecuta list_files por su cuenta antes del bucle", /executeToolCall\("list_files", \{\}\)/.test(inicio));
  comprobar("la directiva entra como system, antes del primer paso", /messages\.push\(\{ role: "system", content: directivaDeObra/.test(inicio));
  comprobar("la inyección ocurre DESPUÉS de la nota de continuidad y ANTES del for", inicio.indexOf("notaContinuidad") !== -1 && inicio.indexOf("notaContinuidad") < inicio.indexOf("directivaDeObra") && inicio.indexOf("directivaDeObra") < cuerpo.indexOf("for (let step = 0"));
  comprobar("cada herramienta de obra se registra tras su resultado real", /registrarObra\(manifiestoObra, String\(fnName\), args, !isError/.test(cuerpo));
  comprobar("el registro va después de conocer isError, no antes", cuerpo.indexOf("registrarObra") > cuerpo.indexOf("const compacted = compactToolResult"));
  // v1.23.0 · El acta ya no se pega con la llamada suelta a cierreDeObra en el
  // return: vive en `actaExtendida()` (ORDEN DE OBRA + COMPLETITUD) y el cierre
  // del juez además pasa por el CONTROL DE CIERRE (puertas dentro del turno,
  // 2 rondas). El contrato de fondo es el mismo: TODO camino de salida pega el
  // acta y el acta contrasta contra el disco.
  comprobar("el acta extendida envuelve el cierre de obra en disco", /const actaExtendida[\s\S]{0,1400}?cierreDeObra\(manifiestoObra, sondaObra\)/.test(cuerpo));
  comprobar("el cierre del juez pega el acta", /\(content \|\| lastContent \|\| d\.informe\)( \+ puertasVerdes)? \+ actaExtendida\(\)/.test(cuerpo));
  comprobar("el cierre por techo de pasos también", /actaExtendida\(\)( \+ avisoLazo)?;\n\}/.test(cuerpo));
  comprobar("el control de cierre reabre el turno con la orden concreta (tope 2)", /cerrarTurnoQf\("cierre dentro del turno"\)[\s\S]{0,400}rondasCierreDeObra < 2/.test(cuerpo));
  comprobar("la sonda mira el disco con la misma raíz segura que las herramientas", /fs\.statSync\(resolveSafePath\(p\)\)/.test(cuerpo));
  comprobar("el acta del turno no rompe las vallas del MOTOR VIVO (envoltorio intacto)", /async function runOllamaAgentLoop\([\s\S]*?\n\}\n\nasync function cuerpoBucleAgente/.test(server));
}

// 7 · CABLOS DE LA CASA ──────────────────────────────────────────────────────
console.log("\n7) Cables de la casa");
{
  comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("ordenDeObra.test.ts"));
  const imports = (modulo.match(/^import[^;]+;/gm) || []).join("\n");
  comprobar("el módulo es puro: sus únicas dependencias son internas", /^import[^;]+;$/.test(imports.trim()) && !/fs|express|path/.test(imports), imports);
  comprobar("reutiliza la escala de certeza de v1.8.0 (una escala, no dos)", /from "\.\/certeza"/.test(modulo));
  const pkg = JSON.parse(leer("package.json"));
  // v1.46.0 — LA VALLA DEJA DE FIJAR UN NÚMERO. Estaba clavada a «1.43.0», así
  // que viajaba roja de fábrica en cuanto la versión subía (ya se había
  // «arreglado» subiendo el literal a mano). La propiedad que de verdad importa
  // —una semilla, y la misma en los dos sitios— no caduca.
  comprobar("la semilla es una semver válida", /^\d+\.\d+\.\d+$/.test(String(pkg.version)), pkg.version);
  comprobar("constants.ts viaja con la misma semilla",
    (leer("src/constants.ts").match(/const VERSION_SEMVER = "([^"]+)"/) || [])[1] === pkg.version);
}

// ═══ V1.57.11 · LA CERTEZA TIENE MANOS ═══════════════════════════════════════
console.log("\n8) v1.57.11 · huecos de certeza: la promesa que el disco desmiente");
{
  const { huecosDeCerteza, bytesObraEnDisco, decidirAperturaCierre, sugerirRutaReal, directivaDeRescate } = await import("../src/engine/ordenDeObra");
  const disco = new Map<string, number>([["existe.js", 100]]);
  const sonda = (r: string) => (disco.has(r) ? { existe: true, esCarpeta: false, bytes: disco.get(r)! } : { existe: false, esCarpeta: false, bytes: 0 });
  const m: ManifiestoObra = new Map();
  registrarObra(m, "write_file", { path: "script.js" }, true);   // dijo ok…
  registrarObra(m, "write_file", { path: "existe.js" }, true);   // …y esto sí está
  const h = huecosDeCerteza(m, sonda);
  comprobar("un ok sin disco es HUECO con causa promesa_vacia", h.length === 1 && h[0].ruta === "script.js" && h[0].causa === "promesa_vacia", JSON.stringify(h));
  comprobar("el que sí está en disco no es hueco", !h.some((x: any) => x.ruta === "existe.js"));
  // El matiz que la sesión del 14/10 exigía: intento fallido sobre archivo que EXISTE
  // (obra previa en disco) NO reabre el turno — reabrir por eso sería el bucle infinito.
  const m2: ManifiestoObra = new Map();
  registrarObra(m2, "write_file", { path: "existe.js" }, true);
  registrarObra(m2, "edit_file", { path: "existe.js" }, false, "el ancla no apareció");
  comprobar("intento fallido con obra previa en disco NO es hueco", huecosDeCerteza(m2, sonda).length === 0, JSON.stringify(huecosDeCerteza(m2, sonda)));
  comprobar("intento fallido sin disco SÍ es hueco (intento_fallido)", (() => {
    const m3: ManifiestoObra = new Map();
    registrarObra(m3, "edit_file", { path: "styles.css" }, false, "no se encontró el texto");
    return huecosDeCerteza(m3, sonda)[0]?.causa === "intento_fallido";
  })());
  comprobar("archivo de 0 bytes es hueco (la escritura no aterrizó)", (() => {
    const s0 = (r: string) => ({ existe: true, esCarpeta: false, bytes: 0 });
    const m4: ManifiestoObra = new Map();
    registrarObra(m4, "write_file", { path: "x.js" }, true);
    return huecosDeCerteza(m4, s0).length === 1;
  })());
  comprobar("bytesObraEnDisco cuenta solo lo que el disco muestra", bytesObraEnDisco(m, sonda) === 100, String(bytesObraEnDisco(m, sonda)));
}
console.log("\n9) v1.57.11 · sugerirRutaReal: distinguir «no existe» de «existe en otra raíz»");
{
  const { sugerirRutaReal } = await import("../src/engine/ordenDeObra");
  comprobar("candidato en otra carpeta: lo encuentra", sugerirRutaReal("script.js", ["MiApp/script.js", "index.html"]) === "MiApp/script.js");
  comprobar("la misma ruta no se sugiere a sí misma", sugerirRutaReal("a/script.js", ["a/script.js"]) === null);
  comprobar("sin candidatos, null (no existe, punto)", sugerirRutaReal("script.js", ["index.html"]) === null);
  comprobar("varias candidatas: la más corta (la raíz más cerca del sandbox)", sugerirRutaReal("s.js", ["x/y/z/s.js", "x/s.js"]) === "x/s.js");
  comprobar("con barras invertizadas compara normalizado", sugerirRutaReal("s.js", ["p\\s.js"]) === "p/s.js");
  comprobar("nombre vacío no explota", sugerirRutaReal("", ["a.js"]) === null);
}
console.log("\n10) v1.57.11 · directiva de rescate y puerta de reapertura");
{
  const { directivaDeRescate, decidirAperturaCierre, MAX_RONDAS_RESCATE } = await import("../src/engine/ordenDeObra");
  const h = [{ ruta: "script.js", tipo: "archivo" as const, causa: "promesa_vacia" as const, nota: "la herramienta dijo ok pero no está en disco", intentos: 3 }];
  const d = directivaDeRescate(h, 1);
  comprobar("nombra el archivo y su causa real", d.includes("script.js") && d.includes("no está en disco"));
  comprobar("prohíbe el juramento (decir listo/funciona sobre el hueco)", /PROHIBIDO/.test(d) && /listo/.test(d));
  comprobar("ordena list_files → write_file force → read_file (el camino del disco)", /list_files/.test(d) && /force=true/.test(d) && /read_file/.test(d));
  comprobar("la sugerencia de otra raíz viaja en la orden", directivaDeRescate([{ ...h[0], sugerida: "MiApp/script.js" }], 1).includes("ENCONTRÓ EN"));
  comprobar("ronda y tope impressos (el modelo sabe que no es infinito)", /ronda 1 de 2/.test(directivaDeRescate(h, 1, 2)));
  // LA PUERTA: decide en seco — reabrir, cerrar limpio, o cerrar rojo al agotar rondas.
  const ap = decidirAperturaCierre({ huecos: h, faltantes: [], rondasUsadas: 0 });
  comprobar("con hueco y rondas disponibles → RESCATE con nota y directiva", ap?.tipo === "rescate" && /CERTEZA HUECA/.test(ap.nota) && ap.directiva.includes("script.js"), JSON.stringify(ap));
  comprobar("sin huecos → CIERRA LIMPIO (no persiana los turnos buenos)", decidirAperturaCierre({ huecos: [], faltantes: [], rondasUsadas: 0 })?.tipo === "limpio");
  comprobar("rondas agotadas → null: el acta roja se entrega, no se eterniza", decidirAperturaCierre({ huecos: h, faltantes: [], rondasUsadas: MAX_RONDAS_RESCATE }) === null);
  comprobar("el faltante de plan solo también reabre (PROMETIDO SIN ESCRIBIR era otro nombre del mismo defecto)", decidirAperturaCierre({ huecos: [], faltantes: ["styles.css"], rondasUsadas: 0 })?.tipo === "rescate");
  comprobar("faltantes también viajan a la directiva", (decidirAperturaCierre({ huecos: [], faltantes: ["styles.css"], rondasUsadas: 0 }) as any)?.directiva.includes("styles.css"));
}
console.log("\n11) v1.57.11 · memoria entre turnos: el acta roja no se borra al mensaje siguiente");
{
  const { huecosDeCerteza, registrarHuecosConocidos, notaHuecosConocidos, reiniciarHuecosConocidos } = await import("../src/engine/ordenDeObra");
  reiniciarHuecosConocidos();
  comprobar("sin huecos registrados: silencio (cero regresión en chat normal)", notaHuecosConocidos() === "");
  const m: ManifiestoObra = new Map();
  registrarObra(m, "write_file", { path: "script.js" }, true);
  const sondaFalsa = () => ({ existe: false, esCarpeta: false, bytes: 0 });
  registrarHuecosConocidos(huecosDeCerteza(m, sondaFalsa));
  const nota = notaHuecosConocidos();
  comprobar("el turno siguiente NACE sabiendo que script.js no está", /script.js/.test(nota) && /NO estaban/.test(nota), nota.slice(0, 120));
  comprobar("la nota prohíbe jurar y manda verificar primero", /No asumas que existen|verificá con list_files/.test(nota));
  registrarHuecosConocidos(huecosDeCerteza(m, (r: string) => ({ existe: true, esCarpeta: false, bytes: 50 }))); // el disco ya muestra el archivo…
  comprobar("si el disco ya muestra la obra, la memoria SE AUTOLIMPIA", notaHuecosConocidos() === "");
  registrarHuecosConocidos([{ ruta: "x", tipo: "archivo", causa: "promesa_vacia", nota: "n", intentos: 1 }]);
  comprobar("a los 31 minutos la nota expira (no habla de obras viejas)", notaHuecosConocidos(Date.now() + 31 * 60 * 1000) === "");
  reiniciarHuecosConocidos();
}
console.log("\n12) v1.57.11 · EL CABLE: la puerta está montada en el bucle real");
{
  const cuerpo = server.slice(server.indexOf("async function cuerpoBucleAgente"));
  comprobar("el motor importa la puerta y la memoria", /decidirAperturaCierre/.test(server) && /notaHuecosConocidos/.test(server) && /registrarHuecosConocidos/.test(server) && /huecosDeCerteza/.test(server));
  comprobar("★ la nota del disco entra como system ANTES del paso 0 (la memoria viaja)", /notaHuecosConocidos\(\)[\s\S]{0,200}role: "system"/.test(cuerpo));
  comprobar("★ antes de cerrar, el motor consulta los huecos (la puerta está en el camino del cierre)", /decidirAperturaCierre\(\{[\s\S]{0,300}rondasUsadas: rondasRescateCerteza/.test(cuerpo));
  comprobar("★ el rescate reabre el turno con continue (no devuelve el «listo» al usuario)", /apertura\.tipo === "rescate"[\s\S]{0,400}messages\.push\(\{ role: "user", content: apertura\.directiva \}\)[\s\S]{0,80}continue/.test(cuerpo));
  comprobar("★ el registro de huecos ocurre en CADA cierre intentado (verde o rojo, el retrato se actualiza)", /registrarHuecosConocidos\(huecosTurno\)/.test(cuerpo));
  comprobar("★ y también cuando el for muere por techo (fin de bucle, camino /api/chat)", /registrarHuecosConocidos\(huecosDeCerteza\(manifiestoObra, sondaObra, listadoReal\)\)/.test(cuerpo));
  comprobar("el CIERRE POR PRÓRROGA también está montado (leído del fuente, v1.57.11)", /concederProrrogaTecho\(\{[^}]*pendientes: tareasPendientes\(plan\)/.test(cuerpo));
  comprobar("★ el recálculo del techo respeta la prórroga concedida (no la pisa)", /Math\.min\(PASOS_TOPE, techoDePasos\([^;]*\+ prorrogaExtra\)/.test(cuerpo));
  comprobar("el acta vieja sigue intacta: cierreDeObra en el acta extendida", /cierreDeObra\(manifiestoObra, sondaObra\)/.test(cuerpo));
}

console.log(`\n═══ ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) { console.log("FALLOS:\n" + fallos.map((f) => `  - ${f}`).join("\n")); }
process.exit(fallos.length ? 1 : 0);
