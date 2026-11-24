/**
 * quirofano.ts — QUIRÓFANO v1 (motor determinista)
 * ================================================
 * EL PROBLEMA, TAL CUAL LO VIVE EL USUARIO
 * ----------------------------------------
 * «Subo una app que funciona, le pido una mejora y el modelo la rompe.»
 * La causa no es que el modelo sea tonto: es que la herramienta que le damos
 * para escribir es un martillo. `write_file` deja al modelo reescribir un
 * archivo de 600 líneas de memoria, y un modelo de nube (Gemini, GLM, Grok…)
 * con 8 archivos de contexto hace lo que puede: devuelve una versión
 * «mejorada» a la que le falta la mitad de las funciones que no miraba. El
 * resultado compila a veces y arranca nunca.
 *
 * El guardián de sintaxis (v2.1) ya impide escribir un archivo DESBALANCEADO.
 * Eso no basta: un archivo perfectamente balanceado y perfectamente mutilado
 * pasa el guardián sin pestañear — y ahí es donde muere la app.
 *
 * QUÉ HACE ESTE MÓDULO
 * --------------------
 * 1. ABRE UNA OPERACIÓN antes del primer cambio: guarda copia de cada archivo
 *    ANTES de tocarlo (copia-al-escribir, no del proyecto entero: barato).
 * 2. JUZGA CADA ESCRITURA antes de que toque el disco:
 *      · ¿desaparecen exportaciones que existían?         → peligroso
 *      · ¿el archivo pierde ≥35 % de líneas útiles?       → peligroso (amputación)
 *      · ¿trae marcadores de truncado («…», «resto del código»)? → peligroso
 *      · ¿el package.json pierde dependencias o scripts?  → peligroso
 *      · ¿pierde entre 12 % y 35 %?                       → revisar (avisa, deja pasar)
 * 3. CIERRA LA OPERACIÓN con PUERTAS de verdad sobre el DISCO (no sobre lo que
 *    el modelo dice haber escrito): sintaxis, imports relativos rotos, superficie
 *    pública perdida. Si una puerta bloqueante cae, REVIERTE los archivos de esa
 *    operación y devuelve el informe para que el modelo se corrija.
 *
 * Es 100 % determinista, sin dependencias de red, sin llamar a ningún modelo:
 * coste cero en tokens y cero en créditos. Reutiliza el guardián de sintaxis y
 * el comprobador de imports que ya existían.
 *
 * FILOSOFÍA DE LOS UMBRALES
 * -------------------------
 * Un guardián que bloquea demasiado es tan inútil como uno que no bloquea nada:
 * el usuario aprende a saltárselo. Por eso «revisar» deja pasar (con aviso) y
 * sólo se bloquea lo que de verdad rompe una app que funcionaba: perder API
 * pública, quedarse a la mitad, o encogerse hasta perder funciones enteras.
 * Y siempre hay una salida honesta (`force=true` + motivo), porque quien manda
 * es el usuario: lo que no puede pasar es que la pérdida ocurra EN SILENCIO.
 */

import { guardFile, problemasBloqueantes } from "./syntaxGuard";
import { findMissingImports, type CheckFile } from "./importChecker";

export const VERSION_QUIROFANO = "1.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// Umbrales (exportados: la suite de pruebas los usa como contrato)
// ─────────────────────────────────────────────────────────────────────────────

/** Pérdida de líneas útiles que ya se considera amputación (bloquea). */
export const UMBRAL_AMPUTACION = 0.35;
/** Pérdida a partir de la cual se avisa sin bloquear. */
export const UMBRAL_AVISO = 0.12;
/** Por debajo de estas líneas útiles, un archivo es demasiado pequeño para juzgarlo por tamaño. */
export const MIN_LINEAS_PARA_CIRUGIA = 30;
/** Tope de bytes de un archivo que se guarda íntegro para poder revertirlo. */
export const MAX_BYTES_REVERSION = 512 * 1024;

/** Rutas donde un recorte «pequeño» deja la app sin arrancar. */
export const RUTAS_DE_RIESGO = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "index.html",
  "src/main.tsx",
  "src/main.ts",
  "src/main.jsx",
  "src/index.tsx",
  "src/App.tsx",
  "src/App.jsx",
];

export type Veredicto = "seguro" | "revisar" | "peligroso";
export type ModoEvaluacion = "cirugia" | "carga";
export type Gravedad = "bloqueante" | "aviso";

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades puras
// ─────────────────────────────────────────────────────────────────────────────

export function normalizarRuta(ruta: string): string {
  return String(ruta || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

/** Normaliza finales de línea para que un CRLF no cuente como cambio. */
export function normalizarTexto(texto: string): string {
  return String(texto ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Huella FNV-1a de 32 bits en hexadecimal. Deliberadamente sin `node:crypto`:
 * este módulo tiene que poder correr igual en el servidor y en el navegador.
 */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  const t = String(texto ?? "");
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function contarLineas(texto: string): number {
  const t = normalizarTexto(texto);
  if (!t) return 0;
  return t.split("\n").length;
}

/**
 * Líneas ÚTILES: no vacías y no comentario puro. Es la medida honesta de
 * «cuánto código hay aquí» — contar bytes premia al que deja líneas en blanco.
 */
export function lineasUtiles(texto: string): number {
  const t = normalizarTexto(texto);
  if (!t.trim()) return 0;
  let n = 0;
  for (const linea of t.split("\n")) {
    const l = linea.trim();
    if (!l) continue;
    if (l.startsWith("//") || l.startsWith("/*") || l.startsWith("*") || l.startsWith("#") || l.startsWith("<!--")) continue;
    n++;
  }
  return n;
}

const PATRONES_EXPORT: Array<{ re: RegExp; grupo: number }> = [
  { re: /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g, grupo: 1 },
  { re: /\bexport\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g, grupo: 1 },
  { re: /\bexport\s*\{([^}]*)\}/g, grupo: 0 },
];

/**
 * Superficie pública de un archivo: qué nombres ofrece al resto del proyecto.
 * Es la lista que NUNCA debe encogerse al pedir una mejora.
 */
export function superficiePublica(texto: string): string[] {
  const t = normalizarTexto(texto);
  const nombres = new Set<string>();
  for (const { re, grupo } of PATRONES_EXPORT) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      if (grupo === 0) {
        const dentro = m[1] || "";
        for (const trozo of dentro.split(",")) {
          const nombre = trozo.trim().split(/\s+as\s+/).pop()?.trim() || "";
          if (nombre && /^[A-Za-z_$][\w$]*$/.test(nombre)) nombres.add(nombre);
          else if (trozo.includes("default")) nombres.add("default");
        }
      } else {
        nombres.add(m[grupo]);
      }
    }
  }
  if (/\bexport\s+default\b/.test(t)) nombres.add("default");
  return [...nombres].sort();
}

const MARCAS_TRUNCADO: Array<{ re: RegExp; que: string }> = [
  { re: /^\s*(?:\.\.\.|…)\s*$/m, que: "una línea que sólo tiene «...»" },
  { re: /resto\s+del\s+c[oó]digo/i, que: "la frase «resto del código»" },
  { re: /<\s*\.\.\.\s*>/, que: "el marcador «<...>»" },
  { re: /aqu[ií]\s+va(?:n)?\s+(?:el|los|la)\s+(?:c[oó]digo|resto)/i, que: "un «aquí va el código»" },
  { re: /(?:se\s+omite|omitido\s+por\s+brevedad|sin\s+cambios\s+en\s+el\s+resto)/i, que: "un «se omite»" },
  { re: /\/\*\s*\.\.\.\s*\*\//, que: "un comentario «/* ... */»" },
  { re: /elif\s+FALSE|pass\s*#\s*TODO|TODO:?\s*implementar/i, que: "un «TODO: implementar»" },
  { re: /etc\.\.\./i, que: "un «etc...»" },
];

/**
 * v2.3.9 — LA MARCA DE TRUNCADO SE JUZGA POR SU FORMA, NO SÓLO POR SU TEXTO.
 *
 * 🐞 DEFECTO MEDIDO (4/11). El escáner buscaba las frases en TODO el texto, sin
 * distinguir prosa de código. Un archivo que DOCUMENTA la frase que el juez
 * busca — como hace `server.ts` al explicar su propio criterio, o el propio
 * `quirofano.ts` al listar sus regexes — quedaba marcado como truncado PARA
 * SIEMPRE y ninguna edición suya pasaba. Medido sobre esta copia: 44 archivos
 * contienen alguna de esas frases. El guardián se había convertido en un candado
 * sin llave: bloqueaba la edición que lo apagaría.
 *
 * ⚠️ EL REMEDIO QUE SE PROBÓ Y SE RETIRÓ (v2.3.9 → v2.3.9): hacer al escáner
 * ciego a los comentarios. Cerraba el falso positivo y abría un agujor peor:
 * la firma nº1 del modelo que se quedó sin contexto ES UN COMENTARIO
 * (`export const a = 1;` + `// resto del código`). Con los comentarios invisibles
 * ese archivo — exactamente la rotura real que esta pieza existe para cazar —
 * pasaba verde. Las 4 vallas que ese arreglo dejó en rojo (quirofano ×3,
 * completitud ×1) NO eran ruido por arreglar: eran esa protección.
 *
 * ✓ LO QUE HACE AHORA: SEPARAR MEDIR DE BLOQUEAR.
 *   · `marcadoresDeTruncado(texto)`  → escáner honesto: mira todo el texto.
 *   · `marcadoresBloqueantes(texto)` → el juez: sólo lo que de verdad corta un archivo.
 * Una marca BLOQUEA cuando está en una línea de CÓDIGO, o cuando el comentario
 * ES la marca y nada más (`// resto del código`, `// ...`). Si la frase vive
 * dentro de una oración (`· ¿trae marcadores de truncado («resto del código»)?`),
 * eso es documentación: se mide, no se bloquea. La diferencia es determinista
 * (prefijo de línea + forma), no se adivina con un modelo.
 *
 * Ningún umbral se tocó: ni el de líneas ni el de exportaciones.
 */

/**
 * Formas canónicas (sin acentos, sin puntuación, en minúscula) de un comentario
 * que NO es más que la confesión de que falta código. Se compara por igualdad
 * exacta: una oración que contiene la frase es documentación, no un corte.
 */
const MARCAS_AISLADAS = new Set([
  "resto del codigo",
  "el resto del codigo",
  "y el resto del codigo",
  "resto del codigo fuente",
  "resto del codigo completo",
  "resto del codigo igual",
  "resto del codigo sin cambios",
  "resto del codigo aqui",
  "resto aqui",
  "resto igual",
  "resto identico",
  "resto sin cambios",
  "resto de codigo igual",
  "demas codigo igual",
  "se omite",
  "se omite por brevedad",
  "se omite el resto",
  "se omiten el resto",
  "se omite aqui",
  "se omite todo lo demas",
  "omitido por brevedad",
  "omitido",
  "aqui va el codigo",
  "aqui va el resto",
  "aqui va el resto del codigo",
  "aqui van los cambios",
  "aqui van las demas funciones",
  "todo implementar",
  "etc",
  "continua",
  "continua igual",
  "continua identico",
  "pass todo",
  "elif false",
]);

/** Minúsculas, sin acentos, sin puntuación, espacios colapsados. */
function formaCanonica(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** ¿La línea es un comentario (o una línea vacía)? */
function esLineaDeComentario(linea: string): boolean {
  const l = linea.trim();
  if (!l) return true;
  return l.startsWith("//") || l.startsWith("*") || l.startsWith("/*") || l.startsWith("#");
}

/**
 * ¿El comentario NO es más que la marca? `// resto del código` sí;
 * `// la validación se omite cuando ya corrió` no (es una oración);
 * `// ...` sí (elipsis suelta = «aquí corté»); `//` a secas no (decoración).
 */
function esMarcaAislada(linea: string): boolean {
  const crudo = linea.trim();
  if (!crudo) return false;
  const sinPrefijo = crudo.replace(/^(?:(?:\/\/|\/\*|#)+|\*+|=+|-+|─+|—+)\s*/, "").replace(/\*\/\s*$/, "");
  const can = formaCanonica(sinPrefijo);
  if (!can) return /(?:\.\.\.|…)/.test(crudo);
  if (can.length > 48) return false;
  return MARCAS_AISLADAS.has(can);
}

export interface MarcaDeTruncado {
  /** Nombre legible de la marca (el que aparece en el informe). */
  que: string;
  /** Línea 1-based donde apareció. */
  linea: number;
  /** La marca está en una línea de código (no comentario). */
  enCodigo: boolean;
  /** La línea NO es más que la marca: el corte confesado. Es lo que bloquea. */
  aislada: boolean;
}

/** La única marca que se juzga por sí sola: una línea que es únicamente «...». */
const MARCA_ELLIPSIS = "una línea que sólo tiene «...»";

/**
 * ¿La línea entera NO dice más que la marca? Se quitan el prefijo de comentario,
 * las comillas, los paréntesis, los puntos y las elipsis; lo que queda tiene que
 * ser exactamente una de `MARCAS_AISLADAS` (o nada, si la línea era sólo «...»).
 *
 *   `// resto del código`                       → true   (corte confesado)
 *   `// ... resto del código ...`               → true   (ídem)
 *   `const x = "se omite";`                     → true   (valor placeholder)
 *   `console.log("se omite npm run build")`     → false  (prosa dentro de un string)
 *   `// la validación se omite si ya corrió`    → false  (documentación)
 *   `*   - Marcadores ("...", "<...>", resto del código)` → false (inventario documentado)
 */
function lineaEsMarcaPura(texto: string): boolean {
  const can = formaCanonica(texto);
  if (!can) return /(?:\.\.\.|…)/.test(texto);
  if (can.length > 48) return false;
  return MARCAS_AISLADAS.has(can);
}

function esLineaSoloMarca(linea: string): boolean {
  const crudo = linea.trim();
  if (!crudo) return false;
  const sinPrefijo = crudo
    .replace(/^(?:(?:\/\/|\/\*|#)+|\*+|=+|-+|─+|—+)\s*/, "")
    .replace(/\*\/\s*$/, "");
  if (lineaEsMarcaPura(sinPrefijo)) return true;
  // Un literal de texto que ES la marca es un placeholder, no una frase:
  //   `const cuerpo = "resto del código";`   → corte.
  //   `console.log("se omite npm run build")` → prosa dentro de un log.
  for (const lit of crudo.match(/(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g) || []) {
    if (lineaEsMarcaPura(lit.slice(1, -1))) return true;
  }
  return false;
}

/**
 * Auditoría línea a línea: TODA marca que existe en el texto, con su forma.
 * Es la base de las dos lecturas públicas: `marcadoresDeTruncado` (medir) y
 * `marcadoresBloqueantes` (juzgar).
 */
export function auditarTruncado(texto: string): MarcaDeTruncado[] {
  const t = normalizarTexto(texto);
  const out: MarcaDeTruncado[] = [];
  const lineas = t.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const comentario = esLineaDeComentario(l);
    for (const { re, que } of MARCAS_TRUNCADO) {
      if (!re.test(l)) continue;
      const aislada = que === MARCA_ELLIPSIS ? true : esLineaSoloMarca(l);
      out.push({ que, linea: i + 1, enCodigo: !comentario, aislada });
    }
  }
  return out;
}

/**
 * Marcadores de que el modelo se quedó sin contexto a mitad (causa nº1 de apps
 * rotas). ESCÁNER: mira todo el texto, comentarios y strings incluidos. Responde
 * «¿aparece esta marca aquí?», no «¿hay que bloquear?».
 */
export function marcadoresDeTruncado(texto: string): string[] {
  return [...new Set(auditarTruncado(texto).map((m) => m.que))];
}

/**
 * LAS QUE BLOQUEAN: las marcas que son todo el mensaje de una línea. Un modelo
 * que se quedó sin contexto escribe `// resto del código` en una línea sola; un
 * archivo que DOCUMENTA esa frase, o que la usa en un log, no está truncado.
 * Ningún umbral de líneas ni el chequeo de exportaciones se tocan aquí.
 */
export function marcadoresBloqueantes(texto: string): string[] {
  return [...new Set(auditarTruncado(texto).filter((m) => m.aislada).map((m) => m.que))];
}

// ─────────────────────────────────────────────────────────────────────────────
// EL GUARDIÁN NO PUEDE BLOQUEARSE A SÍ MISMO (v2.3.9 · pedido 4/11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🐞 EL DEFECTO DE FONDO: `quirofano.ts` contiene, como texto literal, las frases
 * que detecta; `cerradura.ts` contiene, como literales, los patrones de
 * vulnerabilidad que escanea. Un juez que busca sus propias marcas en el archivo
 * que las lista no puede ser editado jamás: la escritura se bloquea sola y la
 * única salida es escribir POR FUERA del juez, que es justo lo que el Quirófano
 * existe para evitar. Medido en esta copia: `quirofano.ts` se auto-detectaba 7
 * marcas y `cerradura.ts` se auto-detectaba 5 hallazgos CRÍTICOS.
 *
 * ✓ LA EXCEPCIÓN, EXPLÍCITA: estos archivos se editan SIEMPRE. El veredicto
 * nunca es `peligroso` para ellos: todo lo encontrado baja a `revisar` (AVISO),
 * se escribe en el log, y queda a la vista en el estado del Quirófano. No es un
 * silencio: es un aviso con nombre.
 *
 * Por qué es seguro aflojar SOLO acá: lo que protege al guardián no es su propio
 * juez (un juez que se juzga a sí mismo no es un juez), es `tests/quirofano.test.ts`,
 * `tests/cerradura.test.ts` y la valla maestra. Un guardián mutilado se ve ahí.
 */
export const RUTAS_DEL_GUARDIAN = [
  "src/engine/quirofano.ts",
  "src/engine/cerradura.ts",
  "src/engine/syntaxGuard.ts",
  "src/engine/interruptorQuirofano.ts",
  "server/gatesObra.ts",
  "tests/quirofano.test.ts",
  "tests/cerradura.test.ts",
  "tests/interruptorQuirofano.test.ts",
  "tests/guard.test.ts",
  "tests/syntaxGuardProfundo.test.ts",
];

/** ¿Estamos editando al propio juez (o a sus pruebas, que citan sus marcas)? */
export function esArchivoGuardian(ruta: string): boolean {
  const r = normalizarRuta(ruta);
  if (!r) return false;
  return RUTAS_DEL_GUARDIAN.some((g) => r === g || r.endsWith("/" + g));
}

/** El aviso que queda en el log y en el informe cuando el juez se deja editar. */
export function avisoGuardian(ruta: string, motivos: string[]): string {
  return (
    `AVISO (no bloquea): ${normalizarRuta(ruta)} es el propio guardián y se edita por contrato, no por excepción. ` +
    (motivos.length ? `Lo que el juez habría bloqueado: ${motivos.join(" · ")}. ` : "") +
    "Si esto aparece sin que nadie lo haya pedido, alguien está tocando al juez: mirá los diffs y las suites quirofano/cerradura."
  );
}

export function resumirLista(nombres: string[], max = 8): string {
  const lista = nombres || [];
  if (lista.length <= max) return lista.join(", ");
  return `${lista.slice(0, max).join(", ")} y ${lista.length - max} más`;
}

export function esRutaDeRiesgo(ruta: string): boolean {
  const r = normalizarRuta(ruta);
  if (RUTAS_DE_RIESGO.includes(r)) return true;
  if (r.endsWith("package.json")) return true;
  if (/(^|\/)main\.(tsx?|jsx?)$/.test(r)) return true;
  if (/(^|\/)vite\.config\.(ts|js|mts|mjs)$/.test(r)) return true;
  return false;
}

export function esPackageJson(ruta: string): boolean {
  return normalizarRuta(ruta).endsWith("package.json");
}

/** Dependencias y scripts de un package.json legible (o null si no se puede leer). */
export function partesDePackageJson(texto: string): { deps: string[]; scripts: string[] } | null {
  try {
    const j = JSON.parse(texto);
    return {
      deps: [...Object.keys(j?.dependencies || {}), ...Object.keys(j?.devDependencies || {})].sort(),
      scripts: Object.keys(j?.scripts || {}).sort(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico de una escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface CifrasCirugia {
  lineasAntes: number;
  lineasDespues: number;
  utilesAntes: number;
  utilesDespues: number;
  /** Fracción de líneas útiles perdidas (0..1; 0 si el archivo era nuevo o vacío). */
  perdidaUtil: number;
  charsAntes: number;
  charsDespues: number;
  publicosAntes: number;
  publicosDespues: number;
  publicosPerdidos: string[];
}

export interface Diagnostico {
  ruta: string;
  existia: boolean;
  veredicto: Veredicto;
  motivos: string[];
  cifras: CifrasCirugia;
}

function cifrasDe(original: string | null, nuevo: string): CifrasCirugia {
  const antes = original === null ? "" : normalizarTexto(original);
  const despues = normalizarTexto(nuevo);
  const utilesAntes = original === null ? 0 : lineasUtiles(antes);
  const utilesDespues = lineasUtiles(despues);
  const supAntes = original === null ? [] : superficiePublica(antes);
  const supDespues = superficiePublica(despues);
  const perdidaUtil = utilesAntes > 0 ? Math.max(0, (utilesAntes - utilesDespues) / utilesAntes) : 0;
  return {
    lineasAntes: original === null ? 0 : contarLineas(antes),
    lineasDespues: contarLineas(despues),
    utilesAntes,
    utilesDespues,
    perdidaUtil: Math.round(perdidaUtil * 1000) / 1000,
    charsAntes: antes.length,
    charsDespues: despues.length,
    publicosAntes: supAntes.length,
    publicosDespues: supDespues.length,
    publicosPerdidos: supAntes.filter((s) => !supDespues.includes(s)),
  };
}

/**
 * El juez. Decide, ANTES de tocar el disco, si esta escritura puede romper una
 * app que funcionaba.
 *
 *  modo "cirugia" (por defecto): el usuario pide una MEJORA sobre algo que ya
 *    funciona → se vigila la pérdida de líneas, de API pública y el truncado.
 *  modo "carga": el usuario está SUBIENDO la app entera (muchos archivos nuevos
 *    de golpe) → juzgar la pérdida de líneas contra lo que hubiera en el sandbox
 *    sería un falso positivo; sólo se exige que no venga truncada.
 */
function juzgarCirugiaInterno(
  ruta: string,
  original: string | null,
  nuevo: string,
  modo: ModoEvaluacion = "cirugia"
): Diagnostico {
  const r = normalizarRuta(ruta);
  const nuevoTxt = normalizarTexto(nuevo);
  const antesTxt = original === null ? null : normalizarTexto(original);
  const cifras = cifrasDe(original, nuevoTxt);
  const motivos: string[] = [];
  const truncados = marcadoresBloqueantes(nuevoTxt);
  const riesgo = esRutaDeRiesgo(r);

  // 1) Archivo nuevo: sólo se exige que esté completo.
  if (antesTxt === null) {
    if (truncados.length > 0) {
      return {
        ruta: r,
        existia: false,
        veredicto: "peligroso",
        motivos: [`El archivo NUEVO viene truncado: contiene ${truncados.join(", ")}. Escríbelo entero o no lo escribas.`],
        cifras,
      };
    }
    return { ruta: r, existia: false, veredicto: "seguro", motivos: [], cifras };
  }

  // 2) v1.23.0 · REESCRITURA IDÉNTICA = FALLO NOMBRADO (antes: «seguro»).
  // El defecto medido: el modelo «arregla» algo, reescribe el archivo con el
  // contenido de siempre, el quirófano lo absolvía, la herramienta devolvía
  // ok:true… de un cambio que no cambió nada. El usuario veía «hace el código
  // otra vez y no cambia nada» y el modelo no tenía forma de enterarse.
  // En modo "carga" (subida masiva de archivos) sigue siendo inofensivo.
  if (antesTxt === nuevoTxt) {
    // Matices que NO son la reescritura idéntica que hay que denunciar:
    // si los bytes crudos difieren pero el texto normalizado es el mismo, el
    // cambio es de puros finales de línea (ruido de edición, inofensivo).
    const soloFinalesDeLinea = original !== null && original !== nuevo;
    if (modo === "cirugia" && !soloFinalesDeLinea) {
      return {
        ruta: r,
        existia: true,
        veredicto: "peligroso",
        motivos: [
          "REESCRITURA IDÉNTICA: lo que querías escribir es byte a byte lo que YA está en disco. El cambio no cambió nada y el error del usuario sigue intacto. CAMBIÁ DE MÉTODO: leé el archivo (read_file_range), identificá la línea exacta del problema y aplicá edit_file con un ancla única de 2-4 líneas. Si crees que el archivo ya está bien, decilo con la evidencia en vez de reescribirlo.",
        ],
        cifras,
      };
    }
    return { ruta: r, existia: true, veredicto: "seguro", motivos: [], cifras };
  }

  // 3) Truncado: la causa nº1 de app rota. Nunca pasa.
  if (truncados.length > 0) {
    motivos.push(
      `El contenido trae ${truncados.join(", ")} y el archivo YA existía: eso es una versión a medias, no una mejora.`
    );
  }

  // 4) API pública perdida: el resto del proyecto llama a eso y dejará de compilar.
  if (cifras.publicosPerdidos.length > 0) {
    motivos.push(
      `Desaparecen ${cifras.publicosPerdidos.length} exportación(es) que el resto del proyecto puede estar usando: ${resumirLista(cifras.publicosPerdidos)}.`
    );
  }

  // 5) package.json: perder dependencias o scripts deja la app sin arrancar.
  if (esPackageJson(r)) {
    const pAntes = partesDePackageJson(antesTxt);
    const pDespues = partesDePackageJson(nuevoTxt);
    if (pAntes && pDespues) {
      const depsPerdidas = pAntes.deps.filter((d) => !pDespues.deps.includes(d));
      const scriptsPerdidos = pAntes.scripts.filter((s) => !pDespues.scripts.includes(s));
      if (depsPerdidas.length) motivos.push(`El package.json pierde dependencias: ${depsPerdidas.slice(0, 8).join(", ")}.`);
      if (scriptsPerdidos.length) motivos.push(`El package.json pierde scripts: ${scriptsPerdidos.slice(0, 8).join(", ")}.`);
    }
  }

  // 6) Amputación por tamaño (sólo en modo cirugía y con archivos que lo merecen).
  if (modo === "cirugia" && cifras.utilesAntes >= MIN_LINEAS_PARA_CIRUGIA) {
    if (cifras.perdidaUtil >= UMBRAL_AMPUTACION) {
      motivos.push(
        `Amputación: ${cifras.utilesAntes} → ${cifras.utilesDespues} líneas útiles (${Math.round(
          cifras.perdidaUtil * 100
        )} % menos). Una mejora no encoge el archivo a la mitad.`
      );
    } else if (cifras.perdidaUtil >= UMBRAL_AVISO) {
      motivos.push(
        `AVISO (no bloquea): ${cifras.utilesAntes} → ${cifras.utilesDespues} líneas útiles (${Math.round(
          cifras.perdidaUtil * 100
        )} % menos). Comprueba que no se ha perdido nada que no te pedían tocar.`
      );
    }
  }

  // 7) Rutas donde cualquier recorte duele más: se avisa aunque el tamaño no llegue al umbral.
  if (riesgo && modo === "cirugia" && cifras.utilesDespues < cifras.utilesAntes && cifras.perdidaUtil < UMBRAL_AVISO) {
    motivos.push(`AVISO (no bloquea): ${r} es un archivo de arranque y pierde ${cifras.utilesAntes - cifras.utilesDespues} línea(s) útiles.`);
  }

  const bloqueantes = motivos.filter((m) => !m.startsWith("AVISO"));
  const veredicto: Veredicto = bloqueantes.length > 0 ? "peligroso" : motivos.length > 0 ? "revisar" : "seguro";
  return { ruta: r, existia: true, veredicto, motivos, cifras };
}

/**
 * EL JUEZ PÚBLICO = el interno + la exención del guardián (pedido 4/11, punto 4).
 *
 * Un archivo del propio juez nunca devuelve `peligroso`: devuelve `revisar` con
 * el aviso completo, que es lo que el llamante escribe en el log. Todo lo demás
 * (amputación, superficie pública, package.json, truncado) sigue juzgándose
 * exactamente igual en el resto del proyecto.
 */
export function evaluarCirugia(
  ruta: string,
  original: string | null,
  nuevo: string,
  modo: ModoEvaluacion = "cirugia"
): Diagnostico {
  const d = juzgarCirugiaInterno(ruta, original, nuevo, modo);
  if (d.veredicto !== "peligroso" || !esArchivoGuardian(d.ruta)) return d;
  const queBloqueaban = d.motivos.filter((m) => !m.startsWith("AVISO"));
  const avisos = d.motivos.map((m) => (m.startsWith("AVISO") ? m : `AVISO (exención del guardián): ${m}`));
  return { ...d, veredicto: "revisar", motivos: [avisoGuardian(d.ruta, queBloqueaban), ...avisos] };
}

/**
 * El mensaje COMPLETO que recibe el modelo cuando una escritura se bloquea. Vive
 * acá (y no en `server.ts`) porque el bloqueo lo decide este motor: el monolito
 * pregunta, el motor explica. La salida honesta (`force=true` + motivo) es parte
 * del contrato: quien manda es el usuario.
 */
export function mensajeBloqueoQf(ruta: string, diag: Diagnostico): string {
  const cif = diag.cifras;
  return [
    "🩺 QUIRÓFANO: escritura BLOQUEADA sobre " + ruta + ".",
    "Motivo: ese archivo YA existía y funciona; lo que se iba a escribir lo rompe.",
    ...diag.motivos.map((m) => "  · " + m),
    "Medidas: " + cif.utilesAntes + " → " + cif.utilesDespues + " líneas útiles; exportaciones " + cif.publicosAntes + " → " + cif.publicosDespues + ".",
    "QUÉ HACER (en este orden):",
    '  1. Lee el archivo de verdad: read_file("' + ruta + '") o read_file_range si es largo.',
    "  2. Cambia SÓLO lo que te han pedido, con edit_file y un ancla ÚNICA de 2-4 líneas exactas.",
    '  3. Si de verdad hay que reescribir el archivo entero, repite write_file con force=true y motivo="…". El Quirófano guarda copia y queda en el informe.',
    "No repitas la misma escritura sin cambiar nada: el resultado será el mismo.",
  ].join("\n");
}

/** Por qué el juez dejó pasar esta escritura (para el log: apagado ≠ invisible). */
export function avisoJuezApagado(ruta: string, archivoInterruptor: string): string {
  return (
    "[CerebroNico] 🩺 QUIRÓFANO: palanca de ESCRITURAS apagada — se escribe " + ruta + " sin juzgar. " +
    "No se vigila: amputación, API pública perdida, truncado confesado y package.json recortado. " +
    "Sigue vigilado: sandboxAuthorized, el guardián de sintaxis y la reversión de la tanda. " +
    "Estado: " + archivoInterruptor
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Operación: copia-al-escribir y reversión
// ─────────────────────────────────────────────────────────────────────────────

export interface CirugiaArchivo {
  ruta: string;
  existia: boolean;
  /** Contenido previo (null si el archivo era nuevo o si superó el tope de reversión). */
  original: string | null;
  huellaOriginal: string;
  huellaNueva: string;
  /** true si no se guardó el original por tamaño: la reversión será honesta y lo dirá. */
  noReversible: boolean;
  diagnostico: Diagnostico;
}

export interface Operacion {
  id: string;
  motivo: string;
  inicio: number;
  fin: number | null;
  /** ruta → cirugía registrada (la PRIMERA copia es la buena: es el estado original). */
  archivos: Map<string, CirugiaArchivo>;
  /** imports relativos rotos que ya existían antes de empezar (baseline de la puerta de imports). */
  importsAntes: string[];
  /** Exportaciones por archivo antes de empezar (baseline de la puerta de superficie). */
  superficieAntes: Record<string, string[]>;
  /** Se pone a true si la operación se revirtió. */
  revertida: boolean;
}

let contadorOperaciones = 0;

export function crearOperacion(motivo: string, ahora?: number): Operacion {
  contadorOperaciones += 1;
  const t = typeof ahora === "number" ? ahora : Date.now();
  return {
    id: `op-${t.toString(36)}-${contadorOperaciones}`,
    motivo: String(motivo || "cambio sin motivo declarado"),
    inicio: t,
    fin: null,
    archivos: new Map<string, CirugiaArchivo>(),
    importsAntes: [],
    superficieAntes: {},
    revertida: false,
  };
}

/**
 * Registra una escritura en la operación. La primera copia de cada ruta es la
 * que se guarda: si el modelo toca el mismo archivo tres veces, la reversión
 * devuelve el estado ANTERIOR a la operación, no el paso intermedio.
 */
export function anotarCirugia(
  op: Operacion,
  ruta: string,
  original: string | null,
  nuevo: string,
  diagnostico?: Diagnostico
): CirugiaArchivo {
  const r = normalizarRuta(ruta);
  const diag = diagnostico || evaluarCirugia(r, original, nuevo);
  const previa = op.archivos.get(r);
  if (previa) {
    previa.huellaNueva = huella(nuevo);
    previa.diagnostico = diag;
    return previa;
  }
  const cabeElOriginal = original !== null && original.length <= MAX_BYTES_REVERSION;
  const registro: CirugiaArchivo = {
    ruta: r,
    existia: original !== null,
    original: cabeElOriginal ? original : null,
    huellaOriginal: original === null ? "" : huella(original),
    huellaNueva: huella(nuevo),
    noReversible: original !== null && !cabeElOriginal,
    diagnostico: diag,
  };
  op.archivos.set(r, registro);
  if (original !== null && !(r in op.superficieAntes)) op.superficieAntes[r] = superficiePublica(original);
  return registro;
}

export function cirugiasDe(op: Operacion): CirugiaArchivo[] {
  return [...op.archivos.values()];
}

/** Rutas tocadas, ordenadas: el informe no depende del orden de escritura. */
export function rutasTocadas(op: Operacion): string[] {
  return cirugiasDe(op).map((c) => c.ruta).sort();
}

export function declararImportsAntes(op: Operacion, claves: string[]): void {
  op.importsAntes = [...new Set(claves)].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Puertas: comprobaciones sobre el DISCO (la verdad), no sobre lo prometido
// ─────────────────────────────────────────────────────────────────────────────

export interface Disco {
  existe: (ruta: string) => boolean;
  leer: (ruta: string) => string | null;
  escribir: (ruta: string, contenido: string) => void;
  borrar: (ruta: string) => void;
}

export interface ResultadoPuerta {
  id: string;
  que: string;
  gravedad: Gravedad;
  ok: boolean;
  detalle: string;
  /**
   * v1.0.10 · F1 — archivos concretos que hicieron caer esta puerta.
   * Si una puerta roja nombra sus culpables, la reversión alcanza SOLO a esos
   * archivos; si no los nombra (peso, o un mal global), se revierte la tanda
   * entera como siempre. Un guardián que castiga a los inocentes pierde la
   * confianza del modelo y del usuario: esto existía en el log como
   * «write_file miente» (49 tandas revertidas por 3 líneas de un archivo).
   */
  culpables?: string[];
}

export interface ResultadoCrudo {
  ok: boolean;
  detalle: string;
  culpables?: string[];
}

export interface Puerta {
  id: string;
  que: string;
  gravedad: Gravedad;
  /** Puede ser asíncrona: las puertas pesadas (tipos, humo) lanzan procesos. */
  correr: (op: Operacion, ctx: ContextoPuertas) => ResultadoCrudo | Promise<ResultadoCrudo>;
}

export interface ContextoPuertas {
  disco: Disco;
  /** Archivos del proyecto tal cual están en disco ahora (para la puerta de imports). */
  archivosProyecto?: () => CheckFile[];
}

/** Puerta 1 — sintaxis del contenido que ha quedado REALMENTE en disco. */
export const puertaSintaxis: Puerta = {
  id: "sintaxis",
  que: "el archivo que ha quedado en disco se puede parsear",
  gravedad: "bloqueante",
  correr: (op, ctx) => {
    const rotos: string[] = [];
    const culpables: string[] = [];
    for (const c of cirugiasDe(op)) {
      const enDisco = ctx.disco.existe(c.ruta) ? ctx.disco.leer(c.ruta) : null;
      if (enDisco === null) continue;
      const guard = guardFile(c.ruta, enDisco);
      const bloqueantes = problemasBloqueantes(guard);
      if (bloqueantes.length > 0) {
        rotos.push(`${c.ruta} (línea ${bloqueantes[0].line}: ${bloqueantes[0].message})`);
        culpables.push(c.ruta);
      }
    }
    return { ok: rotos.length === 0, detalle: rotos.length ? `Sintaxis rota en ${rotos.length} archivo(s): ${rotos.join(" · ")}` : "todos los archivos tocados se parsean", culpables };
  },
};

/** Puerta 2 — ninguna exportación que existía ha desaparecido del disco. */
export const puertaSuperficie: Puerta = {
  id: "superficie",
  que: "no desaparece API pública que el proyecto ya usaba",
  gravedad: "bloqueante",
  correr: (op, ctx) => {
    const perdidas: string[] = [];
    const culpables: string[] = [];
    for (const c of cirugiasDe(op)) {
      const antes = c.original !== null ? superficiePublica(c.original) : op.superficieAntes[c.ruta] || [];
      if (antes.length === 0) continue;
      const enDisco = ctx.disco.existe(c.ruta) ? ctx.disco.leer(c.ruta) || "" : "";
      const despues = superficiePublica(enDisco);
      const perdidos = antes.filter((s) => !despues.includes(s));
      if (perdidos.length) {
        perdidas.push(`${c.ruta}: ${resumirLista(perdidos)}`);
        culpables.push(c.ruta);
      }
    }
    return {
      ok: perdidas.length === 0,
      detalle: perdidas.length ? `Se perdió API pública → ${perdidas.join(" · ")}` : "la API pública se conserva",
      culpables,
    };
  },
};

/** Puerta 3 — no aparecen imports relativos rotos que antes no estuvieran rotos. */
export const puertaImports: Puerta = {
  id: "imports",
  que: "no quedan imports relativos apuntando a archivos que no existen",
  gravedad: "bloqueante",
  correr: (op, ctx) => {
    if (!ctx.archivosProyecto) return { ok: true, detalle: "no aplica: sin inventario del proyecto" };
    let faltantes: string[] = [];
    try {
      faltantes = findMissingImports(ctx.archivosProyecto()).map((m) => `${m.from}|${m.specifier}`);
    } catch {
      return { ok: true, detalle: "no aplica: el inventario del proyecto no se pudo leer" };
    }
    const antes = new Set(op.importsAntes);
    const nuevos = faltantes.filter((f) => !antes.has(f));
    const culpables = [...new Set(nuevos.map((f) => String(f).split("|")[0]))];
    return {
      ok: nuevos.length === 0,
      detalle: nuevos.length ? `Imports relativos rotos NUEVOS (${nuevos.length}): ${nuevos.slice(0, 6).join(" · ")}` : "ningún import relativo nuevo sin resolver",
      culpables,
    };
  },
};

/** Puerta 4 — balance global: el proyecto no puede encogerse sin motivo declarado. */
export const puertaPeso: Puerta = {
  id: "peso",
  que: "el conjunto de archivos tocados no se ha quedado a la mitad",
  gravedad: "bloqueante",
  correr: (op) => {
    let utilesAntes = 0;
    let utilesDespues = 0;
    for (const c of cirugiasDe(op)) {
      utilesAntes += c.diagnostico.cifras.utilesAntes;
      utilesDespues += c.diagnostico.cifras.utilesDespues;
    }
    if (utilesAntes < MIN_LINEAS_PARA_CIRUGIA) return { ok: true, detalle: "no aplica: cambio por debajo del mínimo medible" };
    const perdida = (utilesAntes - utilesDespues) / utilesAntes;
    if (perdida >= UMBRAL_AMPUTACION) {
      return {
        ok: false,
        detalle: `El conjunto pierde ${Math.round(perdida * 100)} % de líneas útiles (${utilesAntes} → ${utilesDespues}).`,
      };
    }
    return { ok: true, detalle: `Peso conservado: ${utilesAntes} → ${utilesDespues} líneas útiles` };
  },
};

/** Las puertas baratas y deterministas: corren siempre, en milisegundos. */
export function puertasEstandar(): Puerta[] {
  return [puertaSintaxis, puertaSuperficie, puertaImports, puertaPeso];
}

/**
 * Puerta PESADA 1 — tipos. Se le inyecta el ejecutor (el servidor usa su
 * `runCommand`, así que aquí no hay dependencias). Sólo cuenta como rojo un
 * error de TypeScript EN UN ARCHIVO QUE ESTA OPERACIÓN TOCÓ: el proyecto puede
 * arrastrar errores viejos de sitios que nadie ha tocado, y culpar a este
 * cambio de ellos sería exactamente el falso positivo que hace inútil un
 * guardián. Opt-in (es la puerta cara: `tsc` tarda).
 */
export function puertaTipos(
  correr: (comando: string) => ResultadoCrudo | Promise<ResultadoCrudo>,
  topeLineas = 6
): Puerta {
  return {
    id: "tipos",
    que: "el comprobador de tipos no se queja de los archivos tocados",
    gravedad: "bloqueante",
    async correr(op) {
      const tocadas = new Set(rutasTocadas(op));
      const r = await correr("npx tsc --noEmit");
      const culpables = String(r.detalle || "")
        .split("\n")
        .filter((l) => /error TS\d+/.test(l))
        .filter((l) => [...tocadas].some((t) => l.includes(t)))
        .slice(0, topeLineas);
      if (culpables.length > 0) {
        const rutasCulpables = [...tocadas].filter((t) => culpables.some((l) => l.includes(t)));
        return { ok: false, detalle: `Errores de tipos en archivos tocados:\n      ${culpables.join("\n      ")}`, culpables: rutasCulpables };
      }
      return { ok: true, detalle: "sin errores de tipos en los archivos tocados" };
    },
  };
}

/**
 * Puerta PESADA 2 — humo: ¿el servidor de vista previa sigue respondiendo?
 * Es la prueba que de verdad importa («¿arranca la app?»), y por eso es opt-in:
 * exige que el sandbox esté levantado. Un 5xx o un cuerpo vacío es rojo.
 */
export function puertaHumo(
  sondear: () => { status: number; cuerpo?: string } | Promise<{ status: number; cuerpo?: string }>
): Puerta {
  return {
    id: "humo",
    que: "la vista previa sigue respondiendo después del cambio",
    gravedad: "bloqueante",
    async correr() {
      try {
        const r = await sondear();
        const status = Number(r?.status || 0);
        const cuerpo = String(r?.cuerpo || "");
        if (status >= 200 && status < 400 && cuerpo.length > 0) {
          return { ok: true, detalle: `la vista previa responde HTTP ${status} (${cuerpo.length} bytes)` };
        }
        return { ok: false, detalle: `la vista previa NO responde bien: HTTP ${status || "sin respuesta"}, ${cuerpo.length} bytes` };
      } catch (err: any) {
        return { ok: false, detalle: `la vista previa no responde: ${err?.message || err}` };
      }
    },
  };
}

/**
 * v1.23.0 · Puerta PESADA 3 — COMPILACIÓN. «Nunca compila» dejó de ser una
 * queja el día en que el acta no puede decir «listo» sin que alguien haya
 * compilado de verdad. A diferencia de la puerta de tipos (opt-in por
 * variable de entorno que nadie conocía), esta puerta se enciende POR DEFECTO
 * desde el servidor con el comando build INFERIDO del package.json del
 * proyecto. Regla de culpa: un error solo bloquea si menciona un archivo que
 * ESTA tanda tocó — el proyecto puede arrastrar daños viejos y castigar por
 * ellos sería el falso positivo que mata la confianza en el guardián. Si el
 * build falla sin señalar los archivos tocados, la puerta queda en verde con
 * el detalle honesto a la vista (el modelo lo lee en el acta).
 */
export function puertaCompilacion(
  correr: (comando: string) => ResultadoCrudo | Promise<ResultadoCrudo>,
  comando: string,
  topeLineas = 8
): Puerta {
  return {
    id: "compilacion",
    que: `el proyecto compila con «${comando}»`,
    gravedad: "bloqueante",
    async correr(op) {
      const tocadas = rutasTocadas(op);
      if (!tocadas.some((r) => /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|py)$/i.test(r))) {
        return { ok: true, detalle: "no aplica: la tanda no tocó código" };
      }
      const r = await correr(comando);
      const salida = String(r?.detalle || "");
      const exitOk = r?.ok !== false && !/Command failed|exit code [1-9]|\[exit \d+\]/i.test(salida);
      const lineasError = salida
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /error TS\d+|SyntaxError|ParseError|Unexpected|expected .* but|Build failed|ERROR in|error:|\berror\b.*\.(ts|tsx|js|jsx|py|html|json)/i.test(l));
      const culpables = [...new Set(lineasError.filter((l) => tocadas.some((t) => l.includes(t))))].slice(0, topeLineas);
      if (culpables.length > 0) {
        const rutasCulpables = tocadas.filter((t) => culpables.some((l) => l.includes(t)));
        return { ok: false, detalle: `«${comando}» falla con errores EN ARCHIVOS TOCADOS:\n      ${culpables.join("\n      ")}`, culpables: rutasCulpables };
      }
      if (!exitOk) {
        const cola = salida.split("\n").filter(Boolean).slice(-4).join(" ⏎ ").slice(0, 400);
        return {
          ok: true,
          detalle: `«${comando}» terminó mal pero ningún error nombra los archivos de esta tanda (daño previo o externo). Último suspiro: ${cola || "(sin salida)"}`,
        };
      }
      return { ok: true, detalle: `«${comando}» compiló verde` };
    },
  };
}

/**
 * v1.23.0 · Puerta PESADA 4 — SEGURIDAD (cerradura). «Entrega trabajos con
 * más de 10 vulnerabilidades»: la puerta escanea los archivos TOCADOS con las
 * 19 reglas de `cerradura.ts`. Las CRÍTICAS bloquean (igual que una puerta
 * roja); las altas y medias se listan en el detalle para el acta.
 * `analizar` entra inyectado para que este módulo siga sin dependencias de fs.
 */
export function puertaSeguridad(
  analizar: (archivos: Array<{ path: string; content: string }>) => Array<{
    regla: string;
    severidad: string;
    archivo: string;
    linea: number;
    titulo: string;
    como: string;
  }>
): Puerta {
  return {
    id: "seguridad",
    que: "los archivos tocados no introducen vulnerabilidades críticas (cerradura, 19 reglas)",
    gravedad: "bloqueante",
    correr(op, ctx) {
      const lote: Array<{ path: string; content: string }> = [];
      for (const c of cirugiasDe(op)) {
        const enDisco = ctx.disco.existe(c.ruta) ? ctx.disco.leer(c.ruta) : null;
        if (typeof enDisco === "string") lote.push({ path: c.ruta, content: enDisco });
      }
      const hallazgos = analizar(lote);
      const criticas = hallazgos.filter((h) => h.severidad === "critica");
      const altas = hallazgos.filter((h) => h.severidad === "alta");
      if (criticas.length > 0) {
        const detalle = criticas
          .slice(0, 10)
          .map((h) => `${h.archivo}:${h.linea} [${h.regla}] ${h.titulo} → ${h.como}`)
          .join("\n      ");
        return {
          ok: false,
          detalle: `CERRADURA encontró ${criticas.length} vulnerabilidad(es) CRÍTICA(S):\n      ${detalle}${criticas.length > 10 ? `\n      … y ${criticas.length - 10} más` : ""}`,
          // F2 · la responsabilidad es del archivo con la vulnerabilidad, no de
          // la tanda: si el lote traía 12 .md y un main.js, solo main.js cae.
          culpables: [...new Set(criticas.map((h) => h.archivo))],
        };
      }
      return {
        ok: true,
        detalle: altas.length
          ? `sin críticas; ${altas.length} alerta(s) de severidad alta quedan en el acta`
          : "sin hallazgos críticos ni altos en los archivos tocados",
      };
    },
  };
}

/** Las puertas pesadas disponibles, activables por quien las conoce. */
export function puertasPesadas(runners: {
  correrComando?: (comando: string) => ResultadoCrudo | Promise<ResultadoCrudo>;
  sondearPreview?: () => { status: number; cuerpo?: string } | Promise<{ status: number; cuerpo?: string }>;
  /** Comando de build del proyecto (inferido del package.json). Sin él, no corre. */
  comandoBuild?: string;
  /** Escáner de seguridad inyectado (cerradura.analizarProyecto). */
  analizarSeguridad?: (archivos: Array<{ path: string; content: string }>) => Array<{
    regla: string; severidad: string; archivo: string; linea: number; titulo: string; como: string;
  }>;
}): Puerta[] {
  const out: Puerta[] = [];
  if (runners.correrComando) out.push(puertaTipos(runners.correrComando));
  if (runners.sondearPreview) out.push(puertaHumo(runners.sondearPreview));
  if (runners.correrComando && runners.comandoBuild) out.push(puertaCompilacion(runners.correrComando, runners.comandoBuild));
  if (runners.analizarSeguridad) out.push(puertaSeguridad(runners.analizarSeguridad));
  return out;
}

export async function correrPuertas(op: Operacion, ctx: ContextoPuertas, puertas: Puerta[] = puertasEstandar()): Promise<ResultadoPuerta[]> {
  const out: ResultadoPuerta[] = [];
  for (const p of puertas) {
    try {
      const r = await p.correr(op, ctx);
      out.push({ id: p.id, que: p.que, gravedad: p.gravedad, ok: !!r.ok, detalle: r.detalle, culpables: r.culpables });
    } catch (err: any) {
      out.push({ id: p.id, que: p.que, gravedad: p.gravedad, ok: true, detalle: `no aplica: ${err?.message || err}` });
    }
  }
  return out;
}

export function hayRojas(resultados: ResultadoPuerta[]): ResultadoPuerta[] {
  return resultados.filter((r) => !r.ok && r.gravedad === "bloqueante");
}

// ─────────────────────────────────────────────────────────────────────────────
// Reversión
// ─────────────────────────────────────────────────────────────────────────────

export function planDeReversion(op: Operacion): { restaurar: Array<{ ruta: string; contenido: string }>; retirar: string[]; noReversibles: string[] } {
  const restaurar: Array<{ ruta: string; contenido: string }> = [];
  const retirar: string[] = [];
  const noReversibles: string[] = [];
  for (const c of cirugiasDe(op)) {
    if (c.existia) {
      if (c.original !== null) restaurar.push({ ruta: c.ruta, contenido: c.original });
      else noReversibles.push(c.ruta);
    } else {
      retirar.push(c.ruta);
    }
  }
  return { restaurar, retirar, noReversibles };
}

/**
 * v1.0.10 · F1 — `soloRutas` limita la reversión a los archivos culpables.
 * Sin el argumento el comportamiento es idéntico al histórico: se revierte todo.
 * `revertir()` sigue siendo el mismo bisturí; solo afina el puntero.
 */
export function revertir(op: Operacion, disco: Disco, soloRutas?: string[]): { restaurados: string[]; retirados: string[]; fallos: string[]; noReversibles: string[] } {
  const plan = planDeReversion(op);
  if (soloRutas) {
    const blanco = new Set(soloRutas.map(normalizarRuta));
    plan.restaurar = plan.restaurar.filter((r) => blanco.has(normalizarRuta(r.ruta)));
    plan.retirar = plan.retirar.filter((r) => blanco.has(normalizarRuta(r)));
    plan.noReversibles = plan.noReversibles.filter((r) => blanco.has(normalizarRuta(r)));
  }
  const restaurados: string[] = [];
  const retirados: string[] = [];
  const fallos: string[] = [];
  for (const r of plan.restaurar) {
    try {
      disco.escribir(r.ruta, r.contenido);
      restaurados.push(r.ruta);
    } catch (err: any) {
      fallos.push(`${r.ruta}: ${err?.message || err}`);
    }
  }
  for (const ruta of plan.retirar) {
    try {
      disco.borrar(ruta);
      retirados.push(ruta);
    } catch {
      /* un archivo nuevo que no se puede retirar es ruido, no catástrofe */
    }
  }
  op.revertida = true;
  return { restaurados, retirados, fallos, noReversibles: plan.noReversibles };
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialización (para que «Deshacer» siga funcionando tras reiniciar el IDE)
// ─────────────────────────────────────────────────────────────────────────────

export function serializarOperacion(op: Operacion): string {
  return JSON.stringify(
    {
      version: VERSION_QUIROFANO,
      id: op.id,
      motivo: op.motivo,
      inicio: op.inicio,
      fin: op.fin,
      revertida: op.revertida,
      importsAntes: op.importsAntes,
      archivos: cirugiasDe(op).map((c) => ({
        ruta: c.ruta,
        existia: c.existia,
        original: c.original,
        noReversible: c.noReversible,
        huellaOriginal: c.huellaOriginal,
        huellaNueva: c.huellaNueva,
        veredicto: c.diagnostico.veredicto,
      })),
    },
    null,
    2
  );
}

export function deserializarOperacion(texto: string): Operacion | null {
  try {
    const j = JSON.parse(texto);
    if (!j || !Array.isArray(j.archivos)) return null;
    const op = crearOperacion(String(j.motivo || "operación recuperada"), Number(j.inicio) || Date.now());
    op.id = String(j.id || op.id);
    op.fin = typeof j.fin === "number" ? j.fin : null;
    op.revertida = !!j.revertida;
    op.importsAntes = Array.isArray(j.importsAntes) ? j.importsAntes.map(String) : [];
    for (const a of j.archivos) {
      const original = typeof a?.original === "string" ? a.original : null;
      const registro: CirugiaArchivo = {
        ruta: normalizarRuta(a?.ruta || ""),
        existia: !!a?.existia,
        original,
        huellaOriginal: String(a?.huellaOriginal || ""),
        huellaNueva: String(a?.huellaNueva || ""),
        noReversible: !!a?.noReversible,
        diagnostico: {
          ruta: normalizarRuta(a?.ruta || ""),
          existia: !!a?.existia,
          veredicto: (a?.veredicto as Veredicto) || "revisar",
          motivos: [],
          cifras: cifrasDe(original, ""),
        },
      };
      op.archivos.set(registro.ruta, registro);
    }
    return op;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Informe: lo que se le devuelve al modelo y lo que se le enseña al usuario
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesCierre {
  /** Puertas extra (tipos, build, humo). Se inyectan desde el servidor. */
  puertas?: Puerta[];
  /** true (por defecto): si una puerta bloqueante cae, se revierte la operación. */
  revertirSiFalla?: boolean;
  /** Inventario del proyecto para la puerta de imports. */
  archivosProyecto?: () => CheckFile[];
}

export interface VeredictoOperacion {
  ok: boolean;
  revertido: boolean;
  motivo: string;
  puertas: ResultadoPuerta[];
  informe: string;
  /**
   * v1.0.10 · F1 — verdad por archivo. `revertidos`: lo que el guardián deshizo.
   * `conservados`: lo que quedó en disco pese a la reversión (cómplices
   * inocentes). Sin estos dos campos, `write_file` reportaba «éxito» sobre
   * archivos que ya no existían: el modelo seguía editando fantasmas.
   */
  revertidos?: string[];
  conservados?: string[];
}

export function informeOperacion(op: Operacion, puertas: ResultadoPuerta[], revertido: boolean, detalleReversion?: string): string {
  const lineas: string[] = [];
  const cirugias = cirugiasDe(op);
  const titulo = revertido ? "⛔ QUIRÓFANO — CAMBIO REVERTIDO" : "✅ QUIRÓFANO — cambio verificado";
  lineas.push(`${titulo} (${op.motivo})`);
  lineas.push(`Archivos tocados: ${cirugias.length}`);
  for (const c of cirugias) {
    const cif = c.diagnostico.cifras;
    lineas.push(
      `  · ${c.ruta}: ${c.existia ? `${cif.utilesAntes} → ${cif.utilesDespues} líneas útiles` : "archivo nuevo"}${
        cif.publicosPerdidos.length ? ` · API perdida: ${resumirLista(cif.publicosPerdidos)}` : ""
      }`
    );
    for (const m of c.diagnostico.motivos) lineas.push(`      - ${m}`);
  }
  lineas.push("Puertas:");
  for (const p of puertas) {
    lineas.push(`  ${p.ok ? "OK  " : "ROJO"} [${p.id}] ${p.que} — ${p.detalle}`);
  }
  if (revertido) {
    lineas.push(detalleReversion || "Se restauraron los archivos al estado anterior a la operación.");
    lineas.push(
      "QUÉ HACER AHORA: no repitas la misma escritura. Usa edit_file con anclas ÚNICAS (2-4 líneas exactas de contexto) y cambia SÓLO lo pedido. Si necesitas reescribir un archivo entero, primero LÉELO (read_file) y conserva todas sus exportaciones."
    );
  }
  return lineas.join("\n");
}

/**
 * Cierra la operación: corre las puertas sobre el disco, revierte si hay rojas
 * y devuelve el veredicto con el informe.
 */
export async function cerrarOperacion(
  op: Operacion,
  disco: Disco,
  opciones: OpcionesCierre = {}
): Promise<VeredictoOperacion> {
  const puertas = await correrPuertas(
    op,
    { disco, archivosProyecto: opciones.archivosProyecto },
    opciones.puertas || puertasEstandar()
  );
  const rojas = hayRojas(puertas);
  const autoRevertir = opciones.revertirSiFalla !== false;
  let revertido = false;
  let detalleReversion: string | undefined;
  let revertidos: string[] = [];
  let conservados: string[] = [];

  // v1.0.10 · F1 — REVERSIÓN POR ARCHIVO. Cada puerta roja que nombra
  // culpables limita el castigo a sus culpables. Una puerta sin culpables
  // (peso, o un fallo global) sigue revirtiendo la tanda: hay daños que sí
  // son de todos. Y el veredicto dice, archivo por archivo, qué se fue y qué
  // se quedó: el modelo deja de adivinar y el usuario deja de pelearse con
  // un `main.js` que el navegador nunca llegó a ejecutar.
  if (rojas.length > 0 && autoRevertir) {
    const puertasCiegas = rojas.some((r) => !r.culpables || r.culpables.length === 0);
    const culpables = puertasCiegas ? undefined : [...new Set(rojas.flatMap((r) => r.culpables || []))];
    const res = revertir(op, disco, culpables);
    revertido = true;
    revertidos = [...res.restaurados, ...res.retirados];
    const todas = cirugiasDe(op).map((c) => c.ruta);
    conservados = puertasCiegas ? [] : todas.filter((r) => !revertidos.includes(r) && !revertidos.includes(normalizarRuta(r)));
    detalleReversion = `${culpables ? `Reversión QUIRÚRGICA (solo los archivos culpables): se restauraron` : `Reversión de la tanda completa: se restauraron`} ${res.restaurados.length} archivo(s)${
      res.retirados.length ? ` y se retiraron ${res.retirados.length} nuevo(s)` : ""
    }.${res.noReversibles.length ? ` OJO: no había copia de ${res.noReversibles.join(", ")} (superaban el tope de reversión).` : ""}${
      res.fallos.length ? ` Fallos al restaurar: ${res.fallos.join(" · ")}` : ""
    }${conservados.length ? ` SE CONSERVAN (${conservados.length}): ${conservados.join(", ")}` : ""}`;
  }
  op.fin = Date.now();
  const ok = rojas.length === 0;
  return {
    ok,
    revertido,
    motivo: rojas.length ? rojas.map((r) => `${r.id}: ${r.detalle}`).join(" · ") : "todas las puertas en verde",
    puertas,
    informe: informeOperacion(op, puertas, revertido, detalleReversion),
    revertidos,
    conservados,
  };
}

/** Texto corto para el log del IDE (una línea, sin ruido). */
export function lineaQuirofano(v: VeredictoOperacion): string {
  const tocados = v.puertas.length;
  if (v.revertido) return `[CerebroNico] 🩺 QUIRÓFANO: cambio REVERTIDO — ${v.motivo}`;
  if (!v.ok) return `[CerebroNico] 🩺 QUIRÓFANO: ${v.motivo}`;
  return `[CerebroNico] 🩺 QUIRÓFANO: ${tocados} puerta(s) en verde — el cambio se queda.`;
}
