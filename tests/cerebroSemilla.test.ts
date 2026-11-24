/**
 * cerebroSemilla.test.ts — v1.99.4 · EL REFLEJO: QUÉ TIENE LUZ Y QUÉ ES NADA
 * ===========================================================================
 * «Inyectar razonamiento y parámetros, diferenciar entre el eje de todo y la nada de
 * algo, dale luz y reflejo» (Mario, 1/11). Detrás de la poesía hay un defecto concreto
 * de todo índice vectorial: si la AUSENCIA cuenta como cero, la cobertura sube sola. Así
 * encontramos `cerebro/` vacío y sin `vectores.json` mientras el tablero se veía sano.
 *
 * Este puente toma (a) la semilla del mapa de hemisferios, (b) las claves REALES del
 * sidecar (`clavesVectores`) y (c) si el archivo existe en disco, y devuelve el tri-estado
 * por pieza. `nada` nunca entra en el denominador de la cobertura.
 */
import {
  ejeDeTodo, semillaDeHemisferios, semillaDeLecciones, reflejoDeSemilla, presencia,
} from "../src/engine/cerebroSemilla";
import { readFileSync } from "node:fs";
import { clavesVectores } from "../src/engine/cerebroOrgano";

let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " -> " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};

const entradas = [
  ejeDeTodo("1.99.4"),
  ...semillaDeHemisferios("izquierdo", [
    { rel: "server.ts", que: "el monolito" },
    { rel: "manual-motor", que: "el manual" },
  ]),
  ...semillaDeHemisferios("derecho", [{ rel: "cerebro/vectores.json", que: "el indice vectorial" }]),
];
const existe = (a: string) => a !== "cerebro/vectores.json";
const claves = { con: ["hemisferio-izquierdo|server.ts|" + "a".repeat(12)] };

console.log("\n1) Tri-estado por pieza, con el sidecar en la mano\n");
const r = reflejoDeSemilla(entradas, claves, existe);
const de = (id: string) => (r.detalle.find((d) => d.id === id) || {}).presencia;
c("\u2605 la pieza con clave y vector en el sidecar es LUZ", de("hemi:izquierdo:server.ts") === "luz", JSON.stringify(r.detalle));
c("\u2605 la pieza que existe pero no tiene vector es DEUDA (falta trabajo, no falta el ser)", de("hemi:izquierdo:manual-motor") === "deuda");
c("\u2605 la pieza que no existe en disco es NADA, nunca distancia cero", de("hemi:derecho:cerebro/vectores.json") === "nada");
c("el eje, sin vector todavia, es DEUDA y no LUZ prestada", de("eje-0") === "deuda");
// 4 piezas: eje (existe, sin vector = deuda), server.ts (luz), manual-motor (deuda) y
// vectores.json (no existe = NADA). Denominador honesto: 3 que existen, 1 con luz.
c("\u2605 la cobertura NO cuenta la nada en el denominador (3 que existen, 1 con luz = 33 %)", r.cobertura === "33%", r.cobertura);
c("el reflejo nombra las tres cosas por separado (luz, deuda y nada, cada una con su cuenta)",
  /1 de 3 piezas tienen luz/.test(r.reflejo) && /2 deben vector/.test(r.reflejo) && /1 son nada/.test(r.reflejo), r.reflejo);
c("el eje esta declarado en el reflejo (sin origen no hay distancia que medir)", r.eje === true);

console.log("\n2) El cerebro vacio se dice vacio (la mentira que esto evita)\n");
const r2 = reflejoDeSemilla(entradas, { con: [] }, existe);
c("\u2605 sidecar sin ninguna clave: 0 de luz, y todo lo existente es deuda", r2.luz === 0 && r2.deuda === entradas.length - 1, JSON.stringify({luz:r2.luz,deuda:r2.deuda,nada:r2.nada}));
c("y la cobertura lo dice en crudo, sin redondear a verde", r2.cobertura === "0%" || r2.cobertura === "0 %", r2.cobertura);
const r3 = reflejoDeSemilla([], { con: [] }, () => false);
c("semilla vacia: no hay nada que reflejar, y no se inventa un 100 %", r3.cobertura === "sin semilla" && /vacio/.test(r3.reflejo), r3.reflejo);

console.log("\n3) El puente con el organo real\n");
c("clavesVectores sobre una ruta inexistente no lanza y dice que no hay nada",
  JSON.stringify(clavesVectores("/ruta/que/no/existe/cerebro-nico")) === '{"con":[],"sin":[]}');
c("presencia() es la regla suelta que usa el puente (mismo idioma, una sola fuente)",
  presencia(true, true) === "luz" && presencia(true, false) === "deuda" && presencia(false, true) === "nada");
c("determinismo: la misma entrada produce el mismo reflejo (sin reloj, sin azar)",
  JSON.stringify(reflejoDeSemilla(entradas, claves, existe)) === JSON.stringify(r));
c("una leccion del disco entra al espacio con su propio tema",
  semillaDeLecciones(["L37 · ante ese error no se reintenta igual"]).length === 1);

console.log("\n4) El cable: el estado del embedder publica el reflejo\n");
const router = readFileSync(new URL("../server/routers/embedderCerebro.ts", import.meta.url), "utf8");
c("\u2605 el router importa el puente y la fuente por clave (no un promedio)", /reflejoDeSemilla/.test(router) && /clavesVectores/.test(router));
c("y publica `reflejo:` en el estado, sin borrar la barra vieja", /reflejo: reflejoCerebro\(\)/.test(router) && /cerebro: estadoVectores\(deps\.raizDatos\)/.test(router));
c("el espejo no puede tumbar el estado: si algo falla, se omite el campo", /catch \{\s*\n\s*return undefined;/.test(router));

console.log("\n5) El cable: la tarjeta del embedder MUESTRA el reflejo\n");
const tarjeta = readFileSync(new URL("../src/components/PanelEmbedder.tsx", import.meta.url), "utf8");
c("\u2605 la tarjeta lee el campo del server y no se inventa un promedio propio", /const reflejo = estado\?\.reflejo/.test(tarjeta));
c("y lo pinta con su cobertura y su eje (la pantalla que pide luz dice luz)",
  /Reflejo:/.test(tarjeta) && /reflejo\.cobertura/.test(tarjeta) && /sin eje/.test(tarjeta));
c("\u2605 «Memoria vectorial: 0/0» ya no ocupa el sitio de una verdad: se retira con el indice vacio",
  /cerebro\.entradas > 0 \?\s*\(/.test(tarjeta));

console.log(`\n=== CEREBRO SEMILLA (v1.99.4): ${ok} correctas - ${mal.length} fallidas ===`);
if (mal.length) { console.log("\nFALLOS:"); for (const f of mal) console.log("  FALLO -> " + f); process.exit(1); }
