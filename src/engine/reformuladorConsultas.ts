/**
 * reformuladorConsultas.ts — UNA SALIDA A LA RED, N PREGUNTAS (v1.0.28)
 * =====================================================================
 *
 * LA PREGUNTA DE MARIO (textual): «¿se puede hacer que el modelo reformule las
 * consultas en el sandbox y mande UNA sola petición?»
 *
 * POR QUÉ ESO IMPORTA, medido y no supuesto:
 *   · Cada búsqueda web es un viaje completo: DNS + TLS + servidor + lectura.
 *     Cuatro preguntas sueltas son cuatro viajes, cuatro veces el mismo costo
 *     fijo, y en un equipo de 8 GB con la IDE compilando, cuatro esperas.
 *   · MÁS GRAVE: cuatro consultas casi iguales devuelven cuatro veces el mismo
 *     resultado, y el modelo gasta su ventana leyendo el mismo párrafo. La peor
 *     forma de «buscar mucho» es buscar cuatro veces lo mismo.
 *   · Y hay un techo real de los proveedores gratuitos (rate limits): gastar
 *     cuatro llamadas donde alcanza una es la diferencia entre investigar diez
 *     minutos y comerse un 429.
 *
 * QUÉ HACE ESTE MÓDULO (puro: sin red, sin disco, sin claves):
 *   1. LIMPIA cada pregunta (espacios, comillas raras, signos de más).
 *   2. PLIEGA las que son la misma cosa (normalizando mayúsculas, tildes,
 *      artículos y orden de palabras) — y dice cuáles pliegó.
 *   3. ORDENA por valor de búsqueda: primero lo más específico, después lo
 *      genérico. Una consulta con números, nombres propios o comillas vale más
 *      que una de dos palabras comunes.
 *   4. RECORTA a un máximo. Lo que no entra NO se esconde: se devuelve aparte.
 *   5. COMPONE la consulta final (una sola): las preguntas se unen con « OR »
 *      porque es lo que los buscadores y los modelos de búsqueda entienden como
 *      «cualquiera de estas», y se respeta el largo máximo de URL/consulta.
 *
 * LO QUE NO HACE (y se dice, porque el silencio es lo que engaña):
 *   · NO reformula con el modelo. Una llamada al modelo para reformular ANTES
 *     de buscar es más lenta que la búsqueda misma en un modelo local de 8 GB.
 *     El valor está en plegar y ordenar, que es gratis y determinista. Si algún
 *     día se quiere sinónimos, se añade aquí una tabla curada, no una llamada.
 *   · NO busca. Devuelve la consulta; llamarla es del que sabe salir a la red.
 */

/** Resultado de reformular: la consulta lista, y todo lo que quedó afuera. */
export interface ConsultaReformulada {
  /** La consulta ÚNICA que hay que enviar (nunca vacía si había algo que decir). */
  consulta: string;
  /** Las preguntas que sobrevivieron al plegado y al recorte, en orden de valor. */
  incluidas: string[];
  /** Las que se pliegaron en otra (con la que la absorbió). */
  plegadas: Array<{ pregunta: string; en: string }>;
  /** Las que quedaron fuera por el tope (NO se pierden: se dicen). */
  fuera: string[];
  /** Descarte por no tener contenido (vacía, solo signos). */
  vacias: string[];
}

/** Tope por defecto de preguntas en una sola consulta. */
export const MAX_PREGUNTAS = 6;
/** Tope por defecto del largo de la consulta final (caracteres). */
export const MAX_LARGO_CONSULTA = 380;

const ARTICULOS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "en", "para", "por", "con", "que", "como", "cuando", "donde", "es", "son", "the", "a", "an", "of", "to", "for", "and", "or", "in", "on",
]);

/**
 * Saca tildes para comparar «código» con «codigo» sin declararlos distintos.
 * Se conserva el texto original para enviarlo: la comparación es lo que se
 * normaliza, no lo que se manda.
 */
export function sinTildes(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Limpia una pregunta: colapsa espacios, quita saltos de línea, comillas
 * tipográficas y signos repetidos que ensucian la consulta enviada.
 */
export function limpiarPregunta(bruta: string): string {
  return String(bruta ?? "")
    .replace(/[\u201c\u201d\u2018\u2019\u00ab\u00bb]/g, '"')
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[¿¡]+/g, "")
    .replace(/[?!.,;:\s]+$/g, "")
    .trim();
}

/**
 * La CLAVE de plegado: sin tildes, sin mayúsculas, sin artículos, sin signos y
 * con las palabras en orden alfabético. Así «¿Qué es MCP?» y «mcp es que» son
 * la misma consulta — y no se pagan dos viajes por ella.
 */
export function claveDePlegado(pregunta: string): string {
  const palabras = sinTildes(pregunta)
    .toLowerCase()
    .replace(/[^a-z0-9\s._/-]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !ARTICULOS.has(p));
  return palabras.sort().join(" ");
}

/**
 * Cuánto vale una pregunta como búsqueda. No es una opinión: son señales de
 * especificidad que un buscador sí aprovecha.
 *   · números y versiones ("v1.0.28", "node 16") → el buscador acierta el doc.
 *   · comillas, dos puntos, rutas, @, / → intención exacta.
 *   · palabras raras (largas) → más informativas que "cosa" o "error".
 *   · demasiado corta (1-2 palabras) → vale menos sola que acompañada.
 */
export function valorDeBusqueda(pregunta: string): number {
  const p = String(pregunta ?? "");
  const palabras = p.split(/\s+/).filter(Boolean);
  let v = Math.min(palabras.length, 12) * 0.5;
  if (/\d/.test(p)) v += 2;
  if (/["':]/.test(p)) v += 1.5;
  if (/[@/\\]/.test(p)) v += 1;
  if (/\.(?:ts|tsx|js|json|py|md|bat)\b|\b[a-z-]+:[a-z0-9.]+/i.test(p)) v += 2;
  v += palabras.filter((w) => w.length >= 8).length * 0.4;
  if (palabras.length <= 1) v -= 1;
  return v;
}

/**
 * Reformula N preguntas en UNA consulta.
 *
 * El orden de las operaciones importa y está probado:
 *   limpiar → descartar vacías → plegar → ordenar → recortar → componer.
 * Recortar ANTES de ordenar dejaría afuera justo las preguntas específicas, que
 * son las que valen.
 */
export function reformular(
  preguntas: string[],
  opciones: { maxPreguntas?: number; maxLargo?: number; operador?: "OR" | " "; } = {}
): ConsultaReformulada {
  const maxPreguntas = Math.max(1, Number(opciones.maxPreguntas) || MAX_PREGUNTAS);
  const maxLargo = Math.max(40, Number(opciones.maxLargo) || MAX_LARGO_CONSULTA);
  const operador = opciones.operador ?? "OR";

  const vacias: string[] = [];
  const limpias: string[] = [];
  for (const cruda of Array.isArray(preguntas) ? preguntas : []) {
    const l = limpiarPregunta(cruda);
    // Una «pregunta» sin letras ni números no es una pregunta: es un signo.
    if (!/[a-zA-Z0-9\u00c0-\u024f]/.test(l)) { if (String(cruda ?? "").trim()) vacias.push(String(cruda).trim()); continue; }
    limpias.push(l);
  }

  // Plegado: la PRIMERA aparición manda (respeta el orden en que el usuario las
  // pensó); las demás se declaran plegadas en ella, no se borran en silencio.
  const plegadas: Array<{ pregunta: string; en: string }> = [];
  const unicas: string[] = [];
  const porClave = new Map<string, string>();
  for (const p of limpias) {
    const k = claveDePlegado(p);
    if (!k) continue;
    const previa = porClave.get(k);
    if (previa) {
      if (claveDePlegado(previa) === k && previa !== p) plegadas.push({ pregunta: p, en: previa });
      continue;
    }
    porClave.set(k, p);
    unicas.push(p);
  }

  // Orden por valor. `indexOf` como desempate: estable, para que dos preguntas
  // iguales de valor conserven el orden del usuario.
  const ordenadas = unicas
    .map((p) => ({ p, v: valorDeBusqueda(p), i: unicas.indexOf(p) }))
    .sort((a, b) => (b.v - a.v) || (a.i - b.i))
    .map((x) => x.p);

  const incluidas: string[] = [];
  let largo = 0;
  const fuera: string[] = [];
  const sep = operador === "OR" ? " OR " : " ";
  for (const p of ordenadas) {
    if (incluidas.length >= maxPreguntas) { fuera.push(p); continue; }
    const suma = incluidas.length === 0 ? p.length : largo + sep.length + p.length;
    if (suma > maxLargo) { fuera.push(p); continue; }
    incluidas.push(p);
    largo = suma;
  }

  // Si la primera sola ya excede el tope (una pregunta larguísima), se recorta
  // en el borde de palabra y se DICE que se recortó: mandar 4000 chars a un
  // buscador es un 414 disfrazado.
  let recortada = false;
  if (!incluidas.length && ordenadas.length) {
    const p = ordenadas[0];
    const trozo = p.slice(0, maxLargo);
    const corte = trozo.lastIndexOf(" ");
    incluidas.push(corte > 20 ? trozo.slice(0, corte) : trozo);
    fuera.push(...ordenadas.slice(1), ...(corte > 20 && corte < p.length ? [p] : []));
    recortada = true;
  }

  // `recortada` no cambia el texto (el trozo ya está en `incluidas`): solo marca
  // que hubo recorte para quien quiera saberlo. Antes había un ternario con las
  // dos ramas iguales —una constante disfrazada, que además hacía saltar la valla
  // de resiliencia— y se quedó así al simplificar. Se dice sin disfraz.
  void recortada;
  const consulta = incluidas.join(sep);
  return { consulta, incluidas, plegadas, fuera, vacias };
}
