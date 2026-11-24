/**
 * reconocimientoError.ts — MÁS CONTEXTO DE ERRORES Y RECONOCER LOS PROPIOS (v1.30.0)
 * =================================================================================
 * El usuario lo pidió así: *«más contexto de errores y reconoce sus errores»*, y la
 * sesión que adjuntó lo demuestra sin lugar a dudas. Ante este error de Vite:
 *
 *     [plugin:vite:import-analysis] Failed to resolve import "react-dom/client"
 *     from "src/main.tsx". Does the file exist?
 *
 * el modelo reescribió la MISMA línea de import quince veces, alternando entre
 * `react-dom`, `react-dom/client` y `{ createRoot }` — «variaciones superficiales»
 * de su propio diagnóstico. Nunca vio que el error era IDÉNTICO turno tras turno,
 * ni que la causa raíz (el paquete no está disponible en el sandbox) no se arregla
 * cambiando cómo se escribe el import. El usuario lo gritó: *«OTRA VEZ LO MISMO
 * QUE HACES?»*, *«LO MISMO… ABORTA»*.
 *
 * Esta capa convierte eso en MECÁNICA, no en fe:
 *   1. CONTEXTO — extrae del texto crudo del error su clase, módulo, archivo,
 *      línea/columna, herramienta y el fragmento citado (`contextoError`).
 *   2. FIRMA — una firma ESTABLE que ignora líneas/rutas y NORMALIZA el paquete a
 *      su raíz, para que `react-dom` y `react-dom/client` cuenten como el MISMO
 *      error (esa fue la trampa) (`firmaError`).
 *   3. BUCLE — mira el historial de errores y detecta la repetición
 *      (`analizarBucle`): si la misma firma vuelve, el modelo está en bucle.
 *   4. CAUSA RAÍZ — para cada clase, qué arreglar y —sobre todo— qué NO volver a
 *      intentar (`diagnosticoRaiz`).
 *   5. RECONOCIMIENTO — una directiva HONESTA que admite el bucle en español y
 *      cambia de enfoque (`directrizReconocimiento`).
 *   6. APRENDIZAJE — un libro de aciertos Y errores: *«RECORDAR CUANDO HACES ALGO
 *      BIEN»* también fue una petición (`resumenAprendizaje`).
 *
 * Lógica pura: recibe texto, devuelve datos. Sin red, sin disco, sin DOM. Se
 * prueba entera (tests/reconocimientoError.test.ts).
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. CONTEXTO — leer el error crudo y sacar lo que importa
// ════════════════════════════════════════════════════════════════════════════

export type ClaseError =
  | "import-no-resuelto"   // Vite/bundler: Failed to resolve import "X"
  | "modulo-no-encontrado" // Node: Cannot find module 'X'
  | "sintaxis"             // SyntaxError, Unexpected token/end of input
  | "referencia"           // X is not defined / is not a function
  | "tipo"                 // TypeScript: type 'X' is not assignable / TSxxxx
  | "runtime"              // otros de ejecución con mensaje reconocible
  | "desconocido";

export interface ContextoError {
  clase: ClaseError;
  /** El paquete/import ofensor tal cual apareció («react-dom/client»). */
  modulo: string | null;
  /** Archivo citado («src/main.tsx»), sin la raíz absoluta del disco. */
  archivo: string | null;
  linea: number | null;
  columna: number | null;
  /** Quién emitió el error: vite, esbuild, tsc, node… */
  herramienta: string | null;
  /** La línea de código citada, si el error la trae. */
  fragmento: string | null;
  /** Una frase limpia del error, sin la traza entera. */
  mensaje: string;
}

/** Quita la raíz absoluta del disco de una ruta (C:/Cerebronico/src/x → src/x). */
function rutaRelativa(ruta: string): string {
  const limpia = ruta.replace(/\\/g, "/").trim();
  const m = limpia.match(/(?:^|\/)((?:src|app|public|components|pages|lib|tests?)\/.*)$/i);
  return m ? m[1] : limpia.replace(/^[a-zA-Z]:\//, "");
}

/**
 * Lee el texto crudo de un error (el que el usuario pega del sandbox) y extrae
 * su contexto. Tolerante: si no reconoce el patrón, devuelve clase «desconocido»
 * con el mensaje recortado — nunca inventa un módulo ni una línea.
 */
export function contextoError(texto: string): ContextoError {
  const t = (texto || "").trim();
  const base: ContextoError = {
    clase: "desconocido", modulo: null, archivo: null, linea: null,
    columna: null, herramienta: null, fragmento: null,
    mensaje: t.split("\n")[0]?.slice(0, 200) || "",
  };
  if (!t) return base;

  // Herramienta declarada entre corchetes: [plugin:vite:import-analysis]
  const herr = t.match(/\[plugin:([a-z0-9:._-]+)\]/i);
  if (herr) base.herramienta = herr[1].split(":")[0];

  // archivo:linea:columna  (C:/Cerebronico/src/main.tsx:2:21)
  const pos = t.match(/([A-Za-z]:\/[^\s:]+|\.?\/?[\w./-]+\.\w+):(\d+):(\d+)/);
  if (pos) {
    base.archivo = rutaRelativa(pos[1]);
    base.linea = parseInt(pos[2], 10);
    base.columna = parseInt(pos[3], 10);
  }

  // (1) import no resuelto (Vite / bundler)
  const imp = t.match(/Failed to resolve import\s+["']([^"']+)["']\s+from\s+["']([^"']+)["']/i);
  if (imp) {
    base.clase = "import-no-resuelto";
    base.modulo = imp[1];
    if (!base.archivo) base.archivo = rutaRelativa(imp[2]);
    if (!base.herramienta) base.herramienta = "vite";
    base.mensaje = `No se pudo resolver el import «${imp[1]}» desde ${base.archivo}.`;
    base.fragmento = extraerFragmento(t, base.modulo);
    return base;
  }

  // (2) módulo no encontrado (Node)
  const cnf = t.match(/Cannot find module\s+["']([^"']+)["']/i);
  if (cnf) {
    base.clase = "modulo-no-encontrado";
    base.modulo = cnf[1];
    if (!base.herramienta) base.herramienta = "node";
    base.mensaje = `No se encuentra el módulo «${cnf[1]}».`;
    return base;
  }

  // (3) sintaxis
  if (/SyntaxError|Unexpected token|Unexpected end of input|Unterminated|Unexpected identifier/i.test(t)) {
    base.clase = "sintaxis";
    base.mensaje = t.match(/((Syntax)?Error:?[^\n]*)/i)?.[1]?.slice(0, 200) || "Error de sintaxis.";
    return base;
  }

  // (4) referencia / no definido
  const ref = t.match(/([A-Za-z_$][\w$]*)\s+is not defined|is not a function/i);
  if (ref) {
    base.clase = "referencia";
    base.modulo = ref[1] || null;
    base.mensaje = base.modulo ? `«${base.modulo}» no está definido o importado.` : "Referencia a algo no definido.";
    return base;
  }

  // (5) tipo (TypeScript)
  if (/TS\d{3,5}|is not assignable to type|Type '[^']+' is/i.test(t)) {
    base.clase = "tipo";
    if (!base.herramienta) base.herramienta = "tsc";
    base.mensaje = t.match(/(TS\d+[^\n]*|Type '[^\n]*)/)?.[1]?.slice(0, 200) || "Error de tipos.";
    return base;
  }

  // (6) runtime genérico con «Error:»
  const err = t.match(/\b([A-Z]\w*Error):?\s*([^\n]*)/);
  if (err) {
    base.clase = "runtime";
    base.mensaje = `${err[1]}: ${err[2]}`.slice(0, 200);
    return base;
  }

  return base;
}

/** Rescata la línea de código citada donde aparece el módulo (para dar contexto). */
function extraerFragmento(texto: string, modulo: string | null): string | null {
  if (!modulo) return null;
  const gutter = /^\s*\d+\s*\|/; // líneas de código citadas: «2 |  import…»
  // 1º preferimos las líneas con número de gutter (son código real citado).
  for (const linea of texto.split("\n")) {
    if (gutter.test(linea) && linea.includes(modulo)) {
      return linea.replace(gutter, "").trim().slice(0, 160);
    }
  }
  // 2º si no hay gutter, cualquier línea de import/require que NO sea el propio mensaje.
  for (const linea of texto.split("\n")) {
    if (/import|require|from/.test(linea) && linea.includes(modulo) && !/Failed to resolve|\[plugin/i.test(linea)) {
      return linea.trim().slice(0, 160);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. FIRMA — la clave para ver el bucle: normalizar el paquete a su raíz
// ════════════════════════════════════════════════════════════════════════════

/**
 * Normaliza un especificador de módulo a su PAQUETE RAÍZ:
 *   react-dom/client   → react-dom
 *   @scope/pkg/sub/ruta → @scope/pkg
 *   ./local/archivo     → ./local/archivo   (los relativos no se tocan)
 * Aquí está el arreglo del bug: cambiar `react-dom` ↔ `react-dom/client` es la
 * MISMA falta, porque el paquete que falta es el mismo. La firma debe verlo igual.
 */
export function paqueteRaiz(modulo: string): string {
  const m = (modulo || "").trim();
  if (!m) return "";
  if (m.startsWith(".") || m.startsWith("/")) return m; // ruta relativa/absoluta: se respeta
  if (m.startsWith("@")) {
    const p = m.split("/");
    return p.slice(0, 2).join("/"); // @scope/pkg
  }
  return m.split("/")[0]; // pkg
}

/**
 * Firma ESTABLE de un error: `clase|detalle`. Ignora línea y columna a propósito
 * (cambian con cada edición y enmascaran que es el mismo fallo) y normaliza el
 * módulo a su raíz. Dos errores con la misma firma son «el mismo error».
 */
export function firmaError(entrada: string | ContextoError): string {
  const ctx = typeof entrada === "string" ? contextoError(entrada) : entrada;
  let detalle = "";
  switch (ctx.clase) {
    case "import-no-resuelto":
    case "modulo-no-encontrado":
      detalle = paqueteRaiz(ctx.modulo || "").toLowerCase();
      break;
    case "referencia":
      detalle = (ctx.modulo || "").toLowerCase();
      break;
    case "sintaxis":
    case "tipo":
      // La sintaxis/tipo se ata al archivo (no a la línea, que cambia al editar).
      detalle = (ctx.archivo || "").toLowerCase();
      break;
    default:
      detalle = ctx.mensaje.toLowerCase().replace(/\d+/g, "#").slice(0, 60);
  }
  return `${ctx.clase}|${detalle}`;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. BUCLE — mirar el historial y ver si nos repetimos
// ════════════════════════════════════════════════════════════════════════════

export interface AnalisisBucle {
  /** ¿El último error ya lo habíamos visto (misma firma) suficientes veces? */
  enBucle: boolean;
  /** Firma del último error. */
  firma: string;
  /** Clase del último error. */
  clase: ClaseError;
  /** Cuántas veces aparece esa firma en el historial. */
  repeticiones: number;
  /** Índice (0-based) de la primera vez que apareció. */
  primeraAparicion: number;
  /** El contexto del último error, para no recalcular fuera. */
  ultimo: ContextoError;
}

/**
 * Analiza una secuencia de errores (del más viejo al más nuevo) y dice si el
 * último repite una firma ya vista. `minRepeticiones` = cuántas apariciones de
 * la misma firma bastan para llamarlo bucle (por defecto 2: verla dos veces ya
 * es repetir). Esto es lo que faltaba en la sesión: nadie contaba.
 */
export function analizarBucle(historial: string[], minRepeticiones = 2): AnalisisBucle {
  const lista = (historial || []).filter((x) => (x || "").trim().length > 0);
  if (lista.length === 0) {
    const vacio = contextoError("");
    return { enBucle: false, firma: firmaError(vacio), clase: "desconocido", repeticiones: 0, primeraAparicion: -1, ultimo: vacio };
  }
  const firmas = lista.map((e) => firmaError(e));
  const ultimaFirma = firmas[firmas.length - 1];
  const ultimo = contextoError(lista[lista.length - 1]);
  let repeticiones = 0;
  let primeraAparicion = -1;
  firmas.forEach((f, i) => {
    if (f === ultimaFirma) {
      repeticiones++;
      if (primeraAparicion === -1) primeraAparicion = i;
    }
  });
  return {
    enBucle: repeticiones >= minRepeticiones,
    firma: ultimaFirma,
    clase: ultimo.clase,
    repeticiones,
    primeraAparicion,
    ultimo,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. CAUSA RAÍZ — qué arreglar y, sobre todo, qué NO volver a intentar
// ════════════════════════════════════════════════════════════════════════════

export interface DiagnosticoRaiz {
  clase: ClaseError;
  /** La causa raíz real, en una frase. */
  causa: string;
  /** Qué sí arregla el problema (uno o varios caminos). */
  arreglos: string[];
  /** El anti-patrón concreto que NO hay que repetir. */
  noHagas: string;
}

/**
 * Para una clase de error (y su módulo si aplica), devuelve la causa raíz y el
 * anti-patrón. El caso estrella es `import-no-resuelto`: la causa NO es cómo se
 * escribe el import, es que el paquete no está en el sandbox. Reescribir el
 * import (lo que hizo el modelo 15 veces) está explícitamente prohibido.
 */
export function diagnosticoRaiz(clase: ClaseError, modulo: string | null = null): DiagnosticoRaiz {
  const pkg = paqueteRaiz(modulo || "") || "el paquete";
  switch (clase) {
    case "import-no-resuelto":
    case "modulo-no-encontrado":
      return {
        clase,
        causa: `La dependencia «${pkg}» no está disponible en el sandbox (no instalada / no declarada). El import está bien escrito; lo que falta es el paquete.`,
        arreglos: [
          `Declarar «${pkg}» en package.json e instalarlo (npm/pnpm install) en el sandbox.`,
          `Si no se puede instalar, servirlo por un import-map / CDN (esm.sh, unpkg) o pasar a un enfoque sin build.`,
          `Verificar después que el paquete resuelve ANTES de tocar el código del import.`,
        ],
        noHagas: `NO reescribas la línea de import ni pruebes otra variante del mismo paquete («${pkg}» ↔ «${pkg}/...» ↔ desestructurar): es el MISMO error, el paquete sigue sin estar.`,
      };
    case "sintaxis":
      return {
        clase,
        causa: "El código está mal formado (paréntesis/llave/comilla sin cerrar, token inesperado).",
        arreglos: [
          "Ir al archivo:línea exactos que cita el error y cerrar/corregir ahí.",
          "Releer el bloque completo, no sólo la línea, para ubicar el desbalance.",
        ],
        noHagas: "NO reescribas el archivo entero a ciegas ni cambies lógica no relacionada: es un fallo local y puntual.",
      };
    case "referencia":
      return {
        clase,
        causa: `«${modulo || "El símbolo"}» se usa sin estar definido, importado o en ámbito.`,
        arreglos: [
          "Añadir el import o la definición que falta, o corregir el nombre mal escrito.",
          "Comprobar el orden: no usarlo antes de declararlo.",
        ],
        noHagas: "NO envuelvas todo en try/catch para tapar el síntoma: falta una definición, no sobra un error.",
      };
    case "tipo":
      return {
        clase,
        causa: "Los tipos no cuadran: se pasa/asigna un valor de un tipo donde se espera otro.",
        arreglos: [
          "Ajustar el tipo real (o el de la firma) para que coincidan de verdad.",
          "Corregir el dato de origen si el tipo esperado es el correcto.",
        ],
        noHagas: "NO silencies con `as any` o `@ts-ignore` para que compile: oculta el fallo, no lo arregla.",
      };
    case "runtime":
      return {
        clase,
        causa: "Fallo en ejecución: el mensaje concreto indica qué operación reventó.",
        arreglos: [
          "Leer el mensaje completo y el punto donde ocurre; reproducir con el mínimo caso.",
          "Validar entradas/estado justo antes de la línea que falla.",
        ],
        noHagas: "NO repitas el mismo intento esperando otro resultado: cambia una variable a la vez y observa.",
      };
    default:
      return {
        clase: "desconocido",
        causa: "No se reconoce el patrón del error; falta contexto.",
        arreglos: [
          "Pedir/leer el mensaje de error completo y el archivo:línea.",
          "Reproducir el fallo antes de tocar nada.",
        ],
        noHagas: "NO adivines un arreglo sin haber leído el error completo.",
      };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. RECONOCIMIENTO — admitir el error en español y cambiar de enfoque
// ════════════════════════════════════════════════════════════════════════════

export interface Reconocimiento {
  /** ¿Hay que reconocer un bucle? */
  reconocer: boolean;
  /** Texto honesto para el chat (en español). Vacío si no hay bucle. */
  mensaje: string;
  /** Directiva operativa para el modelo (qué hacer/no hacer ahora). */
  directiva: string;
  diagnostico: DiagnosticoRaiz;
  analisis: AnalisisBucle;
}

/**
 * A partir de un análisis de bucle produce el RECONOCIMIENTO: si nos repetimos,
 * un texto que lo admite sin rodeos («Reconozco que…») + la causa raíz + el
 * cambio de enfoque. Si no hay bucle, deja el diagnóstico disponible pero no
 * obliga a disculparse: honestidad, no teatro.
 */
export function directrizReconocimiento(analisis: AnalisisBucle): Reconocimiento {
  const diag = diagnosticoRaiz(analisis.clase, analisis.ultimo.modulo);
  if (!analisis.enBucle) {
    return {
      reconocer: false,
      mensaje: "",
      directiva:
        analisis.clase === "desconocido"
          ? ""
          : `[ERROR] ${diag.causa} Camino: ${diag.arreglos[0]} ${diag.noHagas}`,
      diagnostico: diag,
      analisis,
    };
  }
  const que = analisis.ultimo.modulo
    ? `el mismo error con «${analisis.ultimo.modulo}»`
    : `el mismo error (${analisis.clase})`;
  const mensaje =
    `Reconozco que estoy repitiendo lo mismo: he visto ${que} ${analisis.repeticiones} veces y el ` +
    `error es idéntico. Mi intento anterior no funcionó y repetirlo no va a cambiar el resultado. ` +
    `Causa raíz: ${diag.causa} Cambio de enfoque: ${diag.arreglos[0]}`;
  const directiva =
    `[BUCLE DETECTADO x${analisis.repeticiones}] ${diag.noHagas} ` +
    `En su lugar: ${diag.arreglos.join(" | ")} ` +
    `Y dilo en el chat, en español, reconociendo el bucle antes de actuar.`;
  return { reconocer: true, mensaje, directiva, diagnostico: diag, analisis };
}

/**
 * Regla ESTÁTICA para el superprompt: se inyecta siempre, exista o no un error en
 * curso. Enseña a leer «Failed to resolve import» como dependencia faltante y a
 * no caer en el bucle de reescribir imports.
 */
export function directrizReconocimientoEstatica(): string {
  return [
    "[RECONOCE TUS ERRORES]",
    "- Antes de reintentar, compara el error nuevo con el anterior: si es el MISMO (misma clase y mismo paquete/archivo), NO repitas el intento fallido.",
    "- 'Failed to resolve import' / 'Cannot find module' = la DEPENDENCIA no está en el sandbox, NO es cómo escribes el import. 'react-dom' y 'react-dom/client' son el mismo paquete: alternarlos es el mismo fallo.",
    "- Si te repites, dilo en el chat en español ('Reconozco que repetí lo mismo…'), nombra la causa raíz y CAMBIA de enfoque (instalar/declarar la dependencia, usar CDN, o abortar y avisar).",
    "- Cambia una sola variable por intento y verifica que el error cambia; si no cambia, tu hipótesis es errónea.",
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// 6. APRENDIZAJE — recordar también lo que salió bien
// ════════════════════════════════════════════════════════════════════════════

export interface Resultado {
  tipo: "acierto" | "error";
  /** Qué pasó, en una frase. */
  que: string;
  /** La lección a recordar (opcional). */
  leccion?: string;
}

export interface ResumenAprendizaje {
  aciertos: string[];
  errores: string[];
  lecciones: string[];
  /** Bloque de texto listo para pegar en el chat o en cerebro.md. */
  texto: string;
}

/**
 * Resume una lista de resultados en aciertos, errores y lecciones. Existe porque
 * el usuario también pidió «RECORDAR CUANDO HACES ALGO BIEN»: no sólo castigar
 * el bucle, también fijar lo que funcionó para repetirlo.
 */
export function resumenAprendizaje(resultados: Resultado[]): ResumenAprendizaje {
  const lista = resultados || [];
  const aciertos = lista.filter((r) => r.tipo === "acierto").map((r) => r.que);
  const errores = lista.filter((r) => r.tipo === "error").map((r) => r.que);
  const lecciones = lista.map((r) => r.leccion).filter((l): l is string => !!l && l.trim().length > 0);
  const partes: string[] = [];
  if (aciertos.length) partes.push("Aciertos (repetir):\n" + aciertos.map((a) => `  ✓ ${a}`).join("\n"));
  if (errores.length) partes.push("Errores (evitar):\n" + errores.map((e) => `  ✗ ${e}`).join("\n"));
  if (lecciones.length) partes.push("Lecciones:\n" + lecciones.map((l) => `  • ${l}`).join("\n"));
  return { aciertos, errores, lecciones, texto: partes.join("\n\n") };
}

