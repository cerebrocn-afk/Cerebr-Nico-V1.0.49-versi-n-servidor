/**
 * plantillaDefecto.test.ts — LA WEB QUEDA EN PLANTILLA POR DEFECTO (v1.66.0)
 * ===========================================================================
 * Se ejecuta con:  npx tsx tests/plantillaDefecto.test.ts
 *
 * RAÍZ (sesión futuristic.web): el modelo entregaba la web con andamio sin
 * terminar — meta «Descripción de futuristic.web», secciones con solo el título,
 * texto de relleno e imágenes marcador (placeholder/rotas). `completitud.ts` ya
 * caza el archivo prometido-y-no-escrito y el enlace al vacío EN DISCO; esto
 * caza el archivo que SÍ existe pero cuyo CONTENIDO sigue siendo plantilla.
 * Aquí se fija la detección de los 4 síntomas y —CONTROL DE FALSO POSITIVO— que
 * una web REAL y propia no dispara ninguno. Lógica pura: sin red, sin disco.
 */
import {
  detectarPlantillaPorDefecto,
  textoDeRelleno,
  metaPorDefecto,
  imagenesMarcador,
  seccionesHuecas,
  informePlantilla,
} from "../src/engine/plantillaDefecto";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  \u2713 ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  \u2717 ${nombre} ${detalle}`); }
}

const ANDAMIO = [
  "<html><head>",
  '<title>Document</title>',
  '<meta name="description" content="Descripci\u00f3n de futuristic.web">',
  "</head><body>",
  "<section><h2>Secci\u00f3n 1</h2></section>",
  '<img src="https://via.placeholder.com/600x400">',
  "<p>Lorem ipsum dolor sit amet consectetur.</p>",
  '<img src="tu-imagen.jpg">',
  "</body></html>",
].join("\n");

const WEB_REAL = [
  "<html><head>",
  "<title>Portafolio de Ana Ruiz \u2014 Dise\u00f1o UX</title>",
  '<meta name="description" content="Dise\u00f1adora UX con 8 a\u00f1os creando productos digitales accesibles y medibles.">',
  "</head><body>",
  "<section><h2>Sobre m\u00ed</h2><p>Trabajo con equipos para construir interfaces claras, probadas con usuarios reales.</p><img src=\"/img/ana.jpg\"></section>",
  "</body></html>",
].join("\n");

console.log("\n[1] DEFECTO SEMBRADO: el andamio dispara los 4 síntomas");
{
  const v = detectarPlantillaPorDefecto(ANDAMIO, "futuristic.web");
  comprobar("no ok", v.ok === false, JSON.stringify(v.ok));
  comprobar("texto de relleno", textoDeRelleno(ANDAMIO).length >= 1, JSON.stringify(textoDeRelleno(ANDAMIO)));
  comprobar("meta por defecto", metaPorDefecto(ANDAMIO, "futuristic.web").length >= 1, JSON.stringify(metaPorDefecto(ANDAMIO)));
  comprobar("im\u00e1genes marcador (2)", imagenesMarcador(ANDAMIO).length === 2, JSON.stringify(imagenesMarcador(ANDAMIO)));
  comprobar("secci\u00f3n hueca", seccionesHuecas(ANDAMIO).length === 1, JSON.stringify(seccionesHuecas(ANDAMIO)));
  comprobar("informe nombra la raz\u00f3n", /PLANTILLA POR DEFECTO/.test(informePlantilla(v)), informePlantilla(v));
}

console.log("\n[2] <title>Document</title> por defecto");
{
  comprobar("title gen\u00e9rico detectado", metaPorDefecto(ANDAMIO).some((d) => /title/i.test(d)), JSON.stringify(metaPorDefecto(ANDAMIO)));
}

console.log("\n[3] FALSO POSITIVO: una web real y propia no dispara nada");
{
  const v = detectarPlantillaPorDefecto(WEB_REAL, "portafolio");
  comprobar("ok", v.ok === true, JSON.stringify(v.hallazgos));
  comprobar("sin relleno", textoDeRelleno(WEB_REAL).length === 0, JSON.stringify(textoDeRelleno(WEB_REAL)));
  comprobar("sin meta def", metaPorDefecto(WEB_REAL, "portafolio").length === 0, JSON.stringify(metaPorDefecto(WEB_REAL)));
  comprobar("sin img marcador", imagenesMarcador(WEB_REAL).length === 0, JSON.stringify(imagenesMarcador(WEB_REAL)));
  comprobar("sin secci\u00f3n hueca", seccionesHuecas(WEB_REAL).length === 0, JSON.stringify(seccionesHuecas(WEB_REAL)));
  comprobar("informe vac\u00edo", informePlantilla(v) === "", informePlantilla(v));
}

console.log("\n[4] <img> sin src también cuenta como marcador");
{
  comprobar("img sin src", imagenesMarcador('<img alt="x">').length === 1, JSON.stringify(imagenesMarcador('<img alt="x">')));
}

console.log(`\nRESUMEN plantillaDefecto: ${pasan} pasan, ${fallan} fallan`);
if (fallan) { console.error("FALLOS:\n - " + fallos.join("\n - ")); process.exit(1); }
console.log("OK plantillaDefecto");
