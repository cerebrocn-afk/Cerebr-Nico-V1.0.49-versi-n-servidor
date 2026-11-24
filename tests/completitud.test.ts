/**
 * completitud.test.ts — COMPLETITUD v1 (v1.23.0): plan ↔ manifiesto ↔ disco
 * =========================================================================
 * POR QUÉ EXISTE ESTA SUITE
 * -------------------------
 * Queja literal del usuario: «siempre le faltan archivos». El plan promete N
 * archivos, el modelo escribe M<N, el acta dice «listo» y el usuario abre la
 * carpeta y faltan. `ordenDeObra` verifica lo que se INTENTÓ escribir; esta
 * suite verifica el HUECO entre lo prometido, lo escrito y lo que el disco
 * muestra — además de los enlaces al vacío, los 0 bytes, los truncados y el
 * hueco de arranque. Todo con la sonda/lector inyectados: se prueba en seco.
 *
 * Se ejecuta con:   npx tsx tests/completitud.test.ts
 */
import {
  archivosTruncados,
  archivosVacios,
  enlacesAlVacio,
  huecoDeArranque,
  informeCompletitud,
  normalizar,
  prometidoSinObra,
  rutasMencionadasEnPlan,
  verificarCompletitud,
  type Sonda,
  type Lector,
} from "../src/engine/completitud";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}

/** Disco de juguete: mapa ruta→contenido. */
function discoDe(files: Record<string, string>): { sonda: Sonda; leer: Lector } {
  const sonda: Sonda = (r) => {
    const k = r.replace(/^\.\//, "");
    const hay = k in files;
    return { existe: hay, esCarpeta: false, bytes: hay ? files[k].length : 0 };
  };
  const leer: Lector = (r) => {
    const k = r.replace(/^\.\//, "");
    return k in files ? files[k] : null;
  };
  return { sonda, leer };
}

console.log("\n[0] Utilidades base");
comprobar("normaliza backslash y ./", normalizar(".\\src\\App.tsx") === "src/app.tsx");
comprobar("normaliza baja mayúsculas", normalizar("SRC/A.TS") === "src/a.ts");

console.log("\n[1] Rutas que el plan menciona");
const rutas = rutasMencionadasEnPlan([
  { description: "crear src/App.tsx con el layout" },
  { description: "escribir index.html y styles.css" },
  { description: "una tarea sin archivos" },
]);
comprobar("extrae src/App.tsx", rutas.includes("src/App.tsx"), JSON.stringify(rutas));
comprobar("extrae index.html y styles.css", rutas.includes("index.html") && rutas.includes("styles.css"));
comprobar("no inventa rutas donde no hay", rutasMencionadasEnPlan([{ description: "arreglar el bug" }]).length === 0);
comprobar("ignora palabras sueltas sin extensión real", !rutasMencionadasEnPlan([{ description: "el valor de x.tsx vale 3 y de v.js 4" }]).some((r) => r === "3"));

console.log("\n[2] Prometido sin escribir");
const m = new Map<string, { ultimoOk: boolean }>();
m.set("src/App.tsx", { ultimoOk: true });
m.set("src/Falta.tsx", { ultimoOk: false });
const sinObra = prometidoSinObra(["src/App.tsx", "src/Falta.tsx", "src/Nunca.tsx"], m);
comprobar("un escrito ok no está faltante", !sinObra.some((r) => r === "src/App.tsx"));
comprobar("un fallido se marca con porqué", sinObra.some((r) => r.includes("src/Falta.tsx") && r.includes("falló")), JSON.stringify(sinObra));
comprobar("un nunca-escrito aparece pelado", sinObra.includes("src/Nunca.tsx"));

console.log("\n[3] Enlaces al vacío en HTML");
const { sonda, leer } = discoDe({
  "index.html": `<script src="/app.js"></script><link href="estilos.css"><a href="#top">t</a><img src="logo.png">`,
  "app.js": "console.log(1)",
  "estilos.css": "body{}",
});
const rotos = enlacesAlVacio("index.html", leer("index.html")!, sonda);
comprobar("detecta logo.png que no existe", rotos.some((r) => r.includes("logo.png")), JSON.stringify(rotos));
comprobar("no marca el #ancla", !rotos.some((r) => r.includes("#top")));
comprobar("no marca app.js/estilos.css que sí existen", !rotos.some((r) => r.includes("app.js") || r.includes("estilos.css")));
const { sonda: s2, leer: l2 } = discoDe({ "i.html": `<img src="https://cdn.x/a.png"><script src="data:text/javascript,1"></script>` });
comprobar("ignora URLs remotas y data:", enlacesAlVacio("i.html", l2("i.html")!, s2).length === 0);

console.log("\n[4] 0 bytes y truncados");
const { sonda: s3 } = discoDe({ "a.txt": "", "b.txt": "hola" });
comprobar("archivosVacios pilla el de 0 bytes", archivosVacios(["a.txt", "b.txt"], s3).join() === "a.txt");
const { leer: l4 } = discoDe({ "x.ts": "const a=1;\n// resto del código", "y.ts": "const b=2;" });
comprobar("archivosTruncados pilla el «resto del código»", archivosTruncados(["x.ts", "y.ts"], l4).join() === "x.ts");

console.log("\n[5] Hueco de arranque");
const arr1 = discoDe({ "package.json": JSON.stringify({ main: "dist/no-existe.js", scripts: {} }) });
comprobar("main declarado que no existe se reporta", huecoDeArranque(arr1.sonda, arr1.leer).some((m2) => m2.includes("dist/no-existe.js")));
const arr2 = discoDe({ "package.json": "{ esto no es json" });
comprobar("package.json ilegible se reporta", huecoDeArranque(arr2.sonda, arr2.leer).some((m2) => m2.includes("parsear")));
const arr3 = discoDe({ "index.html": `<script src="noHay.js"></script>` });
comprobar("index.html sin ningún script existente se reporta", huecoDeArranque(arr3.sonda, arr3.leer).some((m2) => m2.includes("ninguno existe")));
const arr4 = discoDe({ "index.html": `<script src="si.js"></script>`, "si.js": "1" });
comprobar("arranque sano no reporta hueco", huecoDeArranque(arr4.sonda, arr4.leer).length === 0);

console.log("\n[6] Veredicto completo e informe");
const disco = discoDe({
  "index.html": `<script src="main.js"></script><img src="falta.png">`,
  "main.js": "console.log('ok')",
  "vacio.css": "",
});
const manifiesto = new Map<string, { ultimoOk: boolean }>([
  ["index.html", { ultimoOk: true }],
  ["main.js", { ultimoOk: true }],
  ["vacio.css", { ultimoOk: true }],
]);
const vered = verificarCompletitud({
  rutasPlan: ["index.html", "main.js", "vacio.css", "leerme.md"],
  manifiesto,
  rutasEscritas: [...manifiesto.keys()],
  htmls: ["index.html"],
  sonda: disco.sonda,
  leer: disco.leer,
});
comprobar("no es ok: hay faltantes y rotos", vered.ok === false);
comprobar("detecta leerme.md prometido sin escribir", vered.prometidoFalta.includes("leerme.md"));
comprobar("detecta el enlace al vacío falta.png", vered.enlacesRotos.some((r) => r.includes("falta.png")));
comprobar("detecta vacio.css de 0 bytes", vered.vacios.includes("vacio.css"));
const informe = informeCompletitud(vered);
comprobar("el informe nombra PROMETIDO SIN ESCRIBIR", informe.includes("PROMETIDO SIN ESCRIBIR"));
comprobar("el informe nombra ENLACES AL VACÍO", informe.includes("ENLACES AL VACÍO"));
comprobar("el informe nombra 0 BYTES", informe.includes("0 BYTES"));

const discoOk = discoDe({ "index.html": `<script src="main.js"></script>`, "main.js": "1" });
const veredOk = verificarCompletitud({
  rutasPlan: ["index.html", "main.js"],
  manifiesto: new Map([["index.html", { ultimoOk: true }], ["main.js", { ultimoOk: true }]]),
  rutasEscritas: ["index.html", "main.js"],
  htmls: ["index.html"],
  sonda: discoOk.sonda,
  leer: discoOk.leer,
});
comprobar("obra completa y sana => ok", veredOk.ok === true);
comprobar("obra sana => informe vacío (no ensucia el acta)", informeCompletitud(veredOk) === "");

console.log("\n[7] Bordes y contratos");
comprobar("rutas con backslash en el plan se normalizan", rutasMencionadasEnPlan([{ description: "tocar src\\App.tsx" }]).includes("src/App.tsx") || rutasMencionadasEnPlan([{ description: "tocar src\\App.tsx" }]).length > 0);
const { sonda: sRel, leer: lRel } = discoDe({ "ui/index.html": `<img src="img/foto.png">` });
comprobar("enlaces relativos resuelven contra la carpeta del HTML", enlacesAlVacio("ui/index.html", lRel("ui/index.html")!, sRel).some((r) => r.includes("ui/img/foto.png")));
const { sonda: sRel2, leer: lRel2 } = discoDe({ "ui/index.html": `<img src="img/foto.png">`, "ui/img/foto.png": "PNG" });
comprobar("enlace relativo que sí existe no se marca", enlacesAlVacio("ui/index.html", lRel2("ui/index.html")!, sRel2).length === 0);
comprobar("prometidoSinObra acepta objeto (además de Map)", prometidoSinObra(["a.ts"], { "a.ts": { ultimoOk: true } as any }).length === 0);
comprobar("un plan vacío no genera falsos faltantes", verificarCompletitud({ rutasPlan: [], manifiesto: new Map(), rutasEscritas: [], htmls: [], sonda: sRel, leer: lRel }).prometidoFalta.length === 0);
const truncadoHtml = discoDe({ "p.html": "const a=1;\n<!-- aquí va el resto -->" });
comprobar("truncado detectado por marcador HTML", archivosTruncados(["p.html"], truncadoHtml.leer).length === 1);
comprobar("informe acota más de 8 faltantes con contador", informeCompletitud({ ok: false, prometidoFalta: Array.from({ length: 10 }, (_, i) => `f${i}.ts`), enlacesRotos: [], vacios: [], truncados: [], arranque: [] }).includes("y 2 más"));

console.log(`\n${pasan}/${pasan + fallan} correctas`);
if (fallan > 0) { console.error("FALLOS:", fallos); process.exit(1); }
