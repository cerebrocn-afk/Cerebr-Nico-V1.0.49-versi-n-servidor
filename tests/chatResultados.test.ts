/**
 * chatResultados.test.ts — v1.70.6 · «EL CHAT NO ES UNA BIBLIA»
 * =============================================================
 * La sesión medida: un mensaje con 16 vallas y 40 «Voy a…». El presentador
 * debe: plegar cada bloque con ruta en una ficha, dejar UNA sola línea de
 * intención viva (contando las plegadas), conservar la prosa útil y NO tocar
 * los mensajes normales. Formato de casa (✓ / «N correctas · M fallidas») para
 * que el semáforo de `scripts/validar.mjs` sepa contar.
 * Se ejecuta con:  npx tsx tests/chatResultados.test.ts
 */
import { esMensajeDenso, segmentarMensaje, dividirEclectica, resumenFinalDelMensaje } from "../src/utils/chatResultados";

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

{ // charla normal: no densa, un solo bloque de prosa
  const t = "Claro: el puerto 3500 sirve el sandbox y el 3000 la IDE.";
  const segs = segmentarMensaje(t);
  comprobar("charla simple no es densa", esMensajeDenso(t) === false);
  comprobar("charla simple → un solo segmento de prosa", segs.length === 1 && segs[0].tipo === "prosa");
}

{ // mensaje con dos entregas: fichas plegadas por archivo, una intención por tramo
  const t = [
    "Voy a crear la galería.",
    '```html file="index.html"',
    "<!doctype html><html><body>hola</body></html>",
    "```",
    "Ahora voy a crear los estilos.",
    '```css file="styles.css"',
    "body{background:#000}",
    "h1{color:red}",
    "```",
  ].join("\n");
  comprobar("dos entregas es denso", esMensajeDenso(t) === true);
  const segs = segmentarMensaje(t);
  const fichas = segs.filter((s) => s.tipo === "archivo") as any[];
  const intenciones = segs.filter((s) => s.tipo === "intencion") as any[];
  comprobar("exactamente dos fichas de archivo", fichas.length === 2, `hubo ${fichas.length}`);
  comprobar("ficha 1 con ruta index.html", fichas[0]?.ruta === "index.html");
  comprobar("ficha 2 con ruta styles.css y lenguaje css", fichas[1]?.ruta === "styles.css" && fichas[1]?.lenguaje === "css");
  comprobar("fichas cerradas con líneas contadas", fichas.every((f) => f.abierto === false && f.lineas >= 1));
  comprobar("dos líneas de intención (una por tramo), sin muros de «voy a»", intenciones.length === 2 && /^Voy a crear la galería/.test(intenciones[0]?.texto || "") && /^Ahora voy a crear los estilos/.test(intenciones[1]?.texto || ""));
}

{ // valla abierta (streaming): ficha «escribiendo» sin romper nada
  const t = '```js file="app.js"\nconsole.log(1);\nconsole.log(2);\n\n';
  const ficha = segmentarMensaje(t).find((s) => s.tipo === "archivo") as any;
  comprobar("valla abierta → ficha existe y se marca abierta", !!ficha && ficha.abierto === true);
  comprobar("valla abierta cuenta líneas parciales", ficha?.lineas >= 2);
}

{ // separadores y muros de saltos fuera
  const t = "Primera idea.\n\n\n\n\nSegunda idea.\n\n---\n\n```js file=\"a.js\"\nx=1\n```";
  const segs = segmentarMensaje(t);
  const prosa = segs.filter((s) => s.tipo === "prosa").map((s: any) => s.texto).join("|");
  comprobar("separador --- fuera de la prosa", !prosa.includes("---"));
  comprobar("muro de saltos colapsado", !prosa.includes("\n\n\n"));
}

{ // snippet sin file= sigue siendo ficha, sin ruta inventada
  const t = 'Mira:\n```js\nconst a = 1;\n```\n```js file="otro.js"\nconst b = 2;\n```\nFin.';
  const fichas = segmentarMensaje(t).filter((s) => s.tipo === "archivo") as any[];
  comprobar("primera ficha sin ruta (no se inventa)", fichas[0]?.ruta === null);
  comprobar("segunda ficha con su ruta", fichas[1]?.ruta === "otro.js");
}

{ // v1.84.1 · CEREBRO/AUTO LIMPIO: solo la resolución a la vista, el resto detrás
  // del botón. Fixture calcado del formato que emite `informeEclectico` (el contrato
  // con el motor se vigila además EN SERIO desde tests/enjambreEclectico.test.ts).
  const informe = [
    "🎭 RESPUESTA ECLÉCTICA — 3/5 voces contestaron, un solo prompt",
    "   Enjambre de 5 voces de 5 proveedores distintos.",
    "   ↑ El veredicto vale más: 3 motores independientes coinciden o se contradicen en lo concreto.",
    "",
    "| # | voz | estado | puntaje | ms |",
    "|---|-----|--------|---------|----|",
    "| 1 | zai/glm-4.5-flash | ✓ | 65 | 2012 |",
    "| 2 | groq/openai/gpt-oss-120b | ✓ | 65 | 2819 |",
    "",
    "**Acuerdo medido:** ████░░░░░░ 40 % · sin juez: consenso por similitud real entre respuestas",
    "**Voz más sólida:** groq/openai/gpt-oss-120b",
    "",
    "**Divergencias (lo dijo una sola voz — verificar antes de confiar):**",
    "- Usar pnpm en vez de npm",
    "",
    "**Riesgos declarados:**",
    "- Divergencia sin confirmar: usar pnpm",
    "",
    "**Resumen del enjambre:**",
    "Ninguna afirmación en común entre las voces.",
    "",
    "**Veredicto final de la tarea:**",
    "Levantá el preview con `npm run dev` en el puerto 3500.",
    "",
    "> Tarea consultada: cómo veo el preview",
  ].join("\n");
  const ecl = dividirEclectica(informe);
  comprobar("respuesta ecléctica se divide", ecl !== null);
  // v1.84.4 · «que no resuma tanto, solo lo necesario» (Mario): lo visible es
  // RESUMEN DEL ENJAMBRE + VEREDICTO. La tabla, el acuerdo, las divergencias,
  // los riesgos y la tarea eco siguen detrás del botón.
  comprobar("la resolución es RESUMEN + VEREDICTO (no el veredicto seco)",
    !!ecl && ecl.resolucion.startsWith("**Resumen del enjambre:**") &&
    ecl.resolucion.includes("Ninguna afirmación en común entre las voces.") &&
    ecl.resolucion.includes("Levantá el preview con `npm run dev` en el puerto 3500."),
    JSON.stringify(ecl?.resolucion || ""));
  comprobar("la resolución NO arrastra tabla ni divergencias ni riesgos ni tarea",
    !!ecl && !ecl.resolucion.includes("| # |") && !ecl.resolucion.includes("Divergencias") &&
    !ecl.resolucion.includes("Riesgos declarados") && !ecl.resolucion.includes("Tarea consultada"));
  comprobar("el detalle conserva el informe íntegro (nada se pierde)", ecl?.detalle === informe);
  comprobar("voces y acuerdo salen del rótulo para la ficha", ecl?.voces === "3/5" && ecl?.acuerdo === "40 %");

  // charla normal jamás se toca
  comprobar("charla normal no es ecléctica", dividirEclectica("Hola, ¿qué tal?") === null);
  comprobar("mención suelta del rótulo en medio del mensaje no dispara", dividirEclectica("El otro día salió esto:\n🎭 RESPUESTA ECLÉCTICA — 1/5 voces\n**Veredicto final de la tarea:**\nX") === null);
  // streaming temprano: rótulo sí, veredicto todavía no → crudo honesto
  const parcial = "🎭 RESPUESTA ECLÉCTICA — 2/5 voces contestaron, un solo prompt\n| # | voz |";
  comprobar("sin veredicto aún (streaming) no se pliega nada", dividirEclectica(parcial) === null);
  // veredicto vacío: plegar dejando la pantalla en blanco sería mentir por omisión
  const vacio = "🎭 RESPUESTA ECLÉCTICA — 1/5 voces contestaron\n**Veredicto final de la tarea:**\n(vacío)\n\n> Tarea consultada: x";
  comprobar("veredicto (vacío) no se presenta como resolución", dividirEclectica(vacio) === null);
  // informe sin la línea de tarea (cola abierta): el veredicto es hasta el final
  const sinTarea = "🎭 RESPUESTA ECLÉCTICA — 5/5 voces\n**Veredicto final de la tarea:**\nTodo listo.\n";
  comprobar("sin «Tarea consultada» el veredicto toma el resto", dividirEclectica(sinTarea)?.resolucion === "Todo listo.");

  // v1.84.2 · LA SEGUNDA BOCA («Solo final»): sobre el mismo informe del motor.
  // v1.84.4 · la boca lee lo mismo que la pantalla: RESUMEN + VEREDICTO.
  comprobar("ecléctica: la voz dice RESUMEN + VEREDICTO, no el informe entero",
    !!resumenFinalDelMensaje(informe) &&
    (resumenFinalDelMensaje(informe) as string).startsWith("**Resumen del enjambre:**") &&
    (resumenFinalDelMensaje(informe) as string).includes("Levantá el preview") &&
    !(resumenFinalDelMensaje(informe) as string).includes("Tarea consultada"));
  comprobar("ecléctica: el crudo de «Escuchar» sigue siendo todo el informe",
    dividirEclectica(informe)?.detalle === informe);
  // informe sin bloque de resumen (corte viejo): la resolución cae al veredicto
  const sinResumenBloque = "🎭 RESPUESTA ECLÉCTICA — 1/1 voces\n**Veredicto final de la tarea:**\nHecho, sin resumen previo.\n\n> Tarea consultada: x";
  comprobar("sin bloque de resumen, la resolución es el veredicto (nunca vacía)",
    dividirEclectica(sinResumenBloque)?.resolucion === "Hecho, sin resumen previo.");
}

{ // v1.84.2 · LA SEGUNDA BOCA: «Solo final» lee la resolución, no el prompt entero
  const informeCodigo = "Voy a tocar el servidor.\n```js file=\"server.js\"\nconst a = 1;\n```\n```js file=\"app.js\"\nconst b = 2;\n```\nListo: el servidor levanta en el 3500 y el preview ya abre.";
  comprobar("informe con código: el resumen es la última prosa, no el código",
    resumenFinalDelMensaje(informeCodigo) === "Listo: el servidor levanta en el 3500 y el preview ya abre.");
  const informeSinProsaFinal = "Cambio lo pedido:\n```js file=\"a.js\"\nconst x = 1;\n```\n```js file=\"b.js\"\nconst y = 2;\n```\n```js file=\"c.js\"\nconst z = 3;\n```";
  comprobar("informe que termina en código sin prosa final no inventa resumen",
    resumenFinalDelMensaje(informeSinProsaFinal) === "Cambio lo pedido:");
  comprobar("charla simple: el mensaje entero YA es el resumen (un solo botón, sin duplicado)",
    resumenFinalDelMensaje("Hola, ¿qué tal?") === null);
  comprobar("mensaje vacío no da resumen", resumenFinalDelMensaje("") === null);
}

console.log(`\n═══ ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas ? 1 : 0);
