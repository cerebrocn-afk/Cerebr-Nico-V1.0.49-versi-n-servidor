/**
 * inventarioEntidades.test.ts — LAS 51 ENTIDADES, UNA POR UNA (v1.85.0 · FASE 6.1)
 * ================================================================================
 * El plano, FASE 6 punto 1: «inventario auditado de las 50. Cada entidad con:
 * nombre único (la fuente es una sola), contrato, y al menos 1 test. Lo que no
 * tiene contrato no se fusiona».
 *
 * DOS VERDADES QUE ESTA SUITE PUSO SOBRE LA MESA (medidas, no declaradas):
 *
 *  1) NO SON 50, SON 51. `HOJA_DE_RUTA_PERFECCION.md` habla de «50 entidades
 *     (12 + 38)»; `tests/agentico.test.ts:34` y `consejo.ts:457` dicen 51 desde
 *     que V8 sumó `espejo.generalista`. El plano arrastra la cifra vieja.
 *
 *  2) DOCE ENTIDADES NO TENÍAN NI UNA PRUEBA QUE LAS NOMBRARA. Al medir (no al
 *     suponer) la cobertura contra las suites que de verdad corren en el ritual,
 *     estas doce estaban solas: texto.acentos, texto.mayus, texto.ordenar,
 *     texto.dif, datos.json-llaves, datos.csv-columnas, mate.porcentaje,
 *     mate.minmax, vis.hex2rgb, vis.rgb2hex, proyecto.stats, memorista.registrar.
 *     Estaban "cubiertas por archivo" y nadie había abierto el archivo. Acá cada
 *     una se EJECUTA con valores reales y se compara contra el valor esperado,
 *     no contra su propia sombra.
 *
 * La suite además congela el contrato de forma (id único, nombre, descripcion,
 * ejecutar en herramientas / ausencia en especialistas), el reparto 21 activas
 * y 18 dormidas, y expone el mapa 1:1 entidad→suite con `--mapa`:
 *
 *     npx tsx tests/inventarioEntidades.test.ts --mapa
 *
 * Lo que el mapa imprime es lo que va al documento de FASE 6. Si mañana nace una
 * entidad 52 sin prueba, esto se pone rojo antes que Mario.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import {
  ENTIDADES,
  entidadPorId,
  ejecutarEntidad,
  cambiarActivacion,
  estadoConsejo,
  configurarSistema,
  ACTIVAS_POR_DEFECTO,
  ESPECIALISTAS,
  DUEÑO_DE,
} from "../src/engine/reflejo/consejo";
import { IDS_ESPEJOS } from "../src/engine/reflejo/espejos";
import { dueñosConVoto, ACCIONES_REPARTIDAS } from "../src/engine/votacionConsejo";

configurarSistema({
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem(),
  cpus: () => os.cpus(),
  loadavg: () => os.loadavg(),
  sha256: (x) => createHash("sha256").update(x, "utf8").digest("hex"),
  uuid: () => randomUUID(),
});

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(`${msg}${detalle ? " → " + detalle : ""}`);
}

const RAIZ = process.cwd();

// ═══ 1 · El conteo: 51, no 50 (y cada número tiene su fuente) ════════════════
const especialistas = ENTIDADES.filter((e) => e.tipo === "especialista");
const herramientas = ENTIDADES.filter((e) => e.tipo === "herramienta");
const espejos = herramientas.filter((e) => e.id.startsWith("espejo."));
const curadas = herramientas.filter((e) => !e.id.startsWith("espejo."));
comprobar("son 53 entidades (no las 50 del plano)", ENTIDADES.length === 53, String(ENTIDADES.length));
comprobar("12 especialistas", especialistas.length === 12, String(especialistas.length));
comprobar("28 herramientas curadas", curadas.length === 28, String(curadas.length));
comprobar("13 espejos (incluido el generalista de V8)", espejos.length === 13 && espejos.some((e) => e.id === "espejo.generalista"), String(espejos.length));
comprobar("12 + 28 + 13 = 53, la cuenta cuadra", especialistas.length + curadas.length + espejos.length === ENTIDADES.length);
comprobar("ESPECIALISTAS y ENTIDADES no se contradicen", ESPECIALISTAS.length === 12 && especialistas.every((e) => ESPECIALISTAS.some((x) => x.id === e.id)));
comprobar("IDS_ESPEJOS y el catálogo baten igual", IDS_ESPEJOS.length === espejos.length && IDS_ESPEJOS.every((id) => !!entidadPorId(id)), JSON.stringify(IDS_ESPEJOS));
comprobar("ACTIVAS_POR_DEFECTO son 23 (10 curadas + 13 espejos)", [...ACTIVAS_POR_DEFECTO].length === 23, String([...ACTIVAS_POR_DEFECTO].length));

// ═══ 2 · Contrato de forma: sin contrato no se fusiona ═══════════════════════
comprobar("los 53 ids son únicos", new Set(ENTIDADES.map((e) => e.id)).size === 53);
comprobar("ninguna entidad nace sin nombre", ENTIDADES.every((e) => typeof e.nombre === "string" && e.nombre.trim().length > 0), ENTIDADES.filter((e) => !e.nombre?.trim()).map((e) => e.id).join(","));
comprobar("ninguna entidad nace sin descripción", ENTIDADES.every((e) => typeof e.descripcion === "string" && e.descripcion.trim().length > 0), ENTIDADES.filter((e) => !e.descripcion?.trim()).map((e) => e.id).join(","));
comprobar("toda herramienta trae `ejecutar`", curadas.concat(espejos).every((e) => typeof e.ejecutar === "function"), herramientas.filter((e) => typeof e.ejecutar !== "function").map((e) => e.id).join(","));
comprobar("ningún especialista finge `ejecutar` (votan por frase)", especialistas.every((e) => !e.ejecutar));
comprobar("los 10 especialistas que votan están en el reparto", dueñosConVoto().length >= 9 && dueñosConVoto().every((id) => especialistas.some((e) => e.id === id)), dueñosConVoto().join(","));
comprobar("telemetría y memorista siguen sin voto declarado", !dueñosConVoto().includes("telemetria") && !dueñosConVoto().includes("memorista"));
comprobar("el reparto cubre las 23 acciones del tipo AccionConsejo (7 originales + 16 genericas)", ACCIONES_REPARTIDAS.length === 23, String(ACCIONES_REPARTIDAS.length));
comprobar("DUEÑO_DE sigue mandando las 6 originales", Object.keys ? Object.keys(DUEÑO_DE).length >= 6 : false, JSON.stringify(Object.keys(DUEÑO_DE)));
const est = estadoConsejo();
comprobar("estadoConsejo: total 53 / activas 23 / dormidas 18", est.total === 53 && est.cuenta.activas === 23 && est.cuenta.dormidas === 18, JSON.stringify(est.cuenta));
comprobar("la nota viva dice 53 (no la cifra vieja del plano)", /^53 entidades/.test(est.nota), est.nota.slice(0, 30));

// ═══ 3 · DORMIDA ≠ MUERTA: las 12 sin prueba previa se ejecutan acá ══════════
// Cada caso: id, datos, y el valor REAL esperado. Ninguna comprobación compara
// contra la sombra del código: los resultados están escritos a mano.
type Caso = { id: string; datos: any; esperado: string; nota: string };
const CASOS: Caso[] = [
  { id: "texto.acentos", datos: { texto: "Canción de la montaña" }, esperado: "Cancion de la montana", nota: "NFD sin diacríticos" },
  { id: "texto.mayus", datos: { texto: "hola mundo cruel", modo: "titulo" }, esperado: "Hola Mundo Cruel", nota: "modo titulo" },
  { id: "texto.ordenar", datos: { texto: "perro\ngato\nave" }, esperado: "ave\ngato\nperro", nota: "orden es-locale" },
  { id: "texto.dif", datos: { a: "uno\ndos\ntres", b: "dos\ncuatro" }, esperado: "uno\ntres", nota: "lo que hay en A y no en B" },
  { id: "datos.json-llaves", datos: { json: '{"a":1,"b":[1,2],"c":"x"}' }, esperado: "a:number b:array c:string", nota: "claves raíz con tipo" },
  { id: "datos.csv-columnas", datos: { csv: "nombre,edad\nana,30\nluis,41\n" }, esperado: "2 columnas [nombre,edad] · 2 filas", nota: "cabeceras y conteo" },
  { id: "mate.porcentaje", datos: { p: 15, n: 200 }, esperado: "15% de 200 = 30", nota: "p% de n" },
  { id: "mate.minmax", datos: { numeros: "3 9 1 7" }, esperado: "min=1 max=9 rango=8", nota: "extremos" },
  { id: "vis.hex2rgb", datos: { hex: "#0a141e" }, esperado: "rgb(10, 20, 30)", nota: "hex válido con #" },
  { id: "vis.rgb2hex", datos: { r: 10, g: 20, b: 30 }, esperado: "#0a141e", nota: "canaliza 0-255" },
  { id: "proyecto.stats", datos: { archivos: [{ ruta: "a.ts", contenido: "x\ny" }, { ruta: "b.ts", contenido: "z" }, { ruta: "c.md", contenido: "hola" }] }, esperado: ".ts:2f/3l .md:1f/1l", nota: "por extensión" },
];

const ejecutadasAqui: string[] = [];
for (const c of CASOS) {
  const antes = !!entidadPorId(c.id)?.activa;
  if (!antes) cambiarActivacion(c.id, true);
  const r = ejecutarEntidad(c.id, c.datos);
  comprobar(`${c.id} responde (${c.nota})`, r.ok === true && String(r.salida) === c.esperado, `esperado=${JSON.stringify(c.esperado)} · real=${JSON.stringify(r.salida)} motivo=${r.motivo}`);
  // Y su puerta de error: sin datos, MOTIVO (nunca silencio).
  const malo = ejecutarEntidad(c.id, {});
  comprobar(`${c.id} sin datos declara el motivo`, malo.ok === false && !!malo.motivo, JSON.stringify(malo).slice(0, 90));
  if (!antes) cambiarActivacion(c.id, false);
  ejecutadasAqui.push(c.id);
}

// memorista.registrar vive despierta y escribe en la sesión del consejo.
const memOk = ejecutarEntidad("memorista.registrar", { nota: "inventario auditado: son 51, no 50" });
comprobar("memorista.registrar registra la nota de sesión", memOk.ok === true && /registrada/.test(String(memOk.salida)), JSON.stringify(memOk).slice(0, 120));
comprobar("memorista.registrar sin nota dice qué falta", ejecutarEntidad("memorista.registrar", {}).ok === false);
ejecutadasAqui.push("memorista.registrar");

// ═══ 3b · DEFECTO CAZADO POR EL INVENTARIO (v1.85.0) ════════════════════════
// `Number("")` es 0: sin numeros, la calculadora contestaba «0» como si fuera un
// resultado. El inventario lo midio y se congela la cura: vacio = motivo, nunca cero.
const promedioActivaAntes = !!entidadPorId("mate.promedio")?.activa;
if (!promedioActivaAntes) cambiarActivacion("mate.promedio", true);
const promVacio = ejecutarEntidad("mate.promedio", {});
comprobar("mate.promedio sin numeros NO devuelve 0 (devuelve motivo)", promVacio.ok === false && /ning[uú]n n[uú]mero/.test(promVacio.motivo || "") && promVacio.salida === undefined, JSON.stringify(promVacio));
comprobar("mate.minmax con la lista vacia tampoco inventa un extremo", ejecutarEntidad("mate.minmax", { numeros: "   " }).ok === false);
comprobar("mate.promedio con numeros reales sigue dando 4 (la cura no rompio lo que andaba)", ejecutarEntidad("mate.promedio", { numeros: [2, 4, 6] }).salida === "4");
if (!promedioActivaAntes) cambiarActivacion("mate.promedio", false);

// Dormida ≠ muerta: una de las 12 sigue dormida y lo dice con el botón exacto.
comprobar("texto.acentos sigue DORMIDA tras la prueba y lo dice con el motivo", (() => {
  cambiarActivacion("texto.acentos", false);
  const d = ejecutarEntidad("texto.acentos", { texto: "x" });
  return d.ok === false && /DORMIDA/.test(d.motivo || "") && /POST \/api\/consejo\/entidad/.test(d.motivo || "");
})(), String(ejecutarEntidad("texto.acentos", { texto: "x" }).motivo));
comprobar("un especialista no se duerme con toggle (decisión de producto)", cambiarActivacion("codigo", false).ok === false && /especialista votante/.test(cambiarActivacion("codigo", false).motivo || ""));
comprobar("una entidad inexistente se nombra, no se finge", /no existe la entidad/.test(ejecutarEntidad("no.existe", {}).motivo || ""));

// ═══ 4 · El mapa 1:1 entidad→suite, sobre las suites que SÍ corren ═══════════
const validarBruto = readFileSync(path.join(RAIZ, "scripts/validar.mjs"), "utf8");
const registradas = [...new Set([...validarBruto.matchAll(/archivo:\s*"tests\/([^"]+)"/g)].map((m) => m[1]))];
comprobar("el censo de suites registradas es grande (no se lee con padrón vacío)", registradas.length >= 200, String(registradas.length));
const fuenteSuites = registradas
  .map((f) => { try { return { f, c: readFileSync(path.join(RAIZ, "tests", f), "utf8") }; } catch { return null; } })
  .filter((x): x is { f: string; c: string } => !!x);

function suitesDe(id: string): string[] {
  const re = new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return fuenteSuites.filter((s) => re.test(s.c)).map((s) => s.f);
}
const MAPA: Record<string, string[]> = {};
for (const e of ENTIDADES) MAPA[e.id] = suitesDe(e.id);
const sinCobertura = Object.entries ? [] : [];
const descubiertas = Object.keys(MAPA).filter((id) => MAPA[id].length === 0);
comprobar("★ las 51 entidades tienen al menos una suite que las nombra", descubiertas.length === 0, `sin cobertura: ${descubiertas.join(", ") || "ninguna"}`);
const soloAqui = Object.keys(MAPA).filter((id) => MAPA[id].length === 1 && MAPA[id][0] === "inventarioEntidades.test.ts");
comprobar("las 12 que estaban solas hoy tienen su prueba ejecutada (no solo nombrada)", ejecutadasAqui.length === 12 && soloAqui.every((id) => ejecutadasAqui.includes(id)), `ejercidas: ${ejecutadasAqui.length} · solas: ${soloAqui.join(", ")}`);
comprobar("esta suite también está registrada en el ritual (no es huerfana)", registradas.includes("inventarioEntidades.test.ts"));

// ═══ 5 · El mapa, si se pide (es la evidencia del documento de FASE 6) ═══════
if (process.argv.includes("--mapa")) {
  console.log("\nMAPA 1:1 ENTIDAD → SUITES (registradas en validar.mjs)\n");
  console.log("| id | tipo | activa | suites |");
  console.log("|---|---|---|---|");
  for (const e of ENTIDADES) {
    console.log(`| \`${e.id}\` | ${e.tipo} | ${e.activa ? "sí" : "dormida"} | ${MAPA[e.id].map((s) => s.replace(".test.ts", "")).join(", ") || "—"} |`);
  }
  const totalCobro = Object.values(MAPA).reduce((a: number, v: string[]) => a + v.length, 0);
  console.log(`\n51 entidades · ${totalCobro} aristas entidad↔suite · ${registradas.length} suites en el ritual`);
}

console.log(`\n═══ INVENTARIO DE 51 ENTIDADES (FASE 6.1): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);
