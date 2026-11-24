/**
 * vistaMovil.test.ts — LA MATEMÁTICA DEL PREVIEW MÓVIL (v1.27.0)
 * ==============================================================
 * Se ejecuta con:  npx tsx tests/vistaMovil.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * El bug era «en móvil se ve estirado». La cura es una escala UNIFORME (un solo
 * factor para ancho y alto) sobre un dispositivo de tamaño fijo. Esta suite
 * blinda esa promesa: la escala nunca deforma, el giro sólo intercambia ejes,
 * y los casos límite (contenedor a 0) no explotan.
 */
import {
  DISPOSITIVO_MOVIL,
  ESCALA_MIN,
  ESCALA_MAX,
  dimsSegunOrientacion,
  escalaUniforme,
  tamanoRenderizado,
  girar,
} from "../src/engine/vistaMovil";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}
const casi = (a: number, b: number) => Math.abs(a - b) < 1e-6;

console.log("\n[1] Orientación: girar intercambia ancho y alto");
comprobar("vertical = dispositivo tal cual",
  dimsSegunOrientacion("vertical").ancho === 390 && dimsSegunOrientacion("vertical").alto === 844);
comprobar("horizontal = ejes intercambiados",
  dimsSegunOrientacion("horizontal").ancho === 844 && dimsSegunOrientacion("horizontal").alto === 390);
comprobar("girar alterna vertical<->horizontal",
  girar("vertical") === "horizontal" && girar("horizontal") === "vertical");

console.log("\n[2] Escala UNIFORME: nunca deforma");
// Contenedor cuadrado 780x780: manda el alto (844) => 780/844.
const k1 = escalaUniforme({ ancho: 780, alto: 780 }, DISPOSITIVO_MOVIL);
comprobar("toma el eje más apretado (el alto)", casi(k1, Math.round((780 / 844) * 1000) / 1000), `${k1}`);
// La escala es la MISMA para ancho y alto: el aspect ratio se conserva.
const dims = DISPOSITIVO_MOVIL;
const rend = tamanoRenderizado(dims, k1);
const ratioOrig = dims.ancho / dims.alto;
const ratioRend = rend.ancho / rend.alto;
comprobar("conserva la proporción (no se estira)", Math.abs(ratioOrig - ratioRend) < 0.01, `${ratioOrig} vs ${ratioRend}`);
comprobar("el teléfono escalado cabe en el contenedor", rend.ancho <= 780 && rend.alto <= 780);

console.log("\n[3] Casos límite");
comprobar("contenedor a 0 no explota (devuelve ESCALA_MIN)",
  escalaUniforme({ ancho: 0, alto: 0 }, DISPOSITIVO_MOVIL) === ESCALA_MIN);
comprobar("la escala se acota por arriba a ESCALA_MAX",
  escalaUniforme({ ancho: 100000, alto: 100000 }, DISPOSITIVO_MOVIL) === ESCALA_MAX);
comprobar("la escala nunca baja de ESCALA_MIN",
  escalaUniforme({ ancho: 1, alto: 1 }, DISPOSITIVO_MOVIL) === ESCALA_MIN);

console.log("\n[4] Horizontal también encaja sin deformar");
const dH = dimsSegunOrientacion("horizontal");
const kH = escalaUniforme({ ancho: 900, alto: 500 }, dH);
const rH = tamanoRenderizado(dH, kH);
comprobar("horizontal conserva proporción",
  Math.abs((dH.ancho / dH.alto) - (rH.ancho / rH.alto)) < 0.01);
comprobar("horizontal cabe en el contenedor", rH.ancho <= 900 && rH.alto <= 500);

console.log(`\n─── vistaMovil: ${pasan} ✓  ${fallan} ✗ ───`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
