/**
 * repararImagenes.test.ts — v1.70.6 · LA ADUANA DE IMÁGENES
 * ==========================================================
 * Medido (sesión exportada): la imagen subida era real (`assets/subidas/image.png`)
 * y el HTML apuntaba a rutas soñadas (`assets/site/06-editor-web-ia.jpg`). La
 * aduana reescribe la referencia huérfana hacia la imagen real CUANDO el
 * emparejamiento es inequívoco, y no toca nada externo ni lo que ya existe.
 * Formato de casa para el semáforo de scripts/validar.mjs.
 * Se ejecuta con:  npx tsx tests/repararImagenes.test.ts
 */
import { repararRutasDeImagen, talloDe } from "../src/utils/repararImagenes";

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

{ // referencia soñada + una imagen real → reescrita
  const html = '<img src="assets/site/06-editor-web-ia.jpg" alt="x">';
  const r = repararRutasDeImagen(html, "index.html", ["index.html"], ["assets/subidas/image.png"]);
  comprobar("referencia soñada → imagen real subida", /src="assets\/subidas\/image\.png"/.test(r.texto), r.texto);
  comprobar("registra UNA reparación", r.reparadas.length === 1 && r.reparadas[0].de === "assets/site/06-editor-web-ia.jpg");
}

{ // referencia que existe NO se toca
  const html = '<img src="assets/subidas/real.png">';
  const r = repararRutasDeImagen(html, "index.html", ["index.html", "assets/subidas/real.png"], ["assets/subidas/real.png"]);
  comprobar("referencia existente intacta", r.texto === html && r.reparadas.length === 0);
}

{ // externas / data: / CDN intocables (falso positivo)
  const html = '<img src="https://cdn.ej.com/a.png"><img src="data:image/png;base64,AAAA"><img src="//cdn.ej.com/b.jpg">';
  const r = repararRutasDeImagen(html, "index.html", ["index.html"], ["assets/subidas/x.png"]);
  comprobar("URL https/data/protocol-less intocables", r.texto === html && r.reparadas.length === 0);
}

{ // varias imágenes sin tallo común → no adivina (falso positivo)
  const html = '<img src="galeria/foto-uno.png"><img src="galeria/foto-dos.png">';
  const r = repararRutasDeImagen(html, "index.html", ["index.html"], ["assets/subidas/gato.png", "assets/subidas/perro.png"]);
  comprobar("con varias y sin tallo común NO adivina", r.reparadas.length === 0);
}

{ // tallo exacto casa imagen ya del proyecto (aunque no sea de este turno)
  const html = '<img src="img/portada.jpeg">';
  const r = repararRutasDeImagen(html, "index.html", ["index.html"], [], ["assets/subidas/portada.jpg"]);
  comprobar("tallo exacto casa imagen del proyecto", /src="assets\/subidas\/portada\.jpg"/.test(r.texto), r.texto);
}

{ // CSS url() también pasa la aduana
  const css = ".hero{background:url(./figs/fondo-que-no-existe.png) center}";
  const r = repararRutasDeImagen(css, "styles.css", ["styles.css"], ["assets/subidas/fondo.png"]);
  comprobar("url() de CSS reescrita", /url\((['"]?)assets\/subidas\/fondo\.png\1\)/.test(r.texto), r.texto);
}

{ // talloDe normaliza
  comprobar("talloDe quita ruta, extensión y acentos", talloDe("assets/subidas/Imagen Uno.PNG") === "imagen-uno", talloDe("assets/subidas/Imagen Uno.PNG"));
}

console.log(`\n═══ ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas ? 1 : 0);
