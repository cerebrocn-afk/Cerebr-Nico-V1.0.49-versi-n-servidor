/**
 * rotacionTrazas.test.ts — v1.87.0 · EL TECHO DEL ARCHIVO QUE SE LEE ENTERO
 * ========================================================================
 * Se prueban cuatro cosas, con disco real donde hace falta:
 *   1. El nombre de la generación es determinista y va en UTC (dos husos, un sello).
 *   2. La política se cumple por TAMAÑO, por CANTIDAD y por EDAD, con los números
 *      exactos — `aPurgar` es pura y se evalúa con «hoy» congelado.
 *   3. Sobre un directorio de verdad: rota, no pisa, y dos rotaciones en el mismo
 *      segundo no se pierden.
 *   4. El cableado: `cicloDecision.persistir` poda ANTES de escribir, no después.
 */
import { mkdtempSync, writeFileSync, existsSync, readdirSync, utimesSync, rmSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../src/engine/rotacionTrazas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const T = Date.UTC(2026, 9, 29, 3, 15, 7); // 2026-10-29T03:15:07Z
const DIA = 86_400_000;

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n${t}`); }

const temporales: string[] = [];
function dirTemporal(): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "cn-rotacion-"));
  temporales.push(d);
  return d;
}

console.log("\n🗂️ LA ROTACIÓN DE TRAZAS — v1.87.0\n");

seccion("1 · El sello y el nombre, deterministas");
{
  comprobar("sello UTC exacto", R.selloDe(T) === "20261029-031507", R.selloDe(T));
  comprobar("mismo instante, otro formato de fecha, mismo sello", R.selloDe(Date.UTC(2026, 9, 29, 3, 15, 7, 999)) === "20261029-031507");
  comprobar("la extensión se conserva al final", R.nombreGeneracion("decisiones.jsonl", T) === "decisiones.20261029-031507.jsonl", R.nombreGeneracion("decisiones.jsonl", T));
  comprobar("un nombre sin extensión no se rompe", R.nombreGeneracion("trazas", T) === "trazas.20261029-031507");
  comprobar("un nombre con punto inicial no se parte mal", R.nombreGeneracion(".oculto", T) === ".oculto.20261029-031507");
}

seccion("2 · Debe rotar: el techo es exacto, no aproximado");
{
  comprobar("la política por defecto es 8 MiB · 4 · 30 días", R.POLITICA_TRAZAS.maxBytes === 8 * 1024 * 1024 && R.POLITICA_TRAZAS.generaciones === 4 && R.POLITICA_TRAZAS.retencionDias === 30);
  comprobar("8 MiB exactos ya rotan", R.debeRotar(8 * 1024 * 1024));
  comprobar("un byte menos, no", !R.debeRotar(8 * 1024 * 1024 - 1));
  comprobar("negativo no rota (dato roto)", !R.debeRotar(-1));
  comprobar("NaN no rota", !R.debeRotar(Number.NaN));
}

seccion("3 · Qué es una generación de quién");
{
  comprobar("reconoce su propia generación", R.esGeneracionDe("decisiones.20261029-031507.jsonl", "decisiones.jsonl"));
  comprobar("el archivo activo no es una generación", !R.esGeneracionDe("decisiones.jsonl", "decisiones.jsonl"));
  comprobar("un vecino con otro nombre no lo es", !R.esGeneracionDe("decisiones-otra.jsonl", "decisiones.jsonl"));
  comprobar("misma raíz y otra extensión tampoco", !R.esGeneracionDe("decisiones.20261029-031507.txt", "decisiones.jsonl"));
}

seccion("4 · aPurgar: cantidad y edad, con números puestos a mano");
{
  const lista = [0, 1, 2, 3, 4, 5].map((i) => ({
    nombre: `decisiones.2026100${i + 1}-000000.jsonl`,
    mtimeMs: T - i * DIA, // i = 0 la más nueva
  }));
  const fuera = R.aPurgar(lista, R.POLITICA_TRAZAS, T, "decisiones.jsonl");
  comprobar("con seis generaciones se borran dos", fuera.length === 2, String(fuera.length));
  comprobar("y son las dos más viejas", fuera.join(",") === "decisiones.20261005-000000.jsonl,decisiones.20261006-000000.jsonl", fuera.join(","));
  comprobar("el resultado va ordenado (determinista)", fuera[0] < fuera[1]);

  const vieja = [{ nombre: "decisiones.20250101-000000.jsonl", mtimeMs: T - 400 * DIA }];
  comprobar("una generación de hace 400 días se purga aunque quepa en el cupo", R.aPurgar(vieja, R.POLITICA_TRAZAS, T, "decisiones.jsonl").length === 1);

  const justo = [{ nombre: "decisiones.20260930-000000.jsonl", mtimeMs: T - 29 * DIA }];
  comprobar("29 días sobrevive (el corte es a los 30)", R.aPurgar(justo, R.POLITICA_TRAZAS, T, "decisiones.jsonl").length === 0);

  comprobar("archivos ajenos no se tocan", R.aPurgar([{ nombre: "otro.jsonl", mtimeMs: 0 }], R.POLITICA_TRAZAS, T, "decisiones.jsonl").length === 0);
}

seccion("5 · Sobre disco real: rota, no pisa, y numera el empate");
{
  const dir = dirTemporal();
  const pequena: R.PoliticaRotacion = { maxBytes: 10, generaciones: 3, retencionDias: 30 };
  writeFileSync(path.join(dir, "decisiones.jsonl"), "x".repeat(11));
  const primera = R.aplicarRotacion(dir, "decisiones.jsonl", pequena, T);
  comprobar("rotó", primera.rotado && !!primera.generacion, JSON.stringify(primera));
  comprobar("el activo ya no está", !existsSync(path.join(dir, "decisiones.jsonl")));
  comprobar("la generación existe con el sello", existsSync(path.join(dir, "decisiones.20261029-031507.jsonl")));

  writeFileSync(path.join(dir, "decisiones.jsonl"), "y".repeat(11));
  const segunda = R.aplicarRotacion(dir, "decisiones.jsonl", pequena, T);
  comprobar("dos rotaciones en el mismo segundo no se pisan", segunda.generacion === "decisiones.20261029-031507-2.jsonl", String(segunda.generacion));
  comprobar("y las dos generaciones conviven", readdirSync(dir).filter((f) => f.startsWith("decisiones.")).length === 2);

  const tercera = R.aplicarRotacion(dir, "decisiones.jsonl", pequena, T);
  comprobar("sin activo no hay rotación (nada que renombrar)", !tercera.rotado);
}

seccion("6 · La purga ocurre en el mismo acto de rotar");
{
  const dir = dirTemporal();
  mkdirSync(dir, { recursive: true });
  const politica: R.PoliticaRotacion = { maxBytes: 10, generaciones: 2, retencionDias: 30 };
  for (let i = 1; i <= 4; i++) {
    const nombre = `decisiones.2026100${i}-000000.jsonl`;
    const p = path.join(dir, nombre);
    writeFileSync(p, "viejo");
    utimesSync(p, new Date(T - (10 - i) * DIA), new Date(T - (10 - i) * DIA));
  }
  writeFileSync(path.join(dir, "decisiones.jsonl"), "z".repeat(11));
  const r = R.aplicarRotacion(dir, "decisiones.jsonl", politica, T);
  comprobar("rotó y purgó", r.rotado && r.purgados.length === 3, JSON.stringify(r));
  const quedan = readdirSync(dir).filter((f) => f.startsWith("decisiones."));
  comprobar("quedan 2 generaciones (la nueva + la más reciente)", quedan.length === 2, quedan.join(","));
  comprobar("ninguna purgada sigue en disco", r.purgados.every((n) => !existsSync(path.join(dir, n))));
}

seccion("7 · podarSiHaceFalta: el caso normal no cuesta nada");
{
  const dir = dirTemporal();
  const politica: R.PoliticaRotacion = { maxBytes: 10, generaciones: 2, retencionDias: 30 };
  writeFileSync(path.join(dir, "decisiones.jsonl"), "corto");
  comprobar("por debajo del techo devuelve null", R.podarSiHaceFalta(dir, "decisiones.jsonl", politica, T) === null);
  comprobar("y no creó generaciones", readdirSync(dir).length === 1);

  writeFileSync(path.join(dir, "decisiones.jsonl"), "x".repeat(11));
  const podado = R.podarSiHaceFalta(dir, "decisiones.jsonl", politica, T);
  comprobar("por encima del techo rota", !!podado?.rotado);

  const vacio = path.join(dirTemporal(), "nada");
  comprobar("sin archivo no hace nada", R.podarSiHaceFalta(vacio, "decisiones.jsonl", politica, T) === null);
}

seccion("8 · El cableado: se poda ANTES de escribir la traza");
{
  const cd = leer("src/engine/cicloDecision.ts");
  const iPoda = cd.indexOf('podarSiHaceFalta(dir, "decisiones.jsonl", POLITICA_TRAZAS');
  const iAppend = cd.indexOf('appendFileSync(archivoTrazas(raizDatos)');
  comprobar("importa el módulo", /from "\.\/rotacionTrazas"/.test(cd));
  comprobar("poda antes de anexar", iPoda > 0 && iAppend > iPoda, `${iPoda}/${iAppend}`);
  comprobar("dentro del try que protege el turno", cd.slice(cd.lastIndexOf("function persistir", iPoda), iPoda).includes("try {"));
  comprobar("y no se inventó un segundo escritor", (cd.match(/appendFileSync\(/g) || []).length === 1);
}

for (const d of temporales) { try { rmSync(d, { recursive: true, force: true }); } catch { /* limpieza best-effort */ } }

console.log(`\n═══ rotacionTrazas: ${correctas} correctas · ${fallidas} fallidas ═══\n`);
if (fallidas > 0) process.exit(1);
