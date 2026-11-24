/**
 * goteo.test.ts — v1.99.3 · LA PANTALLA TIENE UN SOLO RITMO
 * =========================================================
 * «La pantalla cae de golpe a veces o va muy rápido… normalizá siempre la misma
 * velocidad… aunque el entregable vaya fuera de tiempo de ejecución, sincronizado y
 * constante» (Mario, 1/11). La prueba que importa no es "sale texto": es que TRES
 * patrones de llegada distintos tarden lo MISMO en mostrarse, y que ningún cuadro
 * suelte un pantallazo.
 */
import { readFileSync } from "node:fs";
import {
  calcularSoltar, cortarSinPartirPalabra, decidirCuadro,
  CPS_LECTURA_MEDIA_RAPIDA, CUADRO_MAX_CARACTERES,
} from "../src/engine/goteo";

let ok = 0;
const mal: string[] = [];
const c = (q: string, v: boolean, d = "") => {
  if (v) { ok++; console.log("  \u2713 " + q); }
  else { mal.push(q + (d ? " -> " + d : "")); console.log("  \u2717 " + q + (d ? " \u2014 " + d : "")); }
};

/**
 * Simula el cuadro a cuadro con RELOJ ABSOLUTO. `llegadas` dice cuántos caracteres
 * soltó el modelo y en qué instante (es lo que cambia entre los tres patrones: un
 * pantallazo, 180 gotas, 18 medios parches). La pantalla NO sabe cuál de los tres fue.
 */
function simular(llegadas: Array<[number, number]>, total: number, finStreamMs: number) {
  const paso = 16;
  let soltados = 0;
  let cuadro = 0;
  let maxCuadro = 0;
  let t = 0;
  while (cuadro < 40000) {
    const disponibles = Math.min(total, sum(llegadas.filter(([ms]) => ms <= t).map(([, n]) => n))) - soltados;
    const r = decidirCuadro({ texto: "x".repeat(Math.min(total, sum(llegadas.filter(([ms]) => ms <= t).map(([, n]) => n)))), soltados, msTranscurrido: t, streamEnCurso: t < finStreamMs });
    const n = r.soltados - soltados;
    if (n > 0) maxCuadro = Math.max(maxCuadro, n);
    soltados = r.soltados;
    if (r.terminar || (soltados >= total && t >= finStreamMs)) return { segundos: t / 1000, soltados, maxCuadro };
    t += paso;
    cuadro += 1;
  }
  return { segundos: t / 1000, soltados, maxCuadro };
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

console.log("\n1) El caudal es del lector, no del modelo\n");
const N = 1800;
const pantallazo = simular([[0, N]], N, 0);
const gotas = simular(Array.from({ length: 180 }, (_, i) => [i * 8, 10] as [number, number]), N, 1500);
const medios = simular(Array.from({ length: 18 }, (_, i) => [i * 83, 100] as [number, number]), N, 1500);
c("\u2605 un pantallazo de 1800 caracteres NO se muestra de golpe", pantallazo.maxCuadro <= CUADRO_MAX_CARACTERES, "max " + pantallazo.maxCuadro);
c("\u2605 los tres patrones de llegada tardan lo mismo en pantalla (<8% de diferencia)",
  Math.abs(pantallazo.segundos - gotas.segundos) / gotas.segundos < 0.08 && Math.abs(medios.segundos - gotas.segundos) / gotas.segundos < 0.08,
  [pantallazo.segundos, gotas.segundos, medios.segundos].join(" / "));
c("y la velocidad nominal es lectura media-rapida", CPS_LECTURA_MEDIA_RAPIDA === 45 && N / gotas.segundos > 20 && N / gotas.segundos <= 60,
  Math.round(N / gotas.segundos) + " cps");
c("nada se queda colgado: los tres drenan el total", pantallazo.soltados === N && gotas.soltados === N && medios.soltados === N);

console.log("\n2) Los bordes que rompen cualquier animacion\n");
c("sin texto disponible no suelta nada", calcularSoltar({ disponibles: 0, soltados: 0, ms: 16 }) === 0);
c("NaN / undefined / negativos no inventan caracteres",
  calcularSoltar({ disponibles: Number.NaN, soltados: 0, msTranscurrido: 1000 }) === 0 &&
  calcularSoltar({ disponibles: 50, soltados: 0, msTranscurrido: Number.NaN }) <= CUADRO_MAX_CARACTERES &&
  calcularSoltar({ disponibles: -9, soltados: 0, msTranscurrido: 1000 }) === 0);
c("\u2605 una pesta en blanco 30 s NO habilita una rafaga: el tiempo se recorta",
  calcularSoltar({ disponibles: 5000, soltados: 0, msTranscurrido: 30000 }) <= CUADRO_MAX_CARACTERES,
  String(calcularSoltar({ disponibles: 5000, soltados: 0, msTranscurrido: 30000 })));
c("el cuadro nunca supera el techo", calcularSoltar({ disponibles: 9000, soltados: 0, msTranscurrido: 1000, cps: 400 }) <= CUADRO_MAX_CARACTERES);

console.log("\n3) No partir palabras, no trabarse, cerrar parejo\n");
c("corta en el ultimo blanco del tramo", cortarSinPartirPalabra("hola mundo gris", 0, 11) === 10);
c("si el token es mas largo que el cuadro avanza igual (no se estanca)", cortarSinPartirPalabra("supercalifragilistico", 0, 5) === 5);
c("borde: si `hasta` <= `desde` no retrocede nunca", cortarSinPartirPalabra("abc def", 4, 2) === 4);
const cerrado = decidirCuadro({ texto: "hola mu", soltados: 5, msTranscurrido: 400, streamEnCurso: false });
c("al cerrar, lo ultimo que queda se suelta parejo", cerrado.soltados > 5);
const fin = decidirCuadro({ texto: "hola", soltados: 4, msTranscurrido: 400, streamEnCurso: false });
c("y el stream terminado se declara terminado", fin.terminar === true);
const vivo = decidirCuadro({ texto: "hola que tal", soltados: 4, msTranscurrido: 400, streamEnCurso: true });
c("mientras el modelo habla, no se declara terminado", vivo.terminar === false);

console.log("\n4) El cable: la bomba late en el render, no en el SSE\n");
const src = readFileSync(new URL("../src/components/ChatCenter.tsx", import.meta.url), "utf8");
c("\u2605 ChatCenter importa el due\u00f1o del caudal (no un n\u00famero escrito a mano)", /from "\.\.\/engine\/goteo"/.test(src));
c("la bomba vive en la puerta \u00fanica del cuerpo y se la pasa por `decidirCuadro`", /const CuerpoMensaje[\s\S]{0,2600}decidirCuadro\(\{/.test(src));
c("se revela en el l\u00edmite de render: el crudo del stream sigue intacto en el state", /cuerpoCrudo\.slice\(0, visibles\)/.test(src));
c("\u2605 late ~10 veces por segundo, no cuadro a cuadro (repintar Markdown a 60 fps es el mismo defecto con otra cara)", /ahora - ultimo >= 100/.test(src));
c("el reloj es absoluto por mensaje y se reinicia al terminar el stream", /arranqueRef\.current = Date\.now\(\)/.test(src) && /arranqueRef\.current = 0;\s*\n\s*setVisibles\(cuerpoCrudo\.length\)/.test(src));
c("y el pump se desmonta: no deja un rAF huérfano por mensaje", /cancelAnimationFrame\(id\)/.test(src));

console.log(`\n=== GOTEo (v1.99.3): ${ok} correctas - ${mal.length} fallidas ===`);
if (mal.length) { console.log("\nFALLOS:"); for (const f of mal) console.log("  FALLO -> " + f); process.exit(1); }
