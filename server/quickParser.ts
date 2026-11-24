/**
 * quickParser.ts — LOS MAPAS DE RUTAS DE LAS ACCIONES RÁPIDAS (v1.16.5)
 * Extraído del monolito para pagar las líneas de la continuidad del plan
 * (Fase 2: partir, no añadir). parseQuickAction los usa igual que antes.
 *
 * v1.16.6 — AQUÍ VIVE TAMBIÉN `parseQuickAction` ENTERO, y la guarda que
 * faltaba. El bug (capturado en pantalla, v1.16.5): toda orden del Editor web
 * viaja envuelta con la etiqueta «[ORDEN DEL EDITOR WEB] … no expliques:
 * ejecuta.»; con Agente PC encendido, el parser determinista veía «ejecuta» +
 * «orden», extractCommand pescaba «DEL EDITOR WEB» DE LA PROPIA ETIQUETA y lo
 * mandaba al puente como comando real. El puente hacía bien en rechazarlo
 * («binario no permitido: «DEL»») — lo que no hacía bien el IDE era corto-
 * circuitar ahí: la orden nunca llegaba al modelo y el editor web entero
 * estaba muerto por su propio envoltorio. La guarda `esOrdenDelEditorWeb` es
 * la única puerta: una orden marcada como del editor NO es acción rápida,
 * NUNCA, caiga quien caiga.
 */
export const FOLDER_MAP: Record<string, string> = {
  escritorio: "Desktop", desktop: "Desktop",
  documentos: "Documents", docs: "Documents", documents: "Documents",
  descargas: "Downloads", downloads: "Downloads",
};

// ============================================================
// LA ETIQUETA DEL EDITOR WEB — una sola cadena, dos dueños
// Frontend (src/constants.ts: WEB_EDITOR_ORDER_TAG) arma el envoltorio de la
// orden; aquí se deshace la trampa. Si alguien cambia una de las dos, la
// suite tests/accionesRapidas.test.ts pone el grito en el cielo: compara
// ambas fuentes contra esta constante.
// ============================================================
export const ETIQUETA_ORDEN_EDITOR_WEB = "[ORDEN DEL EDITOR WEB]";

/** ¿Este prompt es una orden del Editor web? Entonces NO es acción rápida. */
export function esOrdenDelEditorWeb(prompt: string): boolean {
  return prompt.trimStart().toUpperCase().startsWith(ETIQUETA_ORDEN_EDITOR_WEB.toUpperCase());
}

export function extractQuoted(s: string): string | null {
  const m = s.match(/["'«]([^"'«»]{1,2000})["'»]/s);
  return m ? m[1] : null;
}

export function extractFolder(s: string): string {
  for (const [k, v] of Object.entries(FOLDER_MAP)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(s)) return `${v}/`;
  }
  const cm = s.match(/\bcarpeta\s+([\w\- ]+?)(?=[\s.,;]|$)/i);
  if (cm) return `${cm[1].trim()}/`;
  return "Desktop/"; // por defecto: Escritorio
}

export function extractFilename(s: string): string | null {
  const sClean = s.trim();
  // 1) Si hay una ruta de archivo explícita (con barra), usar el nombre base
  const pathM = sClean.match(/(?:[A-Za-z]:\\|\/)[^\s"']{1,180}\.\w{1,10}/);
  if (pathM) {
    const p = pathM[0];
    return p.split(/[\\/]/).pop() ?? p;
  }
  // 2) "llamado X" / "de nombre X" / "named X" → el token siguiente
  const namedM = sClean.match(/\b(?:llamad[ao]|de\s+nombre|named)\s+["']?([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9]{1,10})?)["']?/i);
  if (namedM) return namedM[1];
  // 3) Token con extensión de 2-10 letras (el último del texto)
  const tokens = sClean.split(/\s+/);
  let best: string | null = null;
  for (const t of tokens) {
    const clean = t.replace(/^[«"'(\[]+|[»"')\].,;:]+$/g, "");
    if (/^[A-Za-z0-9_\-]+\.[A-Za-z0-9]{2,10}$/.test(clean)) best = clean;
  }
  return best;
}

// ============================================================
// v1.23.0 · LA PROSA NO ES UN COMANDO (capturas del usuario, 2026-09-29)
// ------------------------------------------------------------
// «binario no permitido: «de»» y ««en»» no los produjo un comando: los produjo
// el propio captador. El regex m2 de abajo pescaba lo que viniera después de
// «comando|orden» y en frases como «ejecutá el comando de compilar» devolvía
// «de compilar» — que el puente, con razón, rechazaba. Y peor: el rechazo
// CORTABA el turno (pc-quick-action), así que el modelo nunca se enteraba del
// pedido real. Con la lista de stopwords y el detector de prosa, una frase en
// español deja de ser un comando antes de llegar al puente.
// ============================================================
const STOPWORDS_IDIOMA = new Set([
  "de", "la", "el", "los", "las", "un", "una", "que", "en", "con", "por", "para", "se", "su", "es", "y", "o",
  "del", "al", "lo", "te", "me", "mi", "tu", "si", "no", "sí", "como", "pero", "muy", "está", "esta", "este",
  "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with", "is", "are", "this", "that", "it",
  "compilar", "ejecutar", "ejecuta", "corre", "corré", "verifica", "revisa", "revisar", "prueba", "probar",
  "script", "terminal", "build", "comando", "orden", "instruccion", "instrucción", "archivo", "archivos",
  // v1.43.0 — LA TRAMPA DE «comando interno o externo» (captura de Mario): el
  // error de cmd.exe «'npm.cmd' no se reconoce como un comando interno o
  // externo» hacía que el regex m2 capturara «interno o externo» y el puente
  // rechazara «binario no permitido: «interno»». Estas palabras del propio
  // mensaje de error nunca son un binario: a la lista de prosa.
  "interno", "externo", "reconoce", "recognized", "internal", "external", "command", "not", "found",
]);

/** ¿Esto es prosa disfrazada de comando? (palabras del idioma, acentos, oraciones) */
export function pareceProsa(texto: string): boolean {
  const t = String(texto || "").trim();
  if (!t) return true;
  const tokens = t.split(/\s+/);
  const primera = tokens[0].toLowerCase().replace(/[^a-záéíóúñü0-9_\-./\\~]/g, "");
  if (STOPWORDS_IDIOMA.has(primera)) return true;
  // Un binario real no lleva acentos ni «ñ»: si el primer token tiene caracteres
  // alfabéticos no-ASCII, es una palabra, no un ejecutable.
  if (/[áéíóúñüÁÉÍÓÚÑÜ]/.test(tokens[0])) return true;
  // Mayoría de stopwords → frase.
  const prosa = tokens.filter((w) => STOPWORDS_IDIOMA.has(w.toLowerCase().replace(/[^a-záéíóúñü]/g, ""))).length;
  if (tokens.length >= 3 && prosa / tokens.length >= 0.4) return true;
  // Un comando puede tener espacios; una frase termina en punto y tiene comas.
  if (tokens.length >= 4 && /[.,;]$/.test(t)) return true;
  return false;
}

/**
 * ¿El prompt es CONTENIDO PEGADO (logs, volcados, trazas, código) y no una
 * orden? El caso medido: «si le doy un código de algún log se tranca» — el
 * texto pegado decía palabras como «ejecutar»/«comando» (¡un log npm las dice
 * todas!), el parser lo declaraba acción rápida, el puente lo rechazaba y el
 * turno moría con un toast rojo sin que el modelo viera nunca el log.
 * Un log NUNCA es una acción rápida: va al modelo, que es para lo que está.
 */
export function pareceContenidoPegado(prompt: string): boolean {
  const p = String(prompt || "");
  if (/```/.test(p)) return true; // bloque de código cercado
  const lineas = p.split("\n");
  if (lineas.length > 12) return true; // una orden de PC es de una o dos líneas
  if (/\u001b\[/.test(p)) return true; // códigos ANSI de terminal
  if (/(Traceback \(most recent call last\)|npm ERR!|npm error |at .*:\d+:\d+|\[exit \d+\]|exit code \d+|Command failed|Exception in thread|panic: |segmentation fault|kernel panic)/i.test(p)) return true;
  // v1.43.0 — el aviso de «binario no reconocido» del propio shell es un LOG, no
  // una orden: cmd.exe («no se reconoce como un comando interno o externo»),
  // bash/PowerShell («command not found», «is not recognized as the name of a
  // cmdlet»), y los clásicos «No such file or directory» / «ENOENT». Pegar eso
  // en el chat pedía al modelo que lo arregle, no que lo ejecute.
  if (/(no se reconoce como un comando|is not recognized as (?:an? )?(?:internal|external|the name)|command not found|: not found|No such file or directory|ENOENT)/i.test(p)) return true;
  if (/^\s*(\$|>)\s+\S+/m.test(p) && lineas.length > 3) return true; // eco de consola
  return false;
}

export function extractCommand(s: string): string | null {
  // v1.16.6 — LAS ETIQUETAS [ASÍ] SE BORRAN ANTES DE LEER EL COMANDO.
  // El captador de abajo buscaba «orden|comando|instrucción» y se tragaba lo
  // que viniera detrás, incluidas las palabras de una etiqueta del propio
  // IDE: «[ORDEN DEL EDITOR WEB]» le devolvía «DEL EDITOR WEB» como comando.
  // Una etiqueta no es un comando; se quita y ya.
  const sin = s.replace(/\[[^\]]{0,80}\]/g, " ");
  const quoted = extractQuoted(sin);
  const m1 = sin.match(/(?:comando|orden|instrucci[oó]n|script)\s+["'«]([^"'«»]{1,400})["'»]/i);
  if (m1) {
    const cmd = m1[1].trim().split("\n")[0].trim();
    return cmd && !pareceProsa(cmd) ? cmd : null;
  }
  const m2 = sin.match(/(?:el |la |este |esa |una |un )?(?:comando|orden|instrucci[oó]n)\s+([A-Za-z_][\w\-./: ]{1,160})/i);
  if (m2) {
    const cmd = m2[1].trim();
    // v1.23.0 — LA PRUEBA DE LA PROSA: «el comando de compilar» devolvía
    // «de compilar». Si el primer token es una palabra del idioma, no hay
    // comando: mejor devolver null (y que lo resuelva el modelo) que
    // mandarle basura al puente.
    if (cmd && !pareceProsa(cmd)) return cmd;
    return null;
  }
  if (quoted && /ejecut|correr|corre|comando|run/i.test(sin)) {
    const cmd = quoted.trim().split("\n")[0].trim();
    return cmd && !pareceProsa(cmd) ? cmd : null;
  }
  return null;
}

export interface ParsedAction {
  intent: "write" | "read" | "delete" | "list" | "exec";
  path?: string;
  content?: string;
  command?: string;
}

export function parseQuickAction(prompt: string): ParsedAction | null {
  const p = prompt.trim();
  if (!p) return null;

  // v1.16.6 — GUARDA DEL EDITOR (la del bug «DEL»): la orden envuelta NO es
  // una petición de PC, es una petición de DISEÑO para el modelo. Se corta
  // aquí, antes que cualquier otra regla, para que ningún cambio futuro en
  // los regex pueda reinterpretar el envoltorio como comando.
  if (esOrdenDelEditorWeb(p)) return null;

  // v1.23.0 — GUARDA DEL LOG PEGADO: el contenido pegado (logs, trazas, código
  // con más de 12 líneas) NUNCA es una acción rápida, aunque mencione
  // «comando», «ejecutar» o «error». Va al modelo. Sin esta guarda, pegar un
  // log npm (que dice «npm run build» y «Command failed» por naturaleza)
  // secuestraba el turno y devolvía un rechazo del puente: «se tranca con un
  // log y no contesta».
  if (pareceContenidoPegado(p)) return null;

  // Ejecutar comando
  if (/\b(ejecut|corr|run|lleva)\w*/i.test(p) && /\b(comando|orden|instrucci[oó]n|script)\b/i.test(p)) {
    const command = extractCommand(p);
    if (command) return { intent: "exec", command };
    // v1.23.0 — sin comando extraíble, la frase era prosa: que hable el modelo,
    // no el puente. (Antes caía igual al ejecutor con un comando basura.)
    return null;
  }

  const folder = extractFolder(p);
  const filename = extractFilename(p);

  // v1.23.0 — GUARDA DE LA RUTA REAL (captura: «No existe: Desktop\validar.mjs»
  // cuando el usuario pedía el validar.mjs DEL PROYECTO): leer/listar/borrar
  // contra la PC solo se cortocircuita cuando el pedido NOMBRA una carpeta de
  // la PC (Escritorio/Documentos/Descargas), una ruta absoluta o «~». Sin eso,
  // «leer validar.mjs» es una petición del sandbox → el modelo decide. El
  // default «Desktop/» del extractor era una adivinanza que escribía en la PC.
  const mencionaCarpetaPc = /(^|[\s"'«(])(desktop|escritorio|documents?|documentos|downloads?|descargas|onedrive|~[\\/]?)/i.test(p)
    || /(?:[A-Za-z]:\\|\\\\|\/home\/|\/Users\/|\/tmp\/|\/var\/)/.test(p);

  // Borrar
  if (/\b(borr|elimina|eliminar|borra|delete|quitar|suprime)\b/i.test(p) && /archivo|archivos|carpeta|folder|documento|\.\w{1,10}/i.test(p)) {
    if (filename && mencionaCarpetaPc) return { intent: "delete", path: folder + filename };
    if (filename) return null; // «borrar el archivo viejo» no es una orden para el puente
  }

  // Leer
  if (/\b(le|lee|leer|muest|mostr|copia|print)\b/i.test(p) && /archivo|contenido|texto|de\s+/i.test(p)) {
    if (filename && mencionaCarpetaPc) return { intent: "read", path: folder + filename };
    if (filename) return null;
  }

  // Listar
  if (/\b(lista|listar|list|mostr|mostrar|contenid|qu[eé] hay|ver|explora)\b/i.test(p) && /archivos|carpeta|contenido|folder|directorio|lista/i.test(p)) {
    if (mencionaCarpetaPc) return { intent: "list", path: folder };
    return null;
  }

  // Crear (prioridad alta: "crear/make/un archivo")
  if (/\b(crea|crear|crea(r)?|genera|generar|haz|hacer|escribi|escribir|guarda|guardar|new|make|write)\b/i.test(p) && /archivo|texto|documento|note|nota|\.txt|\.md|\.py|\.js|\.ts|\.json/i.test(p)) {
    const content =
      extractQuoted(p) ??
      (p.match(/(?:con (?:el |la )?(?:texto|contenido)|que dice|dice|con contenido)\s+(.+)/is)?.[1]?.trim() || "");
    if (filename && (mencionaCarpetaPc || /con (?:el |la )?(?:texto|contenido)|que dice|dice/i.test(p))) {
      return { intent: "write", path: folder + filename, content };
    }
    if (filename) return null; // «creá un archivo utils.ts» → obra del sandbox, no del puente
  }

  return null;
}
