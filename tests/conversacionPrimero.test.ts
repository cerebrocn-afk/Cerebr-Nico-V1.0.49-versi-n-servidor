/**
 * conversacionPrimero.test.ts — CONVERSACIÓN PRIMERO, CÓDIGO AL FONDO, SIN ROMPER (v1.29.0)
 * ==========================================================================================
 * Se ejecuta con:  npx tsx tests/conversacionPrimero.test.ts   (o `npm run validar`)
 *
 * QUÉ CUSTODIA Y POR QUÉ
 * ----------------------
 * Las tres quejas del usuario, convertidas en mecánica probada:
 *   1. ESPAÑOL — la prosa en inglés se detecta; la española pasa.
 *   2. CÓDIGO AL FONDO — un muro de código en el chat se dictamina y se compone
 *      con los archivos separados (van al editor) y la conversación conservada.
 *   3. PRESERVACIÓN — una modificación que borra exportaciones, amputa líneas o
 *      deja marcadores perezosos se marca como INSEGURA con su directiva.
 *
 * Es lógica pura: sin red, sin disco, sin DOM. Por eso corre sin node_modules.
 */
import {
  pareceNoEspanol,
  directrizIdioma,
  extraerBloques,
  medirCharla,
  dictaminarCharla,
  componerChatConCodigoAlFondo,
  auditarPreservacion,
  directrizConversacionPrimero,
  UMBRAL_RATIO_CODIGO,
} from "../src/engine/conversacionPrimero";

let pasan = 0;
let fallan = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = ""): void {
  if (cond) { pasan++; console.log(`  ✓ ${nombre}`); }
  else { fallan++; fallos.push(nombre + (detalle ? ` :: ${detalle}` : "")); console.log(`  ✗ ${nombre} ${detalle}`); }
}

console.log("\n[1] Idioma — el chat habla en español");
comprobar("prosa en español NO se marca",
  pareceNoEspanol("Listo, cambié la función y ahora el código está aquí en el archivo.") === false);
comprobar("prosa en inglés SÍ se marca",
  pareceNoEspanol("Done, I changed the function and the code is now here in the file for you.") === true);
comprobar("una palabra técnica suelta no dispara falso positivo",
  pareceNoEspanol("Hice el commit y subí el archivo al repo.") === false);
comprobar("texto muy corto no se juzga", pareceNoEspanol("ok") === false);
comprobar("la directiva de idioma menciona español", /ESPAÑOL/i.test(directrizIdioma()));

console.log("\n[2] Extracción y medida de bloques");
const RESP_MURO = [
  "Aquí va:",
  '```ts file="src/suma.ts"',
  "export function suma(a: number, b: number) {",
  "  return a + b;",
  "}",
  "export const CERO = 0;",
  "```",
].join("\n");
const ext = extraerBloques(RESP_MURO);
comprobar("detecta 1 bloque", ext.bloques.length === 1, `${ext.bloques.length}`);
comprobar("reconoce que es archivo con su ruta",
  ext.bloques[0].esArchivo && ext.bloques[0].ruta === "src/suma.ts", ext.bloques[0].ruta || "");
comprobar("la prosa queda sin el código", ext.prosa === "Aquí va:");
const med = medirCharla(RESP_MURO);
comprobar("mide código > prosa", med.charsCodigo > med.charsProsa);
comprobar("cuenta 1 bloque-archivo", med.bloquesArchivo === 1);

console.log("\n[3] Dictamen — código al fondo");
const dMuro = dictaminarCharla(RESP_MURO);
comprobar("un muro de código NO es 'equilibrada'", dMuro.veredicto !== "equilibrada", dMuro.veredicto);
comprobar("su directiva manda el código al editor", /editor|fondo/i.test(dMuro.directiva));

const RESP_MUDA = ['```ts file="x.ts"', "export const x = 1;", "```"].join("\n");
comprobar("código sin nada de prosa = 'muda'", dictaminarCharla(RESP_MUDA).veredicto === "muda");

const RESP_CHARLA = "Cambié el color del botón a azul porque contrastaba poco. Probé en el sandbox y se ve bien.";
comprobar("conversación sin código = 'equilibrada'", dictaminarCharla(RESP_CHARLA).veredicto === "equilibrada");

const RESP_MIXTA = [
  "Ajusté la validación del formulario para que no acepte correos vacíos y mostré el error debajo del campo. Esto es el fragmento clave:",
  "```ts",
  "if (!email) setError('Falta el correo');",
  "```",
].join("\n");
comprobar("prosa larga + fragmento corto sin ruta = 'equilibrada'",
  dictaminarCharla(RESP_MIXTA).veredicto === "equilibrada", dictaminarCharla(RESP_MIXTA).veredicto);

console.log("\n[4] Composición — archivos al editor, chat conservado");
const comp = componerChatConCodigoAlFondo(RESP_MURO);
comprobar("el archivo se separa hacia el editor", comp.archivos.length === 1 && comp.archivos[0].ruta === "src/suma.ts");
comprobar("el chat NO contiene el código entero", comp.chat.indexOf("return a + b") === -1);
comprobar("el chat referencia el archivo por su ruta", comp.chat.indexOf("src/suma.ts") !== -1);
comprobar("el chat conserva la prosa original", comp.chat.indexOf("Aquí va:") !== -1);
const compMixta = componerChatConCodigoAlFondo(RESP_MIXTA);
comprobar("un fragmento sin ruta NO se expulsa (es ejemplo)", compMixta.fragmentos.length === 1 && compMixta.archivos.length === 0);

console.log("\n[5] Preservación — no romper lo que funciona");
const ANTES = [
  "export function login(u, p) {",
  "  return check(u, p);",
  "}",
  "export function logout() {",
  "  return true;",
  "}",
  "export const VERSION = '1.0';",
  "function check(u, p) { return u && p; }",
].join("\n");

// Modificación honesta: cambia el cuerpo de login, conserva el resto.
const BUENA = ANTES.replace("return check(u, p);", "return check(u, p) && u.length > 0;");
const aBuena = auditarPreservacion(ANTES, BUENA);
comprobar("una edición que conserva todo es SEGURA", aBuena.seguro, JSON.stringify(aBuena.hallazgos));
comprobar("y puntaje 100", aBuena.puntaje === 100, `${aBuena.puntaje}`);

// Modificación que rompe: se «olvida» logout y VERSION.
const ROTA = [
  "export function login(u, p) {",
  "  return check(u, p);",
  "}",
  "function check(u, p) { return u && p; }",
].join("\n");
const aRota = auditarPreservacion(ANTES, ROTA);
comprobar("perder exportaciones NO es seguro", aRota.seguro === false);
comprobar("nombra la exportación perdida 'logout'",
  aRota.hallazgos.some((h) => h.tipo === "exportacion-perdida" && /logout/.test(h.detalle)));
comprobar("su directiva pide edit_file con ancla", /edit_file|ancla/i.test(aRota.directiva));

// Marcador perezoso.
const PEREZOSA = ANTES.replace("return true;", "// resto del código igual");
const aPerezosa = auditarPreservacion(ANTES, PEREZOSA);
comprobar("un marcador perezoso NO es seguro",
  aPerezosa.seguro === false && aPerezosa.hallazgos.some((h) => h.tipo === "marcador-perezoso"));

// Amputación por encogimiento (archivo largo que se queda en una línea).
const LARGO = Array.from({ length: 20 }, (_, i) => `const linea${i} = ${i};`).join("\n");
const aEncogido = auditarPreservacion(LARGO, "const linea0 = 0;");
comprobar("perder >=35% de líneas se marca como encogimiento",
  aEncogido.hallazgos.some((h) => h.tipo === "encogimiento"));
comprobar("vaciar el archivo es crítico",
  auditarPreservacion(LARGO, "").hallazgos.some((h) => h.tipo === "vaciado"));

console.log("\n[6] Directiva de sistema — las tres reglas viajan");
const dir = directrizConversacionPrimero();
comprobar("la directiva nombra ESPAÑOL", /ESPAÑOL/i.test(dir));
comprobar("la directiva nombra CÓDIGO AL FONDO", /CÓDIGO AL FONDO/i.test(dir));
comprobar("la directiva exige no romper lo que funciona", /NO ROMPAS|conserva/i.test(dir));
comprobar("el umbral de ratio está expuesto y es sensato", UMBRAL_RATIO_CODIGO > 0.5 && UMBRAL_RATIO_CODIGO < 1);

console.log(`\n─── conversacionPrimero: ${pasan} ✓  ${fallan} ✗ ───`);
if (fallan > 0) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
