/**
 * hemisferios.test.ts — v1.99.0 · RECONOCIMIENTO DE LOS DOS HEMISFERIOS
 * =====================================================================
 * Mario subió el `C:\Cerebronico` real (69 archivos) para corroborar su modelo. Medido:
 * el hemisferio derecho está vivo en lo que importa (LECCIONES.md con las L que escribió
 * el motor, `.cerebro-db/kb.json`, `auditoria.jsonl`, `perfeccion.md`, la papelera con
 * sus timestamps) y roto en dos puntos que nadie había dicho en voz alta: `cerebro/` está
 * VACÍO y NO EXISTE `cerebro/vectores.json` — el índice vectorial no tiene domicilio en
 * el disco, que es la forma DURABLE del «fallback por palabra».
 * Eligió además la limpieza «SÓLO RESIDUO» antes de instalar. Esta valla congela el mapa
 * con referencias que se responden en los DOS sentidos, la ley núcleo/residuo contra los
 * nombres reales de su disco, y que el limpiador no borra nada ni en seco toca algo.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEMISFERIO_IZQUIERDO, HEMISFERIO_DERECHO, REFERENCIAS_CRUZADAS,
  esResiduoDatos, NUCLEO_CARPETAS, carpetaPurga,
} from "../src/engine/hemisferios";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf8") : "");
let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " \u2192 " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};

console.log("\n1) El mapa: dos mitades, y referencias que contestan de los dos lados\n");
c("los dos hemisferios est\u00e1n declarados", HEMISFERIO_IZQUIERDO.piezas.length >= 6 && HEMISFERIO_DERECHO.piezas.length >= 10,
  `${HEMISFERIO_IZQUIERDO.piezas.length}/${HEMISFERIO_DERECHO.piezas.length}`);
c("\u2605 cada pieza del IZQUIERDO existe en el \u00e1rbol de instalaci\u00f3n (mapa verificado contra disco, como rutasSistema)",
  HEMISFERIO_IZQUIERDO.piezas.every((p) => existsSync(path.join(RAIZ, p.rel))),
  HEMISFERIO_IZQUIERDO.piezas.filter((p) => !existsSync(path.join(RAIZ, p.rel))).map((p) => p.rel).join(", "));
c("el DERECHO declara su propio vac\u00edo: cerebro/ y el \u00edndice vectorial est\u00e1n en el mapa aunque hoy no existan",
  HEMISFERIO_DERECHO.piezas.some((p) => p.rel === "cerebro") &&
  HEMISFERIO_DERECHO.piezas.some((p) => p.rel === "cerebro/vectores.json"));
c("\u2605 cada referencia cruzada nombra las dos mitades y por qu\u00e9 (un solo sentido = cerebro escindido)",
  REFERENCIAS_CRUZADAS.length >= 5 && REFERENCIAS_CRUZADAS.every((r) => !!r.izquierdo && !!r.derecho && r.porQue.length > 12));
c("y del lado de la instalaci\u00f3n las rutas del mapa existen de verdad",
  REFERENCIAS_CRUZADAS.every((r) => existsSync(path.join(RAIZ, r.izquierdo))),
  REFERENCIAS_CRUZADAS.filter((r) => !existsSync(path.join(RAIZ, r.izquierdo))).map((r) => r.izquierdo).join(","));

console.log("\n2) La ley \u00abS\u00d3LO RESIDUO\u00bb, contra los nombres reales de su disco\n");
for (const n of ["correr_validar.py", "verif_puertos.py", "parche_auditoria.py", "_chk.py", "validar_out.txt",
  "_tsc_resultado.txt", ".bridge_5000.log", "empaquetado.log", "arrancar_todo.bat.bak-20261031-101345",
  "puente-permitidos.json.bak-8bin", "_test_url.bat", "lanzar_empaquetado.bat", "diag_ollama_real.py"]) {
  c(`residuo: ${n}`, esResiduoDatos(n) === true);
}
for (const n of ["LECCIONES.md", "REANUDAR.md", "perfeccion.md", "perfeccion.json", "memory_evolution.json",
  "puente-permitidos.json", "arrancar_puente.bat", "arrancar_todo.bat", "parar_servicios.bat", "cerebro.md"]) {
  c(`n\u00facleo intocable: ${n}`, esResiduoDatos(n) === false);
}
c("ninguna carpeta de memoria entra en la purga",
  ["cerebro", ".cerebro-db", ".cerebro-papelera", ".cerebronico", ".cn-quirofano"].every((d) => NUCLEO_CARPETAS.includes(d)));
c("un .json suelto NO se mueve a ciegas (puede ser dato)", esResiduoDatos("cosa.json") === false);
c("y lo que vive adentro de una carpeta no lo toca esta ley", esResiduoDatos("cerebro/algo.py") === false);

console.log("\n3) El limpiador: seco por default, rename siempre, papelera con \u00edndice\n");
const lim = leer("scripts/limpiar-raiz.mjs");
c("existe y se corre con tsx (importa el criterio .ts)", /tsx scripts\/limpiar-raiz\.mjs/.test(leer("package.json")));
c("\u2605 seco por defecto: antes de mover exige --ejecutar y sale en paz",
  /if \(!EJECUTAR\) \{[\s\S]{0,500}process\.exit\(0\)/.test(lim));
c("\u2605 mueve, no borra: no hay rm/unlink/rimraf en el archivo",
  /fs\.renameSync/.test(lim) && !/rmSync|unlinkSync|rimraf/.test(lim));
c("el destino es la papelera de la casa, con marca de tiempo y \u00edndice",
  /\.cerebro-papelera/.test(lim) && /carpetaPurga\(\)/.test(lim) && /indice\.txt/.test(lim));
c("la marca es AAAAMMDD-HHMM", carpetaPurga(new Date(2026, 10, 1, 15, 30)) === ".cerebro-papelera/20261101-1530",
  carpetaPurga(new Date(2026, 10, 1, 15, 30)));

console.log(`\n\u2550\u2550\u2550 HEMISFERIOS (v1.99.0): ${ok} correctas \u00b7 ${mal.length} fallidas \u2550\u2550\u2550`);
if (mal.length) { console.log("\nFALLOS:"); for (const f of mal) console.log("  FALLO \u2192 " + f); process.exit(1); }
