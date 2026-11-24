/**
 * tests/derivaDocumental.test.ts — FASE 11: QUE EL VERIFICADOR VERIFIQUE (v2.3.13)
 * ==============================================================================
 * La evidencia de cierre que el propio plano exigió, palabra por palabra:
 * «suite `derivaDocumental.test.ts` verde; **un run real donde inyectar una
 * versión falsa en `memoria.md` haga fallar el verificador**»
 * (HOJA_DE_RUTA_EVOLUCION_v2.3.8.md, FASE 11).
 *
 * Acá no se lee el fuente del verificador buscando la palabra «deriva»: se arma un
 * árbol de mentira en un directorio temporal, se le miente de seis maneras
 * distintas y se comprueba que cada mentira se nombre con archivo y línea. Los
 * árboles se arman en `mkdtemp`, nunca sobre el repo del usuario.
 *
 * Y hay una razón histórica para ser quisquilloso con ESTE verificador en
 * particular: durante su construcción devolvió «SIN DERIVA» sobre un `memoria.md`
 * que decía v1.51.0, porque `/\b\d+\.\d+\.\d+\b/` no ve `v1.51.0` (entre la `v` y
 * el `1` no hay frontera de palabra). Un guardián de la verdad que miente en
 * silencio es peor que no tener guardián. El caso del `v` pegada está acá,
 * vallado, para siempre.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MARCADOR_EXENCION,
  ROTULOS_DE_PRESENTE,
  auditar,
  declaracionesDePresente,
  documentosVigilados,
  fijarIdentidad,
  leerSemilla,
  sitiosDeIdentidad,
  textoDelActa,
} from "../scripts/deriva-documental.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const SEMILLA = "9.9.9";

/**
 * Árbol de prueba: un repo mínimo y coherente en un directorio temporal. Cada
 * prueba rompe UNA cosa y verifica que el verificador nombre ESA cosa.
 */
function arbol(romper: (dir: string) => void = () => {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cn-deriva-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  const escribir = (rel: string, texto: string) => writeFileSync(path.join(dir, rel), texto);
  escribir("src/constants.ts", `const VERSION_SEMVER = "${SEMILLA}";\nexport { VERSION_SEMVER };\n`);
  escribir("package.json", `{\n  "name": "cerebronico-ide",\n  "version": "${SEMILLA}"\n}\n`);
  escribir(
    "package-lock.json",
    `{\n  "name": "cerebronico-ide",\n  "version": "${SEMILLA}",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "cerebronico-ide",\n      "version": "${SEMILLA}"\n    },\n    "node_modules/fuse.js": {\n      "version": "7.29.7"\n    }\n  }\n}\n`,
  );
  escribir(
    "index.html",
    `<title>Cerebr\u00f3Nico V${SEMILLA}</title>\n<meta name="description" content="Cerebr\u00f3Nico V${SEMILLA} — motor con V8.0.0 dentro">\n<meta property="og:title" content="Cerebr\u00f3Nico V${SEMILLA}" />\n<meta property="og:description" content="Cerebr\u00f3Nico V${SEMILLA}" />\n`,
  );
  escribir("CHANGELOG.md", `## v${SEMILLA} · 2026-11-06 · Asiento vigente\n\nnada.\n\n---\n## v1.51.0 · 2026-04-25 · asiento viejo\n`);
  escribir("memoria.md", `- **Timestamp de \u00daltima Actividad:** 2026-10-06 \u00b7 v1.51.0: primera entrega\n- **Fase de Desarrollo Activa:** v${SEMILLA} — lo que rige hoy\n- **\u00daltimo Hito Alcanzado:** v1.49.0\n`);
  romper(dir);
  return dir;
}

console.log("\n1) El arbol coherente pasa, y la historia no es deriva\n");

const sano = arbol();
const a1 = auditar(sano);
c("un arbol coherente pasa", a1.ok === true, a1.problemas.map((p: any) => p.motivo).join(" | "));
c("la semilla se lee de src/constants.ts", a1.semilla === SEMILLA, String(a1.semilla));
c("los cuatro sitios de identidad estan presentes", a1.identidad.length === 4, String(a1.identidad.length));
c("y los cuatro coinciden con la semilla", a1.identidad.every((s: any) => s.coincide),
  a1.identidad.map((s: any) => s.archivo + "=" + s.encontrados.join("/")).join(" | "));
const decl = a1.declaraciones as any[];
c("memoria.md aporta UNA declaracion de presente", decl.filter((d) => d.archivo === "memoria.md").length === 1,
  decl.map((d) => d.archivo + ":" + d.linea).join(", "));
c("«Ultimo Hito Alcanzado: v1.49.0» NO cuenta como declaracion (es historia fechada)",
  !decl.some((d) => /Hito/.test(String(d.rotulo || ""))));
c("«Timestamp de Ultima Actividad ... v1.51.0» NO cuenta (idem)",
  !decl.some((d) => /Timestamp/.test(String(d.rotulo || ""))));
c("el CHANGELOG conserva un asiento v1.51.0 viejo y aun asi el arbol pasa", a1.ok === true);
c("los documentos vigilados incluyen memoria.md y las HOJA_DE_RUTA_*",
  documentosVigilados(sano).includes("memoria.md") &&
  ROTULOS_DE_PRESENTE.length > 0 &&
  !ROTULOS_DE_PRESENTE.includes("Ultimo Hito Alcanzado"),
  documentosVigilados(sano).join(","));

console.log("\n2) Las mentiras que TIENEN que sonar rojas\n");

const conMemoria = (texto: string) => arbol((dir) => writeFileSync(path.join(dir, "memoria.md"), texto));

// EL CASO DEL PLANO, literal: «un run real donde inyectar una version falsa en
// memoria.md haga fallar el verificador».
const inyectado = auditar(conMemoria("- **Fase de Desarrollo Activa:** evolucion de contexto EN MARCHA (entrega v1.51.0 cerrada)\n"));
c("\u2605 inyectar v1.51.0 en memoria.md hace FALLAR el verificador", inyectado.ok === false);
c("y la contradiccion se nombra con archivo y linea",
  inyectado.problemas.some((p: any) => p.archivo === "memoria.md" && p.linea === 1),
  JSON.stringify ? "" : String(inyectado.problemas[0] && inyectado.problemas[0].archivo));
c("el motivo dice que la semilla es otra (no es un rojo mudo)",
  /9\.9\.9/.test(String(inyectado.problemas[0] && inyectado.problemas[0].motivo)),
  String(inyectado.problemas[0] && inyectado.problemas[0].motivo));

const pkgMalo = auditar(arbol((dir) => writeFileSync(path.join(dir, "package.json"), '{\n  "name": "x",\n  "version": "8.8.8"\n}\n')));
c("package.json mentiroso es rojo de identidad", pkgMalo.problemas.some((p: any) => p.tipo === "identidad" && /8\.8\.8/.test(p.motivo)));

const lockMalo = auditar(arbol((dir) => writeFileSync(path.join(dir, "package-lock.json"),
  '{\n  "name": "x",\n  "version": "9.9.9",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "x",\n      "version": "1.2.3"\n    },\n    "node_modules/fuse.js": {\n      "version": "7.29.7"\n    }\n  }\n}\n')));
c("\u2605 la version de packages[\"\"] del lock tambien se lee (no solo la raiz)",
  lockMalo.problemas.some((p: any) => /1\.2\.3/.test(p.motivo)),
  lockMalo.problemas.map((p: any) => p.motivo).join(" | "));
c("y la version de una dependencia ajena NO se confunde con la nuestra",
  !lockMalo.problemas.some((p: any) => /7\.29\.7/.test(p.motivo)),
  lockMalo.problemas.map((p: any) => p.motivo).join(" | "));

const htmlMalo = auditar(arbol((dir) => writeFileSync(path.join(dir, "index.html"),
  `<title>CerebroNico V9.9.9</title>\n<meta name="description" content="CerebroNico V9.9.9 — motor con V8.0.0 dentro">\n<meta property="og:title" content="CerebroNico V7.7.7" />\n`)));
c("un literal viejo en index.html es rojo", htmlMalo.problemas.some((p: any) => /7\.7\.7/.test(p.motivo)),
  htmlMalo.problemas.map((p: any) => p.motivo).join(" | "));
c("DEFECTO SEMBRADO: la V8.0.0 de la prosa no se conto como version de la app",
  !htmlMalo.problemas.some((p: any) => /8\.0\.0/.test(p.motivo)),
  htmlMalo.problemas.map((p: any) => p.motivo).join(" | "));

const changelogViejo = auditar(arbol((dir) => writeFileSync(path.join(dir, "CHANGELOG.md"), "## v2.3.12 · 2026-11-06 · viejo\n")));
c("el asiento mas reciente del CHANGELOG tiene que ser la semilla (asi se caz6 el bump a medias)",
  changelogViejo.problemas.some((p: any) => /2\.3\.12/.test(p.motivo)));

const sinSemilla = auditar(arbol((dir) => writeFileSync(path.join(dir, "src/constants.ts"), "export const X = 1;\n")));
c("si no hay semilla el acta lo dice, no devuelve verde", sinSemilla.problemas.some((p: any) => p.tipo === "semilla"));

console.log("\n3) Los tres falsos verdes que este verificador produjo al construirse\n");

// (a) `/\b(\d+\.\d+\.\d+)\b/` no ve `v1.51.0`: entre la v y el 1 no hay frontera
// de palabra. Con ese regex el acta dijo «SIN DERIVA» sobre un archivo derivado.
const conV = auditar(conMemoria("- **Fase de Desarrollo Activa:** v1.51.0\n"));
c("\u2605 la forma con v pegada se detecta (el regex con \\b no la veia)",
  conV.problemas.some((p: any) => /1\.51\.0/.test(p.motivo)),
  JSON.stringify ? "" : "");
const sinV = auditar(conMemoria("- **Fase de Desarrollo Activa:** 1.51.0\n"));
c("la forma suelta tambien", sinV.problemas.some((p: any) => /1\.51\.0/.test(p.motivo)));

// (b) Un numero de cuatro tramos no es «una version seguida de otra».
const cuatro = declaracionesDePresente(conMemoria("- **Fase de Desarrollo Activa:** 10.2.6.1\n")) as any[];
c("10.2.6.1 no se parte en dos versiones falsas",
  cuatro.every((d) => !d.declaran.includes("10.2.6")), JSON.stringify(cuatro.map((d) => d.declaran)));

// (c) En `package-lock.json` la regla por indentacion devolvia 371 versiones.
const lockGrande = arbol((dir) => writeFileSync(path.join(dir, "package-lock.json"),
  '{\n  "version": "9.9.9",\n  "packages": {\n    "": {\n      "version": "9.9.9"\n    },\n' +
  Array.from({ length: 40 }, (_x, i) => `    "node_modules/p${i}": {\n      "version": "1.${i}.0"\n    }`).join(",\n") +
  "\n  }\n}\n"));
// `coincide` la calcula `auditar` (es una comparación contra la semilla, y la
// semilla la conoce el acta, no el lector de archivos). Pedirla de
// `sitiosDeIdentidad` devuelve `undefined` y el verde se vuelve rojo: la valla
// estaba mal, no el verificador.
const idsLock = auditar(lockGrande).identidad.find((s: any) => s.archivo.startsWith("package-lock")) as any;
c("\u2605 el lock se lee con JSON.parse: solo los dos sitios propios, no 42",
  idsLock && idsLock.encontrados.length === 2 && idsLock.coincide === true,
  idsLock ? idsLock.encontrados.length + " hallados" : "sin sitio");

console.log("\n4) Eximir se declara, y queda en el acta\n");

const eximido = auditar(conMemoria(`- **Fase de Desarrollo Activa:** v1.51.0 <!-- ${MARCADOR_EXENCION} -->\n`));
c("la linea con el marcador no es roja", eximido.ok === true, eximido.problemas.map((p: any) => p.motivo).join(" | "));
c("pero SI aparece en el acta como eximida (una exencion invisible es otra deriva)",
  eximido.eximidas.length === 1 && /memoria\.md/.test(eximido.eximidas[0].archivo));
c("el texto del acta nombra la exencion", /eximida/.test(textoDelActa(eximido)), textoDelActa(eximido).split("\n").slice(-2)[0]);
c("el marcador se escribe con el nombre exportado, no de memoria", MARCADOR_EXENCION === "deriva:historico");

console.log("\n5) --fijar alinea la identidad y NO toca la prosa\n");

const paraFijar = arbol((dir) => {
  writeFileSync(path.join(dir, "package.json"), '{\n  "name": "x",\n  "version": "8.8.8"\n}\n');
  writeFileSync(path.join(dir, "index.html"), '<title>Cerebr\u00f3Nico V8.8.8</title>\n<meta name="description" content="Cerebr\u00f3Nico V8.8.8">\n<meta property="og:title" content="Cerebr\u00f3Nico V8.8.8" />\n<meta property="og:description" content="Cerebr\u00f3Nico V8.8.8" />\n');
  writeFileSync(path.join(dir, "package-lock.json"),
    '{\n  "name": "x",\n  "version": "8.8.8",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "x",\n      "version": "8.8.8"\n    }\n  }\n}\n');
  writeFileSync(path.join(dir, "memoria.md"), "- **Fase de Desarrollo Activa:** v1.51.0 (prosa del usuario)\n");
});
const memoriaAntes = readFileSync(path.join(paraFijar, "memoria.md"), "utf8");
const tocados = fijarIdentidad(paraFijar, SEMILLA) as string[];
c("fijar toca los tres sitios de identidad", tocados.length === 3, tocados.join(","));
c("package.json queda en la semilla", readFileSync(path.join(paraFijar, "package.json"), "utf8").includes('"' + SEMILLA + '"'));
c("index.html queda en la semilla en sus cuatro literales",
  ((readFileSync(path.join(paraFijar, "index.html"), "utf8").match(new RegExp("V" + SEMILLA.replace(/\./g, "\\."), "g")) || []).length) === 4);
c("\u2605 la prosa del usuario queda BYTE A BYTE igual: --fijar no fabrica consenso",
  readFileSync(path.join(paraFijar, "memoria.md"), "utf8") === memoriaAntes);
c("y despues de fijar, la identidad pasa (la declaracion de memoria sigue roja, como debe ser)",
  auditar(paraFijar).identidad.every((s: any) => s.coincide) && auditar(paraFijar).ok === false);

const conDep = arbol((dir) => writeFileSync(path.join(dir, "package-lock.json"),
  '{\n  "version": "8.8.8",\n  "packages": {\n    "": {\n      "version": "8.8.8"\n    },\n    "node_modules/fuse.js": {\n      "version": "7.29.7"\n    }\n  }\n}\n'));
fijarIdentidad(conDep, SEMILLA);
const lockDespues = readFileSync(path.join(conDep, "package-lock.json"), "utf8");
c("\u2605 --fijar no toca las versiones de las dependencias", /7\.29\.7/.test(lockDespues) && !/8\.8\.8/.test(lockDespues),
  lockDespues.replace(/\n/g, " "));

console.log("\n6) El repo de verdad, y el registro\n");

const real = auditar(RAIZ);
c("\u2605 ESTE repo pasa el verificador (si este asiento miente, la suite lo sabe)",
  real.ok === true, real.problemas.map((p: any) => `${p.archivo || p.tipo}:${p.linea || ""} ${p.motivo}`).join(" | "));
c("y la semilla del repo es la versión del asiento vigente",
  typeof real.semilla === "string" && readFileSync(path.join(RAIZ, "CHANGELOG.md"), "utf8").startsWith("## v" + real.semilla));
c("las exenciones del repo estan declaradas con marcador (no hay silencios)",
  real.eximidas.every((d: any) => readFileSync(path.join(RAIZ, d.archivo), "utf8").includes(MARCADOR_EXENCION)),
  real.eximidas.map((d: any) => d.archivo).join(","));
c("la suite esta registrada en la valla maestra (si no, no corre nunca)",
  readFileSync(path.join(RAIZ, "scripts/validar.mjs"), "utf8").includes("derivaDocumental.test.ts"));
c("y hay atajo de npm para correrla suelta",
  /"deriva":/.test(readFileSync(path.join(RAIZ, "package.json"), "utf8")));

console.log("\n" + "─".repeat(56));
console.log(`DERIVA DOCUMENTAL (v2.3.13): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }
