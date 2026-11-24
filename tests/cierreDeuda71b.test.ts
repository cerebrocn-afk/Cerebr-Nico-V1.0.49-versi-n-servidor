/**
 * tests/cierreDeuda71b.test.ts — FASE 18: CERRAR 7.1b (v2.3.21)
 * ==========================================================
 * `perfeccion.json` la nombraba desde la FASE 7: «queda 7.1b: el preview llamando a
 * `/api/conciencia` desde su propio server estático». El plano (FASE 18) dice cómo se
 * cierra una deuda así: **«con el mismo criterio: evidencia + suite, o se retira del
 * plano declarándolo. No se deja abierta indefinidamente porque «es poquito»».**
 *
 * ESTA SUITE ES LA EVIDENCIA. Midió el árbol publicado y salió que la deuda, tal como
 * está redactada, **no existe**: `/api/conciencia` sólo aparece en el router del IDE
 * (`server/routers/concienciaSandbox.ts`) y en su módulo de estado; ningún server de
 * preview/estático del paquete llama a ese endpoint. Los parches v1.62.x del sandbox
 * se lo comieron por el camino, sin que nadie bajara la bandera.
 *
 * Retirar declarando, sin valla, es lo mismo que no cerrar: la costura puede volver.
 * Por acá queda el invariante: **si alguien vuelve a meter una llamada a
 * `/api/conciencia` en un server estático o en el generador del preview, esto se pone
 * rojo.** Y la otra pata: las cuatro rutas reales del endpoint siguen vivas — retirar
 * una deuda no es borrar la API que la deuda usaba de excusa.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

/** Recorrido acotado: sólo el código del paquete, nunca `node_modules` ni el `.cerebro-db`. */
function archivosEn(rel: string, filtro: RegExp, fuera: string[] = []): string[] {
  const base = path.join(RAIZ, rel);
  if (!existsSync(base)) return [];
  const sale: string[] = [];
  const pila = [base];
  while (pila.length) {
    const d = pila.pop()!;
    let nombres: string[] = [];
    try {
      nombres = readdirSync(d);
    } catch {
      continue;
    }
    for (const n of nombres) {
      const completo = path.join(d, n);
      if (fuera.some((x) => n === x || n.startsWith(x))) continue;
      let esDir = false;
      try {
        esDir = statSync(completo).isDirectory();
      } catch {
        continue;
      }
      if (esDir) pila.push(completo);
      else if (filtro.test(n)) sale.push(completo);
    }
  }
  return sale;
}

const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

console.log("\n1) La evidencia: ¿existe hoy el server estático que llama a /api/conciencia?\n");

{
  // Se excluye el propio registro de `validar.mjs`: SU TEXTO cita el endpoint para
  // explicar la deuda, y una valla que se espanta a sí misma ya no guarda nada. Es la
  // tercera vez en el día que me pasa (la del escalón con su comentario, la del
  // auditor con su propio listado): una valla de «buscar esta cadena en el árbol» sin
  // lista de exclusión es una valla que se dispara con lo que uno escribe para
  // documentarla.
  const EXCLUIDOS = ["node_modules", "validar.mjs", "dist", ".cerebro-db"];
  const candidatos = [
    ...archivosEn("scripts", /\.(py|mjs|js|ts)$/, EXCLUIDOS),
    ...archivosEn("src", /\.(ts|tsx)$/, EXCLUIDOS),
    ...archivosEn("server", /\.ts$/, EXCLUIDOS),
    ...archivosEn("web-cerebronico", /\.(html|js|ts)$/, EXCLUIDOS),
  ].filter((f) => !f.split(path.sep).join("/").includes("/tests/"));
  const llaman = candidatos.filter((f) => {
    const t = readFileSync(f, "utf8");
    return t.includes("/api/conciencia");
  });
  const queLlaman = llaman.map((f) => path.relative(RAIZ, f).split(path.sep).join("/"));
  console.log("     explorados " + candidatos.length + " archivos; mencionan /api/conciencia: " + (queLlaman.join(", ") || "ninguno"));

  const soloRouter = queLlaman.every((f) => f.startsWith("server/routers/concienciaSandbox") || f.startsWith("src/engine/concienciaSandbox"));
  c("\u2605 ningún server estático o de preview llama a /api/conciencia", soloRouter, queLlaman.join(", "));
  c("\u2605 el endpoint vive sólo donde debe: el router del IDE",
    queLlaman.some((f) => f.startsWith("server/routers/")) && queLlaman.length <= 2, String(queLlaman.length));
  c("y el router sigue ofreciendo sus cuatro rutas (retirar la deuda no es borrar la API)",
    ["GET /api/conciencia", "POST /api/conciencia", "GET /api/conciencia/manifiesto", "POST /api/conciencia/manifiesto"].every((r) => leer("server/routers/concienciaSandbox.ts").includes(r)));
}

console.log("\n2) El invariante anti-regreso: que no vuelva, y que el acta no se borre\n");

{
  const perf = leer("perfeccion.json");
  c("\u2605 perfeccion.json ya no la lista como abierta", /7\.1b[^\n]{0,220}(CERRADA|retirada)/i.test(perf), (perf.match(/7\.1b[^"]{0,140}/i) || ["sin mención"])[0]);
  c("y la mención conserva la fecha y el porqué (no se borró la línea)", /06\/11\/2026/.test(perf));
  const scripts = archivosEn("scripts", /\.(py|mjs)$/, ["node_modules", "validar.mjs"]);
  const llamanAConciencia = scripts.filter((f) => /api\/conciencia/.test(readFileSync(f, "utf8")));
  c("ningún script del sandbox o del generador llama al endpoint desde el server estático",
    llamanAConciencia.length === 0, llamanAConciencia.map((f) => path.relative(RAIZ, f).split(path.sep).join("/")).join(", "));
  const router = leer("server/routers/concienciaSandbox.ts");
  c("el manifiesto del endpoint sigue siendo lo que limita lo que la app generada ve", /manifiesto/.test(router));
  c("\u2605 la suite está registrada en npm run validar", leer("scripts/validar.mjs").includes("cierreDeuda71b.test.ts"));
}

console.log("\n" + "─".repeat(56));
console.log(`CIERRE DEUDA 7.1b (v2.3.21): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }