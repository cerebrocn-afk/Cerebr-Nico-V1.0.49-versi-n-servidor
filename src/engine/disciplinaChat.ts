/**
 * disciplinaChat.ts — v1.66.0 · EL CHAT ES ESPAÑOL Y CONTEXTO, NO UN VOLCADERO
 * ============================================================================
 * RAÍZ (sesión `mistral-code-fim` del 22/10, chat exportado): el modelo —sobre
 * todo los FIM/code de Mistral— «escribe y escribe de más»: llena la burbuja del
 * chat con bloques de código completos y líneas de comandos que NO aportan nada
 * al usuario, porque el código ya va al EDITOR y los comandos a la TERMINAL. El
 * chat debe quedar en lo que el humano necesita leer: español y contexto.
 *
 * QUÉ HACE: separa el canal. Dado el texto que el modelo mandó al chat, extrae
 * los bloques cercados (```lang …``` y la forma con `file="ruta"`) y las líneas
 * de comando de consola, y los REEMPLAZA por una nota de UNA línea en español
 * que dice a dónde fue cada artefacto. El código/comando no se pierde — se
 * devuelve aparte para que el llamador lo enrute al editor/terminal—, pero deja
 * de inundar la conversación.
 *
 * CONTROL DE FALSO POSITIVO: un fragmento CORTO en línea (`npm run build`,
 * `const x = 1`) dentro de una frase explicativa NO se toca — solo se depuran
 * los BLOQUES cercados y los bloques de comandos, que son el ruido real. Si tras
 * depurar no queda prosa, se deja un resumen honesto en vez de un chat vacío.
 *
 * PURO: sin red, sin fs, sin estado global. Se prueba en seco.
 */

export type TipoArtefacto = "codigo" | "comando";

export interface ArtefactoExtraido {
  tipo: TipoArtefacto;
  /** lenguaje declarado en la cerca (``` ```ts```), vacío si no había. */
  lang: string;
  /** ruta si el bloque traía `file="…"` (destino en el editor). */
  file?: string;
  /** líneas del bloque. */
  lineas: number;
  /** el contenido crudo, para enrutarlo al editor/terminal. */
  contenido: string;
}

export interface ResultadoDisciplina {
  /** el texto que SÍ debe verse en el chat (español + contexto). */
  chatLimpio: string;
  /** lo que se sacó del chat, para enrutar al editor/terminal. */
  artefactos: ArtefactoExtraido[];
  /** cuántos caracteres de ruido se quitaron del chat. */
  caracteresPurgados: number;
}

/** Lenguajes de cerca que son COMANDOS de consola (van a la terminal). */
const LANGS_COMANDO = new Set([
  "bash", "sh", "shell", "zsh", "console", "cmd", "bat", "batch",
  "powershell", "ps", "ps1", "terminal",
]);

/** Lee el atributo `file="…"` / `path="…"` del encabezado de la cerca. */
function rutaDeCabecera(cabecera: string): string | undefined {
  const m = cabecera.match(/(?:file|path)\s*=\s*["']([^"']+)["']/i);
  return m ? m[1].trim() : undefined;
}

/** Primer token de lenguaje de la cerca (antes de cualquier atributo). */
function langDeCabecera(cabecera: string): string {
  const t = cabecera.trim().split(/\s+/)[0] || "";
  return /^[A-Za-z0-9_+-]+$/.test(t) ? t.toLowerCase() : "";
}

/** Resumen de una línea de un comando (el primero, acotado). */
function resumenComando(contenido: string): string {
  const primera = contenido.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
  return primera.length > 80 ? primera.slice(0, 77) + "…" : primera;
}

/**
 * Depura el texto destinado al CHAT: saca bloques de código y de comandos,
 * deja una nota contextual en su lugar y devuelve los artefactos aparte.
 */
export function depurarChatParaUsuario(texto: string): ResultadoDisciplina {
  const entrada = String(texto ?? "");
  const artefactos: ArtefactoExtraido[] = [];
  let purgados = 0;

  // Cercas de código: ```[cabecera]\n … \n``` (cabecera = lang + posibles file="…").
  const reCerca = /```([^\n]*)\n([\s\S]*?)```/g;
  const chatLimpio = entrada.replace(reCerca, (bloque, cabecera: string, cuerpo: string) => {
    const lang = langDeCabecera(cabecera);
    const file = rutaDeCabecera(cabecera);
    const lineas = cuerpo.replace(/\n$/, "").split("\n").length;
    const esComando = LANGS_COMANDO.has(lang);
    artefactos.push({
      tipo: esComando ? "comando" : "codigo",
      lang,
      file,
      lineas,
      contenido: cuerpo.replace(/\n$/, ""),
    });
    purgados += bloque.length;
    if (esComando) {
      return `⌨️ [comando enviado a la terminal: \`${resumenComando(cuerpo)}\`]`;
    }
    const destino = file ? ` → ${file}` : ` (${lang || "código"}, ${lineas} línea${lineas === 1 ? "" : "s"})`;
    return `📄 [código enviado al editor${destino}]`;
  });

  const limpioFinal = colapsarEspacios(chatLimpio);
  return {
    chatLimpio: limpioFinal,
    artefactos,
    caracteresPurgados: purgados,
  };
}

/** Quita líneas en blanco repetidas que deja el reemplazo. */
function colapsarEspacios(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * ¿Este texto de chat es RUIDO? (ayuda a decidir si vale la pena depurar).
 * Heurística honesta: proporción de caracteres dentro de cercas sobre el total.
 */
export function proporcionDeCodigoEnChat(texto: string): number {
  const entrada = String(texto ?? "");
  if (!entrada) return 0;
  let enCercas = 0;
  const reCerca = /```[^\n]*\n[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = reCerca.exec(entrada)) !== null) enCercas += m[0].length;
  return Math.round((enCercas / entrada.length) * 100) / 100;
}
