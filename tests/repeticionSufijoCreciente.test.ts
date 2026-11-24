/**
 * tests/repeticionSufijoCreciente.test.ts — npx tsx tests/repeticionSufijoCreciente.test.ts
 *
 * v1.60.19 — DEGENERACIÓN POR SUFIJO CRECIENTE (el «bucle» REAL de la sesión FIM
 * del 21/10, modelo mistral-code-fim-latest). El motor empezó a emitir
 * constantes válidas y luego cada línea AÑADÍA otro `_DATOS_SCHEMA` al
 * identificador:
 *
 *   export const CN_CREADOR_MARCADOR_INICIO_AUTOMIGRACION_DATOS = "...";
 *   export const CN_CREADOR_..._DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA = "...";
 *
 * Como NINGUNA línea es idéntica a otra (el sufijo CRECE), el loop-breaker viejo
 * —que solo caza trozo/línea EXACTOS repetidos 8 veces— no saltaba hasta ~20 KB.
 * El detector nuevo mira UNA línea y corta cuando una unidad corta no trivial se
 * repite muchas veces dentro de ella.
 *
 * Defecto sembrado / entrada hostil: el log degenerado real reconstruido. Se
 * comprueba además que código legítimo (muchas constantes DISTINTAS, sangrías,
 * líneas decorativas `====`) NO se marca como bucle (falso positivo = rechaza).
 */
import { unidadRepetidaEnTexto, cortarDegeneracionSufijo } from "../src/utils/repeticionAnidada";

let ok = 0;
let fail = 0;
function af(nombre: string, cond: boolean) {
  if (cond) { ok++; console.log(`  \u2713 ${nombre}`); }
  else { fail++; console.error(`  \u2717 ${nombre}`); }
}

console.log("repeticionSufijoCreciente — el bucle de sufijo creciente se corta temprano");

// — Reconstrucción del log degenerado: prefijo bueno + sufijo que CRECE.
function logDegenerado(lineasBuenas: number, lineasMalas: number): string {
  const out: string[] = [];
  out.push('export const VERSION_SEMVER = "1.60.19";');
  out.push('export const CN_RAIZ_DATOS = "C:\\\\Cerebronico";');
  out.push("export const CN_PUERTO_IDE = 3000;");
  out.push("export const CN_PUERTO_PUENTE = 5000;");
  for (let i = 0; i < lineasBuenas; i++) out.push(`export const CN_FLAG_${i} = ${i};`);
  let sufijo = "AUTOMIGRACION";
  for (let i = 0; i < lineasMalas; i++) {
    sufijo += "_DATOS_SCHEMA";
    out.push(`export const CN_CREADOR_MARCADOR_INICIO_${sufijo} = "<!-- CN_CREADOR_INICIO_${sufijo} -->";`);
  }
  return out.join("\n");
}

// 1) UNA línea con `_DATOS_SCHEMA` repetido 6 veces es degeneración.
const lineaMala =
  "export const CN_CREADOR_MARCADOR_INICIO_AUTOMIGRACION_DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA = 1;";
const r1 = unidadRepetidaEnTexto(lineaMala);
af("detecta la unidad repetida dentro de una sola línea", r1.hit === true);
af("la unidad detectada es el bloque que se repite (_DATOS_SCHEMA / _SCHEMA_DATOS)", /DATOS|SCHEMA/.test(r1.unidad));
af("cuenta al menos 6 repeticiones", r1.veces >= 6);

// 2) El corte conserva lo BUENO y tira la basura — y salta TEMPRANO (~7 líneas malas).
const logTemprano = logDegenerado(0, 8);
const corte = cortarDegeneracionSufijo(logTemprano);
af("corta el log degenerado", corte.hit === true);
af("el recorte conserva las constantes buenas (VERSION_SEMVER)", /VERSION_SEMVER/.test(corte.cortado));
af("el recorte es más corto que el original (tira la cola basura)", corte.cortado.length < logTemprano.length);
af("el recorte ya NO trae el sufijo degenerado más largo", !/_DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA/.test(corte.cortado));
af("salta mucho antes de los 20 KB (el recorte pesa < 2 KB en este caso)", corte.cortado.length < 2048);

// 3) RED DE SEGURIDAD (falso positivo que debe RECHAZARSE): código legítimo.
const legit = [
  'export const VERSION_SEMVER = "1.60.19";',
  "export const CN_PUERTO_IDE = 3000;",
  "export const CN_PUERTO_PUENTE = 5000;",
  "export const CN_PUERTO_MEMORIA = 5100;",
  "export const CN_PUERTO_CREADOR = 5102;",
  "export const CN_PUERTO_OLLAMA = 11434;",
  "export const CN_PUERTOS_PROPIOS = [3000, 5000, 5100, 5102, 11434];",
  "    const resultado = calcular(a, b, c, d, e, f);",
].join("\n");
af("código legítimo con muchas constantes DISTINTAS NO se marca como bucle", cortarDegeneracionSufijo(legit).hit === false);

// sangría (runs de espacios) NO cuenta como unidad repetida
af("la sangría de espacios no dispara el detector", unidadRepetidaEnTexto("                const x = 1;").hit === false);
// línea decorativa de un solo signo NO cuenta (unidad de un carácter)
af("una línea decorativa '====...' no dispara el detector", unidadRepetidaEnTexto("// " + "=".repeat(60)).hit === false);
af("una línea decorativa '----...' no dispara el detector", unidadRepetidaEnTexto("// " + "-".repeat(60)).hit === false);

// 4) Una lista markdown repetida con formato legítimo distinto por línea no cae.
const lista = ["1. Primero", "2. Segundo", "3. Tercero", "4. Cuarto", "5. Quinto"].join("\n");
af("una lista numerada normal NO se marca como bucle", cortarDegeneracionSufijo(lista).hit === false);

console.log(`\nResultado: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
