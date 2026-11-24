/**
 * rendimiento.ts — ANALIZADOR DE RENDIMIENTO ESTÁTICO (v1.23.0 · 16 reglas)
 * ========================================================================
 * EL DEFECTO QUE CURA
 * -------------------
 * El motor entregaba código que «funcionaba» pero escalaba mal: búsquedas
 * O(n²) dentro de un recorrido, `await` en serie dentro de bucles, clones por
 * `JSON.parse(JSON.stringify())`, I/O síncrono que bloquea el event loop,
 * `SELECT *` y librerías enteras importadas por una función. Ninguna puerta lo
 * miraba: el Quirófano juzgaba sintaxis, superficie, imports y —desde la
 * CERRADURA— seguridad; el rendimiento estaba en la fe.
 *
 * QUÉ ES
 * ------
 * El gemelo de `cerradura.ts` para VELOCIDAD y MEMORIA: un escaner determinista
 * de 16 reglas sobre el código QUE SE ESCRIBE. Entra texto, salen hallazgos con
 * archivo, línea, extracto, categoría y cómo arreglar. Sin dependencias, sin
 * red, sin modelos. Cuesta microsegundos.
 *
 * FILOSOFÍA (coherente con la skill `cerebronico-rendimiento`)
 * ----------------------------------------------------------
 * · Optimizar sin medir es superstición. Por eso el análisis estático NO
 *   bloquea la tanda: son PISTAS, no veredictos. `bloquea` es siempre `false`.
 *   La única verdad la da una medida antes/después — el informe lo recuerda.
 * · Cada hallazgo NOMBRA la línea y dice cómo arreglarla. Un «posible cuello
 *   de botella» sin línea ni remedio es ruido que el modelo ignora.
 * · Severidad = IMPACTO probable a escala: `alta` (crece mal: O(n²), serie,
 *   bloqueo del hilo), `media` (peso o trabajo evitable), `baja` (microcosto).
 * · Falsos positivos conocidos: las exclusiones bajan el ruido de patrones que
 *   aparecen en código legítimo. Un escáner que grita con código sano se apaga
 *   al segundo día.
 */

export type SeveridadRendimiento = "alta" | "media" | "baja";
export type CategoriaRendimiento = "algoritmo" | "io" | "memoria" | "bundle" | "micro";

export interface HallazgoRendimiento {
  regla: string;
  titulo: string;
  severidad: SeveridadRendimiento;
  categoria: CategoriaRendimiento;
  archivo: string;
  linea: number;
  extracto: string;
  como: string;
}

export interface ReglaRendimiento {
  id: string;
  titulo: string;
  severidad: SeveridadRendimiento;
  categoria: CategoriaRendimiento;
  /** Lenguajes a los que aplica (extensión sin punto). Vacío = todos. */
  lenguajes?: string[];
  re: RegExp;
  /** Si la línea ALSO matchea este patrón, no cuenta (falso positivo conocido). */
  excluir?: RegExp;
  como: string;
}

const JS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"];
const PY = ["py"];
const SQL = ["sql"];

export const REGLAS_RENDIMIENTO: ReglaRendimiento[] = [
  {
    id: "foreach-async",
    titulo: "forEach con callback async (la promesa se pierde)",
    severidad: "alta",
    categoria: "algoritmo",
    lenguajes: JS,
    re: /\.forEach\s*\(\s*async\b/,
    como: "forEach ignora la promesa que devuelve el callback: no espera nada. Usá for...of con await (en serie) o Promise.all(arr.map(...)) (en paralelo).",
  },
  {
    id: "await-en-bucle",
    titulo: "await dentro de un bucle (I/O serializado)",
    severidad: "alta",
    categoria: "io",
    lenguajes: JS,
    re: /\b(for|while)\b[^\n]*\bawait\b/,
    excluir: /(Promise\.all|Promise\.allSettled|await Promise|\/\/|for\s+await)/,
    como: "Cada vuelta espera a la anterior: N peticiones tardan Nx. Juntá las promesas y hacé un solo await Promise.all(...) fuera del bucle.",
  },
  {
    id: "map-async-sin-all",
    titulo: ".map(async ...) sin Promise.all alrededor",
    severidad: "media",
    categoria: "io",
    lenguajes: JS,
    re: /\.map\s*\(\s*async\b/,
    excluir: /Promise\.all|Promise\.allSettled|await Promise/,
    como: ".map con async crea un arreglo de promesas sueltas: sin Promise.all(...) no se esperan ni se capturan sus errores.",
  },
  {
    id: "clon-json",
    titulo: "Clon profundo por JSON.parse(JSON.stringify(...))",
    severidad: "media",
    categoria: "memoria",
    lenguajes: JS,
    re: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    como: "Serializar+parsear es lento y pierde Date/Map/Set/undefined. Usá structuredClone(obj) para clon profundo nativo.",
  },
  {
    id: "cuadratico-busqueda-en-recorrido",
    titulo: "Búsqueda lineal dentro de un recorrido (O(n²))",
    severidad: "alta",
    categoria: "algoritmo",
    lenguajes: JS,
    re: /\.(filter|some|every|find|findIndex|map|forEach|reduce)\s*\([^\n]*\.(includes|indexOf|find|findIndex)\s*\(/,
    excluir: /\/\//,
    como: "Buscar dentro de un recorrido es O(n²). Construí un Set/Map UNA vez antes del bucle y consultá en O(1).",
  },
  {
    id: "reduce-spread",
    titulo: "Spread del acumulador en cada paso de reduce (O(n²))",
    severidad: "alta",
    categoria: "memoria",
    lenguajes: JS,
    re: /\.reduce\s*\([^\n]*=>\s*[({\[\s]*\.\.\.\s*(acc|prev|previous|a|res|result|out)\b/,
    como: "{...acc} o [...acc] en cada paso copia todo el acumulador: O(n²) en tiempo y memoria. Mutá el acumulador (push / acc[k]=v) o usá un Map.",
  },
  {
    id: "io-sincrono",
    titulo: "I/O síncrono de Node (bloquea el event loop)",
    severidad: "media",
    categoria: "io",
    lenguajes: JS,
    re: /\b(readFileSync|writeFileSync|appendFileSync|readdirSync|statSync|realpathSync)\s*\(/,
    como: "En un servidor, *Sync detiene TODAS las peticiones mientras dura el disco. Usá la versión de fs.promises con await. En un script de un solo uso es aceptable.",
  },
  {
    id: "length-recomputada-en-for",
    titulo: ".length recalculado en cada vuelta del for",
    severidad: "baja",
    categoria: "micro",
    lenguajes: JS,
    re: /for\s*\([^;]*;[^;]*\.length\s*;/,
    excluir: /\.length\s*(-|\+)|for\s+(const|let|var)?\s*\w+\s+of\b/,
    como: "Si el arreglo no cambia dentro del bucle, guardá la longitud antes: for (let i=0, n=arr.length; i<n; i++). O mejor, for...of.",
  },
  {
    id: "import-lodash-completo",
    titulo: "Import de lodash entero por unas pocas funciones",
    severidad: "media",
    categoria: "bundle",
    lenguajes: JS,
    re: /(import\s+[^\n]*\s+from\s+["']lodash["']|require\(\s*["']lodash["']\s*\))/,
    excluir: /lodash\/|lodash-es/,
    como: "El import completo mete ~70 KB al bundle. Import\u00e1 solo lo que us\u00e1s: import get from \"lodash/get\", o resolvelo con m\u00e9todos nativos.",
  },
  {
    id: "libreria-fecha-pesada",
    titulo: "Librer\u00eda de fechas pesada (moment)",
    severidad: "baja",
    categoria: "bundle",
    lenguajes: JS,
    re: /from\s+["']moment["']|require\(\s*["']moment["']\s*\)/,
    como: "moment es grande (~230 KB), mutable y est\u00e1 en modo mantenimiento. Us\u00e1 date-fns (tree-shakeable), day.js o el Intl/Temporal nativo.",
  },
  {
    id: "setinterval-agresivo",
    titulo: "setInterval con periodo muy corto (satura la CPU)",
    severidad: "baja",
    categoria: "micro",
    lenguajes: JS,
    re: /setInterval\s*\([^,]*,\s*([0-9]|[12][0-9]|3[0-5])\s*\)/,
    como: "Intervalos < ~36 ms disparan m\u00e1s de lo que la pantalla puede pintar. Para animaci\u00f3n us\u00e1 requestAnimationFrame; para trabajo real, un periodo realista.",
  },
  {
    id: "select-estrella",
    titulo: "SELECT * (trae columnas de m\u00e1s y rompe \u00edndices cubridores)",
    severidad: "media",
    categoria: "io",
    re: /SELECT\s+\*\s+FROM\b/i,
    como: "Ped\u00ed solo las columnas que us\u00e1s: mueve menos datos por la red y deja usar \u00edndices cubridores. SELECT * tambi\u00e9n se rompe al cambiar el esquema.",
  },
  {
    id: "like-comodin-inicial",
    titulo: "LIKE con comod\u00edn al principio (no usa \u00edndice)",
    severidad: "media",
    categoria: "io",
    re: /LIKE\s+['"]%/i,
    como: "'%texto' obliga a un scan completo: ning\u00fan \u00edndice B-Tree lo cubre. Evit\u00e1 el comod\u00edn inicial o us\u00e1 b\u00fasqueda full-text / trigram.",
  },
  {
    id: "pandas-iterrows",
    titulo: "pandas: iterrows() (recorrido fila a fila, lent\u00edsimo)",
    severidad: "alta",
    categoria: "algoritmo",
    lenguajes: PY,
    re: /\.iterrows\s*\(\s*\)/,
    como: "iterrows crea una Series por fila: \u00f3rdenes de magnitud m\u00e1s lento. Vectoriz\u00e1 con operaciones de columna, .apply, o .itertuples() si hace falta iterar.",
  },
  {
    id: "python-range-len",
    titulo: "Python: for i in range(len(seq)) (indexado innecesario)",
    severidad: "baja",
    categoria: "micro",
    lenguajes: PY,
    re: /\bfor\s+\w+\s+in\s+range\s*\(\s*len\s*\(/,
    como: "Us\u00e1 enumerate(seq) para \u00edndice+valor, o iter\u00e1 directo sobre seq. Evit\u00e1 el indexado repetido y queda m\u00e1s claro.",
  },
  {
    id: "pandas-apply-fila",
    titulo: "pandas: .apply(..., axis=1) fila por fila",
    severidad: "media",
    categoria: "algoritmo",
    lenguajes: PY,
    re: /\.apply\s*\([^\n]*axis\s*=\s*1/,
    como: "apply con axis=1 recorre en Python fila por fila. Cuando puedas, vectoriz\u00e1 con operaciones de columna (df['a'] + df['b']) o np.where.",
  },
];

// ───────────────────────────────────────────────────────────────────────────────────
// API
// ───────────────────────────────────────────────────────────────────────────────────

export function extensionDe(archivo: string): string {
  const m = String(archivo || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Analiza UN archivo. Determinista: mismo texto, mismos hallazgos, en orden. */
export function analizarCodigo(archivo: string, codigo: string): HallazgoRendimiento[] {
  const ext = extensionDe(archivo);
  const lineas = String(codigo || "").replace(/\r\n/g, "\n").split("\n");
  const out: HallazgoRendimiento[] = [];
  for (const regla of REGLAS_RENDIMIENTO) {
    if (regla.lenguajes && regla.lenguajes.length > 0 && !regla.lenguajes.includes(ext)) continue;
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const t = linea.trimStart();
      if (t.startsWith("//") || t.startsWith("#") || t.startsWith("*")) continue;
      regla.re.lastIndex = 0;
      if (!regla.re.test(linea)) continue;
      if (regla.excluir) {
        regla.excluir.lastIndex = 0;
        if (regla.excluir.test(linea)) continue;
      }
      out.push({
        regla: regla.id,
        titulo: regla.titulo,
        severidad: regla.severidad,
        categoria: regla.categoria,
        archivo,
        linea: i + 1,
        extracto: linea.trim().slice(0, 160),
        como: regla.como,
      });
      if (out.length >= 400) return out; // techo anti-explosión
    }
  }
  return out;
}

export interface ResumenRendimiento {
  total: number;
  altas: number;
  medias: number;
  bajas: number;
  /** Recuento por categoría (algoritmo/io/memoria/bundle/micro). */
  porCategoria: Record<CategoriaRendimiento, number>;
  /**
   * El análisis estático NO bloquea: son pistas, no medidas. Siempre `false`.
   * La verdad la da un número antes/después (ver skill cerebronico-rendimiento).
   */
  bloquea: false;
}

export function contarHallazgos(hallazgos: HallazgoRendimiento[]): ResumenRendimiento {
  const r: ResumenRendimiento = {
    total: hallazgos.length,
    altas: 0,
    medias: 0,
    bajas: 0,
    porCategoria: { algoritmo: 0, io: 0, memoria: 0, bundle: 0, micro: 0 },
    bloquea: false,
  };
  for (const h of hallazgos) {
    if (h.severidad === "alta") r.altas++;
    else if (h.severidad === "media") r.medias++;
    else r.bajas++;
    r.porCategoria[h.categoria]++;
  }
  return r;
}

/** Analiza un lote de archivos (inventario del proyecto o tanda tocada). */
export function analizarProyecto(archivos: Array<{ path: string; content: string }>): HallazgoRendimiento[] {
  const out: HallazgoRendimiento[] = [];
  for (const a of archivos || []) {
    if (!a || typeof a.content !== "string") continue;
    if (a.content.length > 800 * 1024) continue; // archivo descomunal: no es código de app
    out.push(...analizarCodigo(a.path, a.content));
    if (out.length >= 400) break;
  }
  return out;
}

/**
 * Informe legible para el modelo y el usuario. Acotado: 12 pistas con línea y
 * remedio valen más que 300 sin contexto. Recuerda SIEMPRE que son pistas: el
 * veredicto de rendimiento lo da una medida, no un regex.
 */
export function informeRendimiento(hallazgos: HallazgoRendimiento[], max = 12): string {
  if (hallazgos.length === 0) return "\u26a1 RENDIMIENTO: sin pistas de cuello de botella en el c\u00f3digo revisado.";
  const r = contarHallazgos(hallazgos);
  const lineas = [
    `\u26a1 RENDIMIENTO \u2014 ${r.total} pista(s): ${r.altas} alta(s), ${r.medias} media(s), ${r.bajas} baja(s).`,
  ];
  for (const h of hallazgos.slice(0, max)) {
    lineas.push(`  \u00b7 [${h.severidad}\u00b7${h.categoria}] ${h.regla} \u2014 ${h.archivo}:${h.linea} \u2014 ${h.titulo}`);
    lineas.push(`      c\u00f3mo mejorar: ${h.como}`);
  }
  if (hallazgos.length > max) lineas.push(`  \u2026 y ${hallazgos.length - max} pista(s) m\u00e1s en el informe completo.`);
  lineas.push("Son PISTAS est\u00e1ticas, no un veredicto: confirm\u00e1 con una medida antes/despu\u00e9s antes de optimizar.");
  return lineas.join("\n");
}
