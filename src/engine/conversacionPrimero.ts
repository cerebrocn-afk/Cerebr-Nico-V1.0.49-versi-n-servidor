/**
 * conversacionPrimero.ts — CONVERSACIÓN PRIMERO, CÓDIGO AL FONDO, SIN ROMPER (v1.29.0)
 * ====================================================================================
 * El usuario lo pidió con estas palabras: *«el modelo siempre se equivoca cuando
 * intenta hacer algo, si le doy algo terminado para modificar lo termina
 * rompiendo, me escribe mucho código y poca conversación, el código que vaya en
 * segundo plano al editor y que se comunique con el usuario en español»*.
 *
 * Son TRES defectos distintos y esta capa los convierte en MECÁNICA, no en fe
 * (una regla retórica en el prompt la lee un modelo pequeño y la ignora — misma
 * lección que §9.C de cerebro.md). Todo aquí es lógica pura: recibe texto,
 * devuelve veredictos y directivas. No toca red, ni disco, ni el DOM. Por eso se
 * prueba entera (tests/conversacionPrimero.test.ts).
 *
 *   1. ESPAÑOL — el chat se comunica en español; si la prosa se va al inglés se
 *      detecta y se corrige la directiva del turno.
 *   2. CÓDIGO AL FONDO — el código NO inunda el chat: los bloques de archivo
 *      viajan al editor en segundo plano y el chat conserva la conversación
 *      (qué se hizo y por qué), no un muro de código.
 *   3. PRESERVACIÓN AL MODIFICAR — al cambiar algo que YA funciona, se audita
 *      que la modificación conserve lo que no se pidió tocar (exportaciones,
 *      funciones, volumen de líneas) y que no deje marcadores perezosos.
 *
 * Complementa —no duplica— al Quirófano (quirofano.ts): el Quirófano BLOQUEA la
 * escritura destructiva en el motor; esta capa es la CONCIENCIA del chat, que
 * decide antes de escribir y explica en español. Una verdad por lado.
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. ESPAÑOL — el chat habla en español
// ════════════════════════════════════════════════════════════════════════════

/**
 * Palabras funcionales que delatan a cada idioma. No es un detector de idioma de
 * biblioteca (eso arrastraría dependencias en runtime); es una heurística de
 * palabras-ancla suficiente para cazar el defecto real: que el modelo responda
 * en inglés cuando el usuario escribe en español.
 */
const ANCLAS_INGLES = [
  "the", "and", "is", "are", "you", "this", "that", "with", "for", "your",
  "here", "file", "code", "will", "have", "should", "please", "need", "can",
  "function", "return", "let", "me", "now", "done", "created", "added",
];
const ANCLAS_ESPANOL = [
  "el", "la", "los", "las", "que", "con", "para", "por", "una", "del",
  "código", "archivo", "aquí", "está", "esto", "hice", "cambié", "añadí",
  "función", "listo", "ahora", "tenés", "tienes", "porque", "así",
];

function contarAnclas(prosa: string, anclas: string[]): number {
  const texto = " " + prosa.toLowerCase() + " ";
  let n = 0;
  for (const a of anclas) {
    // \b no reconoce acentos de forma fiable en todos los runtimes: se acota con
    // separadores explícitos (espacios y puntuación) para contar palabras enteras.
    const re = new RegExp("(^|[^a-záéíóúñü])" + a + "([^a-záéíóúñü]|$)", "gi");
    const m = texto.match(re);
    if (m) n += m.length;
  }
  return n;
}

/**
 * ¿La prosa (SIN los bloques de código) parece NO estar en español? Se compara
 * el peso de anclas inglesas contra españolas. Umbral honesto: hace falta más de
 * un ancla inglesa y que superen a las españolas — una palabra suelta en inglés
 * (un nombre de API, «commit») no dispara un falso positivo.
 */
export function pareceNoEspanol(prosa: string): boolean {
  const limpio = (prosa || "").trim();
  if (limpio.length < 12) return false; // muy corto para juzgar
  const ing = contarAnclas(limpio, ANCLAS_INGLES);
  const esp = contarAnclas(limpio, ANCLAS_ESPANOL);
  return ing >= 2 && ing > esp;
}

/** La directiva de idioma del turno. Es afirmativa y sin excepciones. */
export function directrizIdioma(): string {
  return [
    "[IDIOMA — ESPAÑOL SIEMPRE]",
    "- Comunícate con el usuario en ESPAÑOL: la explicación, los avisos, los mensajes de estado y los comentarios que el usuario lea.",
    "- El código conserva sus palabras técnicas (nombres de API, sintaxis), pero lo que rodea al código —lo que le dices al usuario— va en español.",
    "- Si te descubres escribiendo la respuesta en inglés, reescríbela en español antes de enviarla.",
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// 2. CÓDIGO AL FONDO — el chat conversa, el código va al editor
// ════════════════════════════════════════════════════════════════════════════

export interface BloqueCodigo {
  /** Lenguaje declarado en la valla (```ts, ```python…). "" si no hay. */
  lenguaje: string;
  /** Ruta del atributo file="…" si existe; null si es un bloque suelto. */
  ruta: string | null;
  /** El contenido íntegro entre las vallas. */
  contenido: string;
  /** true si la valla trae file="ruta": es un ARCHIVO, va al editor. */
  esArchivo: boolean;
  /** Nº de líneas del contenido (para medir el volumen). */
  lineas: number;
}

// Valla de apertura: ```lenguaje  o  ```lenguaje file="ruta/x.ext"
const RE_VALLA = /```([a-zA-Z0-9_+-]*)([^\n]*)\n([\s\S]*?)```/g;

/**
 * Separa una respuesta del modelo en: los BLOQUES de código y la PROSA (el texto
 * que queda al quitar los bloques). No pierde nada: lo que no es valla es prosa.
 */
export function extraerBloques(respuesta: string): { bloques: BloqueCodigo[]; prosa: string } {
  const texto = respuesta || "";
  const bloques: BloqueCodigo[] = [];
  let prosa = "";
  let ultimo = 0;
  RE_VALLA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_VALLA.exec(texto)) !== null) {
    prosa += texto.slice(ultimo, m.index);
    ultimo = m.index + m[0].length;
    const lenguaje = (m[1] || "").trim();
    const atributos = m[2] || "";
    const contenido = m[3] || "";
    const rutaMatch = atributos.match(/file="([^"]+)"/);
    const ruta = rutaMatch ? rutaMatch[1] : null;
    bloques.push({
      lenguaje,
      ruta,
      contenido,
      esArchivo: ruta !== null,
      lineas: contenido.replace(/\n$/, "").split("\n").length,
    });
  }
  prosa += texto.slice(ultimo);
  return { bloques, prosa: prosa.trim() };
}

export interface MedidaCharla {
  /** Caracteres de prosa (sin bloques). */
  charsProsa: number;
  /** Caracteres de código (suma de contenidos de los bloques). */
  charsCodigo: number;
  /** codigo / (codigo + prosa). 0 = todo prosa, 1 = todo código. */
  ratioCodigo: number;
  /** Cuántos bloques son ARCHIVOS (file="…"). */
  bloquesArchivo: number;
  /** Líneas de código sumadas. */
  lineasCodigo: number;
}

/** Mide cuánto de la respuesta es código y cuánto es conversación. */
export function medirCharla(respuesta: string): MedidaCharla {
  const { bloques, prosa } = extraerBloques(respuesta);
  const charsCodigo = bloques.reduce((s, b) => s + b.contenido.length, 0);
  const charsProsa = prosa.length;
  const total = charsCodigo + charsProsa;
  return {
    charsProsa,
    charsCodigo,
    ratioCodigo: total === 0 ? 0 : charsCodigo / total,
    bloquesArchivo: bloques.filter((b) => b.esArchivo).length,
    lineasCodigo: bloques.reduce((s, b) => s + b.lineas, 0),
  };
}

/**
 * El veredicto de la charla:
 *   · "equilibrada"      — hay conversación suficiente para lo que se entrega.
 *   · "codigo-al-fondo"  — el código domina el chat: los archivos deben ir al
 *                          editor (segundo plano) y el chat quedarse con la
 *                          explicación, no con el muro de código.
 *   · "muda"             — hay código pero casi ninguna prosa: el chat no explica
 *                          nada. El defecto «mucho código y poca conversación» en
 *                          su forma extrema.
 */
export type VeredictoCharla = "equilibrada" | "codigo-al-fondo" | "muda";

export interface DictamenCharla {
  veredicto: VeredictoCharla;
  medida: MedidaCharla;
  /** Explicación en una frase, en español. */
  motivo: string;
  /** La directiva concreta para el siguiente intento (vacía si ya está bien). */
  directiva: string;
}

// Umbrales. Son fijos y están aquí a la vista: un modelo pequeño necesita
// límites deterministas, no «criterio». Se calibran contra el defecto real.
//
// v1.30.0 — AJUSTE DE SENSIBILIDAD (petición «ajustar umbral de detección de
// código»). El defecto medido en sesión fue «me escribe mucho código y poca
// conversación»: con el ratio en 0,72 y 24 líneas, respuestas claramente
// dominadas por código pasaban como «equilibradas». Se BAJAN los dos umbrales
// que gobiernan «código al fondo» para detectarlo antes; la prosa mínima que
// define «muda» sube un poco para exigir explicación de verdad. Los tres son
// ajustables por llamada (parámetro `umbrales` de dictaminarCharla) sin tocar
// el punto de uso: cero regulador mudo.
export const UMBRAL_PROSA_MINIMA = 48;   // caracteres de prosa por debajo de esto = «muda» si hay código
export const UMBRAL_RATIO_CODIGO = 0.6;  // por encima de esto el código domina el chat
export const UMBRAL_LINEAS_CHAT = 16;    // más líneas de código que esto NO deberían vivir en el chat

/** Umbrales efectivos de un dictamen; se pueden sobreescribir por llamada. */
export interface UmbralesCharla {
  prosaMinima: number;
  ratioCodigo: number;
  lineasChat: number;
}

/** Los umbrales por defecto, en un solo objeto (fuente única). */
export const UMBRALES_POR_DEFECTO: UmbralesCharla = {
  prosaMinima: UMBRAL_PROSA_MINIMA,
  ratioCodigo: UMBRAL_RATIO_CODIGO,
  lineasChat: UMBRAL_LINEAS_CHAT,
};

/**
 * Dictamina si la respuesta conversa lo suficiente o si el código debe irse al
 * fondo. Determinista: mismos textos (y mismos umbrales) → mismo veredicto.
 * `umbrales` permite endurecer o relajar la detección sin duplicar la lógica.
 */
export function dictaminarCharla(
  respuesta: string,
  umbrales: Partial<UmbralesCharla> = {}
): DictamenCharla {
  const u: UmbralesCharla = { ...UMBRALES_POR_DEFECTO, ...umbrales };
  const medida = medirCharla(respuesta);
  const hayCodigo = medida.charsCodigo > 0 || medida.bloquesArchivo > 0;

  if (!hayCodigo) {
    return { veredicto: "equilibrada", medida, motivo: "No hay código: es conversación.", directiva: "" };
  }

  // MUDA: hay código y casi nada de prosa — el chat no explica.
  if (medida.charsProsa < u.prosaMinima) {
    return {
      veredicto: "muda",
      medida,
      motivo: `El chat entrega código (${medida.lineasCodigo} líneas) sin explicarlo (${medida.charsProsa} caracteres de prosa).`,
      directiva:
        "[CÓDIGO AL FONDO] Envía los archivos al editor con las herramientas y en el chat escribe SOLO la conversación: qué hiciste, por qué, y cómo comprobarlo. No pegues el código entero en el chat.",
    };
  }

  // CÓDIGO AL FONDO: el código domina, o son demasiadas líneas para el chat.
  if (medida.ratioCodigo > u.ratioCodigo || medida.lineasCodigo > u.lineasChat) {
    return {
      veredicto: "codigo-al-fondo",
      medida,
      motivo: `El código ocupa el ${Math.round(medida.ratioCodigo * 100)}% del mensaje (${medida.lineasCodigo} líneas): domina la conversación.`,
      directiva:
        "[CÓDIGO AL FONDO] Escribe los archivos en el editor con write_file/edit_file (segundo plano) y deja en el chat una explicación breve en español con la lista de archivos tocados. El código se ve en el editor, no en el chat.",
    };
  }

  return { veredicto: "equilibrada", medida, motivo: "Hay conversación suficiente para el código entregado.", directiva: "" };
}

export interface ChatConCodigoAlFondo {
  /** Lo que se muestra en el chat: prosa + una línea por archivo (referencia, no código). */
  chat: string;
  /** Los archivos que van al editor en segundo plano. */
  archivos: BloqueCodigo[];
  /** Bloques de código SUELTOS (sin ruta): se quedan en el chat, son ejemplo, no entrega. */
  fragmentos: BloqueCodigo[];
}

/**
 * Realiza el «código al fondo» de forma mecánica: separa los bloques-archivo
 * (van al editor) de la prosa (se queda en el chat) y compone un chat
 * conversacional con UNA línea de referencia por archivo, en español. Los
 * bloques sueltos (sin file="…") se consideran fragmentos de ejemplo y NO se
 * expulsan del chat: no son una entrega, son parte de la explicación.
 */
export function componerChatConCodigoAlFondo(respuesta: string): ChatConCodigoAlFondo {
  const { bloques, prosa } = extraerBloques(respuesta);
  const archivos = bloques.filter((b) => b.esArchivo);
  const fragmentos = bloques.filter((b) => !b.esArchivo);

  const lineas: string[] = [];
  if (prosa) lineas.push(prosa);
  if (archivos.length > 0) {
    lineas.push(
      archivos.length === 1
        ? "Escribí este archivo en el editor:"
        : `Escribí estos ${archivos.length} archivos en el editor:`
    );
    for (const a of archivos) {
      lineas.push(`- \`${a.ruta}\` (${a.lineas} líneas)`);
    }
  }
  return { chat: lineas.join("\n").trim(), archivos, fragmentos };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. PRESERVACIÓN AL MODIFICAR — no rompas lo que ya funciona
// ════════════════════════════════════════════════════════════════════════════

export type SeveridadHallazgo = "critico" | "aviso";

export interface HallazgoPreservacion {
  tipo:
    | "exportacion-perdida"
    | "funcion-perdida"
    | "encogimiento"
    | "marcador-perezoso"
    | "vaciado";
  detalle: string;
  severidad: SeveridadHallazgo;
}

export interface AuditoriaPreservacion {
  /** true si la modificación conserva lo que ya funcionaba (sin hallazgos críticos). */
  seguro: boolean;
  hallazgos: HallazgoPreservacion[];
  /** 0..100: 100 = preserva todo; baja con cada hallazgo. */
  puntaje: number;
  /** Qué hacer, en español, si no es seguro. Vacía si lo es. */
  directiva: string;
}

/** Fracción de líneas útiles que se puede perder antes de sospechar amputación. */
export const UMBRAL_ENCOGIMIENTO = 0.35;

// Marcadores de «código perezoso»: el modelo dejó un hueco en vez del código real.
const RE_PEREZOSOS: { re: RegExp; nombre: string }[] = [
  { re: /\/\/\s*resto (del|de) código/i, nombre: "// resto del código" },
  { re: /\/\/\s*(rest of|remaining|unchanged)/i, nombre: "// rest of code" },
  { re: /\.\.\.\s*\(?(truncado|omitido|sin cambios|resto)\)?/i, nombre: "... (truncado)" },
  { re: /\/\/\s*\.\.\.(\s|$)/, nombre: "// ..." },
  { re: /#\s*(resto|sin cambios|\.\.\.)/i, nombre: "# resto" },
  { re: /\[Personaliza este texto\]/i, nombre: "[Personaliza este texto]" },
];

/** Líneas no vacías (las útiles): comparar el volumen real, no los espacios. */
function lineasUtiles(s: string): number {
  return (s || "").split("\n").filter((l) => l.trim().length > 0).length;
}

/** Nombres exportados: export const/function/class X, export default function X, export { X }. */
function exportaciones(s: string): Set<string> {
  const out = new Set<string>();
  const texto = s || "";
  let m: RegExpExecArray | null;
  const reDecl = /export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reDecl.exec(texto)) !== null) out.add(m[1]);
  const reLlaves = /export\s*\{([^}]*)\}/g;
  while ((m = reLlaves.exec(texto)) !== null) {
    for (const parte of m[1].split(",")) {
      const nombre = parte.trim().split(/\s+as\s+/i)[0].trim();
      if (nombre) out.add(nombre);
    }
  }
  return out;
}

/** Nombres de funciones/const de nivel superior (aunque no se exporten). */
function definiciones(s: string): Set<string> {
  const out = new Set<string>();
  const texto = s || "";
  let m: RegExpExecArray | null;
  const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re.exec(texto)) !== null) {
    const nombre = m[1] || m[2];
    if (nombre) out.add(nombre);
  }
  return out;
}

/**
 * Audita si una MODIFICACIÓN conserva lo que ya funcionaba. Compara el «antes»
 * (lo que el usuario dio, terminado) con el «después» (lo que el modelo propone).
 * Caza el defecto literal del usuario: *«si le doy algo terminado para modificar
 * lo termina rompiendo»*.
 *
 * Es DETERMINISTA y no depende de ejecutar nada: mismos textos → mismo veredicto.
 */
export function auditarPreservacion(
  antes: string,
  despues: string,
  opts: { permitirEncogimiento?: boolean } = {}
): AuditoriaPreservacion {
  const hallazgos: HallazgoPreservacion[] = [];
  const antesL = lineasUtiles(antes);
  const despuesL = lineasUtiles(despues);

  // (a) Vaciado: el «después» se quedó prácticamente en nada.
  if (antesL >= 3 && despuesL === 0) {
    hallazgos.push({ tipo: "vaciado", detalle: "El resultado está vacío: se borró el archivo entero.", severidad: "critico" });
  }

  // (b) Exportaciones perdidas: romper la API pública es el error #1.
  const expAntes = exportaciones(antes);
  const expDespues = exportaciones(despues);
  for (const e of expAntes) {
    if (!expDespues.has(e)) {
      hallazgos.push({ tipo: "exportacion-perdida", detalle: `Desapareció la exportación «${e}»: rompe a quien la importa.`, severidad: "critico" });
    }
  }

  // (c) Funciones/const de nivel superior perdidas (no exportadas, pero usadas dentro).
  const defAntes = definiciones(antes);
  const defDespues = definiciones(despues);
  for (const d of defAntes) {
    if (!defDespues.has(d) && !expAntes.has(d)) {
      hallazgos.push({ tipo: "funcion-perdida", detalle: `Desapareció «${d}», que existía antes.`, severidad: "aviso" });
    }
  }

  // (d) Encogimiento sospechoso: perder >=35% de líneas útiles sin que se pidiera.
  if (!opts.permitirEncogimiento && antesL >= 8) {
    const perdida = (antesL - despuesL) / antesL;
    if (perdida >= UMBRAL_ENCOGIMIENTO) {
      hallazgos.push({
        tipo: "encogimiento",
        detalle: `El archivo pierde el ${Math.round(perdida * 100)}% de sus líneas (${antesL}→${despuesL}): parece una amputación, no una edición.`,
        severidad: "critico",
      });
    }
  }

  // (e) Marcadores perezosos: un hueco en vez del código real rompe el build.
  for (const { re, nombre } of RE_PEREZOSOS) {
    if (re.test(despues)) {
      hallazgos.push({ tipo: "marcador-perezoso", detalle: `Marcador perezoso «${nombre}»: falta el código real, no un resumen.`, severidad: "critico" });
    }
  }

  const criticos = hallazgos.filter((h) => h.severidad === "critico").length;
  const avisos = hallazgos.filter((h) => h.severidad === "aviso").length;
  const puntaje = Math.max(0, 100 - criticos * 40 - avisos * 10);
  const seguro = criticos === 0;

  let directiva = "";
  if (!seguro) {
    directiva = [
      "[PRESERVACIÓN — no rompas lo que funciona]",
      "El cambio propuesto destruye algo que existía. Antes de escribir:",
      "- Usa edit_file con un ancla única para tocar SOLO lo pedido; no reescribas el archivo entero.",
      "- Conserva todas las exportaciones, funciones, rutas y textos que no te pidieron cambiar.",
      "- Sustituye cualquier marcador perezoso por el código real completo.",
      "Hallazgos: " + hallazgos.map((h) => h.detalle).join(" "),
    ].join("\n");
  }

  return { seguro, hallazgos, puntaje, directiva };
}

// ════════════════════════════════════════════════════════════════════════════
// DIRECTRIZ DE SISTEMA — lo que viaja al prompt del turno
// ════════════════════════════════════════════════════════════════════════════

/**
 * El bloque único que resume las tres reglas para el system prompt. Se inyecta
 * en superPrompt (niveles distintos de «micro», que necesita el contexto para
 * trabajar). Es afirmativo, corto y sin ceremonia — §2.3 sigue vigente.
 */
export function directrizConversacionPrimero(): string {
  return [
    "[CONVERSACIÓN PRIMERO — v1.29.0]",
    "1. ESPAÑOL: habla con el usuario en español (explicación, avisos, estado). El código mantiene su sintaxis; lo que rodea al código va en español.",
    "2. CÓDIGO AL FONDO: no inundes el chat de código. Escribe los archivos en el editor con las herramientas (segundo plano) y en el chat deja una explicación breve y la lista de archivos tocados. Pega código en el chat solo como fragmento de ejemplo corto, nunca la entrega entera.",
    "3. NO ROMPAS LO QUE FUNCIONA: si modificas algo que ya anda, léelo antes, edita con edit_file (ancla única) en vez de reescribir, y conserva TODO lo que no te pidieron cambiar (exportaciones, funciones, textos). Nada de marcadores perezosos: código real y completo.",
  ].join("\n");
}
