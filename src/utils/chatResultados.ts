/**
 * chatResultados.ts — EL CHAT ES UN INFORME, NO UN VOLCADO (v1.70.6)
 * ===================================================================
 * 🐞 LA QUEJA MEDIDA (sesión exportada 24/10, modelo mistral-code-latest):
 * un solo mensaje del agente tenía 20.000 caracteres, 16 vallas de código y
 * 40 frases de relleno («Voy a…», «Ahora voy a…»). El usuario: «es una biblia
 * el chat lleno de código, no termina nunca de escribir».
 *
 * La entrega de código NO se toca: los bloques ```file="ruta"``` son el canal
 * por el que el IDE escribe los archivos (utils/codeParser.ts). Lo que cambia
 * es la FORMA en que se VEN:
 *   · un bloque con ruta → una ficha colapsada: «app.js · 68 líneas · aplicado»,
 *     expandible con clic;
 *   · la prosa de intención («Voy a reemplazar…») → UNA sola línea viva
 *     (la última; los repetidos se cuentan y se callan);
 *   · el resto del texto, tal cual.
 *
 * Módulo PURO (sin React): el mismo parser sirve a la vista y al test.
 */

export type SegmentoMensaje =
  | { tipo: "prosa"; texto: string }
  | { tipo: "archivo"; ruta: string | null; lenguaje: string; lineas: number; contenido: string; abierto: boolean }
  | { tipo: "intencion"; texto: string; tapadas: number };

/** Valla ```info\n...contenido...``` (cerrada o abierta — streaming). */
const RE_VALLA = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;

/** Línea de intención: futuro de relato en vez de resultado. */
const RE_INTENCION =
  /^\s{0,6}(?:[-*>•]\s+|#{1,6}\s+|\d+[.)]\s+)?(?:✅|✔️|🔹|📌|🔸|⏳|👉\s*)?(?:ahora\s+)?(voy\s+a|voy\s+por|me\s+voy\s+a|proced(?:o|er[éé])\s+a|pasar[ée]\s+a|tocar(?:\s+\w+)?\s+a|el\s+siguiente\s+paso\s+(?:es|ser[áa])|siguiente\s+paso\s*:|a\s+continuaci[óo]n\s+(?:voy\s+a|hago|ejecuto|procedo))\b/i;

/** Separadores decorativos que solo ocupan pantalla. */
const RE_SEPARADOR = /^\s*(?:[-*_]\s*){3,}\s*$/;

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** Quita rótulos markdown/emoji sueltos del principio de una intención. */
const limpiarIntencion = (linea: string) =>
  linea
    .replace(/^\s{0,6}(?:[-*>•]\s+|#{1,6}\s+|\d+[.)]\s+)?/, "")
    .replace(/^[✅✔️🔹📌🔸⏳👉]+\s*/u, "")
    .replace(/\*\*/g, "")
    .trim()
    .replace(/\s*[.:;]\s*$/, "");

function extraerRuta(info: string): string | null {
  const m = info.match(/(?:file|filepath|path)\s*=\s*["']?([^"'\n ]+)["']?/i);
  return m && m[1] ? m[1] : null;
}

function extraerLenguaje(info: string, ruta: string | null): string {
  const crudo = (info.trim().split(/\s+/)[0] || "");
  const limpio = crudo.toLowerCase().replace(/[^a-z0-9+#-]/g, "");
  const esRótulo = crudo.includes("=") || /^(file|filepath|path)/i.test(limpio);
  if (limpio && !esRótulo) return limpio;
  if (ruta) return (ruta.split(".").pop() || "").toLowerCase();
  return "";
}

/**
 * Parte el texto del asistente en segmentos de presentación.
 * — sin vallas: un único segmento de prosa (igual que antes);
 * — con vallas: fichas colapsables + la última intención en vivo.
 */
export function segmentarMensaje(texto: string): SegmentoMensaje[] {
  const src = String(texto ?? "");
  if (!src) return [];
  const segs: SegmentoMensaje[] = [];

  const verterProsa = (trozo: string) => {
    if (!trozo) return;
    const lineas = trozo.split("\n");
    const buffer: string[] = [];
    const volcarProsa = () => {
      // colapsar 3+ líneas en blanco a un salto: aire, no un muro de saltos
      const txt = buffer.join("\n").replace(/\n{3,}/g, "\n\n");
      buffer.length = 0;
      if (txt.trim()) segs.push({ tipo: "prosa", texto: txt.replace(/^\n+|\n+$/g, "") || txt });
    };
    const volcarIntencion = (linea: string) => {
      const limpio = limpiarIntencion(linea);
      if (!limpio) return;
      const prev = segs[segs.length - 1];
      if (prev && prev.tipo === "intencion") {
        // la nueva reemplaza a la anterior: el plan cambió de frase, no de faena
        if (normalizar(prev.texto) !== normalizar(limpio)) {
          prev.texto = limpio;
          prev.tapadas += 1;
        }
        return;
      }
      segs.push({ tipo: "intencion", texto: limpio, tapadas: 0 });
    };
    for (const l of lineas) {
      if (RE_SEPARADOR.test(l)) continue;
      if (RE_INTENCION.test(l)) { volcarProsa(); volcarIntencion(l); continue; }
      buffer.push(l);
    }
    volcarProsa();
  };

  let ultimo = 0;
  RE_VALLA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_VALLA.exec(src)) !== null) {
    if (m.index > ultimo) verterProsa(src.slice(ultimo, m.index));
    const info = m[1] || "";
    const contenido = (m[2] || "").replace(/\n$/, "");
    const ruta = extraerRuta(info);
    const abierto = !/```\s*$/.test(m[0]);
    segs.push({
      tipo: "archivo",
      ruta,
      lenguaje: extraerLenguaje(info, ruta),
      lineas: contenido ? contenido.split("\n").length : 0,
      contenido,
      abierto,
    });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < src.length) verterProsa(src.slice(ultimo));
  return segs;
}

/** ¿Este mensaje justifica la vista de resultados? (vallas con sustancia) */
export function esMensajeDenso(texto: string): boolean {
  const src = String(texto ?? "");
  if (!src.includes("```")) return false;
  let total = 0;
  RE_VALLA.lastIndex = 0;
  let m: RegExpExecArray | null;
  let vallas = 0;
  while ((m = RE_VALLA.exec(src)) !== null) {
    vallas++;
    total += (m[2] || "").length;
  }
  return vallas >= 2 || total > 700;
}

/** Ficha de una valla, en una línea, para el log/terminal. */
export function rotuloSegmento(s: SegmentoMensaje): string {
  if (s.tipo === "archivo") return `${s.ruta || s.lenguaje || "bloque"} · ${s.lineas} líneas${s.abierto ? " · escribiendo…" : ""}`;
  if (s.tipo === "intencion") return `→ ${s.texto}`;
  return s.texto;
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.84.1 · CEREBRO/AUTO LIMPIO — «SOLO LA RESOLUCIÓN, EL RESTO DETRÁS»
// ───────────────────────────────────────────────────────────────────────────
// 🐞 LA QUEJA MEDIDA (sesión exportada 26/10, seis mensajes, misma sarta de
// ruegos: 11 «solo pases al chat el Veredicto final», 17 «sé más breve»,
// 19 «una respuesta más limpia, todos los otros datos que sean una ventana que
// se abra en el mensaje»). El enjambre ecléctico contestaba con el informe
// COMPLETO — tabla de voces, puntajes, acuerdo, divergencias, riesgos, resumen
// — y la resolución, que es lo único que se lee, quedaba al final de un muro.
//
// LA REGLA (palabra de Mario, ajustada el 27/10: «que no resuma tanto, solo lo
// necesario»): en el chat se entrega la RESOLUCIÓN = resumen del enjambre +
// veredicto final. Los demás detalles NO se tiran: viajan dentro del mismo
// mensaje, en una ventana cerrada con su botón («ver el pensamiento / la tarea
// realizada»). Copiar, voz y export siguen usando el crudo: nada se pierde.
//
// El formato origen lo produce `informeEclectico` (engine/enjambreEclectico.ts)
// y es determinista: rótulo 🎭 en la primera línea, marcador
// «**Veredicto final de la tarea:**» a solas en su línea, y al pie
// «> Tarea consultada: …». Si el texto no calza ese molde exacto, se devuelve
// null y se muestra el crudo — mejor un muro honesto que un recorte mentiroso.
// ═══════════════════════════════════════════════════════════════════════════

export interface EclecticaDividida {
  /** Solo la resolución: lo que el usuario pidió ver en el chat. */
  resolucion: string;
  /** El informe completo, tal cual — para la ventana plegada. Nada se pierde. */
  detalle: string;
  /** «3/5» — voces que contestaron (rótulo del informe). */
  voces: string;
  /** «40 %» — acuerdo medido; "" si el informe no lo decía. */
  acuerdo: string;
}

/** Rótulo de la respuesta ecléctica: SOLO en la primera línea del mensaje. */
const RE_ELECTICA_CAB = /^\s*🎭 RESPUESTA ECL[Ée]CTICA\b/;
/**
 * Marcador del resumen del enjambre: línea a solas, tal como la emite
 * `informeEclectico`. v1.84.4 — Mario pidió «que no resuma tanto, solo lo
 * necesario»: la pantalla útil empezó AQUÍ, no en el veredicto seco.
 */
const RE_ELECTICA_RESUMEN = /^[ \t]*\*\*Resumen del enjambre:\*\*[ \t]*$/m;
/** Marcador de veredicto: línea a solas, tal como la emite `informeEclectico`. */
const RE_ELECTICA_VEREDICTO = /^\*\*Veredicto final de la tarea:\*\*[ \t]*$/m;
/** La tarea consultada cierra el informe (va al detalle, no a la resolución). */
const RE_ELECTICA_TAREA = /^[ \t]*>[ \t]*Tarea consultada:/m;
const RE_ELECTICA_VOCES = /(\d+)\s*\/\s*(\d+) voces/;
const RE_ELECTICA_ACUERDO = /\*\*Acuerdo medido:\*\*[^\d]*(\d+)\s*%/;

/**
 * Parte una RESPUESTA ECLÉCTICA (cerebro/auto) en resolución visible y detalle
 * plegable. Devuelve `null` para cualquier otro mensaje — o para un informe
 * aún sin veredicto (streaming temprano): en esos casos se muestra el crudo.
 *
 * v1.84.4 · El corte afloja un paso, por pedido expreso de Mario («creo que
 * ahora resume mucho, que no resuma tanto, solo lo necesario», y ya en la
 * sesión del 26/10: «en el chat solo decir desde **Resumen del enjambre:**»):
 * la resolución visible es RESUMEN + VEREDICTO — lo que el enjambre concluyó
 * y por qué, no la tabla de voces ni las divergencias ni la tarea eco. Si el
 * informe no trae bloque de resumen (versiones viejas, corte raro), la
 * resolución vuelve a ser el veredicto a secas: nunca se queda vacío.
 */
export function dividirEclectica(texto: string): EclecticaDividida | null {
  const src = String(texto ?? "");
  const primeraLinea = src.slice(0, 80);
  if (!RE_ELECTICA_CAB.test(primeraLinea)) return null;
  const mv = src.match(RE_ELECTICA_VEREDICTO);
  if (!mv || mv.index === undefined) return null;
  const mr = src.match(RE_ELECTICA_RESUMEN);
  // La pantalla arranca en el resumen (si existe y cae antes del veredicto);
  // si no, en el veredicto. El final es siempre «Tarea consultada» (o el cabo).
  // El corte desde el RESUMEN conserva su rótulo (es lectura útil); el corte
  // desde el VEREDICTO salta la etiqueta (como desde siempre: el cuerpo es la
  // respuesta, el rótulo lo pone la interfaz).
  const desde = mr && mr.index !== undefined && mr.index < mv.index ? mr.index : mv.index + mv[0].length;
  const despues = src.slice(desde);
  const mt = despues.match(RE_ELECTICA_TAREA);
  const resolucion = (mt ? despues.slice(0, mt.index) : despues).trim();
  // Sin sustancia detrás de las etiquetas («(vacío)» de fábrica, o solo los
  // rótulos): plegar el informe dejando nada en pantalla sería mentir por
  // omisión. Se muestra el crudo.
  const sustancia = resolucion
    .replace(/\*\*Resumen del enjambre:\*\*/g, "")
    .replace(/\*\*Veredicto final de la tarea:\*\*/g, "")
    .replace(/\(vacío\)/g, "")
    .trim();
  if (!sustancia) return null;
  const voces = src.match(RE_ELECTICA_VOCES);
  const acuerdo = src.match(RE_ELECTICA_ACUERDO);
  return {
    resolucion,
    detalle: src,
    voces: voces ? `${voces[1]}/${voces[2]}` : "",
    acuerdo: acuerdo ? `${acuerdo[1]} %` : "",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// v1.84.2 · LA VOZ DEL RESUMEN (Mario 27/10, dos capturas con la flecha puesta):
// «el botón de audio que está ahora lee TODO el prompt; falta otro que lea con
// TTS el resumen final del mensaje». «Escuchar» sigue diciendo el crudo
// (derecho del que quiere oír el informe entero); el botón nuevo dice SOLO la
// resolución: el veredicto en una respuesta ecléctica, la última prosa en un
// informe con código. En un mensaje simple sin código ni enjambre el resumen
// es el mensaje entero — no se duplica el botón: dos bocas diciendo lo mismo
// son decorado, no función. Lógica pura aquí, para que la vigile el test.
// ────────────────────────────────────────────────────────────────────────────

/**
 * El resumen final de un mensaje del asistente, listo para la voz.
 * `null` = no hay un resumen DISTINTO del mensaje (se oculta el botón nuevo).
 */
export function resumenFinalDelMensaje(texto: string): string | null {
  const src = String(texto ?? "");
  if (!src.trim()) return null;
  // 1 · respuesta ecléctica: la resolución es lo mismo que muestra la pantalla
  //   (resumen + veredicto desde v1.84.4) — la vista ya sabe partir, la voz no
  //   reimplementa el corte: una verdad, una función.
  const ecl = dividirEclectica(src);
  if (ecl) return ecl.resolucion;
  // 2 · informe con vallas de código: resumen = la última prosa. Las fichas de
  //   archivo y las líneas de intención («voy a…») no son material de lectura.
  if (esMensajeDenso(src)) {
    const segs = segmentarMensaje(src);
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (s.tipo === "prosa" && s.texto.trim()) return s.texto.trim();
    }
    return null;
  }
  // 3 · charla simple: todo el mensaje ES el resumen. Un segundo botón que lea
  //   lo mismo que el primero mentiría por omisión (haría creer que hay corte).
  //   Excepción desde v1.92.0: si el mensaje es LARGO, el modelo sí mezclado
  //   proceso y conclusión, y ahí el corte existe — ver `dividirVozSimple`.
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// v1.92.0 · LAS DOS BOCAS TAMBIÉN EN LOS MODELOS SIMPLES (pedido de Mario, 30/10:
// «recuerda en los modelos simples en el chat agregar el otro tts para el resumen
// y otro para el pensamiento»).
// El par «Escuchar / Solo final» nació en v1.65.6 para mensajes DENSOS (informe con
// vallas o ecléctico). Un modelo simple no tiene vallas ni fichas: `resumenFinal
// DelMensaje` devolvía null y el usuario se quedaba con UNA boca, obligado a
// escucharse 3.000 caracteres de proceso para llegar a la conclusión.
// El corte NO se inventa: `resumen` es el último párrafo de prosa corrida (lo que
// el modelo cerró), `pensamiento` es textualmente todo lo que vino antes. Mismo
// contenido de la burbuja, dos maneras de escucharlo.
// Cuándo NO se desdobla (regla v1.84.2: «dos bocas diciendo lo mismo son decorado,
// no función»): mensaje corto, informe ecléctico (ya tiene sus botones) o denso con
// «Solo final» disponible. Ahí devuelve null y la vista pinta un solo botón, igual
// que siempre.
// ─────────────────────────────────────────────────────────────────────────────

export interface VozSimple {
  /** Lo que el modelo dijo al cerrar. Se escucha solo. */
  resumen: string;
  /** Todo el proceso anterior (narración, pasos, intención). Se escucha aparte. */
  pensamiento: string;
}

/** Umbral honesto: por debajo de esto, separar las dos bocas es decoración. */
export const LARGO_MINIMO_DOS_BOCAS = 280;

/** Un párrafo es material de cierre si es prosa corrida (no lista, valla, cita ni tabla). */
const ES_PROSA_DE_CIERRE = (b: string): boolean =>
  b.length >= 60 && !/^```|^\s*[-*•]\s|^\s*\||^\s*>|^#{1,6}\s/.test(b);

export function dividirVozSimple(texto: string): VozSimple | null {
  const src = String(texto ?? "");
  if (src.trim().length < LARGO_MINIMO_DOS_BOCAS) return null;
  if (dividirEclectica(src)) return null; // el ecléctico ya trae sus dos piezas
  if (esMensajeDenso(src)) return null; // el denso ya tiene «Solo final»
  const bloques = src.split(/\n[ \t]*\n/);
  for (let i = bloques.length - 1; i >= 1; i--) {
    const cierre = String(bloques[i] ?? "").trim();
    if (!ES_PROSA_DE_CIERRE(cierre)) continue;
    const pensamiento = bloques.slice(0, i).join("\n\n").trim();
    if (pensamiento.length < 60) continue;
    return { resumen: cierre, pensamiento };
  }
  return null;
}
