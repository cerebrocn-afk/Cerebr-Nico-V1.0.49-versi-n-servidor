/**
 * cerradura.ts — ESCÁNER DE SEGURIDAD ESTÁTICO (v1.23.0 · 19 reglas)
 * ==================================================================
 * EL DEFECTO QUE CURA
 * -------------------
 * «Entrega trabajos con más de 10 o 15 vulnerabilidades.» Medido: el motor
 * generaba apps con `innerHTML` sin sanear, `eval`, SQL por concatenación,
 * secretos hardcodeados y `exec` con string del usuario — y NINGUNA puerta lo
 * miraba. El Quirófano juzgaba sintaxis, superficie e imports; la seguridad
 * no estaba en el quirófano, estaba en la fe.
 *
 * QUÉ ES
 * ------
 * Un escáner determinista de 19 reglas sobre el código QUE SE ESCRIBE:
 * entra texto, salen hallazgos con archivo, línea, extracto y cómo arreglar.
 * Sin dependencias, sin red, sin modelos. Cuesta microsegundos y corre:
 *   1. en la puerta de seguridad del Quirófano (cada tanda de cambios), y
 *   2. en el acta de cierre (inventario completo del proyecto tocado).
 *
 * FILOSOFÍA
 * ---------
 * · Cada hallazgo NOMBRA la línea y dice cómo arreglarla — un "posible XSS"
 *   sin línea ni remedio es ruido que el modelo ignora.
 * · Severidades: `critica` bloquea la tanda (igual que una puerta roja);
 *   `alta`/`media`/`baja` se listan en el acta sin bloquear. Un guardián que
 *   bloquea todo se salta; un guardián que no bloquea nada no existe.
 * · Falsos positivos conocidos: las exclusiones (`excluir`) bajan el ruido de
 *   patrones que aparecen en código legítimo (tests, config de ejemplo).
 *   Lo que no puede pasar es que una vulnerabilidad real pase EN SILENCIO.
 */

export type SeveridadCerradura = "critica" | "alta" | "media" | "baja";

export interface Hallazgo {
  regla: string;
  titulo: string;
  severidad: SeveridadCerradura;
  archivo: string;
  linea: number;
  extracto: string;
  como: string;
}

export interface ReglaCerradura {
  id: string;
  titulo: string;
  severidad: SeveridadCerradura;
  /** Lenguajes a los que aplica (extensión sin punto). Vacío = todos. */
  lenguajes?: string[];
  re: RegExp;
  /** Si la línea ALSO matchea este patrón, no cuenta (falso positivo conocido). */
  excluir?: RegExp;
  como: string;
}

/**
 * v1.0.10 · OPCIONES DE ANÁLISIS (F2 — pedido de la sesión 1794120824912).
 * `permitidas`: lista de ids de regla que el proyecto declaró en su
 * `.cn-seguridad.json`. Una regla permitida NO desaparece del acta: baja a
 * `baja` y queda anotada con el motivo. La transparencia manda sobre el silencio.
 */
export interface OpcionesAnalisis {
  permitidas?: string[];
  /** Quién concedió el permiso (aparece en el acta). */
  concedidoPor?: string;
}

const JS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const PY = ["py"];
const PHP = ["php"];

export const REGLAS_CERRADURA: ReglaCerradura[] = [
  {
    id: "xss-innerhtml",
    titulo: "XSS: asignación directa a innerHTML/insertAdjacentHTML",
    severidad: "critica",
    lenguajes: JS.concat("html", "htm"),
    re: /\.innerHTML\s*(\+?=|;)|insertAdjacentHTML\s*\(/,
    excluir: /(\.innerHTML\s*=\s*(""|''|null)|textContent|sanitiz|dompurify|escapeHtml)/i,
    como: "Usá textContent, o saneá con DOMPurify.sanitize() antes de insertar HTML que venga de datos.",
  },
  {
    id: "xss-react",
    titulo: "XSS en React: dangerouslySetInnerHTML",
    severidad: "critica",
    lenguajes: JS,
    re: /dangerouslySetInnerHTML/,
    como: "Renderizá nodos React en vez de HTML crudo; si es HTML de terceros, sanealo antes (DOMPurify).",
  },
  {
    id: "xss-document-write",
    titulo: "XSS: document.write con datos",
    severidad: "alta",
    lenguajes: JS.concat("html", "htm"),
    re: /document\.write(?:ln)?\s*\(/,
    como: "Manipulá el DOM con createElement/textContent; document.write además rompe el parser de la página.",
  },
  {
    id: "xss-php-echo",
    titulo: "XSS en PHP: echo de entrada del request sin escapar",
    severidad: "alta",
    lenguajes: PHP,
    re: /echo\s+\$_(GET|POST|REQUEST|COOKIE)\b/,
    excluir: /htmlspecialchars| htmlentities/,
    como: "Envolvé la salida en htmlspecialchars($valor, ENT_QUOTES, 'UTF-8').",
  },
  {
    id: "rce-eval",
    titulo: "RCE: eval() sobre texto",
    severidad: "critica",
    re: /\beval\s*\(/,
    excluir: /(json\.eval|\.eval\s*=\s*function|eval\s*\(\s*["']typeof)/,
    como: "Nada que se evalúa solo: parseá JSON con JSON.parse o resolvé la lógica con un mapa de casos.",
  },
  {
    id: "rce-function",
    titulo: "RCE: constructor Function/new Function con string",
    severidad: "critica",
    lenguajes: JS,
    re: /new\s+Function\s*\(|\bsetTimeout\s*\(\s*["'`]/,
    como: "Pasá una función real (flecha) en vez de armar código desde texto.",
  },
  {
    id: "rce-shell-node",
    titulo: "RCE en Node: exec/execSync con cadena construida",
    severidad: "critica",
    lenguajes: JS,
    re: /\bexec(?:Sync)?\s*\(\s*[`'"][^`'"]*\$\{|\bexec(?:Sync)?\s*\(\s*[^)]*\+/ ,
    excluir: /execSync\s*\(\s*["'][a-z0-9._ /-]+["']\s*\)/i,
    como: "Usá execFile/spawn con ARRAY de argumentos y nunca interpole entrada del usuario en el comando.",
  },
  {
    id: "rce-shell-python",
    titulo: "RCE en Python: os.system / subprocess con shell=True",
    severidad: "critica",
    lenguajes: PY,
    re: /os\.system\s*\(|subprocess\.(?:call|run|Popen|check_output)\s*\([^)]*shell\s*=\s*True|os\.popen\s*\(/,
    como: "subprocess.run([...], shell=False) con lista de argumentos; sin interpolación del usuario.",
  },
  {
    id: "rce-shell-php",
    titulo: "RCE en PHP: system/exec/passthru/shell_exec",
    severidad: "critica",
    lenguajes: PHP,
    re: /\b(system|exec|passthru|shell_exec|popen|proc_open)\s*\(/,
    como: "Evitá la shell; si es imprescindible, escapá cada argumento con escapeshellarg() y whitelist de binarios.",
  },
  {
    id: "sqli-concat",
    titulo: "SQLi: consulta armada por concatenación",
    severidad: "critica",
    re: /(SELECT(?![-\w])|INSERT\s+INTO(?![-\w])|UPDATE\s+\w+\s+SET(?![-\w])|DELETE\s+FROM(?![-\w]))[^;\n]*(\+\s*\w|\$\{|%s|'\s*\+)/i,
    excluir: /(\?\s*\)|placeholder|prepared|parametriz)/i,
    como: "Consultas parametrizadas: `WHERE id = ?` con args en array (node-mysql, PDO, sqlite3).",
  },
  {
    id: "sqli-template",
    titulo: "SQLi: consulta con interpolación ${}",
    severidad: "critica",
    lenguajes: JS,
    re: /(?:SELECT(?![-\w])|INSERT\s+INTO(?![-\w])|UPDATE(?![-\w])|DELETE\s+FROM(?![-\w]))[^\n]*\$\{/,
    como: "Nada de ${} dentro del SQL: pases los valores como parámetros del driver.",
  },
  {
    id: "secret-duro",
    titulo: "Secreto hardcodeado (clave/token/contraseña literal)",
    severidad: "critica",
    re: /(api[_-]?key|apikey|secret|token|passw(?:or)?d|credential)s?["']?\s*[:=]\s*["'][A-Za-z0-9+/_\-\.=]{12,}["']/i,
    excluir: /(process\.env|os\.environ|example|changeme|your[_-]|<|\{\{|placeholder|xxx)/i,
    como: "Sacá el valor a variable de entorno (.env fuera del repo) y leelo con process.env/os.environ.",
  },
  {
    id: "secret-private-key",
    titulo: "Clave privada embebida en el código",
    severidad: "critica",
    re: /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+|DSA\s+|PGP\s+)?PRIVATE KEY-----/,
    como: "Nunca versionar claves privadas: movelas a un archivo de permisos 600 fuera del proyecto.",
  },
  {
    id: "traversal-ruta",
    titulo: "Path traversal: ruta de archivo construida desde el request",
    severidad: "alta",
    lenguajes: JS.concat(PY, PHP),
    re: /(readFile|readFileSync|createReadStream|sendFile|open\s*\(|file_get_contents)\s*\([^)]*(req\.(query|params|body)|request\.(query|params)|\$_(GET|POST)|\.\.\/)/,
    como: "Validá con whitelist de nombres y path.resolve + comprobación de prefijo contra la raíz permitida.",
  },
  {
    id: "cors-wildcard",
    titulo: "CORS: Access-Control-Allow-Origin * (con o sin credenciales)",
    severidad: "alta",
    re: /(Access-Control-Allow-Origin["']?\s*[:,=]\s*["']\*["']|cors\(\s*\{\s*origin\s*:\s*["']?\*)/,
    como: "Whitelist explícita de orígenes; nunca * junto con credentials: true.",
  },
  {
    id: "csp-ausente",
    titulo: "HTML con <script> inline y sin Content-Security-Policy",
    severidad: "media",
    lenguajes: ["html", "htm"],
    re: /<script(?![^>]*\bsrc=)[^>]*>/i,
    como: "Añadí <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'\"> o mandá el código a un archivo externo.",
  },
  {
    id: "cookie-insegura",
    titulo: "Cookie sin HttpOnly/Secure (robo de sesión por XSS)",
    severidad: "alta",
    re: /[Ss]et-Cookie["']?\s*[:,=]|document\.cookie\s*=/,
    excluir: /(HttpOnly|httponly)/,
    como: "Cookies de sesión: HttpOnly + Secure + SameSite=Lax/Strict; nunca guardes tokens de sesión en document.cookie.",
  },
  {
    id: "deserializacion",
    titulo: "Deserialización peligrosa (pickle/yaml.load/unserialize)",
    severidad: "critica",
    re: /pickle\.loads?\s*\(|yaml\.load\s*\((?![^)]*SafeLoader)|marshal\.loads?\s*\(|unserialize\s*\(|JSON\.parse\s*\(\s*(fs\.readFileSync|readFile)/,
    como: "JSON con validación de esquema, o yaml.safe_load; pickle solo para datos generados por vos mismo, nunca del usuario.",
  },
  {
    id: "hash-debil",
    titulo: "Hash débil para credenciales (md5/sha1)",
    severidad: "alta",
    // Sólo denuncia md5/sha1 CERCA de una credencial (passw/contrase/pwd/clave/
    // secreto/token). Un sha1() para checksums de archivos es legítimo y no hay
    // que gritarlo: el escáner que marca código sano se apaga al segundo día.
    re: /\b(?:md5|sha1)\s*\([^)]*(?:passw|contrase|pwd|clave|secreto|token)|(?:passw|contrase|pwd|clave|secreto|token)[^)]*\b(?:md5|sha1)\b|createHash\s*\(\s*["'](md5|sha1)["']\s*\)[^;]*(?:passw|contrase|pwd)/i,
    como: "Para contraseñas: bcrypt/argon2/scrypt. Para integridad de archivos está bien, pero declaralo en el comentario.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// v1.0.10 · F2 — CONTEXTO PARA `xss-innerhtml` (49 tandas revertidas en la
// sesión 1794120824912 por tratar igual un HUD de plantilla propia que un
// `innerHTML = location.hash`). La regla deja de ser una palabra: mira de
// dónde sale el dato.
// ─────────────────────────────────────────────────────────────────────────────

/** Datos que entran de fuera del programa: XSS real. */
const PATRON_DATO_EXTERNO =
  /(\blocation\b|URLSearchParams|document\.cookie|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|responseText|\.hash\b|\.search\b|\.href\b|\breq\.(?:query|params|body)|\bparams\b|\bquery\b|\bevent\.|\bprompt\s*\(|getAttribute\s*\(|\bdataset\b|formData|window\.name)/i;

/** Fábricas de HTML propio: el contenido lo escribe el programa, no el mundo. */
const PATRON_FUNCION_LOCAL =
  /^\s*(?:[\w$.]+\s*\()?\s*(?:render|plantilla|template|tpl|hud|marcador|etiqueta|card|fila|celda|item|construir|generar|dibujar|formatear|crear)[\w$]*\s*\(/i;

export type OrigenInnerHtml = "externo" | "local" | "dudoso";

/**
 * ¿De dónde sale el texto que se asigna a `innerHTML`? Determinista y avaricioso
 * hacia el lado seguro: solo llamamos `local` a lo que PODEMOS probar local
 * (literal al inicio del lado derecho, o fábrica de nombre reconocible sin
 * datos externos en la línea). Todo lo demás es `dudoso` y sigue siendo
 * crítico — lo que cambia es que la reversión pasa a ser por archivo (F1).
 */
export function clasificarOrigenInnerHtml(linea: string): OrigenInnerHtml {
  const m = /\.innerHTML\s*\+?=\s*([\s\S]*)$/.exec(linea) || /insertAdjacentHTML\s*\(\s*["'][\w-]+["']\s*,\s*([\s\S]*)$/.exec(linea);
  const rhs = m ? m[1] : linea;
  if (PATRON_DATO_EXTERNO.test(rhs)) return "externo";
  const arrancaLiteral = /^\s*["'`]/.test(rhs);
  const arrancaFabrica = PATRON_FUNCION_LOCAL.test(rhs);
  if ((arrancaLiteral || arrancaFabrica) && !PATRON_DATO_EXTERNO.test(rhs)) return "local";
  return "dudoso";
}

/**
 * Permiso explícito en el propio archivo: `// cn-allow: xss-innerhtml motivo`.
 * Excluir del todo o del nada: la línea se ignora para ESA regla y queda un
 * registro `baja` en el acta (y por tanto en el log del quirófano).
 */
export function leerCnAllow(linea: string): { regla: string; motivo: string } | null {
  const m = /(?:\/\/|\/\*|<!--)\s*cn-allow:\s*([\w-]+|\*)\s*([^\r\n*]*(?:\*\/|-->)[^\r\n]*)?/.exec(linea) ||
            /(?:\/\/|\/\*)\s*cn-allow:\s*([\w-]+|\*)\s*([^\r\n]*)?/.exec(linea);
  if (!m) return null;
  return { regla: m[1].toLowerCase(), motivo: String(m[2] || "sin motivo declarado").replace(/(?:\*\/|-->).*$/, "").trim() || "sin motivo declarado" };
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export function extensionDe(archivo: string): string {
  const m = String(archivo || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Analiza UN archivo. Determinista: mismo texto, mismos hallazgos, en orden. */
export function analizarCodigo(archivo: string, codigo: string, opciones: OpcionesAnalisis = {}): Hallazgo[] {
  const ext = extensionDe(archivo);
  const lineas = String(codigo || "").replace(/\r\n/g, "\n").split("\n");
  const out: Hallazgo[] = [];
  const permitidas = aSetMinusculas(opciones.permitidas || []);
  const allowsRegistrados = new Set<string>();
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const allow = leerCnAllow(linea);
    for (const regla of REGLAS_CERRADURA) {
      if (regla.lenguajes && regla.lenguajes.length > 0 && !regla.lenguajes.includes(ext)) continue;
      if (linea.trimStart().startsWith("//") || linea.trimStart().startsWith("#") || linea.trimStart().startsWith("*")) continue;
      regla.re.lastIndex = 0;
      if (!regla.re.test(linea)) continue;
      if (regla.excluir) {
        regla.excluir.lastIndex = 0;
        if (regla.excluir.test(linea)) continue;
      }
      // cn-allow en esta misma línea → no es hallazgo de riesgo, es permiso usado.
      if (allow && (allow.regla === "*" || allow.regla === regla.id)) {
        const clave = `${regla.id}:${i}`;
        if (!allowsRegistrados.has(clave)) {
          allowsRegistrados.add(clave);
          out.push({
            regla: "cn-allow", titulo: `Permiso explícito usado: ${regla.id} — ${allow.motivo}`,
            severidad: "baja", archivo, linea: i + 1,
            extracto: linea.trim().slice(0, 160),
            como: "El permiso quedó registrado. Si el motivo deja de ser cierto, borra la directiva.",
          });
        }
        continue;
      }
      let severidad: SeveridadCerradura = regla.severidad;
      let titulo = regla.titulo;
      // F2 · innerHTML con dato probadamente local → aviso, no bloqueo.
      if (regla.id === "xss-innerhtml") {
        const origen = clasificarOrigenInnerHtml(linea);
        if (origen === "local") {
          severidad = severidad === "critica" ? "media" : severidad;
          titulo += " · plantilla local (dato no externo): aviso, no bloqueo";
        } else if (origen === "dudoso") {
          titulo += " · origen del dato no concluyente";
        }
      }
      // Permiso de proyecto (.cn-seguridad.json) → queda en el acta como baja.
      if (permitidas.has(regla.id)) {
        severidad = "baja";
        titulo += ` · permitido por ${(opciones.concedidoPor || ".cn-seguridad.json")}`;
      }
      out.push({
        regla: regla.id,
        titulo,
        severidad,
        archivo,
        linea: i + 1,
        extracto: linea.trim().slice(0, 160),
        como: regla.como,
      });
      if (out.length >= 400) return out; // techo anti-explosión en archivos rarísimos
    }
  }
  return out;
}

/** Set sin colisión de prototipo para listas venidas de JSON. */
function aSetMinusculas(items: string[]): Set<string> {
  const s = new Set<string>();
  for (const i of items) if (typeof i === "string") s.add(i.toLowerCase());
  return s;
}

export interface ResumenCerradura {
  total: number;
  criticas: number;
  altas: number;
  medias: number;
  bajas: number;
  /** true si hay que bloquear la tanda (críticas presentes). */
  bloquea: boolean;
}

export function contarHallazgos(hallazgos: Hallazgo[]): ResumenCerradura {
  const r: ResumenCerradura = { total: hallazgos.length, criticas: 0, altas: 0, medias: 0, bajas: 0, bloquea: false };
  for (const h of hallazgos) {
    if (h.severidad === "critica") r.criticas++;
    else if (h.severidad === "alta") r.altas++;
    else if (h.severidad === "media") r.medias++;
    else r.bajas++;
  }
  r.bloquea = r.criticas > 0;
  return r;
}

/** Analiza un lote de archivos (inventario del proyecto o tanda tocada). */
export function analizarProyecto(archivos: Array<{ path: string; content: string }>, opciones: OpcionesAnalisis = {}): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const a of archivos || []) {
    if (!a || typeof a.content !== "string") continue;
    if (a.content.length > 800 * 1024) continue; // archivo descomunal: no es código de app
    out.push(...analizarCodigo(a.path, a.content, opciones));
    if (out.length >= 400) break;
  }
  return out;
}

/**
 * Informe legible para el modelo y para el usuario. Acotado: 12 hallazgos con
 * línea y remedio valen más que 300 sin contexto. El conteo completo igual se
 * declara para que nadie crea que "no había más".
 */
export function informeCerradura(hallazgos: Hallazgo[], max = 12): string {
  if (hallazgos.length === 0) return "🔒 CERRADURA: sin hallazgos en el código revisado.";
  const r = contarHallazgos(hallazgos);
  const lineas = [
    `🔒 CERRADURA — ${r.total} hallazgo(s): ${r.criticas} crítica(s), ${r.altas} alta(s), ${r.medias} media(s), ${r.bajas} baja(s).`,
  ];
  for (const h of hallazgos.slice(0, max)) {
    lineas.push(`  · [${h.severidad}] ${h.regla} — ${h.archivo}:${h.linea} — ${h.titulo}`);
    lineas.push(`      cómo arreglar: ${h.como}`);
  }
  if (hallazgos.length > max) lineas.push(`  … y ${hallazgos.length - max} hallazgo(s) más en el informe completo.`);
  if (r.bloquea) lineas.push("Las CRÍTICAS bloquean la tanda: arreglalas antes de decir que terminaste.");
  return lineas.join("\n");
}
