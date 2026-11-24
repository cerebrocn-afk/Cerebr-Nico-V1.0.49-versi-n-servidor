/**
 * rendimiento.test.ts — RENDIMIENTO v1: 16 reglas de análisis estático
 * =============================================================================
 * POR QUÉ EXISTE ESTA SUITE
 * ------------------------
 * El motor entregaba código que «funcionaba» pero escalaba mal: O(n²) dentro de
 * un recorrido, await en serie en bucles, clones por JSON, I/O síncrono, SELECT *
 * y librerías enteras. La CERRADURA cubrió la seguridad; el rendimiento no lo
 * miraba nadie. Esta suite fija qué detecta el analizador (cada regla, con su
 * línea y su remedio) y —igual de importante— qué NO debe marcar, porque un
 * escáner que grita con código limpio se apaga al segundo día. Y fija la regla
 * de oro: el análisis estático NUNCA bloquea (son pistas, no medidas).
 *
 * Se ejecuta con:   npx tsx tests/rendimiento.test.ts
 */
import {
  REGLAS_RENDIMIENTO,
  analizarCodigo,
  analizarProyecto,
  contarHallazgos,
  extensionDe,
  informeRendimiento,
} from "../src/engine/rendimiento";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}
const tiene = (archivo: string, codigo: string, regla: string) =>
  analizarCodigo(archivo, codigo).some((h) => h.regla === regla);

console.log("\n[0] El contrato del registro");
comprobar("hay EXACTAMENTE 16 reglas", REGLAS_RENDIMIENTO.length === 16, String(REGLAS_RENDIMIENTO.length));
comprobar("los ids son \u00fanicos", new Set(REGLAS_RENDIMIENTO.map((r) => r.id)).size === 16);
comprobar("cada regla tiene t\u00edtulo, severidad, categor\u00eda y remedio", REGLAS_RENDIMIENTO.every((r) => r.titulo && r.como && ["alta", "media", "baja"].includes(r.severidad) && ["algoritmo", "io", "memoria", "bundle", "micro"].includes(r.categoria)));
comprobar("cada regex compila (no hay patrones rotos)", REGLAS_RENDIMIENTO.every((r) => r.re instanceof RegExp));
comprobar("hay al menos 5 reglas de impacto alto", REGLAS_RENDIMIENTO.filter((r) => r.severidad === "alta").length >= 5);

console.log("\n[1] Async mal usado (serie / promesa perdida)");
comprobar("detecta forEach async", tiene("a.js", "items.forEach(async (x) => { await guardar(x); });", "foreach-async"));
comprobar("detecta await dentro de for", tiene("a.ts", "for (const u of users) { await traer(u); }", "await-en-bucle"));
comprobar("no marca await con Promise.all", !tiene("a.ts", "for (const p of Promise.all(ps)) { await p; }", "await-en-bucle"));
comprobar("no marca for await (async iterator leg\u00edtimo)", !tiene("a.ts", "for await (const x of stream) { usar(x); }", "await-en-bucle"));
comprobar("detecta .map(async) sin Promise.all", tiene("a.ts", "const r = xs.map(async (x) => fetch(x));", "map-async-sin-all"));
comprobar("no marca .map(async) envuelto en Promise.all", !tiene("a.ts", "const r = await Promise.all(xs.map(async (x) => fetch(x)));", "map-async-sin-all"));

console.log("\n[2] Algoritmo y memoria (O(n\u00b2), clones)");
comprobar("detecta clon por JSON.parse(JSON.stringify)", tiene("a.ts", "const copia = JSON.parse(JSON.stringify(obj));", "clon-json"));
comprobar("detecta includes dentro de filter (O(n\u00b2))", tiene("a.ts", "const r = a.filter((x) => b.includes(x));", "cuadratico-busqueda-en-recorrido"));
comprobar("detecta indexOf dentro de some", tiene("a.ts", "const hay = a.some((x) => b.indexOf(x) >= 0);", "cuadratico-busqueda-en-recorrido"));
comprobar("no marca un filter simple sin b\u00fasqueda anidada", !tiene("a.ts", "const r = a.filter((x) => x > 0);", "cuadratico-busqueda-en-recorrido"));
comprobar("detecta spread del acumulador en reduce", tiene("a.ts", "const o = xs.reduce((acc, x) => ({ ...acc, [x.id]: x }), {});", "reduce-spread"));
comprobar("no marca reduce que muta el acumulador", !tiene("a.ts", "const o = xs.reduce((acc, x) => { acc[x.id] = x; return acc; }, {});", "reduce-spread"));

console.log("\n[3] I/O y bloqueo del hilo");
comprobar("detecta readFileSync", tiene("s.ts", "const txt = readFileSync(ruta, 'utf8');", "io-sincrono"));
comprobar("detecta writeFileSync", tiene("s.ts", "writeFileSync(dst, datos);", "io-sincrono"));
comprobar("no marca fs.promises con await", !tiene("s.ts", "const txt = await fs.readFile(ruta, 'utf8');", "io-sincrono"));
comprobar("detecta setInterval agresivo (5ms)", tiene("a.ts", "setInterval(tick, 5);", "setinterval-agresivo"));
comprobar("no marca setInterval de 1000ms", !tiene("a.ts", "setInterval(tick, 1000);", "setinterval-agresivo"));

console.log("\n[4] Micro y bundle");
comprobar("detecta .length recomputada en for", tiene("a.ts", "for (let i = 0; i < arr.length; i++) { usar(arr[i]); }", "length-recomputada-en-for"));
comprobar("no marca for con longitud cacheada", !tiene("a.ts", "for (let i = 0, n = arr.length; i < n; i++) { usar(arr[i]); }", "length-recomputada-en-for"));
comprobar("detecta import completo de lodash", tiene("a.ts", "import _ from 'lodash';", "import-lodash-completo"));
comprobar("no marca import puntual de lodash", !tiene("a.ts", "import get from 'lodash/get';", "import-lodash-completo"));
comprobar("detecta import de moment", tiene("a.ts", "import moment from 'moment';", "libreria-fecha-pesada"));

console.log("\n[5] SQL");
comprobar("detecta SELECT *", tiene("q.sql", "SELECT * FROM usuarios WHERE activo = 1;", "select-estrella"));
comprobar("no marca SELECT con columnas", !tiene("q.sql", "SELECT id, nombre FROM usuarios;", "select-estrella"));
comprobar("detecta LIKE con comod\u00edn inicial", tiene("q.sql", "SELECT id FROM t WHERE nombre LIKE '%ana';", "like-comodin-inicial"));
comprobar("no marca LIKE con comod\u00edn final", !tiene("q.sql", "SELECT id FROM t WHERE nombre LIKE 'ana%';", "like-comodin-inicial"));

console.log("\n[6] Python (pandas y modismos lentos)");
comprobar("detecta iterrows", tiene("h.py", "for i, fila in df.iterrows():", "pandas-iterrows"));
comprobar("detecta range(len(...))", tiene("h.py", "for i in range(len(datos)):", "python-range-len"));
comprobar("no marca enumerate", !tiene("h.py", "for i, x in enumerate(datos):", "python-range-len"));
comprobar("detecta apply axis=1", tiene("h.py", "df['t'] = df.apply(lambda r: r.a + r.b, axis=1)", "pandas-apply-fila"));
comprobar("las reglas JS no disparan en Python", analizarCodigo("h.py", "const copia = JSON.parse(JSON.stringify(obj));").every((h) => h.regla !== "clon-json"));

console.log("\n[7] El agregado: proyecto, conteo e informe");
const lote = [
  { path: "src/app.ts", content: "const c = JSON.parse(JSON.stringify(o));\nfor (const u of us) { await traer(u); }" },
  { path: "src/ok.ts", content: "export const n: number = 1;" },
];
const hallazgos = analizarProyecto(lote);
const resumen = contarHallazgos(hallazgos);
comprobar("analiza el lote completo", hallazgos.length >= 2, JSON.stringify(hallazgos.map((h) => h.regla)));
comprobar("el archivo limpio no suma nada", hallazgos.every((h) => h.archivo === "src/app.ts"));
comprobar("el an\u00e1lisis est\u00e1tico NUNCA bloquea (son pistas)", resumen.bloquea === false);
comprobar("el resumen cuenta por categor\u00eda", resumen.porCategoria.memoria >= 1 && resumen.porCategoria.io >= 1);
const informe = informeRendimiento(hallazgos);
comprobar("el informe nombra archivo y l\u00ednea", /src\/app\.ts:\d+/.test(informe));
comprobar("el informe trae el c\u00f3mo mejorar", informe.includes("c\u00f3mo mejorar"));
comprobar("el informe recuerda que son pistas, no veredicto", informe.toLowerCase().includes("pistas") && informe.toLowerCase().includes("medida"));
comprobar("sin hallazgos, el informe lo dice", informeRendimiento([]).includes("sin pistas"));
comprobar("extensionDe lee el sufijo", extensionDe("a/b/c.PY") === "py" && extensionDe("sin-ext") === "");
comprobar("un hallazgo trae l\u00ednea > 0", hallazgos.every((h) => h.linea > 0));
comprobar("determinismo: el mismo c\u00f3digo da el mismo resultado", JSON.stringify(analizarCodigo("a.ts", "JSON.parse(JSON.stringify(o))")) === JSON.stringify(analizarCodigo("a.ts", "JSON.parse(JSON.stringify(o))")));
comprobar("no marca c\u00f3digo dentro de un comentario", !tiene("a.ts", "// antes usaba JSON.parse(JSON.stringify(o)) ac\u00e1", "clon-json"));

console.log(`\n${pasan}/${pasan + fallan} correctas`);
if (fallan > 0) { console.error("FALLOS:", fallos); process.exit(1); }
