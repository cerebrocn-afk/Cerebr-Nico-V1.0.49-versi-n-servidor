/**
 * cerebroModelo.ts — v1.57.12 · CERTEZA DE MODELO: NO CUALQUIER MODELO PIENSA EN TEXTO
 * =====================================================================================
 * RAÍZ (consola del 15/10, 16 GB de RAM, sesión exportada 1792025946771): el usuario
 * eligió `glm-ocr:latest` y `qwen3-vl:2b` como CEREBRO del chat. El motor los trató
 * como iguales a un modelo de lenguaje: les mandó texto, esperó, y el watchdog los
 * mató a los 180 s de silencio — tres veces seguidas. Después el aviso culpaba a la
 * RAM o a Ollama («verifica que Ollama tenga el modelo descargado y RAM suficiente»)
 * cuando Ollama estaba arriba, el modelo estaba descargado y la RAM DOBLÓ de 8 a
 * 16 GB sin que el fallo cambiara. El fallo nunca fue de recursos: fue de CLASE.
 * Un OCR no tiene nada que leer sin imagen; un vision-chico en CPU tarda lo que
 * tarda. La certeza que faltaba era esa: saber QUÉ es el modelo antes de mandarle
 * un turno de chat, no adivinarlo después de tres timeouts.
 *
 * Este módulo es PURO y seco: clasifica por nombre (la única señal que Ollama da
 * sin cargar el modelo) y redacta los dos mensajes que el motor necesita:
 *   · `sirveComoCerebroChat` — el PREFLIGHT responde antes de gastar 180 segundos;
 *   · `consejoSilencioLocal` — si el watchdog corta igual, el mensaje habla DEL
 *     MODELO ELEGIDO, no de la clave de Google (era lo que salía antes, mezclado).
 * No inventa capacidades: `lenguaje` es la respuesta por defecto y la duda se
 * resuelve a favor de intentar (avisando), nunca de bloquear a ciegas.
 */

export type FamiliaModelo = "ocr" | "vision" | "embedding" | "rerank" | "lenguaje";

/**
 * Familia por nombre de modelo. Las expresiones cubren los nombres reales que
 * circulan en `ollama list` (los del inventario de Mario incluidos: glm-ocr,
 * qwen3-vl, qwen2.5vl, bge-m3...). Orden deliberado: OCR antes que visión —
 * `glm-ocr` también parece "vision" y no lo es: no responde texto libre.
 */
export function familiaModelo(nombre: string): FamiliaModelo {
  const n = String(nombre || "").toLowerCase();
  if (/(^|[-_:])ocr/.test(n)) return "ocr";
  if (/rerank/.test(n)) return "rerank"; // ANTES que embedding: «snowflake-arctic-rerank» es rerank, no índice
  if (/(^|[-_:])(bge|nomic-embed|jina-embed|mxbai|snowflake-arctic-embed)|embed/.test(n)) return "embedding";
  if (/(^|[-_.:\d])vl(\d|[._:-]|$)|vision|llava|moondream|minicpm|pixtral|cogvlm|internvl|glm-4v|glm4v|bakllava|smolvlm/.test(n)) return "vision";
  return "lenguaje";
}

export interface CerebroVeredicto {
  ok: boolean;
  familia: FamiliaModelo;
  /** Por qué sirve o no, en el idioma del usuario. Vacío si sirve. */
  motivo: string;
}

/**
 * ¿Puede este modelo ser el cerebro de un turno de CHAT?
 * `tieneImagenes` es la clave del asunto: un OCR con imagen adjunta es el
 * herramienta correcta; un OCR sin imagen es un pozo de 180 segundos de silencio.
 * Los de visión SÍ sirven para chat de texto (responden, lento): se dejan pasar.
 * Embeddings y rerank JAMÁS generan conversación: se cortan siempre.
 */
export function sirveComoCerebroChat(nombre: string, tieneImagenes = false): CerebroVeredicto {
  const familia = familiaModelo(nombre);
  if (familia === "ocr") {
    return tieneImagenes
      ? { ok: true, familia, motivo: "" }
      : {
          ok: false, familia, motivo:
            `⛔ «${nombre}» es un modelo de OCR: su trabajo es LEER IMÁGENES, no conversar. ` +
            `Sin imagen adjunta se queda mudo y el watchdog lo corta (eso es lo que viste tres veces). ` +
            `Adjuntale una foto al mensaje para usarlo de OCR, o cambiá el cerebro por un modelo de lenguaje ` +
            `(qwen2.5:0.5b, llama3.2:3b, gemma3n...): con 16 GB te sobran.`,
        };
  }
  if (familia === "embedding" || familia === "rerank") {
    return {
      ok: false, familia, motivo:
        `⛔ «${nombre}» es un modelo de ${familia === "embedding" ? "embeddings (índices de búsqueda)" : "reranking"}: ` +
        `no produce texto de conversación, NUNCA te va a responder un chat. ` +
        `Elegí un modelo de lenguaje como cerebro.`,
    };
  }
  return { ok: true, familia, motivo: "" };
}

/**
 * El mensaje del watchdog, con la cara del modelo que se eligió. Antes era UNO
 * solo para todo («...si es un modelo en la NUBE revisá la clave de Google AI
 * Studio...») y mentía por omisión: un glm-ocr local cortado por silencio no
 * tiene nada que ver con Gemini. Vacío = sin consejo específico (el watchdog
 * mantiene el genérico de la nube).
 */
export function consejoSilencioLocal(nombre: string): string {
  const familia = familiaModelo(String(nombre || ""));
  if (familia === "ocr" || familia === "vision") {
    return (
      `⏱️ El modelo local cayó demasiado tiempo y se cortó. «${nombre}» es de ${familia === "ocr" ? "OCR" : "visión"}: ` +
      `sin imagen (o en CPU) puede tardar muchísimo o no soltar texto. ` +
      `Probá adjuntando la imagen, o cambiá el cerebro por un modelo de lenguaje.`
    );
  }
  return (
    `⏱️ El modelo local cayó demasiado tiempo y se cortó. Suele ser CARGA (el modelo entrando a RAM) ` +
    `o RAM ocupada por otro modelo: mirá «ollama ps», usá el botón Expulsar de la pestaña Puertos ` +
    `y reintentá; si persiste, probá con un modelo más chico.`
  );
}
