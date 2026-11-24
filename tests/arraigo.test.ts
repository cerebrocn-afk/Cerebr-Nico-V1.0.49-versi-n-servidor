/**
 * arraigo.test.ts — v1.99.5 · PLANTAR EL MAPA SIN DUPLICARLO NI INVENTARLO
 * =======================================================================
 * El reflejo (v1.99.4) medía; este corte es el acto que cambia lo medido. Tres promesas que
 * hay que poder señalar con el dedo:
 *
 *   1. NO INVENTA: una pieza cuyo ancla no está en el disco no entra al índice, y se nombra
 *      en `omitidas` con la raíz donde se la buscó. (El IDE afirmando memoria de archivos que
 *      no existen es el defecto que ya costó horas: «tablero sano, cerebro vacío».)
 *   2. NO DUPLICA: la misma pieza, enraizada dos veces, es UNA entrada con el MISMO archivo.
 *      Sin esto, cada arranque del botón sumaba un eje nuevo y el índice se pudría.
 *   3. EL ASIENTO COINCIDE: la ruta que el plano predice (`nombreArchivo.archivoDeEntrada`) es
 *      la que `aprender` escribe. Si éstas divergen, la pieza queda en `deuda` eterna aunque
 *      tenga vector — dos dueños para una verdad, la falta clásica de la casa.
 *
 * Escribe de verdad, sobre un directorio temporal (la convención de la casa: `mkdtempSync` +
 * `rmSync`), porque «probé la lógica en seco» no alcanza para un alta en disco.
 */
import { planDeArraigo, sentarseEnIndice, resumenDeArraigo, anclaDe, tituloDe, cuerpoDe, raizDe, MAX_PIEZAS_ARRAIGO, TITULO_EJE } from "../src/engine/arraigo";
import { archivoDeEntrada, slug, idDeEntrada } from "../src/engine/nombreArchivo";
import { aprender, cargarIndice, clavesVectores } from "../src/engine/cerebroOrgano";
import { reflejoDeSemilla } from "../src/engine/cerebroSemilla";
import { claveVector } from "../src/engine/vectorCerebro";
import { HEMISFERIO_IZQUIERDO, HEMISFERIO_DERECHO } from "../src/engine/hemisferios";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " -> " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};

const IZQ = [
  { rel: "cerebro.md", que: "las leyes del agente" },
  { rel: "server.ts", que: "el monolito" },
];
const DER = [
  { rel: "cerebro", que: "los organos enraigados" },
  { rel: "LECCIONES.md", que: "las L del disco" },
  { rel: "no-existe.md", que: "una pieza ausente" },
];

console.log("\n1) El plano no inventa y dice que no invento\n");
const miradas: string[] = [];
const plan = planDeArraigo({
  version: "9.9.9",
  izquierdo: IZQ,
  derecho: DER,
  lecciones: ["L1 · la primera leccion", "L2 · la segunda leccion"],
  rutas: ["R1 · server.ts vive en la instalacion"],
  existe: (rel, raiz) => {
    miradas.push(`${raiz}:${rel}`);
    return !(raiz === "datos" && rel === "no-existe.md");
  },
});
c("★ la pieza ausente NO se planta, pero SI se mide (nada con nombre, no silencio)",
  plan.nuevas.every((n) => !/no-existe/.test(n.titulo)) && plan.semilla.some((s) => s.archivo === "no-existe.md"));
c("y la omision dice donde se la busco",
  plan.omitidas.some((o) => /no-existe\.md/.test(o.motivo) && /raiz de datos/.test(o.motivo)), JSON.stringify(plan.omitidas));
c("el hemisferio izquierdo se consulta contra LA INSTALACION", miradas.includes("app:server.ts"), miradas.join(" | "));
c("el hemisferio derecho se consulta contra LA RAIZ DE DATOS", miradas.includes("datos:cerebro"));
c("\u2605 el eje se planta siempre: sin origen no hay distancia que medir",
  plan.nuevas[0]?.tema === "eje-0" && plan.nuevas[0]?.titulo === TITULO_EJE, JSON.stringify(plan.nuevas[0]));
c("las lecciones del disco entran textualmente (eso es lo que el hibrido tiene que hallar)",
  plan.nuevas.some((n) => n.texto === "L1 · la primera leccion"));
c("con un archivo comun y corriente, dos lecciones entran las dos (no se canibalizan)",
  plan.nuevas.filter((n) => n.tema === "lecciones").length === 2);
c("determinismo: el mismo mapa produce el mismo plano, byte a byte",
  JSON.stringify(planDeArraigo({ version: "9.9.9", izquierdo: IZQ, derecho: DER, lecciones: [], rutas: [], existe: () => true }))
  === JSON.stringify(planDeArraigo({ version: "9.9.9", izquierdo: IZQ, derecho: DER, lecciones: [], rutas: [], existe: () => true })));
c("el techo del plano se cumple (no se plantan 500 piezas de golpe)",
  planDeArraigo({ version: "9.9.9", izquierdo: Array.from({ length: 40 }, (_, i) => ({ rel: `a${i}.md`, que: "q" })), derecho: [], existe: () => true }).semilla.length <= MAX_PIEZAS_ARRAIGO + 1);
c("cada pieza lleva su ancla con sentido (hemisferio + rel) y su titulo nombra la mitad",
  anclaDe({ hemisferio: "derecho", rel: "cerebro/vectores.json", que: "" }) === "derecho-cerebro/vectores.json"
  && tituloDe({ hemisferio: "izquierdo", rel: "server.ts", que: "" }) === "hemisferio izquierdo · server.ts");
c("el cuerpo dice QUE es y EN QUE raiz se lo busca (la ruta enrutada se entiende sola)",
  /la instalacion/.test(cuerpoDe({ hemisferio: "izquierdo", rel: "server.ts", que: "el monolito" }))
  && /raiz de datos/.test(cuerpoDe({ hemisferio: "derecho", rel: "cerebro", que: "organos" })));
c("raizDe() reparte las mitades sin excepcion", raizDe("izquierdo") === "app" && raizDe("derecho") === "datos");

console.log("\n2) El asiento: una sola formula para el que escribe y el que mide\n");
c("slug quita acentos, mayusculas y simbolos sin dejar nombre vacio",
  slug("CerebroNico V1") === "cerebronico-v1" && slug("!!!") === "nota" && slug("") === "nota");
c("archivoDeEntrada es temas/<tema>-<titulo>-<ancla>.md, con barra y sin azar",
  archivoDeEntrada("eje-0", "eje de todo", "eje-0") === "temas/eje-0-eje-de-todo-eje-0.md",
  archivoDeEntrada("eje-0", "eje de todo", "eje-0"));
c("y el id del indice sale de la misma base (el archivo es el id, no un primo)",
  idDeEntrada("eje-0", "eje de todo", "eje-0") === "eje-0-eje-de-todo-eje-0");
c("\u2605 el asiento que predice el plano NO cambia entre corridas (sin randomBytes)",
  new Set([0, 1, 2].map(() => JSON.stringify(planDeArraigo({ version: "9.9.9", izquierdo: IZQ, derecho: DER, existe: () => true }).semilla.map((s) => s.asiento)))).size === 1);
c("cada pieza plantada tiene asiento propio (dos piezas no pueden compartir vector)",
  new Set(planDeArraigo({ version: "9.9.9", izquierdo: IZQ, derecho: DER, existe: () => true }).semilla.map((s) => s.asiento)).size
  === planDeArraigo({ version: "9.9.9", izquierdo: IZQ, derecho: DER, existe: () => true }).semilla.length);

console.log("\n3) El arraigo sobre un disco de verdad (aqui es donde se rompe o se prueba)\n");
const DIR = mkdtempSync(join(tmpdir(), "cn-arraigo-"));
const RAIZ_DATOS = join(DIR, "datos");
const RAIZ_APP = join(DIR, "app");
try {
  mkdirSync(join(RAIZ_APP, "src", "engine"), { recursive: true });
  // El disco del usuario del 1/11: `cerebro/` EXISTE y esta VACIO, y `vectores.json` no esta.
  mkdirSync(join(RAIZ_DATOS, "cerebro"), { recursive: true });
  writeFileSync(join(RAIZ_APP, "cerebro.md"), "# leyes\n");
  writeFileSync(join(RAIZ_APP, "server.ts"), "// monolito\n");
  // No se pre-crea ningun espejo: el punto es que el arraigo lo escriba (es `cerebro/CEREBRO.md`,
  // no `cerebro.md` — el mapa del derecho estaba declarando un archivo que nadie escribe).
  writeFileSync(join(RAIZ_DATOS, "LECCIONES.md"), "L1 · la primera leccion\nL2 · la segunda leccion\n");

  const reales = () => planDeArraigo({
    version: "9.9.9",
    izquierdo: IZQ,
    derecho: DER,
    lecciones: readFileSync(join(RAIZ_DATOS, "LECCIONES.md"), "utf-8").split(/\r?\n/),
    rutas: [],
    existe: (rel, raiz) => existsSync(join(raiz === "app" ? RAIZ_APP : RAIZ_DATOS, rel)),
  });

  const p1 = reales();
  const escritas1 = p1.nuevas.map((n) => aprender(RAIZ_DATOS, n)).filter(Boolean);
  const indice1 = cargarIndice(RAIZ_DATOS);
  c("plantar escribe una entrada por pieza y su archivo en cerebro/temas/",
    indice1.entradas.length === p1.nuevas.length && escritas1.length === p1.nuevas.length,
    `${indice1.entradas.length} vs ${p1.nuevas.length}`);
  c("el archivo escrito es EXACTAMENTE el asiento que predijo el plano",
    indice1.entradas.every((e) => {
      const s = p1.semilla.find((x) => x.tema === e.tema && (x.asiento || "") === e.archivo);
      return !!s;
    }), indice1.entradas.map((e) => e.archivo).join(" | "));
  c("y el archivo existe en el disco del indice (no es un puntero fantasma)",
    indice1.entradas.every((e) => existsSync(join(RAIZ_DATOS, "cerebro", e.archivo))));

  const p2 = reales();
  p2.nuevas.map((n) => aprender(RAIZ_DATOS, n));
  const indice2 = cargarIndice(RAIZ_DATOS);
  c("\u2605 IDEMPOTENCIA: enraizar dos veces deja UNA entrada por pieza, no dos",
    indice2.entradas.length === indice1.entradas.length, `${indice1.entradas.length} -> ${indice2.entradas.length}`);
  c("con el mismo nombre de archivo (los archivos viejos no se acumulan en temas/)",
    JSON.stringify([...indice2.entradas].map((e) => e.archivo).sort()) === JSON.stringify([...indice1.entradas].map((e) => e.archivo).sort()));
  c("el refuerzo es visible y no duplicado: peso 2 en el eje",
    (indice2.entradas.find((e) => e.tema === "eje-0")?.peso || 0) === 2, String(indice2.entradas.find((e) => e.tema === "eje-0")?.peso));
  c("los archivos de tema siguen siendo los mismos en disco",
    indice2.entradas.filter((e) => existsSync(join(RAIZ_DATOS, "cerebro", e.archivo))).length === indice2.entradas.length);
  c("\u2605 el arraigo materializa la cara humana del indice (cerebro/CEREBRO.md)",
    existsSync(join(RAIZ_DATOS, "cerebro", "CEREBRO.md")));

  // Antes del vector: todo lo plantado es DEUDA. Despues, LUZ. Ese salto es el arraigo sirviendo.
  const conAsiento = sentarseEnIndice(p2, cargarIndice(RAIZ_DATOS).entradas);
  const clavesVacias = clavesVectores(RAIZ_DATOS);
  const antes = reflejoDeSemilla(conAsiento, clavesVacias, (rel, e) =>
    existsSync(join((e?.raiz || "datos") === "app" ? RAIZ_APP : RAIZ_DATOS, rel)));
  c("sin sidecar lo plantado es DEUDA, no luz prestada",
    antes.luz === 0 && antes.deuda > 0, JSON.stringify({ luz: antes.luz, deuda: antes.deuda, nada: antes.nada }));

  const sidecar: Record<string, number[]> = {};
  for (const s of conAsiento) if (s.clase === "eje" || s.clase === "hemisferio") sidecar[claveVector(s.tema, s.asiento || s.archivo, "cafe0000")] = [0.1, 0.2];
  mkdirSync(join(RAIZ_DATOS, "cerebro"), { recursive: true });
  writeFileSync(join(RAIZ_DATOS, "cerebro", "vectores.json"), JSON.stringify(sidecar));
  const despues = reflejoDeSemilla(conAsiento, clavesVectores(RAIZ_DATOS), (rel, e) =>
    existsSync(join((e?.raiz || "datos") === "app" ? RAIZ_APP : RAIZ_DATOS, rel)));
  c("\u2605 con el vector escrito en la clave que predice el asiento, la pieza pasa a LUZ",
    despues.luz >= 1 && despues.luz > antes.luz, JSON.stringify({ antes: antes.luz, despues: despues.luz }));
  c("y la cobertura sube sin contar la nada en el denominador",
    /^\d+%$/.test(despues.cobertura) && despues.cobertura !== "0%", despues.cobertura);
  c("la nada sigue nombrandose nada (la pieza ausente no se volvio luz por decreto)",
    despues.nada === antes.nada && despues.nada >= 1, JSON.stringify({ antes: antes.nada, despues: despues.nada }));
  c("el resumen del arraigo nombra plantadas y omisiones, sin cifras inventadas",
    /1 pieza\(s\) en el indice|^\d+ pieza/.test(resumenDeArraigo(1, [{ id: "x", motivo: "no esta" }])) && /no esta/.test(resumenDeArraigo(1, [{ id: "x", motivo: "no esta" }])),
    resumenDeArraigo(1, [{ id: "x", motivo: "no esta" }]));
} finally {
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* el temporal se va con el sistema */ }
}

console.log("\n4) El mapa real, medido contra este arbol (hoja viva, no ficcion)\n");
const planReal = planDeArraigo({
  version: "9.9.9",
  izquierdo: HEMISFERIO_IZQUIERDO.piezas,
  derecho: HEMISFERIO_DERECHO.piezas,
  existe: (rel, raiz) => existsSync(join(raiz === "app" ? process.cwd() : RAIZ_DATOS, rel)),
});
c("las piezas del izquierdo existen de verdad en la instalacion (server.ts, src/engine...)",
  planReal.nuevas.filter((n) => /^hemisferio izquierdo/.test(n.titulo)).length >= 5,
  String(planReal.nuevas.filter((n) => /^hemisferio izquierdo/.test(n.titulo)).length));
c("el derecho se mide contra la raiz de datos, no contra el arbol de codigo",
  planReal.omitidas.some((o) => /raiz de datos/.test(o.motivo)) || planReal.nuevas.some((n) => /^hemisferio derecho/.test(n.titulo)),
  JSON.stringify(planReal.omitidas.slice(0, 2)));

console.log("\n5) El cable: quien enraiza, cuando y con que dos raices\n");
const fuenteRouter = readFileSync(join(process.cwd(), "server", "routers", "embedderCerebro.ts"), "utf-8");
c("\u2605 el router planta por la puerta unica (aprender) y con el plano (no a mano)",
  /planDeArraigo/.test(fuenteRouter) && /aprender\(deps\.raizDatos/.test(fuenteRouter));
c("el boton enraiza y calienta en ese orden; nadie mas enraiza",
  /opciones\.arraigar\) arraigar\(\)/.test(fuenteRouter) && /arraigar: true/.test(fuenteRouter));
// v1.0.14 · la valla buscaba `\n` y el router está en CRLF (Windows): nunca podía coincidir.
// Se acepta `\r?\n` y se exige lo que de verdad importa: que el arranque llame a `calentar()`
// SIN `arraigar: true` (escribir en la memoria del usuario sin que nadie lo pida es el defecto).
// v1.0.14 · dos defectos de la valla, no del cable:
//  (a) buscaba `\n` y el router está en CRLF (Windows) → nunca coincidía;
//  (b) prohibía `arraigar: true` en TODO el archivo, y el botón del panel lo usa a propósito.
// Lo que hay que vigilar es SOLO el calentado tardío del arranque: el `setTimeout` que llama a
// `calentar()` sin bandera. Se aísla ese bloque y se comprueba que no enraíza.
const bloqueArranque = (fuenteRouter.match(/setTimeout\(\(\) => \{[\s\S]*?\}, retraso\)/) || [""])[0];
c("\u2605 el calentado del arranque NO escribe en la memoria del usuario",
  /calentar\(\)\r?\n\s+\.then/.test(fuenteRouter)
  && bloqueArranque.length > 0
  && !/arraigar/.test(bloqueArranque),
  bloqueArranque ? "el bloque del arranque menciona arraigar" : "no se aisló el setTimeout del arranque");
c("el reflejo usa las DOS raices y el asiento del indice real",
  /sentarseEnIndice/.test(fuenteRouter) && /existeEn\(e\?\.raiz \|\| "datos", rel\)/.test(fuenteRouter));
c("la instalacion le llega montada al server (si no, el izquierdo seria nada falso)",
  /raizApp: process\.cwd\(\)/.test(readFileSync(join(process.cwd(), "server.ts"), "utf-8")));
c("cerebroOrgano ya no tiene su propia formula de nombre (una verdad, un dueno)",
  !/function slug\(/.test(readFileSync(join(process.cwd(), "src", "engine", "cerebroOrgano.ts"), "utf-8")));
c("y escribe el archivo con la forma que el plano predice, no con path.join",
  /archivo: `temas\/\$\{id\}\.md`/.test(readFileSync(join(process.cwd(), "src", "engine", "cerebroOrgano.ts"), "utf-8")));

console.log(`\n=== ARRAIGO (v1.99.5): ${ok} correctas - ${mal.length} fallidas ===`);
if (mal.length) { console.log("\nFALLOS:"); for (const f of mal) console.log("  FALLO -> " + f); process.exit(1); }
